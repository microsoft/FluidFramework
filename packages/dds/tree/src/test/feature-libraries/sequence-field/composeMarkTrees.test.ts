/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Cross-checks `composeMarkTrees` against the real, flat-array `compose()`
 * for a wide range of scenarios (reusing the same `cases` matrix
 * `compose.test.ts` itself uses for its associativity tests), then verifies
 * the specific complexity claim this whole exercise is about.
 */

import { strict as assert } from "node:assert";

import {
	type RevisionInfo,
	type RevisionTag,
	revisionMetadataSourceFromInfo,
} from "../../../core/index.js";
import type { NodeId } from "../../../feature-libraries/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { compose } from "../../../feature-libraries/sequence-field/compose.js";
// eslint-disable-next-line import-x/no-internal-modules
import { composeMarkTrees } from "../../../feature-libraries/sequence-field/composeMarkTrees.js";
import {
	markTreeFromArray,
	nodeConstructionStats,
	type MarkTree,
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../../feature-libraries/sequence-field/markTree.js";
// eslint-disable-next-line import-x/no-internal-modules
import type { MoveEffect } from "../../../feature-libraries/sequence-field/moveEffectTable.js";
// eslint-disable-next-line import-x/no-internal-modules
import type { Changeset, Mark } from "../../../feature-libraries/sequence-field/types.js";
// eslint-disable-next-line import-x/no-internal-modules
import { splitMark } from "../../../feature-libraries/sequence-field/utils.js";
import { brand, idAllocatorFromMaxId } from "../../../util/index.js";
import { TestChange } from "../../testChange.js";
import { TestNodeId } from "../../testNodeId.js";
import { mintRevisionTag } from "../../utils.js";

import { cases } from "./testEdits.js";
import {
	areComposable,
	assertChangesetsEqual,
	newCrossFieldTable,
	tagChangeInline,
} from "./utils.js";

const tag1: RevisionTag = mintRevisionTag();
const tag2: RevisionTag = mintRevisionTag();
const revInfos: RevisionInfo[] = [{ revision: tag1 }, { revision: tag2 }];

function treeOf(changeset: Changeset): MarkTree<Mark> {
	return markTreeFromArray<Mark>(changeset, splitMark, () => undefined);
}

function totalCountOf(changeset: Changeset): number {
	return changeset.reduce((sum, mark) => sum + mark.count, 0);
}

/**
 * `TestNodeId.composeChild`, but with its internal `TestChange` consistency
 * verification disabled - matching `compose.test.ts`'s own `composeNoVerify`,
 * which its blanket cross-product tests over `cases` also rely on. Many
 * pairs in that matrix aren't meaningful from `TestChange`'s own "intention
 * tracking" point of view (e.g. composing `cases.modify` with itself), even
 * though they're perfectly valid from sequence-field's own structural point
 * of view - which is all a mark-level correctness cross-check like this one
 * actually cares about.
 */
function composeChildNoVerify(id1: NodeId | undefined, id2: NodeId | undefined): NodeId {
	return TestNodeId.composeChild(id1, id2, false);
}

/**
 * Runs `composeMarkTrees` with the same real machinery (`CrossFieldManager`,
 * `TestNodeId.composeChild`, retry-on-invalidation) that `testCompose` in
 * `utils.ts` uses to run the real `compose()`, so the two are exercised
 * under equivalent conditions.
 */
function composeWithMarkTrees(change1: Changeset, change2: Changeset): Changeset {
	const metadata = revisionMetadataSourceFromInfo(revInfos);
	const table = newCrossFieldTable<MoveEffect>();
	let result = composeMarkTrees(
		treeOf(change1),
		treeOf(change2),
		composeChildNoVerify,
		table,
		metadata,
	);
	if (table.isInvalidated) {
		table.reset();
		result = composeMarkTrees(
			treeOf(change1),
			treeOf(change2),
			composeChildNoVerify,
			table,
			metadata,
		);
	}
	return result.toArray();
}

/**
 * Calls the real, unmodified `compose()` directly with `change1`/`change2` -
 * a genuine single pairwise composition, *not* `composeNoVerify`/`testCompose`
 * (which chain through an initial empty accumulator: effectively
 * `compose(compose([], change1), change2)`). That chaining calls
 * `settleMark` on `change1` before it ever reaches `change2`, which can
 * produce a different (still correct, but *differently* correct) result
 * than composing `change1`/`change2` directly - e.g. a redundant "pin" mark
 * gets settled into a plain no-op (and then dropped entirely, per the
 * "trailing unchanged marks are omitted" rule) by the chained version, but
 * not by a direct pairwise compose. Since `composeMarkTrees` is meant to be
 * a drop-in for a direct two-argument `compose()` call, this must compare
 * against that same direct call.
 */
function composeWithRealAlgorithm(change1: Changeset, change2: Changeset): Changeset {
	const metadata = revisionMetadataSourceFromInfo(revInfos);
	const table = newCrossFieldTable<MoveEffect>();
	const idAllocator = idAllocatorFromMaxId();
	let result = compose(change1, change2, composeChildNoVerify, idAllocator, table, metadata);
	if (table.isInvalidated) {
		table.reset();
		result = compose(change1, change2, composeChildNoVerify, idAllocator, table, metadata);
	}
	return result;
}

/** `count` separate single-cell modifies, each with distinct (but otherwise meaningless) node changes. */
function manyModifies(count: number): Changeset {
	const marks: Changeset = [];
	for (let i = 0; i < count; i++) {
		marks.push({
			count: 1,
			changes: TestNodeId.create({ localId: brand(i) }, TestChange.mint([i], i)),
		});
	}
	return marks;
}

export function testComposeMarkTrees(): void {
	describe("composeMarkTrees", () => {
		// ====================================================================
		// Correctness: cross-check against the real compose() across every
		// pair from the same `cases` matrix compose.test.ts's own
		// associativity tests use - insert, remove, modify, revive, pin,
		// rename, move, moveAndRemove, return, transient_insert, and every
		// combination of two of those.
		// ====================================================================
		describe("matches the real compose() for every pair in the standard test matrix", () => {
			const entries = Object.entries(cases);
			for (const [nameA, changeA] of entries) {
				for (const [nameB, changeB] of entries) {
					const taggedA = tagChangeInline(changeA, tag1);
					const taggedB = tagChangeInline(changeB, tag2);
					const title = `${nameA} then ${nameB}`;
					if (!areComposable([taggedA, taggedB])) {
						// Not a valid sequence of composable changes; skip, same
						// as compose.test.ts's own associativity tests do.
						continue;
					}
					it(title, () => {
						const expected = composeWithRealAlgorithm(taggedA.change, taggedB.change);
						const actual = composeWithMarkTrees(taggedA.change, taggedB.change);
						assertChangesetsEqual(actual, expected, true /* ignoreMoveIds */);
					});
				}
			}
		});

		// ====================================================================
		// The actual point of this whole exercise: composing a large no-op
		// aligned with a run of many smaller marks should touch ~nothing,
		// not scale with how many marks are in that run.
		// ====================================================================
		describe("complexity: bulk-skip touches ~nothing", () => {
			it("a large no-op aligned with thousands of small modifies is composed with a handful of node constructions", () => {
				// base: one big no-op covering the whole document (nothing
				// happened in the first changeset).
				const base: Changeset = [{ count: 5000 }];
				// new: 5000 separate single-cell modifies - exactly the
				// scenario the design doc describes (a huge no-op aligned
				// with a run of many smaller marks).
				const marks = manyModifies(5000);

				const expected = composeWithRealAlgorithm(base, marks);

				// Built *before* resetting the counter: constructing a
				// 5000-entry `MarkTree` is itself an unavoidable O(n) cost
				// (see `markTree.test.ts`'s own complexity tests for that
				// claim in isolation) that every caller pays once, whether
				// or not they ever call `composeMarkTrees` on the result -
				// what this test is actually about is that *composing*
				// doesn't add another O(n) on top of it.
				const baseTree = treeOf(base);
				const newTree = treeOf(marks);

				nodeConstructionStats.reset();
				const metadata = revisionMetadataSourceFromInfo(revInfos);
				const table = newCrossFieldTable<MoveEffect>();
				const result = composeMarkTrees(baseTree, newTree, TestNodeId.composeChild, table, metadata);

				assertChangesetsEqual(result.toArray(), expected);
				assert.ok(
					nodeConstructionStats.count < 200,
					`expected O(log n) node constructions, got ${nodeConstructionStats.count}`,
				);
			});

			it("grows sub-linearly as the aligned run grows, not linearly", () => {
				const sizes = [500, 5000, 50_000];
				const constructions: number[] = [];
				for (const size of sizes) {
					const base: Changeset = [{ count: size }];
					const marks = manyModifies(size);
					// Same reasoning as the test above: build first, *then*
					// reset, so only `composeMarkTrees`'s own work counts -
					// otherwise this would just be re-measuring `MarkTree`
					// construction's own (acknowledged, unavoidable) O(n)
					// cost and could never pass regardless of how well
					// `composeMarkTrees` itself scales.
					const baseTree = treeOf(base);
					const newTree = treeOf(marks);
					nodeConstructionStats.reset();
					const metadata = revisionMetadataSourceFromInfo(revInfos);
					const table = newCrossFieldTable<MoveEffect>();
					composeMarkTrees(baseTree, newTree, TestNodeId.composeChild, table, metadata);
					constructions.push(nodeConstructionStats.count);
				}
				const growthFactor = constructions[2] / constructions[0];
				assert.ok(
					growthFactor < 5,
					`expected sub-linear growth, but construction count went from ` +
						`${constructions[0]} to ${constructions[2]} (${growthFactor}x) as the run grew 100x`,
				);
			});
		});

		// ====================================================================
		// Moves specifically: a move hiding inside what would otherwise be a
		// bulk-skippable run must not silently break the result - the
		// conservative fallback (see tryBulkSkip's doc comment) must kick in.
		// ====================================================================
		describe("moves", () => {
			it("a no-op aligned with a real move composes correctly (conservative fallback, not bulk-skip)", () => {
				const moveChange = cases.move;
				const base: Changeset = [{ count: totalCountOf(moveChange) }];

				const expected = composeWithRealAlgorithm(base, moveChange);
				const actual = composeWithMarkTrees(base, moveChange);
				assertChangesetsEqual(actual, expected, true /* ignoreMoveIds */);
			});

			it("a real move on the base side aligned with a no-op on the new side composes correctly", () => {
				const moveChange = cases.move;
				const newChange: Changeset = [{ count: totalCountOf(moveChange) }];

				const expected = composeWithRealAlgorithm(moveChange, newChange);
				const actual = composeWithMarkTrees(moveChange, newChange);
				assertChangesetsEqual(actual, expected, true /* ignoreMoveIds */);
			});
		});
	});
}
