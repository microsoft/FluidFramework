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
	summarizeNow,
	waitForContainerConnection,
	type ITestContainerConfig,
	type ITestFluidObject,
	type ITestObjectProvider,
} from "@fluidframework/test-utils/internal";
import {
	FluidClientVersion,
	asAlpha,
	type CompactionRange,
	type ITree,
	type ITreeAlpha,
	type JsonCompatibleReadOnlyObject,
	type PlanCompaction,
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
 * Plans one range per maximal run of adjacent commits, reading the original (not yet combined) commits.
 * @param shouldExtend - Whether `next` continues `run`.
 * @param metadataForRange - When provided, its result replaces the metadata of each range.
 */
function planRuns(
	shouldExtend: (
		run: readonly TreeBranchCommitMetadata[],
		next: TreeBranchCommitMetadata,
	) => boolean,
	metadataForRange?: (
		commits: readonly TreeBranchCommitMetadata[],
	) => JsonCompatibleReadOnlyObject,
): PlanCompaction {
	return (retainedHistory, eligibleCount) => {
		const history = retainedHistory.slice(0, eligibleCount);
		const ranges: CompactionRange[] = [];
		let start = 0;
		for (let index = 1; index <= history.length; index++) {
			const next = history[index];
			if (next !== undefined && shouldExtend(history.slice(start, index), next)) {
				continue;
			}
			const oldest = history[start];
			const newest = history[index - 1];
			if (oldest !== undefined && newest !== undefined && oldest !== newest) {
				const commits = history.slice(start, index);
				ranges.push({
					oldest: oldest.revision,
					newest: newest.revision,
					...(metadataForRange === undefined ? {} : { metadata: metadataForRange(commits) }),
				});
			}
			start = index;
		}
		return { ranges };
	};
}

/**
 * Combines each run of adjacent commits that were made in the same group.
 */
const sameGroup: PlanCompaction = planRuns(
	(run, next) =>
		run[0]?.custom?.group !== undefined && run[0].custom.group === next.custom?.group,
);

/**
 * Builds the schema and container configuration from the compat-versioned tree APIs.
 * @param summaryPolicy - When provided, set as the tree's `historyCompaction` option, so it runs whenever the tree is summarized.
 * @param enableRevisionPreservation - Whether clients can preserve revisions through shared ops.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- captures closure types from per-version apis
function makeTestSetup(
	apis: CompatApis,
	summaryPolicy?: PlanCompaction,
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
				: { planCompaction: summaryPolicy, enableRevisionPreservation },
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
	const dataObject = (await container.getEntryPoint()) as ITestFluidObject;
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
		// Combines runs of commits from the same session that finish within 4000ms of the run's start.
		const startOf = (commit: TreeBranchCommitMetadata): unknown =>
			commit.custom?.startTimestamp ?? commit.custom?.timestamp;
		const names = (commits: readonly TreeBranchCommitMetadata[]): string =>
			commits
				.map((commit) => (typeof commit.custom?.name === "string" ? commit.custom.name : "?"))
				.join("+");
		const policy: PlanCompaction = planRuns(
			(run, next) => {
				const first = run[0];
				const start = first === undefined ? undefined : startOf(first);
				if (
					typeof first?.custom?.name !== "string" ||
					typeof next.custom?.name !== "string" ||
					typeof first.custom.session !== "string" ||
					typeof start !== "number" ||
					typeof next.custom.timestamp !== "number"
				) {
					return false;
				}
				const duration = next.custom.timestamp - start;
				const sameSession = first.custom.session === next.custom.session;
				const combine = sameSession && duration < 4000;
				log(
					`Summarizer plan ${names(run)} + ${next.custom.name}: sameSession=${sameSession}, durationFromStart=${duration}ms < 4000ms => ${combine ? "COMBINE" : "KEEP"}`,
				);
				return combine;
			},
			(commits) => {
				const newest = commits.at(-1)?.custom;
				const merged = {
					name: names(commits),
					session: newest?.session ?? null,
					startTimestamp: (startOf(commits[0] ?? assert.fail()) as number | undefined) ?? null,
					timestamp: newest?.timestamp ?? null,
					isCompacted: true,
				};
				log(`Planned replacement metadata: ${JSON.stringify(merged)}`);
				return merged;
			},
		);
		const compact = (expectedRemoved: number): void => {
			snapshot("Summarizer BEFORE compaction");
			const content = [...summarizerView.root];
			const interactiveMetadata = [view, otherView].map((source) =>
				sessionCommits(source).map((commit) => commit.custom),
			);
			const removed = summarizerTree.historyCompaction.requestPlannedCompaction(policy);
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

		const removedCount = (
			await getTree(container1)
		).historyCompaction.requestPlannedCompaction(sameGroup);
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
		const removedCount = summarizerTree.historyCompaction.requestPlannedCompaction(sameGroup);
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
		assert.equal(tree2.historyCompaction.requestPlannedCompaction(sameGroup), 0);

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
		assert.equal(tree2.historyCompaction.requestPlannedCompaction(sameGroup), 8);
		assert.equal(historyOf(view2.branchHistory).length, commitsBefore - 8);
		assert.deepEqual([...view2.root], [...view1.root]);
	});

	describe("with the historyCompaction option", () => {
		// Every client uses the same configuration, as an application would.
		// Only the summarizer client writes summaries, so only it runs the policy.
		const withPolicy = makeTestSetup(apis, sameGroup);

		for (const trigger of ["manual", "summary"] as const) {
			it(`keeps an idle client's edits consistent after the summarizer compacts its last commit (${trigger})`, async () => {
				const setup = trigger === "summary" ? withPolicy : makeTestSetup(apis);
				const container1 = await provider.makeTestContainer(setup.testContainerConfig);
				const view1 = setup.viewTree(await getTree(container1));
				view1.initialize([]);
				await provider.ensureSynchronized();
				const container2 = await provider.loadTestContainer(setup.testContainerConfig);
				const view2 = setup.viewTree(await getTree(container2));
				const { summarizer } = await createSummarizer(
					provider,
					container1,
					setup.summarizerContainerConfig,
				);
				const summarizerTree = await getSummarizerTree(summarizer);
				const summarizerView = setup.viewTree(summarizerTree);
				await provider.ensureSynchronized();

				// Client 2's only edit starts a group that client 1 continues,
				// so compaction composes client 2's last commit into client 1's next one.
				view2.runTransaction(() => view2.root.insertAtEnd("client 2"), {
					customMetadata: { group: 0 },
				});
				await provider.ensureSynchronized();
				for (let edit = 0; edit < 3; edit++) {
					view1.runTransaction(() => view1.root.insertAtEnd(`client 1 ${edit}`), {
						customMetadata: { group: 0 },
					});
				}
				await advanceCollabWindow(provider, container1, view1);

				const commitsBefore = historyOf(summarizerView.branchHistory).length;
				if (trigger === "manual") {
					assert.equal(
						summarizerTree.historyCompaction.requestPlannedCompaction(sameGroup),
						3,
					);
				} else {
					await summarizeNow(summarizer);
				}
				assert.equal(historyOf(summarizerView.branchHistory).length, commitsBefore - 3);

				// Client 2 edits again: the summarizer must not re-apply its composed-away edit.
				view2.root.insertAtStart("client 2 again");
				view1.root.insertAtEnd("client 1 again");
				await provider.ensureSynchronized();
				assert.deepEqual([...view2.root], [...view1.root]);
				assert.deepEqual([...summarizerView.root], [...view1.root]);
				assert.equal(
					view1.root.filter((item) => item === "client 2").length,
					1,
					"Client 2's first edit is applied once",
				);

				// The summary written after the idle client edited must load with the same content.
				const { summaryVersion } = await summarizeNow(summarizer);
				const loadedContainer = await provider.loadTestContainer(setup.testContainerConfig, {
					[LoaderHeader.version]: summaryVersion,
				});
				const loadedView = setup.viewTree(await getTree(loadedContainer));
				await provider.ensureSynchronized();
				assert.deepEqual([...loadedView.root], [...view1.root]);
				view2.root.insertAtEnd("after reload");
				loadedView.root.insertAtStart("from reloaded client");
				await provider.ensureSynchronized();
				for (const view of [view2, loadedView, summarizerView]) {
					assert.deepEqual([...view.root], [...view1.root]);
				}
			});
		}

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
			const [firstPass] = summaryEvents;
			assert(firstPass !== undefined);
			// No pins: the plan is called once, and each group's range is merged by default.
			assert.equal(firstPass.policyCallCount, 1);
			assert.equal(firstPass.plannedRangeCount, 4);
			assert.equal(firstPass.combinedRangeCount, 4);
			assert.equal(firstPass.skippedRangeCount, 0);
			assert.equal(firstPass.composeCallCount, 4);
			assert.equal(firstPass.composedChangeCount, 40);
			assert.equal(firstPass.defaultMergeCount, 4);
			assert.equal(firstPass.replacementMergeCount, 0);
			assert.equal(firstPass.replacementMetadataLength, 0);
			// The summarizer rebases its view of the interactive client's branch before composing.
			assert((firstPass.peerBranchCount as number) >= 1, "Peer branches are reported");
			assert(typeof firstPass.durationMs === "number");
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
			assert.equal(tree2.historyCompaction.requestPlannedCompaction(sameGroup), 0);
			// The interactive client never summarized, so it still has all of its grouped commits.
			// 4 groups of 10 edits leave 4 commits.
			logger.clear();
			assert.equal(tree1.historyCompaction.requestPlannedCompaction(sameGroup), 36);
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
			const logger = new MockLogger();
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
				undefined,
				logger,
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
			logger.clear();
			const { summaryVersion } = await summarizeNow(summarizer);
			const compactionEvent = logger.events.find((event) =>
				event.eventName.endsWith("HistoryCompaction"),
			);
			// The pinned middle commit causes its group's range to be skipped.
			assert.equal(compactionEvent?.skippedRangeCount, 1);
			assert.equal(compactionEvent?.combinedRangeCount, 1);
			assert.equal(compactionEvent?.removedCount, 2);
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

		it("is honoured when requested while disconnected", async () => {
			const container1 = await provider.makeTestContainer(
				withPreservation.testContainerConfig,
			);
			const view1 = withPreservation.viewTree(await getTree(container1));
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
			const summarizerTree = await getSummarizerTree(summarizer);
			makeGroupedEdits(view1, 1, 3);
			await provider.ensureSynchronized();
			const preserved = historyOf(view1.branchHistory).filter(
				(commit) => commit.custom?.group === 0,
			)[1];
			assert(preserved !== undefined);

			// The pin is submitted on reconnect, so other clients only see it once it is sequenced.
			container2.disconnect();
			tree2.historyCompaction.setRevisionPreserved(preserved.revision, true);
			assert.equal(tree2.historyCompaction.isRevisionPreserved(preserved.revision), true);
			await provider.ensureSynchronized(container1);
			assert.equal(
				summarizerTree.historyCompaction.isRevisionPreserved(preserved.revision),
				false,
			);
			container2.connect();
			await waitForContainerConnection(container2);
			await advanceCollabWindow(provider, container1, view1);
			assert.equal(
				summarizerTree.historyCompaction.isRevisionPreserved(preserved.revision),
				true,
			);

			const commitsBefore = historyOf(view1.branchHistory).length;
			const { summaryVersion } = await summarizeNow(summarizer);
			const loadedView = withPreservation.viewTree(
				await getTree(
					await provider.loadTestContainer(withPreservation.testContainerConfig, {
						[LoaderHeader.version]: summaryVersion,
					}),
				),
			);
			await provider.ensureSynchronized();
			// The pinned middle commit of the only group blocks both merges.
			assert.equal(historyOf(loadedView.branchHistory).length, commitsBefore);
			assert(
				historyOf(loadedView.branchHistory).some(
					(commit) => commit.revision === preserved.revision,
				),
			);
		});

		it("is rejected by the summarizer when it already compacted the revision", async () => {
			const logger = new MockLogger();
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
				undefined,
				logger,
			);
			const summarizerTree = await getSummarizerTree(summarizer);
			makeGroupedEdits(view1, 1, 3);
			await advanceCollabWindow(provider, container1, view1);
			const stale = historyOf(view1.branchHistory).filter(
				(commit) => commit.custom?.group === 0,
			)[1];
			assert(stale !== undefined);

			// Only the summarizer's history is compacted; interactive clients still have the revision.
			await summarizeNow(summarizer);
			assert(
				!historyOf(withPreservation.viewTree(summarizerTree).branchHistory).some(
					(commit) => commit.revision === stale.revision,
				),
			);

			const rejected: Record<string, string[]> = { tree1: [], tree2: [] };
			tree1.historyCompaction.events.on("revisionPreservationRejected", (revision) =>
				rejected.tree1.push(revision),
			);
			tree2.historyCompaction.events.on("revisionPreservationRejected", (revision) =>
				rejected.tree2.push(revision),
			);
			logger.clear();
			tree2.historyCompaction.setRevisionPreserved(stale.revision, true);
			assert.equal(tree2.historyCompaction.isRevisionPreserved(stale.revision), true);
			// The first round sequences the pin; the second sequences the summarizer's rejection.
			await provider.ensureSynchronized();
			await provider.ensureSynchronized();

			// Both interactive clients had marked the revision once the pin was sequenced, so both are told.
			assert.deepEqual(rejected, { tree1: [stale.revision], tree2: [stale.revision] });
			for (const tree of [tree1, tree2, summarizerTree]) {
				assert.equal(tree.historyCompaction.isRevisionPreserved(stale.revision), false);
			}
			const ignored = logger.events.filter((event) =>
				event.eventName.endsWith("PreserveRevisionIgnored"),
			);
			assert.equal(ignored.length, 1);
			assert.equal(ignored[0].isSummarizer, true);
			assert.equal(ignored[0].rejectionSent, true);
		});
	});
});
