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
import { LogLevel, type IFluidHandle } from "@fluidframework/core-interfaces";
import { delay } from "@fluidframework/core-utils/internal";
import { SummaryType, type SummaryObject } from "@fluidframework/driver-definitions";
import { MockLogger, createMockLoggerExt } from "@fluidframework/telemetry-utils/internal";
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
	type CanCompactCommit,
	type ITree,
	type ITreeAlpha,
	type TreeBranchCommitMetadata,
	type TreeBranchHistory,
	type RevertibleAlpha,
} from "@fluidframework/tree/alpha";

// eslint-disable-next-line import-x/no-internal-modules -- Reuse the GC summary decoder to verify GC ran.
import { getGCStateFromSummary } from "./gc/gcTestSummaryUtils.js";

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

/**
 * Test-only inspection of repair identities and refresher keys; not an application API.
 */
function inspectRepairData(
	tree: ITree,
	selected: ReadonlySet<string>,
): {
	removedRootKeys: readonly (readonly unknown[])[];
	changes: {
		revision: string;
		maxId?: number;
		refresherKeys: readonly (readonly unknown[])[];
	}[];
} {
	interface Commit {
		revision: number | string;
		parent?: Commit;
		change: {
			changes: readonly {
				type: string;
				innerChange: {
					maxId?: number;
					refreshers?: { keys(): Iterable<readonly [number | string | undefined, number]> };
				};
			}[];
		};
	}
	const { checkout, idCompressor } = (
		tree as unknown as {
			kernel: {
				checkout: {
					getRemovedRoots(): readonly (readonly unknown[])[];
					getLocationHead(): Commit;
				};
				idCompressor: { decompress(id: number): string };
			};
		}
	).kernel;
	const changes: {
		revision: string;
		maxId?: number;
		refresherKeys: readonly (readonly unknown[])[];
	}[] = [];
	for (
		let commit: Commit | undefined = checkout.getLocationHead();
		commit !== undefined;
		commit = commit.parent
	) {
		const revision =
			typeof commit.revision === "number"
				? idCompressor.decompress(commit.revision)
				: commit.revision;
		if (!selected.has(revision)) {
			continue;
		}
		for (const { type, innerChange } of commit.change.changes) {
			if (type === "data") {
				changes.push({
					revision,
					maxId: innerChange.maxId,
					refresherKeys: [...(innerChange.refreshers?.keys() ?? [])].map(([major, minor]) => [
						typeof major === "number" ? idCompressor.decompress(major) : major,
						minor,
					]),
				});
			}
		}
	}
	return {
		removedRootKeys: checkout
			.getRemovedRoots()
			.map(([major, minor]) => [
				typeof major === "number" ? idCompressor.decompress(major) : major,
				minor,
			]),
		changes,
	};
}

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

	describe("controlled lifecycle matrix", () => {
		interface LifecycleFailure {
			stage: string;
			branch?: string;
			revision?: string;
			forkId?: number;
			treeId?: string;
			sessionId?: string;
			error: string;
		}
		for (const mode of [
			"disabled",
			"summary-only",
			"manual",
			"manual with readers",
		] as const) {
			it(`compares ${mode} with acknowledged summaries, retained reads and Undo/Redo`, async function () {
				if (provider.driver.type !== "local") {
					this.skip();
				}
				this.timeout(60_000);
				const logger = createMockLoggerExt(LogLevel.verbose);
				let lifecycleStage = "setup";
				let diagnosticWritten = false;
				let firstFailure: LifecycleFailure | undefined;
				try {
					const policy: CanCompactCommit = ({ current, target }) =>
						current.custom?.group === "deletions" && target.custom?.group === "deletions";
					const setup = makeTestSetup(apis, mode === "summary-only" ? policy : undefined);
					const config: ITestContainerConfig = {
						...setup.testContainerConfig,
						loaderProps: {
							logger,
							configProvider: {
								getRawConfig: (name) =>
									name === "Fluid.SharedTree.HistoryDebugTrace" ? true : undefined,
							},
						},
					};
					const summarizerConfig = {
						...config,
						runtimeOptions: setup.summarizerContainerConfig.runtimeOptions,
					};
					const container = await provider.makeTestContainer(config);
					const tree = await getTree(container);
					const view = setup.viewTree(tree);
					view.initialize(["a", "b", "c"]);
					await provider.ensureSynchronized();
					const initialRevision = view.branchHistory.getHead()?.revision ?? assert.fail();
					const { summarizer } = await createSummarizer(
						provider,
						container,
						summarizerConfig,
						undefined,
						logger,
					);
					const summarizerTree = await getSummarizerTree(summarizer);
					const summarizerView = setup.viewTree(summarizerTree);

					lifecycleStage = "workload";
					view.runTransaction(() => view.root.removeAt(0), {
						customMetadata: { group: "deletions" },
					});
					const removedRevision = view.branchHistory.getHead()?.revision ?? assert.fail();
					view.runTransaction(() => view.root.removeAt(0), {
						customMetadata: { group: "deletions" },
					});
					const survivorRevision = view.branchHistory.getHead()?.revision ?? assert.fail();
					view.root.insertAtEnd("x");
					const preview = mode === "manual with readers" ? view.fork() : undefined;
					let retainedUndo: RevertibleAlpha | undefined;
					const offRetainedUndo = view.events.on("changed", (_data, getRevertible) => {
						if (mode === "manual with readers" && retainedUndo === undefined) {
							retainedUndo = getRevertible?.();
						}
					});
					view.root.removeAt(0);
					offRetainedUndo();
					if (mode === "manual with readers") {
						assert(
							retainedUndo !== undefined,
							"The protected case must hold the original Undo",
						);
					}
					view.root.insertAtEnd("y");
					await provider.ensureSynchronized();
					const targetSequence = container.deltaManager.lastSequenceNumber;
					// Fixed barriers exceed the local driver's 50-op noop cadence: every mode gets the same history.
					for (let index = 0; index < 52; index++) {
						view.root.insertAtEnd("advance");
						await provider.ensureSynchronized();
					}
					assert(container.deltaManager.minimumSequenceNumber >= targetSequence);
					const content = [...view.root];
					const source = mode === "summary-only" ? summarizerView : view;
					const sourceTree = mode === "summary-only" ? summarizerTree : tree;
					const sourceRole = mode === "summary-only" ? "summarizer" : "author";
					const historyBefore = historyOf(source.branchHistory).map(
						(commit) => commit.revision,
					);
					assert.equal(
						historyBefore.length,
						58,
						"All four cases must start with identical retained history",
					);
					const removedRoots = (target: ITree): readonly unknown[] =>
						(
							target as unknown as {
								kernel: { checkout: { getRemovedRoots(): readonly unknown[] } };
							}
						).kernel.checkout.getRemovedRoots();
					const repairBefore = removedRoots(sourceTree);
					const selectedRevisions = new Set([removedRevision, survivorRevision]);
					const repairDiagnosticsBefore = inspectRepairData(sourceTree, selectedRevisions);
					const failures: LifecycleFailure[] = [];
					const readRevision = (
						stage: string,
						branch: string,
						targetView: StringArrayView,
						revision: string,
						expected: readonly string[],
					): void => {
						const eventOffset = logger.events().length;
						const reader = targetView.fork();
						const forkEvent = logger
							.events()
							.slice(eventOffset)
							.find((event) => event.eventName.endsWith("HistoryForkCreated"));
						try {
							reader.rewindTo(revision);
							assert.deepEqual([...reader.root], expected);
							reader.dispose();
						} catch (error: unknown) {
							// Disposing a broken rewind checkout can mask its original assertion.
							const failure = {
								stage,
								branch,
								revision,
								forkId: typeof forkEvent?.forkId === "number" ? forkEvent.forkId : undefined,
								treeId: typeof forkEvent?.treeId === "string" ? forkEvent.treeId : undefined,
								sessionId:
									typeof forkEvent?.sessionId === "string" ? forkEvent.sessionId : undefined,
								error: String(error),
							};
							failures.push(failure);
							firstFailure ??= failure;
						}
					};
					readRevision("beforeCompactionRead", sourceRole, source, initialRevision, [
						"a",
						"b",
						"c",
					]);
					assert.deepEqual(
						failures,
						[],
						"The retained-state control must work before compaction",
					);
					let manualCalls = 0;
					let removed = 0;
					lifecycleStage = "manualCompaction";
					if (mode === "manual" || mode === "manual with readers") {
						manualCalls++;
						removed = tree.historyCompaction.requestCompaction(policy);
						assert.equal(removed, 1, "The manual case must compose the two deletion commits");
						readRevision(
							"afterCompactionBeforeSerializationRead",
							sourceRole,
							source,
							initialRevision,
							["a", "b", "c"],
						);
					}
					assert.deepEqual([...view.root], content);
					assert.deepEqual([...summarizerView.root], content);
					if (preview !== undefined) {
						assert.deepEqual(
							[...preview.root],
							["c", "x"],
							"The open preview retains its original content",
						);
					}

					// summarizeNow waits for broadcast and acknowledgement, not just local encoding.
					lifecycleStage = "summaryAcknowledgement";
					await provider.ensureSynchronized();
					const { summaryVersion } = await summarizeNow(summarizer);
					assert.equal(
						manualCalls,
						mode === "manual" || mode === "manual with readers" ? 1 : 0,
					);
					const historyAfter = historyOf(source.branchHistory).map(
						(commit) => commit.revision,
					);
					if (mode !== "disabled") {
						removed = historyBefore.length - historyAfter.length;
						assert.equal(removed, 1, "A zero-merge summary-only run is not a valid control");
					} else {
						assert.deepEqual(historyAfter, historyBefore);
					}
					assert(
						historyAfter.includes(initialRevision),
						"The initial state remains a retained revision",
					);
					assert(
						historyAfter.includes(survivorRevision),
						"The newest deletion revision survives composition",
					);
					const repairAfter = removedRoots(sourceTree);
					const repairDiagnosticsAfter = inspectRepairData(sourceTree, selectedRevisions);
					lifecycleStage = "freshClientReload";
					const loadedContainer = await provider.loadTestContainer(config, {
						[LoaderHeader.version]: summaryVersion,
					});
					const loadedTree = await getTree(loadedContainer);
					const loadedView = setup.viewTree(loadedTree);
					await provider.ensureSynchronized();
					const persistedRepairDiagnostics = inspectRepairData(loadedTree, selectedRevisions);
					assert.deepEqual([...loadedView.root], content);
					assert.deepEqual(
						historyOf(loadedView.branchHistory).map((commit) => commit.revision),
						historyOf(summarizerView.branchHistory).map((commit) => commit.revision),
						"Reload must preserve the history actually written by the summarizer",
					);
					assert.deepEqual(
						removedRoots(loadedTree),
						removedRoots(summarizerTree),
						"Detached-root identities and content must round-trip",
					);
					if (mode === "manual" || mode === "manual with readers") {
						assert.equal(
							historyOf(loadedView.branchHistory).length,
							historyAfter.length + 1,
							"Manual-only compaction is local: the separate summarizer persists uncompacted history",
						);
					}

					// Read before further edits so fresh-client failures cannot be attributed to Undo/Redo.
					lifecycleStage = "retainedRevisionRead";
					for (const [branch, targetView] of [
						[sourceRole, source],
						["reloaded", loadedView],
					] as const) {
						for (const [revision, expected] of [
							[initialRevision, ["a", "b", "c"]],
							[survivorRevision, ["c"]],
						] as const) {
							readRevision(
								"afterReloadBeforeUndoRead",
								branch,
								targetView,
								revision,
								expected,
							);
						}
					}

					// Exercise original Undo ownership across compaction, then replicated Undo/Redo with a fresh peer.
					lifecycleStage = "undoRedo";
					const roundTripUndo = async (
						retained: RevertibleAlpha,
						expected: readonly string[],
					): Promise<void> => {
						let retainedRedo: RevertibleAlpha | undefined;
						const off = view.events.on("changed", (_data, getRevertible) => {
							retainedRedo = getRevertible?.();
						});
						retained.revert();
						off();
						await provider.ensureSynchronized();
						assert.deepEqual([...view.root], expected);
						assert.deepEqual([...loadedView.root], expected);
						assert(retainedRedo !== undefined);
						retainedRedo.revert();
						await provider.ensureSynchronized();
						assert.deepEqual([...view.root], content);
						assert.deepEqual([...loadedView.root], content);
					};
					if (retainedUndo !== undefined) {
						await roundTripUndo(retainedUndo, ["c", ...content]);
					}
					let undo: RevertibleAlpha | undefined;
					const offUndo = view.events.on("changed", (_data, getRevertible) => {
						undo = getRevertible?.();
					});
					view.root.removeAt(0);
					offUndo();
					await provider.ensureSynchronized();
					assert(undo !== undefined);
					const deletedContent = content.slice(1);
					let redo: RevertibleAlpha | undefined;
					const offRedo = view.events.on("changed", (_data, getRevertible) => {
						redo = getRevertible?.();
					});
					undo.revert();
					offRedo();
					await provider.ensureSynchronized();
					assert.deepEqual([...view.root], content);
					assert.deepEqual([...loadedView.root], content);
					assert(redo !== undefined);
					redo.revert();
					await provider.ensureSynchronized();
					assert.deepEqual([...view.root], deletedContent);
					assert.deepEqual([...loadedView.root], deletedContent);
					preview?.dispose();

					const trace = logger
						.events()
						.filter((event) => event.eventName.endsWith("HistoryTrace"));
					const encodeFailures = trace.filter(
						(event) =>
							event.activity === "HistoryEncodeFailed" ||
							event.activity === "HistoryRenameConflict",
					);
					const passes = logger
						.events()
						.filter(
							(event) =>
								event.eventName.endsWith("HistoryCompaction") && event.removedCount === 1,
						);
					assert.equal(passes.length, mode === "disabled" ? 0 : 1);
					assert.equal(
						encodeFailures.length,
						0,
						"Rename/serialization failures are tracked separately from reader failures",
					);
					if (process.env.FLUID_HISTORY_COMPACTION_LIFECYCLE === "1" || failures.length > 0) {
						process.stdout.write(
							`[history-lifecycle] ${JSON.stringify({
								mode,
								manualCalls,
								removed,
								summaryVersion,
								sourceRole,
								retainedCountBefore: historyBefore.length,
								historyEncodeCompleted: trace.some(
									(event) =>
										event.activity === "HistoryEncoded" && event.isSummarizer === true,
								),
								undoRedoWithReloadedPeer: "passed",
								protectedUndoAcrossCompaction:
									mode === "manual with readers" ? "passed" : "not acquired",
								repairRootCountBefore: repairBefore.length,
								repairRootCountAfter: repairAfter.length,
								repairDiagnosticsBefore,
								repairDiagnosticsAfter,
								persistedRepairDiagnostics,
								firstFailure,
								failures,
								passes: passes.map((event) => ({
									operationId: event.operationId,
									summaryOperationId: event.summaryOperationId,
									treeId: event.treeId,
									sessionId: event.sessionId,
									isSummarizer: event.isSummarizer,
									trigger: event.trigger,
									removedCount: event.removedCount,
									limitingBoundary: event.limitingBoundary,
									activeForkCount: event.activeForkCount,
								})),
							})}\n`,
						);
					}
					diagnosticWritten = true;
					assert.deepEqual(
						failures,
						[],
						"Retained-revision reads must work, not merely compaction and summary encoding",
					);
				} catch (error: unknown) {
					if (!diagnosticWritten) {
						process.stdout.write(
							`[history-lifecycle] ${JSON.stringify({
								mode,
								firstFailure: firstFailure ?? { stage: lifecycleStage, error: String(error) },
								fatalFailureStage: lifecycleStage,
								events: logger
									.events()
									.filter(
										(event) =>
											event.eventName.endsWith("HistoryCompaction") ||
											(typeof event.activity === "string" &&
												/Failed$|Conflict$/.test(event.activity)),
									)
									.map((event) => ({
										activity: event.activity,
										operationId: event.operationId,
										summaryOperationId: event.summaryOperationId,
										treeId: event.treeId,
										sessionId: event.sessionId,
										isSummarizer: event.isSummarizer,
										failureStage: event.failureStage,
									})),
							})}\n`,
						);
					}
					throw error;
				}
			});
		}
	});

	describe("retained navigation and persisted replacements", () => {
		const { SchemaFactory, TreeViewConfiguration, configuredSharedTree } =
			apis.dataRuntime.packages.tree;
		const sf = new SchemaFactory("history-compaction-detached-replacements");
		class Item extends sf.object("Item", {
			value: sf.number,
			children: sf.array(sf.string),
		}) {}
		class Document extends sf.object("Document", {
			section: sf.optional(Item),
			items: sf.array(Item),
			barriers: sf.array(sf.string),
		}) {}
		const viewConfig = new TreeViewConfiguration({ schema: Document });
		const content = (root: Document) => ({
			section:
				root.section === undefined
					? undefined
					: { value: root.section.value, children: [...root.section.children] },
			items: root.items.map((entry) => ({
				value: entry.value,
				children: [...entry.children],
			})),
			barriers: [...root.barriers],
		});
		const item = (value: number) => ({ value, children: [`child ${value}`] });
		const viewReplacementTree = (tree: ITree) => asAlpha(tree.viewWith(viewConfig));

		for (const mode of ["disabled", "summary-only", "manual"] as const) {
			it(`preserves every retained state through ${mode} compaction, lazy realization and GC`, async function () {
				if (provider.driver.type !== "local") {
					this.skip();
				}
				this.timeout(60_000);
				const logger = createMockLoggerExt(LogLevel.verbose);
				const config: ITestContainerConfig = {
					...testContainerConfig,
					registry: [
						[
							treeId,
							configuredSharedTree({
								retainHistory: true,
								minVersionForCollab: FluidClientVersion.v2_117,
								historyCompaction:
									mode === "summary-only" ? { canCompactCommit: sameGroup } : undefined,
							}).getFactory(),
						],
					],
					loaderProps: {
						logger,
						configProvider: {
							getRawConfig: (name) =>
								name === "Fluid.SharedTree.HistoryDebugTrace" ? true : undefined,
						},
					},
				};
				const summarizerConfig = {
					...config,
					runtimeOptions: {
						...config.runtimeOptions,
						summaryOptions: undefined,
					},
				};
				let stage = "setup";
				let targetRevision: string | undefined;
				try {
					const container = await provider.makeTestContainer(config);
					const tree = await getTree(container);
					const view = viewReplacementTree(tree);
					view.initialize({
						section: item(0),
						items: [item(1), item(2)],
						barriers: [],
					});
					await provider.ensureSynchronized();
					const snapshots = new Map<string, ReturnType<typeof content>>();
					const record = (): void => {
						snapshots.set(
							view.branchHistory.getHead()?.revision ?? assert.fail(),
							content(view.root),
						);
					};
					record();
					const first = await createSummarizer(
						provider,
						container,
						summarizerConfig,
						undefined,
						logger,
					);
					const summarizerTree = await getSummarizerTree(first.summarizer);
					const summarizerView = viewReplacementTree(summarizerTree);
					stage = "workload";
					for (let group = 0; group < 9; group++) {
						view.runTransaction(
							() => {
								if (view.root.section === undefined) {
									view.root.section = new Item(item(group));
								} else {
									view.root.section.value = group;
									view.root.section.children.insertAtEnd(`edited ${group}`);
								}
								view.root.items[0].value = group;
								view.root.items[0].children.insertAtEnd(`nested ${group}`);
							},
							{ customMetadata: { group } },
						);
						record();
						view.runTransaction(
							() => {
								if (group % 3 === 0) {
									view.root.section = new Item(item(100 + group));
								} else if (group % 3 === 1) {
									view.root.section = undefined;
								} else {
									assert(view.root.section !== undefined);
									view.root.section.children.removeAt(0);
									view.root.section.children.insertAtEnd(`replacement ${group}`);
									view.root.items.moveToEnd(0);
								}
								view.root.items.removeAt(0);
								view.root.items.insertAtStart(item(200 + group));
							},
							{ customMetadata: { group } },
						);
						record();
					}
					await provider.ensureSynchronized();
					const targetSequence = container.deltaManager.lastSequenceNumber;
					for (let index = 0; index < 52; index++) {
						view.root.barriers.insertAtEnd("advance");
						record();
						await provider.ensureSynchronized();
					}
					assert(container.deltaManager.minimumSequenceNumber >= targetSequence);
					const expectedContent = content(view.root);
					const before = historyOf(view.branchHistory).map((commit) => commit.revision);
					assert.equal(before.length, 71);
					const checkNavigation = (target: ReturnType<typeof viewReplacementTree>): void => {
						const retained = historyOf(target.branchHistory);
						for (const commit of retained) {
							targetRevision = commit.revision;
							const reader = target.fork();
							reader.rewindTo(commit.revision);
							assert.deepEqual(content(reader.root), snapshots.get(commit.revision));
							reader.dispose();
						}
						for (let pass = 0; pass < 2; pass++) {
							const reader = target.fork();
							for (const commit of [...retained].reverse()) {
								targetRevision = commit.revision;
								reader.rewindTo(commit.revision);
								assert.deepEqual(content(reader.root), snapshots.get(commit.revision));
							}
							reader.dispose();
						}
						assert.deepEqual(content(target.root), expectedContent);
					};
					stage = "beforeCompactionRead";
					checkNavigation(view);
					if (mode === "manual") {
						stage = "manualCompaction";
						assert.equal(tree.historyCompaction.requestCompaction(sameGroup), 9);
						checkNavigation(view);
						// Serialize manually compacted history too, not the summarizer's uncompacted control.
						assert.equal(summarizerTree.historyCompaction.requestCompaction(sameGroup), 9);
					}
					stage = "firstSummary";
					const firstSummary = await summarizeNow(first.summarizer, {
						reason: "persist replacement history",
						fullTree: true,
					});
					assert(getGCStateFromSummary(firstSummary.summaryTree) !== undefined);
					assert.equal(
						summarizerView.branchHistory.length,
						before.length - (mode === "disabled" ? 0 : 9),
					);
					stage = "afterCompactionRead";
					checkNavigation(summarizerView);
					const persistedRevisions = historyOf(summarizerView.branchHistory).map(
						(commit) => commit.revision,
					);
					if (mode === "disabled" || mode === "summary-only") {
						assert.deepEqual(
							historyOf(view.branchHistory).map((commit) => commit.revision),
							before,
							"Summary compaction must not rewrite the author's history",
						);
					}
					first.container.close();
					// Do not fetch the new summarizer's tree before GC/summary realizes it.
					stage = "lazySummarizerLoad";
					const coldLoadOffset = logger.events().length;
					const second = await createSummarizer(
						provider,
						container,
						summarizerConfig,
						firstSummary.summaryVersion,
						logger,
					);
					assert(
						!logger
							.events()
							.slice(coldLoadOffset)
							.some((event) => event.activity === "HistoryLoadCompleted"),
						"The replacement summarizer must not eagerly realize the tree",
					);
					stage = "lazyGcSummary";
					const secondSummary = await summarizeNow(second.summarizer, {
						reason: "realize and collect persisted replacement history",
						fullTree: true,
					});
					assert(getGCStateFromSummary(secondSummary.summaryTree) !== undefined);
					assert(
						logger
							.events()
							.slice(coldLoadOffset)
							.some((event) => event.activity === "HistoryLoadCompleted"),
						"GC/summary must realize and decode the persisted history",
					);
					stage = "afterLazySummaryRead";
					const secondView = viewReplacementTree(await getSummarizerTree(second.summarizer));
					checkNavigation(secondView);
					assert.deepEqual(
						historyOf(secondView.branchHistory).map((commit) => commit.revision),
						persistedRevisions,
					);
					stage = "freshClientReload";
					const loaded = await provider.loadTestContainer(config, {
						[LoaderHeader.version]: secondSummary.summaryVersion,
					});
					const loadedView = viewReplacementTree(await getTree(loaded));
					checkNavigation(loadedView);
					const events = logger.events();
					const passes = events.filter(
						(event) =>
							event.eventName.endsWith("HistoryCompaction") && event.removedCount === 9,
					);
					assert.equal(passes.length, mode === "disabled" ? 0 : mode === "manual" ? 2 : 1);
					assert(
						events.some(
							(event) =>
								event.activity === "HistoryValidationDecodeStarted" &&
								event.codec === "modularV2",
						),
					);
					assert(
						!events.some(
							(event) =>
								typeof event.activity === "string" && /Failed$|Conflict$/.test(event.activity),
						),
					);
				} catch (error: unknown) {
					process.stdout.write(
						`[history-replacements] ${JSON.stringify({
							mode,
							stage,
							targetRevision,
							error: String(error),
							events: logger
								.events()
								.filter(
									(event) =>
										event.eventName.endsWith("HistoryCompaction") ||
										(typeof event.activity === "string" &&
											/Failed$|Conflict$|MissingRepairData$/.test(event.activity)),
								),
						})}\n`,
					);
					throw error;
				}
			});
		}
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
					assert.equal(summarizerTree.historyCompaction.requestCompaction(sameGroup), 3);
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
			// No pins and a `true`-returning policy: every eligible pair is offered and merged by default.
			assert.equal(firstPass.preservedPairCount, 0);
			assert.equal(firstPass.eligiblePairCount, firstPass.policyCallCount);
			assert.equal(firstPass.eligibleCommitCount, (firstPass.eligiblePairCount as number) + 1);
			assert.equal(firstPass.defaultMergeCount, 36);
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
			// The pinned middle commit blocks both pairs it belongs to.
			assert.equal(compactionEvent?.preservedPairCount, 2);
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
