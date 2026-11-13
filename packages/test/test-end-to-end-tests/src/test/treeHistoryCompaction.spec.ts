/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat, type CompatApis } from "@fluid-private/test-version-utils";
import { LoaderHeader, type IContainer } from "@fluidframework/container-definitions/internal";
import type {
	ContainerRuntime,
	ISummarizer,
} from "@fluidframework/container-runtime/internal";
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import { delay } from "@fluidframework/core-utils/internal";
import { SummaryType, type SummaryObject } from "@fluidframework/driver-definitions";
import { MockLogger } from "@fluidframework/telemetry-utils/internal";
import {
	DataObjectFactoryType,
	createSummarizer,
	getContainerEntryPointBackCompat,
	summarizeNow,
	type ITestContainerConfig,
	type ITestFluidObject,
	type ITestObjectProvider,
} from "@fluidframework/test-utils/internal";
import {
	FluidClientVersion,
	asAlpha,
	type CanCompactCommit,
	type ITree,
	type ITreeAlpha,
	type TreeBranchCommitMetadata,
	type TreeBranchHistory,
} from "@fluidframework/tree/alpha";

/**
 * End-to-end tests for SharedTree history compaction (`ITreeAlpha.historyCompaction`).
 *
 * These tests run real containers and a separate summarizer client against the selected service driver.
 * They check that compaction:
 * - keeps collaboration working when an interactive client compacts its own history, and
 * - when run inside the summarizer client, is persisted in the summary and survives a reload.
 *
 * - when configured through the `historyCompaction` SharedTree option, runs automatically in the summarizer client.
 *
 * See the history compaction DEV.md in `packages/dds/tree/docs/history-compaction`.
 */

const treeId = "sharedTree";

/**
 * Combines adjacent commits that were made in the same group.
 */
const sameGroup: CanCompactCommit = ({ current, target }) =>
	current.custom?.group !== undefined && current.custom.group === target.custom?.group;

/**
 * Builds the schema and container configuration from the compat-versioned tree APIs.
 * @param summaryPolicy - When provided, set as the tree's `historyCompaction` option, so it runs whenever the tree is summarized.
 * @param enableRevisionPreservation - Whether clients can preserve revisions through shared ops.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- captures closure types from per-version apis
function makeTestSetup(
	apis: CompatApis,
	summaryPolicy?: CanCompactCommit,
	enableRevisionPreservation = false,
) {
	const { SchemaFactory, TreeViewConfiguration, configuredSharedTree } =
		apis.dataRuntime.packages.tree;

	const sf = new SchemaFactory("treeHistoryCompactionE2E");
	class StringArraySchema extends sf.array("StringArray", sf.string) {}
	const viewConfig = new TreeViewConfiguration({ schema: StringArraySchema });

	const SharedTree = configuredSharedTree({
		retainHistory: true,
		// Custom commit metadata is persisted in summaries from this version.
		// Without it, a client loaded from a summary could not apply a metadata-based policy.
		minVersionForCollab: FluidClientVersion.v2_117,
		historyCompaction:
			summaryPolicy === undefined && !enableRevisionPreservation
				? undefined
				: { canCompactCommit: summaryPolicy, enableRevisionPreservation },
	});

	const testContainerConfig: ITestContainerConfig = {
		fluidDataObjectType: DataObjectFactoryType.Test,
		runtimeOptions: {
			enableRuntimeIdCompressor: "on",
			// The test decides when to summarize.
			summaryOptions: { summaryConfigOverrides: { state: "disabled" } },
		},
		registry: [[treeId, SharedTree.getFactory()]],
	};

	const summarizerContainerConfig: ITestContainerConfig = {
		...testContainerConfig,
		runtimeOptions: { ...testContainerConfig.runtimeOptions, summaryOptions: undefined },
	};

	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- the view type depends on the locally defined schema
	const viewTree = (tree: ITree) => asAlpha(tree.viewWith(viewConfig));

	return { testContainerConfig, summarizerContainerConfig, viewTree };
}

/**
 * The view type produced by {@link makeTestSetup}.
 * Derived from its return type because the schema class is defined inside that function.
 */
type StringArrayView = ReturnType<ReturnType<typeof makeTestSetup>["viewTree"]>;

function historyOf(history: TreeBranchHistory): TreeBranchCommitMetadata[] {
	const commits: TreeBranchCommitMetadata[] = [];
	for (let commit = history.getHead(); commit !== undefined; commit = commit.getParent()) {
		commits.unshift(commit);
	}
	return commits;
}

function sessionCommits(view: StringArrayView): TreeBranchCommitMetadata[] {
	return historyOf(view.branchHistory).filter(
		(commit) => commit.custom?.session !== undefined,
	);
}

async function getTree(container: IContainer): Promise<ITree & ITreeAlpha> {
	const dataObject = await getContainerEntryPointBackCompat<ITestFluidObject>(container);
	return dataObject.getSharedObject<ITree & ITreeAlpha>(treeId);
}

/**
 * Gets the tree inside a summarizer client.
 * The summarizer has no public entry point to its data stores, so this goes through its runtime.
 */
async function getSummarizerTree(summarizer: ISummarizer): Promise<ITree & ITreeAlpha> {
	const runtime = (summarizer as unknown as { runtime: ContainerRuntime }).runtime;
	const handle = (await runtime.getAliasedDataStoreEntryPoint("default")) as
		| IFluidHandle<ITestFluidObject>
		| undefined;
	assert(handle !== undefined, "default data store must exist");
	const dataObject = await handle.get();
	return dataObject.getSharedObject<ITree & ITreeAlpha>(treeId);
}

/**
 * Makes `groups` groups of `editsPerGroup` edits.
 * Every edit in a group is tagged with the same `group` metadata.
 */
function makeGroupedEdits(view: StringArrayView, groups: number, editsPerGroup: number): void {
	for (let group = 0; group < groups; group++) {
		for (let edit = 0; edit < editsPerGroup; edit++) {
			view.runTransaction(() => view.root.insertAtEnd(`${group}-${edit}`), {
				customMetadata: { group },
			});
		}
	}
}

/**
 * Moves the collaboration window past every edit made so far, so that they become eligible for compaction.
 *
 * @remarks
 * The minimum sequence number only moves once every client (including the summarizer) has seen the edits.
 * Edits without group metadata are made until it has moved, then one more edit is made so that
 * every tree processes an op that carries the new minimum sequence number.
 */
async function advanceCollabWindow(
	provider: ITestObjectProvider,
	container: IContainer,
	view: StringArrayView,
): Promise<void> {
	await provider.ensureSynchronized();
	const target = container.deltaManager.lastSequenceNumber;
	while (container.deltaManager.minimumSequenceNumber < target) {
		view.root.insertAtEnd("advance");
		await provider.ensureSynchronized();
	}
	view.root.insertAtEnd("advance");
	await provider.ensureSynchronized();
}

/**
 * Total size, in characters or bytes, of the blobs in the given summary (sub)tree.
 */
function summarySize(summary: SummaryObject): number {
	switch (summary.type) {
		case SummaryType.Tree: {
			let size = 0;
			for (const child of Object.values(summary.tree)) {
				size += summarySize(child);
			}
			return size;
		}
		case SummaryType.Blob: {
			return summary.content.length;
		}
		default: {
			return 0;
		}
	}
}

/**
 * Size of the summary the given tree would write right now.
 */
function treeSummarySize(tree: ITree): number {
	const sharedObject = tree as unknown as {
		getAttachSummary(fullTree?: boolean): { summary: SummaryObject };
	};
	return summarySize(sharedObject.getAttachSummary(true).summary);
}

/**
 * Finds the summary of the tree channel inside a container summary.
 */
function findTreeSummary(summary: SummaryObject): SummaryObject | undefined {
	if (summary.type !== SummaryType.Tree) {
		return undefined;
	}
	for (const [key, child] of Object.entries(summary.tree)) {
		if (key === treeId && child.type === SummaryType.Tree) {
			return child;
		}
		const found = findTreeSummary(child);
		if (found !== undefined) {
			return found;
		}
	}
	return undefined;
}

describeCompat("SharedTree history compaction", "NoCompat", (getTestObjectProvider, apis) => {
	const { testContainerConfig, summarizerContainerConfig, viewTree } = makeTestSetup(apis);
	let provider: ITestObjectProvider;

	beforeEach("getTestObjectProvider", async function () {
		provider = getTestObjectProvider({ syncSummarizer: true });
		// Moving the collaboration window can take many round trips.
		this.timeout(Math.max(this.timeout(), 30_000));
	});

	async function createDocument(): Promise<{
		container: IContainer;
		view: StringArrayView;
	}> {
		const container = await provider.makeTestContainer(testContainerConfig);
		const view = viewTree(await getTree(container));
		view.initialize([]);
		await provider.ensureSynchronized();
		return { container, view };
	}

	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- captures the walkthrough's schema and metadata types
	async function setupCompactionWalkthrough() {
		const { container, view } = await createDocument();
		const otherContainer = await provider.loadTestContainer(testContainerConfig);
		const otherView = viewTree(await getTree(otherContainer));
		const { summarizer } = await createSummarizer(
			provider,
			container,
			summarizerContainerConfig,
		);
		const summarizerTree = await getSummarizerTree(summarizer);
		const summarizerView = viewTree(summarizerTree);
		await provider.ensureSynchronized();
		const started = Date.now();
		const log = (message: string): void => {
			process.stdout.write(
				`[history-compaction] [walkthrough +${((Date.now() - started) / 1000).toFixed(1)}s] ${message}\n`,
			);
		};
		const snapshot = (label: string, source = summarizerView): void => {
			log(
				`${label}: metadata (oldest first; initialization and window-advance edits omitted)`,
			);
			for (const commit of sessionCommits(source)) {
				log(
					JSON.stringify(
						{
							revision: commit.revision,
							custom: commit.custom,
							customTree: commit.customTree,
						},
						undefined,
						2,
					),
				);
			}
		};
		const edit = async (
			name: string,
			session: string,
			waitMs: number,
		): Promise<{ name: string; session: string; timestamp: number }> => {
			await delay(waitMs);
			const metadata = { name, session, timestamp: Date.now() };
			view.runTransaction(
				() => {
					view.runTransaction(() => view.root.insertAtEnd(name), {
						customMetadata: { ...metadata, name: `${name}.insert` },
					});
				},
				{ customMetadata: metadata },
			);
			await provider.ensureSynchronized();
			log(
				`Interactive client authored ${name}; all clients sequenced it: ${JSON.stringify(metadata)}`,
			);
			return metadata;
		};
		const advanceWindow = async (): Promise<void> => {
			await advanceCollabWindow(provider, container, view);
			log(
				"The collaboration window advanced past earlier edits, including on the summarizer.",
			);
		};
		const policy: CanCompactCommit = ({ current, target }) => {
			const older = current.custom;
			const newer = target.custom;
			const start = older?.startTimestamp ?? older?.timestamp;
			if (
				typeof older?.name !== "string" ||
				typeof newer?.name !== "string" ||
				typeof older?.session !== "string" ||
				typeof newer?.session !== "string" ||
				typeof start !== "number" ||
				typeof newer.timestamp !== "number"
			) {
				return false;
			}
			const duration = newer.timestamp - start;
			const sameSession = older.session === newer.session;
			const combine = sameSession && duration < 4000;
			log(
				`Summarizer callback ${older.name} + ${newer.name}: sameSession=${sameSession}, durationFromStart=${duration}ms < 4000ms => ${combine ? "COMBINE" : "KEEP"}`,
			);
			if (!combine) {
				return false;
			}
			const merged = {
				name: `${older.name}+${newer.name}`,
				session: newer.session,
				startTimestamp: start,
				timestamp: newer.timestamp,
				isCompacted: true,
			};
			log(`Returned replacement metadata: ${JSON.stringify(merged)}`);
			return merged;
		};
		const compact = (expectedRemoved: number): void => {
			snapshot("Summarizer BEFORE compaction");
			const content = [...summarizerView.root];
			const interactiveMetadata = [view, otherView].map((source) =>
				sessionCommits(source).map((commit) => commit.custom),
			);
			const removed = summarizerTree.historyCompaction.requestCompaction(policy);
			assert.equal(removed, expectedRemoved);
			assert.deepEqual([...summarizerView.root], content);
			assert.deepEqual(
				[view, otherView].map((source) =>
					sessionCommits(source).map((commit) => commit.custom),
				),
				interactiveMetadata,
				"Neither interactive client's history was compacted",
			);
			log(
				`Summarizer removed ${removed} commits; content and interactive histories are unchanged.`,
			);
			snapshot("Summarizer AFTER compaction");
		};
		return {
			view,
			otherView,
			summarizer,
			summarizerView,
			log,
			snapshot,
			edit,
			advanceWindow,
			compact,
		};
	}

	it("walks through session and timestamp compaction with logs", async function () {
		if (process.env.FLUID_HISTORY_COMPACTION_WALKTHROUGH !== "1") {
			this.skip();
		}
		this.timeout(120_000);
		const {
			view,
			otherView,
			summarizer,
			summarizerView,
			log,
			snapshot,
			edit,
			advanceWindow,
			compact,
		} = await setupCompactionWalkthrough();

		// Timeline: A(0s), B(2s), C(5s), D(10s), E(12s), F(17s), plus service round trips.
		const a = await edit("A", "session-1", 0);
		const b = await edit("B", "session-1", 2000);
		const c = await edit("C", "session-1", 3000);
		await advanceWindow();
		snapshot("A, B and C retained on the summarizer; no automatic compaction");

		const d = await edit("D", "session-2", 5000);
		log("D is newly sequenced; sequencing alone does not run compaction.");
		compact(1);
		const ab = {
			name: "A+B",
			session: a.session,
			startTimestamp: a.timestamp,
			timestamp: b.timestamp,
			isCompacted: true,
		};
		assert.deepEqual(
			sessionCommits(summarizerView).map((commit) => commit.custom),
			[ab, c, d],
		);

		const e = await edit("E", "session-2", 2000);
		const f = await edit("F", "session-2", 5000);
		await advanceWindow();
		compact(1);
		const de = {
			name: "D+E",
			session: d.session,
			startTimestamp: d.timestamp,
			timestamp: e.timestamp,
			isCompacted: true,
		};
		const expected = [ab, c, de, f];
		assert.deepEqual(
			sessionCommits(summarizerView).map((commit) => commit.custom),
			expected,
		);
		for (const commit of sessionCommits(summarizerView)) {
			if (commit.custom?.isCompacted === true) {
				assert.deepEqual(commit.customTree, { metadata: commit.custom, children: [] });
			}
		}
		for (const source of [view, otherView]) {
			assert.deepEqual(
				sessionCommits(source).map((commit) => commit.custom),
				[a, b, c, d, e, f],
			);
			assert.deepEqual([...source.root], [...summarizerView.root]);
		}
		snapshot("Interactive author AFTER summarizer compaction (still A through F)", view);

		await provider.ensureSynchronized();
		const { summaryVersion } = await summarizeNow(summarizer);
		const loadedContainer = await provider.loadTestContainer(testContainerConfig, {
			[LoaderHeader.version]: summaryVersion,
		});
		const loadedView = viewTree(await getTree(loadedContainer));
		await provider.ensureSynchronized();
		const persistedMetadata = sessionCommits(summarizerView).map((commit) => ({
			revision: commit.revision,
			custom: commit.custom,
			customTree: commit.customTree,
		}));
		assert.deepEqual(
			sessionCommits(loadedView).map((commit) => ({
				revision: commit.revision,
				custom: commit.custom,
				customTree: commit.customTree,
			})),
			persistedMetadata,
		);
		assert.deepEqual([...loadedView.root], [...view.root]);
		snapshot("Client reloaded from the summarizer's uploaded summary", loadedView);
		log("Summary reloaded: compacted revisions, metadata trees and content survived.");
		loadedView.root.insertAtEnd("after reload");
		await provider.ensureSynchronized();
		assert.deepEqual([...loadedView.root], [...view.root]);
		assert.deepEqual([...otherView.root], [...view.root]);
	});

	it("compaction on an interactive client does not change what the summarizer writes", async () => {
		const { container: container1, view: view1 } = await createDocument();
		const container2 = await provider.loadTestContainer(testContainerConfig);
		const tree2 = await getTree(container2);
		const view2 = viewTree(tree2);
		await provider.ensureSynchronized();

		makeGroupedEdits(view1, 3, 5);
		await advanceCollabWindow(provider, container1, view1);
		const uncompactedCommits = historyOf(view2.branchHistory).length;

		const removedCount = (await getTree(container1)).historyCompaction.requestCompaction(
			sameGroup,
		);
		// 3 groups of 5 edits leave 3 commits.
		assert.equal(removedCount, 12);
		assert.equal(historyOf(view1.branchHistory).length, uncompactedCommits - 12);
		assert.equal(historyOf(view2.branchHistory).length, uncompactedCommits);

		// Both clients keep editing after the compaction.
		view1.root.insertAtEnd("from client 1");
		view2.root.insertAtStart("from client 2");
		await provider.ensureSynchronized();
		assert.deepEqual([...view1.root], [...view2.root]);
		assert.equal(view1.root[0], "from client 2");
		assert.equal(view1.root.at(-1), "from client 1");
		const commitsBeforeSummary = historyOf(view2.branchHistory).length;

		// The summarizer did not compact, so the document still loads with everything.
		const { summarizer } = await createSummarizer(
			provider,
			container1,
			summarizerContainerConfig,
		);
		const { summaryVersion } = await summarizeNow(summarizer);
		const container3 = await provider.loadTestContainer(testContainerConfig, {
			[LoaderHeader.version]: summaryVersion,
		});
		const view3 = viewTree(await getTree(container3));
		await provider.ensureSynchronized();
		assert.deepEqual([...view3.root], [...view1.root]);
		assert.equal(
			historyOf(view3.branchHistory).length,
			commitsBeforeSummary,
			"The summarizer did not compact, so the summary has the full history",
		);
	});

	it("persists compaction done by the summarizer client and reloads from it", async () => {
		const { container: container1, view: view1 } = await createDocument();
		const { summarizer } = await createSummarizer(
			provider,
			container1,
			summarizerContainerConfig,
		);

		makeGroupedEdits(view1, 4, 10);
		await advanceCollabWindow(provider, container1, view1);

		// Compact inside the summarizer client, as a summarizer-side policy would.
		const summarizerTree = await getSummarizerTree(summarizer);
		const sizeBefore = treeSummarySize(summarizerTree);
		const removedCount = summarizerTree.historyCompaction.requestCompaction(sameGroup);
		// 4 groups of 10 edits leave 4 commits.
		assert.equal(removedCount, 36);
		const sizeAfter = treeSummarySize(summarizerTree);
		assert(sizeAfter < sizeBefore, `expected ${sizeAfter} < ${sizeBefore}`);

		// The summary the summarizer writes contains the compacted history.
		const { summaryTree, summaryVersion } = await summarizeNow(summarizer);
		const writtenTree = findTreeSummary(summaryTree);
		assert(writtenTree !== undefined, "summary should contain the tree");
		assert(
			summarySize(writtenTree) < sizeBefore,
			`expected written summary ${summarySize(writtenTree)} < ${sizeBefore}`,
		);

		// A client loaded from that summary sees the same content...
		const container2 = await provider.loadTestContainer(testContainerConfig, {
			[LoaderHeader.version]: summaryVersion,
		});
		const tree2 = await getTree(container2);
		const view2 = viewTree(tree2);
		await provider.ensureSynchronized();
		assert.deepEqual([...view2.root], [...view1.root]);

		// ...and the grouped edits arrive already combined: there is nothing left to compact.
		await advanceCollabWindow(provider, container1, view1);
		assert.equal(tree2.historyCompaction.requestCompaction(sameGroup), 0);

		// Collaboration keeps working on the reloaded document.
		view2.root.insertAtEnd("after reload");
		await provider.ensureSynchronized();
		assert.deepEqual([...view2.root], [...view1.root]);
	});

	it("a client loaded from a summary can compact using only persisted metadata", async () => {
		const { container: container1, view: view1 } = await createDocument();
		const { summarizer } = await createSummarizer(
			provider,
			container1,
			summarizerContainerConfig,
		);

		makeGroupedEdits(view1, 2, 5);
		await advanceCollabWindow(provider, container1, view1);
		const { summaryVersion } = await summarizeNow(summarizer);

		const container2 = await provider.loadTestContainer(testContainerConfig, {
			[LoaderHeader.version]: summaryVersion,
		});
		const tree2 = await getTree(container2);
		await provider.ensureSynchronized();

		// The loaded client only knows the collaboration window once it processes ops.
		await advanceCollabWindow(provider, container1, view1);

		// The policy uses only the metadata that was persisted in the summary.
		const view2 = viewTree(tree2);
		const commitsBefore = historyOf(view2.branchHistory).length;
		assert.equal(tree2.historyCompaction.requestCompaction(sameGroup), 8);
		assert.equal(historyOf(view2.branchHistory).length, commitsBefore - 8);
		assert.deepEqual([...view2.root], [...view1.root]);
	});

	describe("with the historyCompaction option", () => {
		// Every client uses the same configuration, as an application would.
		// Only the summarizer client writes summaries, so only it runs the policy.
		const withPolicy = makeTestSetup(apis, sameGroup);

		it("the summarizer client compacts with the policy from the tree's options", async () => {
			const logger = new MockLogger();
			const container1 = await provider.makeTestContainer({
				...withPolicy.testContainerConfig,
				loaderProps: { logger },
			});
			const tree1 = await getTree(container1);
			const view1 = withPolicy.viewTree(tree1);
			view1.initialize([]);
			await provider.ensureSynchronized();
			const { summarizer } = await createSummarizer(
				provider,
				container1,
				withPolicy.summarizerContainerConfig,
				undefined,
				logger,
			);

			makeGroupedEdits(view1, 4, 10);
			await advanceCollabWindow(provider, container1, view1);
			const uncompactedCommits = historyOf(view1.branchHistory).length;
			logger.clear();
			const { summaryVersion } = await summarizeNow(summarizer);
			const summaryEvents = logger.events.filter((event) =>
				event.eventName.endsWith("HistoryCompaction"),
			);
			// GC scans handles through summarizeCore before the actual summary runs it again.
			assert.deepEqual(
				summaryEvents.map(({ trigger, status, removedCount }) => ({
					trigger,
					status,
					removedCount,
				})),
				[
					{ trigger: "summary", status: "success", removedCount: 36 },
					{ trigger: "summary", status: "success", removedCount: 0 },
				],
			);
			assert.equal(
				historyOf(view1.branchHistory).length,
				uncompactedCommits,
				"The interactive client did not summarize, so it keeps its history",
			);

			const container2 = await provider.loadTestContainer(withPolicy.testContainerConfig, {
				[LoaderHeader.version]: summaryVersion,
			});
			const tree2 = await getTree(container2);
			const view2 = withPolicy.viewTree(tree2);
			await provider.ensureSynchronized();
			assert.deepEqual([...view2.root], [...view1.root]);
			assert.equal(
				historyOf(view2.branchHistory).length,
				uncompactedCommits - 36,
				"The summarizer applied the policy before writing the summary",
			);

			// The loaded history was already compacted by the summarizer.
			await advanceCollabWindow(provider, container1, view1);
			assert.equal(tree2.historyCompaction.requestCompaction(sameGroup), 0);
			// The interactive client never summarized, so it still has all of its grouped commits.
			// 4 groups of 10 edits leave 4 commits.
			logger.clear();
			assert.equal(tree1.historyCompaction.requestCompaction(sameGroup), 36);
			const manualEvents = logger.events.filter((event) =>
				event.eventName.endsWith("HistoryCompaction"),
			);
			assert.equal(manualEvents.length, 1);
			assert.equal(manualEvents[0]?.trigger, "manual");
			assert.equal(manualEvents[0]?.status, "success");
			assert.equal(manualEvents[0]?.removedCount, 36);

			view2.root.insertAtEnd("after reload");
			await provider.ensureSynchronized();
			assert.deepEqual([...view2.root], [...view1.root]);
		});
	});

	describe("preserved revisions", () => {
		const withPreservation = makeTestSetup(apis, sameGroup, true);

		it("is honoured by a real summarizer client", async () => {
			const container1 = await provider.makeTestContainer(
				withPreservation.testContainerConfig,
			);
			const tree1 = await getTree(container1);
			const view1 = withPreservation.viewTree(tree1);
			view1.initialize([]);
			await provider.ensureSynchronized();
			const container2 = await provider.loadTestContainer(
				withPreservation.testContainerConfig,
			);
			const tree2 = await getTree(container2);
			const { summarizer } = await createSummarizer(
				provider,
				container1,
				withPreservation.summarizerContainerConfig,
			);
			makeGroupedEdits(view1, 2, 3);
			await provider.ensureSynchronized();
			const preserved = historyOf(view1.branchHistory).filter(
				(commit) => commit.custom?.group === 0,
			)[1];
			assert(preserved !== undefined);
			tree1.historyCompaction.setRevisionPreserved(preserved.revision, true);
			await advanceCollabWindow(provider, container1, view1);
			assert.equal(tree2.historyCompaction.isRevisionPreserved(preserved.revision), true);
			const uncompactedCommits = historyOf(view1.branchHistory).length;

			await provider.ensureSynchronized();
			const { summaryVersion } = await summarizeNow(summarizer);
			const loadedContainer = await provider.loadTestContainer(
				withPreservation.testContainerConfig,
				{
					[LoaderHeader.version]: summaryVersion,
				},
			);
			const loaded = await getTree(loadedContainer);
			const loadedView = withPreservation.viewTree(loaded);
			await provider.ensureSynchronized();
			assert.equal(historyOf(loadedView.branchHistory).length, uncompactedCommits - 2);
			assert.equal(loaded.historyCompaction.isRevisionPreserved(preserved.revision), true);
			const loadedPreserved = historyOf(loadedView.branchHistory).find(
				(commit) => commit.revision === preserved.revision,
			);
			assert(loadedPreserved !== undefined);
			assert.deepEqual(loadedPreserved.customTree, preserved.customTree);
			assert.deepEqual([...loadedView.root], [...view1.root]);
			assert.equal(historyOf(view1.branchHistory).length, uncompactedCommits);
		});
	});
});
