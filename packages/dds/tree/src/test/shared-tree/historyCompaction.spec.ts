/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { setTimeout as delay } from "node:timers/promises";

import type {
	IChannel,
	IChannelFactory,
} from "@fluidframework/datastore-definitions/internal";
import type { IIdCompressor } from "@fluidframework/id-compressor";
import type { ISummaryTree, SummaryObject } from "@fluidframework/driver-definitions";
import { SummaryType } from "@fluidframework/driver-definitions";
import {
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";

import { asAlpha } from "../../api.js";
import { FluidClientVersion } from "../../codec/index.js";
import type { CustomMetadataTree } from "../../core/index.js";
import { FormatValidatorBasic } from "../../external-utilities/index.js";
import {
	TreeViewConfiguration,
	type CanCompactCommit,
	type ITree,
	type TreeBranchHistory,
	type TreeViewAlpha,
} from "../../simple-tree/index.js";
import { configuredSharedTree, type ISharedTree } from "../../treeFactory.js";
import type { JsonCompatibleReadOnlyObject } from "../../util/index.js";
import { StringArray, TestTreeProviderLite } from "../utils.js";

const config = new TreeViewConfiguration({ schema: StringArray });

/**
 * Makes a SharedTree factory that uses a format version which persists commit metadata.
 * @param summaryPolicy - When provided, configured as the `historyCompaction` option so that it runs on every summary.
 */
function makeFactory(
	retainHistory: boolean | number,
	summaryPolicy?: CanCompactCommit,
	enableRevisionPreservation = false,
): IChannelFactory<ITree> {
	return configuredSharedTree({
		jsonValidator: FormatValidatorBasic,
		minVersionForCollab: FluidClientVersion.v2_117,
		retainHistory,
		historyCompaction:
			summaryPolicy === undefined && !enableRevisionPreservation
				? undefined
				: { canCompactCommit: summaryPolicy, enableRevisionPreservation },
	}).getFactory();
}

/** Combines adjacent commits that the application tagged with the same `group`. */
const sameGroup: CanCompactCommit = ({ current, target }) =>
	current.custom?.group !== undefined && current.custom.group === target.custom?.group;

/**
 * The kinds of edit used to measure compaction.
 * - `append`: every edit inserts a new item, so all of the content survives composition.
 * - `overwrite`: every edit replaces the same item, so composition can drop the intermediate values.
 */
type EditKind = "append" | "overwrite";

/**
 * Makes `groups * editsPerGroup` single-edit transactions on the first of two connected clients,
 * tagging each with its group, and then moves the collaboration window past all of them.
 */
function generateHistory(
	kind: EditKind,
	groups: number,
	editsPerGroup: number,
	retainHistory: boolean | number = true,
	summaryPolicy?: CanCompactCommit,
): {
	provider: TestTreeProviderLite;
	view: TreeViewAlpha<typeof StringArray>;
	otherView: TreeViewAlpha<typeof StringArray>;
} {
	const provider = new TestTreeProviderLite(2, makeFactory(retainHistory, summaryPolicy));
	const view = asAlpha(provider.trees[0].viewWith(config));
	view.initialize(kind === "overwrite" ? ["initial"] : []);
	provider.synchronizeMessages();
	const other = asAlpha(provider.trees[1].viewWith(config));
	for (let group = 0; group < groups; group++) {
		for (let edit = 0; edit < editsPerGroup; edit++) {
			const value = `group ${group} edit ${edit}`;
			view.runTransaction(
				() => {
					if (kind === "append") {
						view.root.insertAtEnd(value);
					} else {
						view.root.removeAt(0);
						view.root.insertAtStart(value);
					}
				},
				{ customMetadata: { group } },
			);
		}
	}
	provider.synchronizeMessages();
	// Edits from both clients that reference the edits above advance the minimum sequence number past them.
	view.root.insertAtEnd("x");
	other.root.insertAtEnd("y");
	provider.synchronizeMessages();
	return { provider, view, otherView: other };
}

function countCommits(history: TreeBranchHistory): number {
	let count = 0;
	for (let commit = history.getHead(); commit !== undefined; commit = commit.getParent()) {
		count++;
	}
	return count;
}

function blobSize(summary: SummaryObject): number {
	switch (summary.type) {
		case SummaryType.Tree: {
			return Object.values(summary.tree).reduce((sum, child) => sum + blobSize(child), 0);
		}
		case SummaryType.Blob: {
			return typeof summary.content === "string"
				? summary.content.length
				: summary.content.byteLength;
		}
		default: {
			return 0;
		}
	}
}

/** Finds the summary subtree that holds the edit manager's history. */
function findEditManager(summary: ISummaryTree): SummaryObject {
	const found = Object.entries(summary.tree).find(([key]) =>
		key.toLowerCase().includes("editmanager"),
	);
	if (found !== undefined) {
		return found[1];
	}
	for (const child of Object.values(summary.tree)) {
		if (child.type === SummaryType.Tree) {
			try {
				return findEditManager(child);
			} catch {
				// Keep looking in the other subtrees.
			}
		}
	}
	throw new Error("No edit manager summary");
}

async function summarize(tree: ITree): Promise<ISummaryTree> {
	const { summary } = await (tree as unknown as IChannel).summarize();
	return summary;
}

interface SizeReport {
	readonly commits: number;
	readonly summaryBytes: number;
	readonly historyBytes: number;
}

async function measure(
	tree: ITree,
	view: TreeViewAlpha<typeof StringArray>,
): Promise<SizeReport> {
	const summary = await summarize(tree);
	return {
		commits: countCommits(view.branchHistory),
		summaryBytes: blobSize(summary),
		historyBytes: blobSize(findEditManager(summary)),
	};
}

async function loadFromSummary(
	summary: ISummaryTree,
	idCompressor: IIdCompressor,
	retainHistory = true,
	enableRevisionPreservation = false,
): Promise<ISharedTree> {
	const runtime = new MockFluidDataStoreRuntime({ idCompressor });
	const factory = makeFactory(retainHistory, undefined, enableRevisionPreservation);
	return (await factory.load(
		runtime,
		"loaded",
		{
			deltaConnection: runtime.createDeltaConnection(),
			objectStorage: MockStorage.createFromSummary(summary),
		},
		factory.attributes,
	)) as ISharedTree;
}

/** When set, the measurement tests print their numbers. Used to produce the tables in `DEV.md`. */
const printReport = process.env.FLUID_HISTORY_COMPACTION_REPORT !== undefined;

/** Writes a measurement line. The test setup silences `console`, so this writes to stdout directly. */
function report(line: string): void {
	process.stdout.write(`[history-compaction] ${line}\n`);
}

/** Heap in use after a full garbage collection. Requires running node with `--expose-gc`. */
function heapUsedAfterGc(gc: () => void): number {
	gc();
	gc();
	return process.memoryUsage().heapUsed;
}

/** Creates connected clients and helpers for authoring nested metadata, logging, and compacting history. */
function setupCompactionWalkthrough(
	enableRevisionPreservation = false,
	metadataMode: "default" | "replacement" = "replacement",
) {
	const provider = new TestTreeProviderLite(
		2,
		makeFactory(true, undefined, enableRevisionPreservation),
	);
	const tree = provider.trees[0];
	const view = asAlpha(tree.viewWith(config));
	view.initialize([]);
	provider.synchronizeMessages();
	const other = asAlpha(provider.trees[1].viewWith(config));
	const started = Date.now();
	const log = (message: string): void => {
		if (process.env.FLUID_HISTORY_COMPACTION_WALKTHROUGH === "1") {
			report(`[walkthrough +${((Date.now() - started) / 1000).toFixed(1)}s] ${message}`);
		}
	};

	const historyMetadata = (history: TreeBranchHistory): JsonCompatibleReadOnlyObject[] => {
		const metadata: JsonCompatibleReadOnlyObject[] = [];
		for (let commit = history.getHead(); commit !== undefined; commit = commit.getParent()) {
			if (commit.custom?.session !== undefined) {
				metadata.unshift(commit.custom);
			}
		}
		return metadata;
	};
	const snapshot = (label: string): void => {
		log(`${label}: metadata (oldest first; initialization and window-advance edits omitted)`);
		const entries: string[] = [];
		for (
			let commit = view.branchHistory.getHead();
			commit !== undefined;
			commit = commit.getParent()
		) {
			if (commit.custom?.session !== undefined) {
				entries.unshift(
					JSON.stringify(
						{
							revision: commit.revision,
							preserved:
								enableRevisionPreservation &&
								asAlpha(tree).historyCompaction.isRevisionPreserved(commit.revision),
							custom: commit.custom,
							customTree: commit.customTree,
						},
						undefined,
						2,
					),
				);
			}
		}
		for (const entry of entries) {
			log(entry);
		}
	};
	const edit = async (name: string, session: string, waitMs: number) => {
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
		provider.synchronizeMessages();
		log(`Sequenced ${name}: ${JSON.stringify(metadata)}`);
		return metadata;
	};
	const advanceWindow = (): void => {
		// Both clients send edits referencing the preceding commits, advancing the minimum sequence number.
		view.root.insertAtEnd("window advance: client 1");
		other.root.insertAtEnd("window advance: client 2");
		provider.synchronizeMessages();
		log("Both clients advanced the collaboration window; earlier edits are now history-only.");
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
			`Callback ${older.name} + ${newer.name}: sameSession=${sameSession}, durationFromStart=${duration}ms < 4000ms => ${combine ? "COMBINE" : "KEEP"}`,
		);
		if (!combine) {
			return false;
		}
		if (metadataMode === "default") {
			log("  Returning true: keep both original metadata trees, including nested children.");
			return true;
		}
		// Preserve the run's first timestamp, not just its newest one, for the next pair.
		const merged = {
			name: `${older.name}+${newer.name}`,
			session: newer.session,
			startTimestamp: start,
			timestamp: newer.timestamp,
			isCompacted: true,
		};
		log(`  Returned metadata (replaces originals): ${JSON.stringify(merged)}`);
		return merged;
	};
	const compact = (expectedRemoved: number, canCompactCommit = policy): void => {
		snapshot("BEFORE compaction");
		const content = [...view.root];
		const removed = asAlpha(tree).historyCompaction.requestCompaction(canCompactCommit);
		log(`Removed ${removed} commits; document content is unchanged.`);
		assert.equal(removed, expectedRemoved);
		assert.deepEqual([...view.root], content);
		snapshot("AFTER compaction");
	};
	return {
		provider,
		tree,
		view,
		log,
		historyMetadata,
		snapshot,
		edit,
		advanceWindow,
		compact,
		policy,
	};
}

/** Adds revision tracking and independent metadata expectations for staged pin/unpin walkthroughs. */
function setupPreservationWalkthrough(metadataMode: "default" | "replacement") {
	const { provider, tree, view, edit, advanceWindow, compact, policy, log } =
		setupCompactionWalkthrough(true, metadataMode);
	const compaction = asAlpha(tree).historyCompaction;
	const commits = new Map<
		string,
		{
			revision: string;
			sequenceNumber: number;
			metadata: Awaited<ReturnType<typeof edit>>;
		}
	>();
	const preservedNames = new Set<string>();
	const getCommit = (name: string) =>
		commits.get(name) ?? assert.fail(`Unknown commit ${name}`);
	const author = async (name: string, session: string): Promise<void> => {
		const metadata = await edit(name, session, 0);
		commits.set(name, {
			revision: view.branchHistory.getHead()?.revision ?? assert.fail("Expected a commit"),
			sequenceNumber: provider.sequenceNumber,
			metadata,
		});
	};
	const setPreserved = (name: string, preserved: boolean): void => {
		const { revision } = getCommit(name);
		compaction.setRevisionPreserved(revision, preserved);
		provider.synchronizeMessages();
		for (const client of provider.trees) {
			assert.equal(asAlpha(client).historyCompaction.isRevisionPreserved(revision), preserved);
		}
		if (preserved) {
			preservedNames.add(name);
		} else {
			preservedNames.delete(name);
		}
		log(
			`${preserved ? "Preserved" : "Unpreserved"} ${name}: ${revision} (both clients agree).`,
		);
	};
	const assertWindow = (names: readonly string[], historyOnly: boolean): void => {
		for (const name of names) {
			const { sequenceNumber } = getCommit(name);
			assert.equal(
				sequenceNumber <= provider.minimumSequenceNumber,
				historyOnly,
				`${name}: sequence ${sequenceNumber}, MSN ${provider.minimumSequenceNumber}`,
			);
		}
		log(
			`${names.join(", ")} are ${historyOnly ? "history-only" : "still needed for correctness"}; MSN=${provider.minimumSequenceNumber}.`,
		);
	};
	const originalTree = (name: string): CustomMetadataTree => {
		const { metadata } = getCommit(name);
		return {
			metadata,
			children: [{ metadata: { ...metadata, name: `${name}.insert` }, children: [] }],
		};
	};
	const assertHistory = (
		runs: readonly (readonly string[])[],
		history: TreeBranchHistory = view.branchHistory,
	): void => {
		const expected = runs.map((names) => {
			const first = getCommit(names[0]);
			const last = getCommit(names.at(-1) ?? assert.fail("Expected a non-empty run"));
			const custom =
				names.length === 1 || metadataMode === "default"
					? last.metadata
					: {
							name: names.join("+"),
							session: last.metadata.session,
							startTimestamp: first.metadata.timestamp,
							timestamp: last.metadata.timestamp,
							isCompacted: true,
						};
			let customTree = originalTree(names[0]);
			if (names.length > 1) {
				if (metadataMode === "default") {
					for (const name of names.slice(1)) {
						customTree = {
							metadata: undefined,
							children: [customTree, originalTree(name)],
						};
					}
				} else {
					customTree = { metadata: custom, children: [] };
				}
			}
			return { revision: last.revision, custom, customTree };
		});
		const actual = [];
		for (let commit = history.getHead(); commit !== undefined; commit = commit.getParent()) {
			if (commit.custom?.session !== undefined) {
				actual.unshift({
					revision: commit.revision,
					custom: commit.custom,
					customTree: commit.customTree,
				});
			}
		}
		assert.deepEqual(actual, expected);
	};
	const compactStage = (
		label: string,
		expectedRemoved: number,
		runs: readonly (readonly string[])[],
	): void => {
		log(`STAGE: ${label} (${metadataMode} metadata)`);
		compact(expectedRemoved, (pair) => {
			for (const candidate of [pair.current, pair.target]) {
				assert(!compaction.isRevisionPreserved(candidate.revision), "Pinned commit offered");
				for (const commit of commits.values()) {
					if (commit.revision === candidate.revision) {
						assert(
							commit.sequenceNumber <= provider.minimumSequenceNumber,
							"Commit still needed for correctness was offered",
						);
					}
				}
			}
			return policy(pair);
		});
		assertHistory(runs);
		for (const name of preservedNames) {
			assert(compaction.isRevisionPreserved(getCommit(name).revision));
		}
	};
	const checkSummary = async (runs: readonly (readonly string[])[]): Promise<void> => {
		assertHistory(runs);
		const loaded = await loadFromSummary(
			await summarize(tree),
			provider.getCompressor(tree),
			true,
			true,
		);
		assertHistory(runs, loaded.kernel.checkout.branchHistory);
		for (const [name, { revision }] of commits) {
			assert.equal(
				asAlpha(loaded).historyCompaction.isRevisionPreserved(revision),
				preservedNames.has(name),
				`${name}'s pin after summary reload`,
			);
		}
		assert.deepEqual([...loaded.viewWith(config).root], [...view.root]);
		log(
			"Summary reloaded: exact revisions, metadata trees, pins and document content survived.",
		);
	};
	return { author, setPreserved, assertWindow, advanceWindow, compactStage, checkSummary };
}

describe("History compaction", () => {
	for (const mode of ["default", "replacement"] as const) {
		it(`preserves old and newly sequenced revisions while compacting surrounding history (${mode} metadata)`, async () => {
			const { author, setPreserved, assertWindow, advanceWindow, compactStage, checkSummary } =
				setupPreservationWalkthrough(mode);

			// B is pinned in old history; E is pinned while newly sequenced.
			for (const name of ["A", "B", "C"]) {
				await author(name, "session-1");
			}
			advanceWindow();
			assertWindow(["A", "B", "C"], true);
			setPreserved("B", true);
			await author("D", "session-2");
			await author("E", "session-2");
			setPreserved("E", true);
			await author("F", "session-2");
			advanceWindow();
			assertWindow(["D", "E", "F"], true);
			compactStage("B and E block both directions", 0, [
				["A"],
				["B"],
				["C"],
				["D"],
				["E"],
				["F"],
			]);

			// More edits arrive after pinning. Releasing H cannot bypass the collaboration window.
			await author("G", "session-3");
			await author("H", "session-3");
			setPreserved("H", true);
			await author("I", "session-3");
			assertWindow(["G", "H", "I"], false);
			setPreserved("B", false);
			setPreserved("H", false);
			assertWindow(["G", "H", "I"], false);
			compactStage("unpin old B and new H; E stays pinned", 2, [
				["A", "B", "C"],
				["D"],
				["E"],
				["F"],
				["G"],
				["H"],
				["I"],
			]);

			advanceWindow();
			assertWindow(["G", "H", "I"], true);
			await author("J", "session-4");
			await author("K", "session-4");
			setPreserved("K", true);
			assertWindow(["J", "K"], false);
			const withPins = [["A", "B", "C"], ["D"], ["E"], ["F"], ["G", "H", "I"], ["J"], ["K"]];
			compactStage("G/H/I are eligible now; E and K stay pinned", 2, withPins);
			await checkSummary(withPins);

			// Release a history-only pin and a correctness-window pin in the same pass.
			setPreserved("E", false);
			setPreserved("K", false);
			assertWindow(["J", "K"], false);
			compactStage("unpin older E and newest K; J/K still need correctness", 2, [
				["A", "B", "C"],
				["D", "E", "F"],
				["G", "H", "I"],
				["J"],
				["K"],
			]);

			advanceWindow();
			assertWindow(["J", "K"], true);
			const finalRuns = [
				["A", "B", "C"],
				["D", "E", "F"],
				["G", "H", "I"],
				["J", "K"],
			];
			compactStage("J/K finally become history-only", 1, finalRuns);
			await checkSummary(finalRuns);
		});
	}

	for (const mode of ["default", "replacement"] as const) {
		it(`${mode} compaction ${mode === "default" ? "preserves" : "discards"} nested metadata children`, async () => {
			const { provider, tree, view, edit, advanceWindow, compact } =
				setupCompactionWalkthrough();
			const a = await edit("A", "session-1", 0);
			const aTree = view.branchHistory.getHead()?.customTree;
			const b = await edit("B", "session-1", 0);
			const bTree = view.branchHistory.getHead()?.customTree;
			assert.deepEqual(aTree, {
				metadata: a,
				children: [{ metadata: { ...a, name: "A.insert" }, children: [] }],
			});
			assert.deepEqual(bTree, {
				metadata: b,
				children: [{ metadata: { ...b, name: "B.insert" }, children: [] }],
			});
			advanceWindow();

			// A and B each contain an inner transaction. Only the return value determines whether those children survive.
			const replacement = {
				name: "A+B",
				session: a.session,
				startTimestamp: a.timestamp,
				timestamp: b.timestamp,
			};
			compact(1, ({ current, target }) => {
				if (current.custom?.name !== "A" || target.custom?.name !== "B") {
					return false;
				}
				assert.deepEqual(current.customTree, aTree);
				assert.deepEqual(target.customTree, bTree);
				return mode === "default" ? true : replacement;
			});

			const expectedCustom = mode === "default" ? b : replacement;
			const expectedTree =
				mode === "default"
					? { metadata: undefined, children: [aTree, bTree] }
					: { metadata: replacement, children: [] };
			const assertMetadata = (history: TreeBranchHistory): void => {
				const annotated = [];
				for (
					let commit = history.getHead();
					commit !== undefined;
					commit = commit.getParent()
				) {
					if (commit.custom?.session === a.session) {
						annotated.push({ custom: commit.custom, customTree: commit.customTree });
					}
				}
				assert.deepEqual(annotated, [{ custom: expectedCustom, customTree: expectedTree }]);
			};
			assertMetadata(view.branchHistory);
			const loaded = await loadFromSummary(
				await summarize(tree),
				provider.getCompressor(tree),
			);
			assertMetadata(loaded.kernel.checkout.branchHistory);
			assert.deepEqual([...loaded.viewWith(config).root], [...view.root]);
		});
	}

	describe("persisted size", () => {
		const cases: { kind: EditKind; groups: number; editsPerGroup: number }[] = [
			{ kind: "append", groups: 10, editsPerGroup: 10 },
			{ kind: "append", groups: 1, editsPerGroup: 100 },
			{ kind: "overwrite", groups: 10, editsPerGroup: 10 },
			{ kind: "overwrite", groups: 1, editsPerGroup: 100 },
		];
		for (const { kind, groups, editsPerGroup } of cases) {
			it(`shrinks the summarized history (${kind}, ${groups} groups of ${editsPerGroup} edits)`, async () => {
				const { provider, view } = generateHistory(kind, groups, editsPerGroup);
				const tree = provider.trees[0];
				const before = await measure(tree, view);

				const removedCount = asAlpha(tree).historyCompaction.requestCompaction(sameGroup);
				const after = await measure(tree, view);

				// The last edit of each group survives. The newest eligible commit is never removed, so
				// the boundary into the following unannotated edits is unaffected.
				assert.equal(removedCount, groups * (editsPerGroup - 1));
				assert.equal(after.commits, before.commits - removedCount);
				assert(after.historyBytes < before.historyBytes);
				assert(after.summaryBytes < before.summaryBytes);

				if (printReport) {
					const ratio = (n: number, d: number): string => `${((100 * n) / d).toFixed(1)}%`;
					report(
						JSON.stringify({
							kind,
							groups,
							editsPerGroup,
							before,
							after,
							historyRemaining: ratio(after.historyBytes, before.historyBytes),
							summaryRemaining: ratio(after.summaryBytes, before.summaryBytes),
						}),
					);
				}
			});
		}

		it("matches a client that never retained the history", async () => {
			// This is the floor: without `retainHistory`, history is trimmed to the collaboration window.
			const retained = generateHistory("append", 10, 10, true);
			const trimmed = generateHistory("append", 10, 10, false);
			asAlpha(retained.provider.trees[0]).historyCompaction.requestCompaction(sameGroup);
			const compacted = await measure(retained.provider.trees[0], retained.view);
			const none = await measure(trimmed.provider.trees[0], trimmed.view);
			assert(none.historyBytes <= compacted.historyBytes);
			if (printReport) {
				report(JSON.stringify({ trimmedHistory: none, compacted }));
			}
		});
	});

	describe("memory", function () {
		// Generating a long history and forcing garbage collections is slow.
		this.timeout(60_000);
		const gc = (globalThis as { gc?: () => void }).gc;
		// Only runs when measuring, because heap numbers are noisy and need `node --expose-gc`.
		const itIfMeasuring = printReport && gc !== undefined ? it : it.skip;
		for (const kind of ["append", "overwrite"] as const) {
			itIfMeasuring(`reports retained heap before and after compaction (${kind})`, () => {
				assert(gc !== undefined);
				const { provider } = generateHistory(kind, 1, 1000);
				const tree = provider.trees[0];
				const before = heapUsedAfterGc(gc);
				const removedCount = asAlpha(tree).historyCompaction.requestCompaction(sameGroup);
				const after = heapUsedAfterGc(gc);
				report(
					JSON.stringify({
						kind,
						edits: 1000,
						removedCount,
						heapBefore: before,
						heapAfter: after,
						savedBytes: before - after,
						savedBytesPerCommit: Math.round((before - after) / removedCount),
					}),
				);
			});
		}
	});

	describe("per-client history and direct summaries", () => {
		it("only affects the history of the client that compacts", async () => {
			const { provider, view, otherView } = generateHistory("append", 2, 3);
			const [compactingTree] = provider.trees;
			const otherCommitsBefore = countCommits(otherView.branchHistory);

			asAlpha(compactingTree).historyCompaction.requestCompaction(sameGroup);

			assert.equal(countCommits(view.branchHistory), otherCommitsBefore - 4);
			assert.equal(
				countCommits(otherView.branchHistory),
				otherCommitsBefore,
				"Compaction is not sent to other clients",
			);
			// The two clients still have the same content and still collaborate.
			assert.deepEqual([...view.root], [...otherView.root]);
			otherView.root.insertAtEnd("after compaction");
			view.root.insertAtStart("after compaction too");
			provider.synchronizeMessages();
			assert.deepEqual([...view.root], [...otherView.root]);
		});

		it("is persisted only by summaries from the client that compacted", async () => {
			const { provider, view } = generateHistory("append", 2, 3);
			const [compactingTree, otherTree] = provider.trees;
			asAlpha(compactingTree).historyCompaction.requestCompaction(sameGroup);

			const fromCompacting = await loadFromSummary(
				await summarize(compactingTree),
				provider.getCompressor(compactingTree),
			);
			const fromOther = await loadFromSummary(
				await summarize(otherTree),
				provider.getCompressor(otherTree),
			);
			const commits = (tree: ISharedTree): number =>
				countCommits(tree.kernel.checkout.branchHistory);

			assert.equal(commits(fromCompacting), countCommits(view.branchHistory));
			assert.equal(commits(fromOther), commits(fromCompacting) + 4);
		});

		it("has nothing to compact on a client loaded from a summary until it processes ops", async () => {
			// A freshly loaded client does not know the minimum sequence number yet, so it must assume
			// that all of the loaded history may still be needed for collaboration.
			const { provider } = generateHistory("append", 2, 3);
			const original = provider.trees[0];
			const loaded = await loadFromSummary(
				await summarize(original),
				provider.getCompressor(original),
			);
			const removedCount = asAlpha(loaded).historyCompaction.requestCompaction(() => true);
			assert.equal(removedCount, 0);
		});

		it("has nothing to compact when history is not retained", () => {
			const { provider } = generateHistory("append", 2, 3, false);
			const removedCount = asAlpha(provider.trees[0]).historyCompaction.requestCompaction(
				() => true,
			);
			assert.equal(removedCount, 0);
		});
	});

	describe("commit metadata given to the policy", () => {
		it("cannot distinguish default-compacted metadata from a nested transaction", async () => {
			const a = { name: "A", session: "session-1", timestamp: 0 };
			const b = { name: "B", session: "session-1", timestamp: 2 };
			const c = { name: "C", session: "session-1", timestamp: 3 };
			const abTree: CustomMetadataTree = {
				metadata: undefined,
				children: [
					{ metadata: a, children: [] },
					{ metadata: b, children: [] },
				],
			};
			const abcTree: CustomMetadataTree = {
				metadata: undefined,
				children: [abTree, { metadata: c, children: [] }],
			};
			const readMetadata = (history: TreeBranchHistory) => {
				const entries = [];
				for (
					let commit = history.getHead();
					commit !== undefined;
					commit = commit.getParent()
				) {
					if (commit.custom?.session !== undefined) {
						entries.unshift({
							revision: commit.revision,
							custom: commit.custom,
							customTree: commit.customTree,
						});
					}
				}
				return entries;
			};

			for (const authoring of ["separate commits", "nested transaction"] as const) {
				const { provider, tree, view, advanceWindow, snapshot, log } =
					setupCompactionWalkthrough();
				const append = (metadata: typeof a): void => {
					view.runTransaction(() => view.root.insertAtEnd(metadata.name), {
						customMetadata: metadata,
					});
				};
				if (authoring === "separate commits") {
					append(a);
					append(b);
				} else {
					// One authored commit has exactly the metadata tree that default compaction creates.
					view.runTransaction(() => {
						append(a);
						append(b);
					});
				}
				provider.synchronizeMessages();
				const abRevision =
					view.branchHistory.getHead()?.revision ?? assert.fail("Expected A/B history");
				append(c);
				provider.synchronizeMessages();
				const cRevision = view.branchHistory.getHead()?.revision ?? assert.fail("Expected C");
				advanceWindow();
				log(`PROVENANCE: ${authoring}`);
				snapshot("BEFORE default compaction");
				const content = [...view.root];
				const offeredBeforeC: {
					custom: JsonCompatibleReadOnlyObject | undefined;
					customTree: CustomMetadataTree | undefined;
				}[] = [];

				const removed = asAlpha(tree).historyCompaction.requestCompaction(
					({ current, target }) => {
						if (current.custom?.name === "A" && target.custom?.name === "B") {
							return true;
						}
						if (current.custom?.name === "B" && target.custom?.name === "C") {
							offeredBeforeC.push({ custom: current.custom, customTree: current.customTree });
							assert.equal(current.revision, abRevision);
							assert.equal("isCompacted" in current, false, "No system-managed flag");
							assert.equal(current.custom.isCompacted, undefined, "No app marker was added");
							log(
								`Callback before C: ${JSON.stringify(offeredBeforeC.at(-1))}; no isCompacted flag.`,
							);
							return true;
						}
						return false;
					},
				);

				assert.equal(removed, authoring === "separate commits" ? 2 : 1);
				assert.deepEqual(offeredBeforeC, [{ custom: b, customTree: abTree }]);
				const expected = [{ revision: cRevision, custom: c, customTree: abcTree }];
				assert.deepEqual(readMetadata(view.branchHistory), expected);
				assert.deepEqual([...view.root], content);
				assert.equal(
					readMetadata(provider.trees[1].kernel.checkout.branchHistory).length,
					authoring === "separate commits" ? 3 : 2,
					"The other client did not compact",
				);
				snapshot("AFTER default compaction");

				const loaded = await loadFromSummary(
					await summarize(tree),
					provider.getCompressor(tree),
				);
				assert.deepEqual(readMetadata(loaded.kernel.checkout.branchHistory), expected);
				assert.deepEqual([...loaded.viewWith(config).root], content);
				log(
					`Summary reloaded (${authoring}): same metadata tree, still no provenance marker.`,
				);
			}
		});

		it("cannot revert, and its parents reflect the history as it is being compacted", () => {
			const { provider } = generateHistory("append", 2, 3);
			const removed = new Set<string>();
			let calls = 0;
			const removedCount = asAlpha(provider.trees[0]).historyCompaction.requestCompaction(
				(pair) => {
					calls++;
					const { current, target } = pair;
					assert.equal(current.revertTo, undefined);
					assert.equal(target.revertTo, undefined);
					assert.equal(target.getParent()?.revision, current.revision);
					const parent = current.getParent();
					assert(parent === undefined || !removed.has(parent.revision));
					const combine = sameGroup(pair);
					if (combine !== false) {
						removed.add(current.revision);
					}
					return combine;
				},
			);
			assert(calls > 0);
			assert(removed.size > 0);
			assert.equal(removedCount, removed.size);
		});

		it("offers each commit once it leaves the collaboration window, pairing a combined commit with the next one", () => {
			// Two clients make single edits named A, B, C, ... and the first client runs a
			// compaction pass after each edit. Each pass records the pairs it was offered as "current>target".
			const provider = new TestTreeProviderLite(2, makeFactory(true));
			const views = provider.trees.map((tree) => asAlpha(tree.viewWith(config)));
			views[0].initialize([]);
			provider.synchronizeMessages();
			const name = (commit: { readonly custom?: { readonly name?: unknown } }): string =>
				typeof commit.custom?.name === "string" ? commit.custom.name : "init";
			// Which client makes each edit determines when the minimum sequence number passes it.
			const author: Record<string, number> = { A: 0, B: 1, C: 0, D: 1, E: 1, F: 0, G: 1 };
			const edit = (commitName: string): void => {
				const view = views[author[commitName] ?? 0];
				view.runTransaction(() => view.root.insertAtEnd(commitName), {
					customMetadata: { name: commitName },
				});
				provider.synchronizeMessages();
			};
			let combinedTree: unknown;
			const pass = (combine: string[] = []): string[] => {
				const offered: string[] = [];
				asAlpha(provider.trees[0]).historyCompaction.requestCompaction(
					({ current, target }) => {
						const pair = `${name(current)}>${name(target)}`;
						offered.push(pair);
						if ((current.customTree?.children.length ?? 0) > 0) {
							combinedTree = current.customTree;
						}
						return combine.includes(pair);
					},
				);
				return offered;
			};

			for (const commitName of ["A", "B", "C", "D"]) {
				edit(commitName);
			}
			// C and D are still in the collaboration window.
			assert.deepEqual(pass(), ["init>A", "A>B"]);
			edit("E");
			assert.deepEqual(pass(["C>D"]), ["init>A", "A>B"]);
			// The minimum sequence number passes D: C>D is offered and combined.
			// Pairs that were declined before are offered again.
			edit("F");
			assert.deepEqual(pass(["C>D"]), ["init>A", "A>B", "B>C", "C>D"]);
			// The combined commit keeps D's revision, and its flattened `custom` only shows D's name:
			// the newer commit wins on conflicting properties. `customTree` still has both.
			edit("G");
			assert.deepEqual(pass(), ["init>A", "A>B", "B>D", "D>E"]);
			assert.deepEqual(combinedTree, {
				metadata: undefined,
				children: [
					{ metadata: { name: "C" }, children: [] },
					{ metadata: { name: "D" }, children: [] },
				],
			});
		});

		it("keeps every original commit's metadata in customTree, but custom only shows the newest values", async () => {
			const provider = new TestTreeProviderLite(2, makeFactory(true));
			const [tree] = provider.trees;
			const view = asAlpha(tree.viewWith(config));
			view.initialize([]);
			provider.synchronizeMessages();
			const other = asAlpha(provider.trees[1].viewWith(config));
			for (const [time, name] of ["A", "B", "C"].entries()) {
				view.runTransaction(() => view.root.insertAtEnd(name), {
					customMetadata: { name, time },
				});
			}
			provider.synchronizeMessages();
			view.root.insertAtEnd("x");
			other.root.insertAtEnd("y");
			provider.synchronizeMessages();

			const removedCount = asAlpha(tree).historyCompaction.requestCompaction(
				({ current, target }) =>
					current.custom?.name !== undefined && target.custom?.name !== undefined,
			);
			assert.equal(removedCount, 2);

			const expectedTree = {
				metadata: undefined,
				children: [
					{
						metadata: undefined,
						children: [
							{ metadata: { name: "A", time: 0 }, children: [] },
							{ metadata: { name: "B", time: 1 }, children: [] },
						],
					},
					{ metadata: { name: "C", time: 2 }, children: [] },
				],
			};
			const findCombined = (history: TreeBranchHistory) => {
				for (let c = history.getHead(); c !== undefined; c = c.getParent()) {
					if (c.custom?.name !== undefined) {
						return c;
					}
				}
				assert.fail("No commit with metadata");
			};

			const combined = findCombined(view.branchHistory);
			// A's time (when the run started) is not in `custom`; only C's values are.
			assert.deepEqual(combined.custom, { name: "C", time: 2 });
			// Nothing is erased: every original commit's metadata is a leaf of `customTree`,
			// and each combination adds a level.
			assert.deepEqual(combined.customTree, expectedTree);

			// The full metadata tree is what the summary stores.
			const loaded = await loadFromSummary(
				await summarize(tree),
				provider.getCompressor(tree),
			);
			assert.deepEqual(
				findCombined(loaded.kernel.checkout.branchHistory).customTree,
				expectedTree,
			);
		});

		describe("when the policy returns the combined commit's metadata", () => {
			/**
			 * Makes six edits at times 0 to 5, then makes them all eligible for compaction.
			 */
			function setUpTimedEdits(factory = makeFactory(true)): {
				tree: ITree;
				provider: TestTreeProviderLite;
				view: TreeViewAlpha<typeof StringArray>;
			} {
				const provider = new TestTreeProviderLite(2, factory);
				const [tree] = provider.trees;
				const view = asAlpha(tree.viewWith(config));
				view.initialize([]);
				provider.synchronizeMessages();
				const other = asAlpha(provider.trees[1].viewWith(config));
				for (let time = 0; time < 6; time++) {
					view.runTransaction(() => view.root.insertAtEnd(`${time}`), {
						customMetadata: { time },
					});
				}
				provider.synchronizeMessages();
				view.root.insertAtEnd("x");
				other.root.insertAtEnd("y");
				provider.synchronizeMessages();
				return { tree, provider, view };
			}

			function timedMetadata(history: TreeBranchHistory): unknown[] {
				const result: unknown[] = [];
				for (let c = history.getHead(); c !== undefined; c = c.getParent()) {
					if (c.custom?.time !== undefined) {
						result.unshift(c.custom);
					}
				}
				return result;
			}

			const numberProperty = (
				metadata: { readonly custom: JsonCompatibleReadOnlyObject | undefined },
				key: string,
			): number | undefined => {
				const value = metadata.custom?.[key];
				return typeof value === "number" ? value : undefined;
			};

			it("with the default merge, a rule that needs the start of a run cannot bound it", () => {
				const { tree, view } = setUpTimedEdits();
				// "Combine edits made within 3 time units of the start of the run."
				// With the default merge, `current.custom.time` is the newest time in the run, so every step looks short.
				const removedCount = asAlpha(tree).historyCompaction.requestCompaction(
					({ current, target }) => {
						const start = numberProperty(current, "time");
						const time = numberProperty(target, "time");
						return start !== undefined && time !== undefined && time - start < 3;
					},
				);
				assert.equal(removedCount, 5);
				assert.deepEqual(timedMetadata(view.branchHistory), [{ time: 5 }]);
			});
		});
	});

	describe("with a retention limit", () => {
		/** The `group` of each commit in the history, oldest first. Commits without a group are `undefined`. */
		function groupsInHistory(history: TreeBranchHistory): unknown[] {
			const groups: unknown[] = [];
			for (let commit = history.getHead(); commit !== undefined; commit = commit.getParent()) {
				groups.unshift(commit.custom?.group);
			}
			return groups;
		}

		/**
		 * Makes `groups` groups of `editsPerGroup` edits on the first client, moving the collaboration window past each group.
		 * After each group, `afterGroup` is called (for example, to compact).
		 */
		function editInGroups(
			retainHistory: number,
			groups: number,
			editsPerGroup: number,
			afterGroup: (tree: ITree) => void,
		): { tree: ITree; view: TreeViewAlpha<typeof StringArray> } {
			const provider = new TestTreeProviderLite(2, makeFactory(retainHistory));
			const view = asAlpha(provider.trees[0].viewWith(config));
			view.initialize([]);
			provider.synchronizeMessages();
			const other = asAlpha(provider.trees[1].viewWith(config));
			for (let group = 0; group < groups; group++) {
				for (let edit = 0; edit < editsPerGroup; edit++) {
					view.runTransaction(() => view.root.insertAtEnd(`${group}.${edit}`), {
						customMetadata: { group },
					});
				}
				provider.synchronizeMessages();
				// Edits from both clients move the minimum sequence number past the group.
				// They are tagged with the same group so that the whole group can be combined.
				other.runTransaction(() => other.root.removeAt(other.root.length - 1), {
					customMetadata: { group },
				});
				provider.synchronizeMessages();
				view.runTransaction(() => view.root.insertAtEnd("x"), { customMetadata: { group } });
				provider.synchronizeMessages();
				afterGroup(provider.trees[0]);
			}
			return { tree: provider.trees[0], view };
		}

		it("only compacts the commits that the retention limit keeps", () => {
			const retained = 10;
			const { tree, view } = editInGroups(retained, 4, 5, () => {});
			const before = groupsInHistory(view.branchHistory);
			// The limit counts commits; the trimmed base is extra, and the collaboration window can add more.
			assert(before.length <= retained + 3, `${before.length} commits are retained`);

			const removedCount = asAlpha(tree).historyCompaction.requestCompaction(() => true);

			assert.equal(countCommits(view.branchHistory), before.length - removedCount);
			assert(removedCount < before.length - 1, "The base and window are never removed");
		});

		it("keeps more points in time within the same limit when compacting", () => {
			const retained = 10;
			const { view: compacted } = editInGroups(retained, 8, 3, (tree) =>
				asAlpha(tree).historyCompaction.requestCompaction(sameGroup),
			);
			const { view: uncompacted } = editInGroups(retained, 8, 3, () => {});

			const compactedGroups = new Set(groupsInHistory(compacted.branchHistory));
			const uncompactedGroups = new Set(groupsInHistory(uncompacted.branchHistory));
			assert(
				compactedGroups.size > uncompactedGroups.size,
				`compacted: ${JSON.stringify(groupsInHistory(compacted.branchHistory))}, uncompacted: ${JSON.stringify(groupsInHistory(uncompacted.branchHistory))}`,
			);
			// Both histories respect the limit; compaction does not make retention keep more commits.
			assert(countCommits(compacted.branchHistory) <= countCommits(uncompacted.branchHistory));
			assert.deepEqual([...compacted.root], [...uncompacted.root]);
		});
	});

	describe("telemetry", () => {
		function expectRun(
			provider: TestTreeProviderLite,
			start: number,
			expected: Record<string, unknown>,
		): void {
			const events = provider.logger
				.events()
				.slice(start)
				.filter((loggedEvent) => loggedEvent.eventName.includes("HistoryCompaction"));
			assert.equal(events.length, 1, "Exactly one event per pass");
			const [event] = events;
			assert(event !== undefined);
			assert(event.eventName.endsWith("HistoryCompaction"));
			for (const [key, value] of Object.entries(expected)) {
				assert.deepEqual(event[key], value, key);
			}
			assert(typeof event.durationMs === "number");
			assert(Number.isFinite(event.durationMs) && event.durationMs >= 0);
			assert(!JSON.stringify(event).includes("private application data"));
		}

		it("does not report a summary pass when no policy is configured", async () => {
			const { provider } = generateHistory("append", 1, 3);
			const start = provider.logger.events().length;
			await summarize(provider.trees[0]);
			assert(
				!provider.logger
					.events()
					.slice(start)
					.some((event) => event.eventName.includes("HistoryCompaction")),
			);
		});

		for (const trigger of ["manual", "summary"] as const) {
			async function run(tree: ITree, policy: CanCompactCommit): Promise<number | undefined> {
				if (trigger === "summary") {
					await summarize(tree);
					return undefined;
				}
				return asAlpha(tree).historyCompaction.requestCompaction(policy);
			}

			it(`reports completed default and replacement merges for a ${trigger} pass`, async () => {
				const policy: CanCompactCommit = (candidate) => {
					if (sameGroup(candidate) === false) {
						return false;
					}
					return candidate.current.custom?.group === 0
						? true
						: { group: 1, description: "private application data" };
				};
				const { provider, view } = generateHistory(
					"append",
					2,
					3,
					true,
					trigger === "summary" ? policy : undefined,
				);
				const commitsBefore = countCommits(view.branchHistory);
				const start = provider.logger.events().length;
				const removed = await run(provider.trees[0], policy);
				if (trigger === "manual") {
					assert.equal(removed, 4);
				}
				assert.equal(countCommits(view.branchHistory), commitsBefore - 4);
				expectRun(provider, start, {
					trigger,
					status: "success",
					category: "generic",
					removedCount: 4,
					policyCallCount: 6,
					rejectedPairCount: 2,
					defaultMergeCount: 2,
					replacementMergeCount: 2,
				});
			});

			it(`reports a ${trigger} pass with no eligible pairs`, async () => {
				const policy: CanCompactCommit = () => assert.fail("No pair should be offered");
				const provider = new TestTreeProviderLite(
					1,
					makeFactory(true, trigger === "summary" ? policy : undefined),
				);
				const [tree] = provider.trees;
				tree.viewWith(config).initialize([]);
				provider.synchronizeMessages();
				const start = provider.logger.events().length;
				await run(tree, policy);
				expectRun(provider, start, {
					trigger,
					status: "success",
					removedCount: 0,
					policyCallCount: 0,
					rejectedPairCount: 0,
					defaultMergeCount: 0,
					replacementMergeCount: 0,
				});
			});

			it(`distinguishes a ${trigger} pass that rejects every eligible pair`, async () => {
				const policy: CanCompactCommit = () => false;
				const { provider, view } = generateHistory(
					"append",
					1,
					3,
					true,
					trigger === "summary" ? policy : undefined,
				);
				const commitsBefore = countCommits(view.branchHistory);
				const start = provider.logger.events().length;
				await run(provider.trees[0], policy);
				assert.equal(countCommits(view.branchHistory), commitsBefore);
				expectRun(provider, start, {
					trigger,
					status: "success",
					removedCount: 0,
					policyCallCount: 3,
					rejectedPairCount: 3,
					defaultMergeCount: 0,
					replacementMergeCount: 0,
				});
			});

			it(`reports partial progress without logging application errors in a ${trigger} pass`, async () => {
				const error = new Error("private application data");
				let allowed = false;
				let policyCalls = 0;
				const policy: CanCompactCommit = (candidate) => {
					policyCalls++;
					if (sameGroup(candidate) === false) {
						return false;
					}
					if (allowed) {
						throw error;
					}
					allowed = true;
					return true;
				};
				const { provider, view } = generateHistory(
					"append",
					1,
					5,
					true,
					trigger === "summary" ? policy : undefined,
				);
				const [tree] = provider.trees;
				const commitsBefore = countCommits(view.branchHistory);
				const start = provider.logger.events().length;
				if (trigger === "manual") {
					assert.throws(
						() => asAlpha(tree).historyCompaction.requestCompaction(policy),
						(thrown: unknown) => thrown === error,
					);
				} else {
					const summary = await summarize(tree);
					assert.equal(countCommits(view.branchHistory), commitsBefore - 1);
					const loaded = await loadFromSummary(summary, provider.getCompressor(tree));
					assert.equal(countCommits(loaded.kernel.checkout.branchHistory), commitsBefore - 1);
					view.root.insertAtEnd("still editable");
					provider.synchronizeMessages();
					assert.equal(view.root.at(-1), "still editable");
				}
				assert.equal(policyCalls, 3, "The policy is not called again after failing");
				expectRun(provider, start, {
					trigger,
					status: "failure",
					category: "error",
					failureSource: "policy",
					removedCount: 1,
					policyCallCount: 3,
					rejectedPairCount: 1,
					defaultMergeCount: 1,
					replacementMergeCount: 0,
				});
			});
		}
	});

	describe("policy configured to run when summarizing", () => {
		it("compacts the history of the tree that writes the summary", async () => {
			const { provider, view, otherView } = generateHistory("append", 2, 3, true, sameGroup);
			const [summarizingTree] = provider.trees;
			const commitsBefore = countCommits(view.branchHistory);

			const summary = await summarize(summarizingTree);

			assert.equal(countCommits(view.branchHistory), commitsBefore - 4);
			assert.equal(
				countCommits(otherView.branchHistory),
				commitsBefore,
				"Clients that do not summarize keep their history",
			);
			const loaded = await loadFromSummary(summary, provider.getCompressor(summarizingTree));
			assert.equal(countCommits(loaded.kernel.checkout.branchHistory), commitsBefore - 4);
		});

		it("writes a smaller summary than the same tree without the policy", async () => {
			const withPolicy = generateHistory("append", 2, 10, true, sameGroup);
			const withoutPolicy = generateHistory("append", 2, 10);
			const compacted = blobSize(
				findEditManager(await summarize(withPolicy.provider.trees[0])),
			);
			const full = blobSize(findEditManager(await summarize(withoutPolicy.provider.trees[0])));
			assert(compacted < full, `${compacted} should be smaller than ${full}`);
		});
	});

	describe("preserved revisions", () => {
		/** The revision and `group` of each commit in the history, oldest first. */
		function historyOf(
			view: TreeViewAlpha<typeof StringArray>,
		): { revision: string; group: unknown }[] {
			const commits: { revision: string; group: unknown }[] = [];
			for (
				let commit = view.branchHistory.getHead();
				commit !== undefined;
				commit = commit.getParent()
			) {
				commits.unshift({ revision: commit.revision, group: commit.custom?.group });
			}
			return commits;
		}

		/**
		 * Makes two groups of three edits on the first of two clients that enable revision preservation,
		 * and moves the collaboration window past them.
		 * Returns the revisions of the edits in group 0, oldest first.
		 */
		function setUp(summaryPolicy?: CanCompactCommit): {
			provider: TestTreeProviderLite;
			view: TreeViewAlpha<typeof StringArray>;
			otherView: TreeViewAlpha<typeof StringArray>;
			group0: string[];
		} {
			const provider = new TestTreeProviderLite(2, makeFactory(true, summaryPolicy, true));
			const view = asAlpha(provider.trees[0].viewWith(config));
			view.initialize([]);
			provider.synchronizeMessages();
			const otherView = asAlpha(provider.trees[1].viewWith(config));
			for (const group of [0, 1]) {
				for (let edit = 0; edit < 3; edit++) {
					view.runTransaction(() => view.root.insertAtEnd(`${group}.${edit}`), {
						customMetadata: { group },
					});
				}
			}
			provider.synchronizeMessages();
			view.root.insertAtEnd("x");
			otherView.root.insertAtEnd("y");
			provider.synchronizeMessages();
			const group0 = historyOf(view)
				.filter((commit) => commit.group === 0)
				.map((commit) => commit.revision);
			assert.equal(group0.length, 3);
			return { provider, view, otherView, group0 };
		}

		for (const [index, position] of ["first", "middle", "last"].entries()) {
			it(`never combines a preserved ${position} commit in either direction`, () => {
				const { provider, view, group0 } = setUp();
				const [first, middle, last] = group0;
				const pinned = group0[index];
				asAlpha(provider.trees[0]).historyCompaction.setRevisionPreserved(pinned, true);
				provider.synchronizeMessages();

				const seenRevisions: string[] = [];
				const removedCount = asAlpha(provider.trees[0]).historyCompaction.requestCompaction(
					(candidate) => {
						seenRevisions.push(candidate.current.revision, candidate.target.revision);
						return sameGroup(candidate);
					},
				);

				// A middle pin blocks both pairs in group 0; an end pin leaves one pair. Group 1 still compacts.
				assert.equal(removedCount, index === 1 ? 2 : 3);
				assert(
					!seenRevisions.includes(pinned),
					"The policy is never offered the pinned commit",
				);
				const group0After = historyOf(view)
					.filter((commit) => commit.group === 0)
					.map((commit) => commit.revision);
				assert.deepEqual(
					group0After,
					[
						[first, last],
						[first, middle, last],
						[middle, last],
					][index],
				);
			});
		}

		it("can be compacted again once it is no longer preserved", () => {
			const { provider, group0 } = setUp();
			const compaction = asAlpha(provider.trees[0]).historyCompaction;
			compaction.setRevisionPreserved(group0[1], true);
			compaction.setRevisionPreserved(group0[1], false);
			provider.synchronizeMessages();
			assert.equal(compaction.isRevisionPreserved(group0[1]), false);
			assert.equal(compaction.requestCompaction(sameGroup), 4);
		});

		it("is shared with other clients", () => {
			const { provider, otherView, group0 } = setUp();
			asAlpha(provider.trees[0]).historyCompaction.setRevisionPreserved(group0[1], true);
			const other = asAlpha(provider.trees[1]).historyCompaction;
			assert.equal(other.isRevisionPreserved(group0[1]), false, "Not sent yet");

			provider.synchronizeMessages();

			assert.equal(other.isRevisionPreserved(group0[1]), true);
			assert.equal(other.requestCompaction(sameGroup), 2);
			assert(historyOf(otherView).some((commit) => commit.revision === group0[1]));
		});

		it("is honoured by the summary policy of another client and stored in the summary", async () => {
			const { provider, view, group0 } = setUp(sameGroup);
			// The second client preserves the revision; the first client writes the summary.
			asAlpha(provider.trees[1]).historyCompaction.setRevisionPreserved(group0[1], true);
			provider.synchronizeMessages();
			const commitsBefore = countCommits(view.branchHistory);

			const summary = await summarize(provider.trees[0]);

			assert.equal(countCommits(view.branchHistory), commitsBefore - 2);
			const loaded = await loadFromSummary(
				summary,
				provider.getCompressor(provider.trees[0]),
				true,
				true,
			);
			assert.equal(asAlpha(loaded).historyCompaction.isRevisionPreserved(group0[1]), true);
			assert.equal(countCommits(loaded.kernel.checkout.branchHistory), commitsBefore - 2);
		});

		it("is dropped when the retention limit removes the commit", () => {
			const provider = new TestTreeProviderLite(2, makeFactory(3, undefined, true));
			const view = asAlpha(provider.trees[0].viewWith(config));
			view.initialize([]);
			provider.synchronizeMessages();
			const other = provider.trees[1].viewWith(config);
			view.root.insertAtEnd("first");
			provider.synchronizeMessages();
			const first = view.branchHistory.getHead()?.revision ?? assert.fail("Expected a commit");
			const compaction = asAlpha(provider.trees[0]).historyCompaction;
			compaction.setRevisionPreserved(first, true);
			provider.synchronizeMessages();
			assert.equal(compaction.isRevisionPreserved(first), true);

			for (let edit = 0; edit < 10; edit++) {
				view.root.insertAtEnd(`${edit}`);
				other.root.insertAtEnd(`${edit}`);
				provider.synchronizeMessages();
			}

			assert(!historyOf(view).some((commit) => commit.revision === first));
			assert.equal(compaction.isRevisionPreserved(first), false);
		});

		it("cannot preserve a revision that is no longer in the history", () => {
			const { provider, group0 } = setUp();
			const compaction = asAlpha(provider.trees[0]).historyCompaction;
			compaction.requestCompaction(sameGroup);
			assert.throws(
				() => compaction.setRevisionPreserved(group0[0], true),
				/not in the main branch's history/,
			);
			assert.equal(compaction.isRevisionPreserved(group0[0]), false);
		});

		it("keeps detached-root editing usable when revision preservation is also requested", () => {
			const provider = new TestTreeProviderLite(
				1,
				configuredSharedTree({
					jsonValidator: FormatValidatorBasic,
					retainHistory: true,
					enableDetachedRootEditing: true,
					historyCompaction: { enableRevisionPreservation: true },
				}).getFactory(),
			);
			const [tree] = provider.trees;
			const view = asAlpha(tree.viewWith(config));
			view.initialize([]);
			provider.synchronizeMessages();
			const revision =
				view.branchHistory.getHead()?.revision ?? assert.fail("Expected a commit");
			assert.throws(
				() => asAlpha(tree).historyCompaction.setRevisionPreserved(revision, true),
				/not supported with shared branches or detached-root editing/,
			);
			view.root.insertAtEnd("still editable");
			provider.synchronizeMessages();
			assert.deepEqual([...view.root], ["still editable"]);
		});

		it("requires enableRevisionPreservation", () => {
			const provider = new TestTreeProviderLite(1, makeFactory(true));
			const view = asAlpha(provider.trees[0].viewWith(config));
			view.initialize([]);
			provider.synchronizeMessages();
			const revision =
				view.branchHistory.getHead()?.revision ?? assert.fail("Expected a commit");
			assert.throws(
				() =>
					asAlpha(provider.trees[0]).historyCompaction.setRevisionPreserved(revision, true),
				/enableRevisionPreservation/,
			);
		});
	});
});
