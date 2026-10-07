/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * These tests are written to double as an explanation of `markTree.ts`.
 * Each `describe` block documents one function/behavior; read them in order.
 */

import { strict as assert } from "node:assert";

import {
	type Counted,
	type MarkTree,
	markTreeFromArray,
	nodeConstructionStats,
	// eslint-disable-next-line import-x/no-internal-modules -- Importing code being tested.
} from "../../../feature-libraries/sequence-field/markTree.js";
// eslint-disable-next-line import-x/no-internal-modules -- Importing code being tested.
import { splitMark } from "../../../feature-libraries/sequence-field/utils.js";
import { brand } from "../../../util/index.js";

import { MarkMaker as Mark } from "./testEdits.js";

// ============================================================================
// A tiny stand-in for a sequence-field `Mark`, used for the first batch of
// tests. It only has what `MarkTree` actually needs (a `count`), plus an
// `id` so we can tell marks apart by eye in assertions/failure messages.
// This keeps the early tests focused on the tree's behavior, not on the real
// `Mark` type's complexity. The last describe block swaps in real `Mark`s to
// show the same tree works unmodified with production types.
// ============================================================================
interface TestMark extends Counted {
	readonly id: string;
	readonly count: number;
}

function m(id: string, count: number): TestMark {
	return { id, count };
}

/**
 * Splits a `TestMark` the same way `splitMark` would split a real `Mark`:
 * two marks whose counts add up to the original, tagged so you can see in
 * assertions which side of the split each half came from.
 */
function splitTestMark(mark: TestMark, offset: number): [TestMark, TestMark] {
	assert(offset > 0 && offset < mark.count, "split offset must be strictly inside the mark");
	return [m(`${mark.id}.left`, offset), m(`${mark.id}.right`, mark.count - offset)];
}

/** Not exercised by the current skeleton (merging isn't wired up yet), but required by the constructor. */
function neverMerge(): undefined {
	return undefined;
}

function treeOf(marks: readonly TestMark[]): MarkTree<TestMark> {
	return markTreeFromArray(marks, splitTestMark, neverMerge);
}

/**
 * Like `treeOf`, but lets tests force a small branching factor so a handful
 * of entries already produce a multi-level tree - needed to exercise
 * `join`'s recursive (unequal-height) and overflow-splitting branches
 * without having to build thousands of entries by hand.
 */
function treeOfSized(marks: readonly TestMark[], maxNodeSize: number): MarkTree<TestMark> {
	return markTreeFromArray(marks, splitTestMark, neverMerge, maxNodeSize);
}

/**
 * Computes what `input` "should" look like after `splitAt(offset)` followed
 * immediately by `concat`: identical to `input`, except the one entry (if
 * any) that `offset` falls strictly inside of is replaced by its two
 * `splitTestMark` halves. Used as an independent oracle for exhaustive
 * round-trip correctness tests below, so those tests don't just check
 * `totalCount` (which a subtly-broken `join` could still get right) but the
 * exact resulting sequence of marks.
 */
function expectedAfterSplitRejoin(input: readonly TestMark[], offset: number): TestMark[] {
	let cursor = 0;
	const result: TestMark[] = [];
	for (const entry of input) {
		if (offset <= cursor || offset >= cursor + entry.count) {
			result.push(entry);
		} else {
			result.push(...splitTestMark(entry, offset - cursor));
		}
		cursor += entry.count;
	}
	return result;
}

/** `count` 1-cell marks, named `mark0`, `mark1`, ... Used by the complexity tests below, where the actual mark content doesn't matter - only that there are a lot of them. */
function bigMarkList(size: number): TestMark[] {
	const list: TestMark[] = [];
	for (let i = 0; i < size; i++) {
		list.push(m(`mark${i}`, 1));
	}
	return list;
}

export function testMarkTree(): void {
	describe("MarkTree", () => {
		// ====================================================================
		describe("toArray", () => {
			it("reproduces exactly the marks it was built from, in order", () => {
				const input = [m("A", 3), m("B", 1), m("C", 2), m("D", 4)];
				const tree = treeOf(input);

				assert.deepEqual(tree.toArray(), input);
			});

			it("never copies the mark objects themselves", () => {
				// This is the "cheap" half of cheap cloning: the tree only ever
				// rearranges *pointers* to marks. It never allocates a new mark
				// object unless that specific mark is the one being split.
				const a = m("A", 3);
				const b = m("B", 1);
				const tree = treeOf([a, b]);

				const [outA, outB] = tree.toArray();
				assert.equal(outA, a, "same object reference as the original 'A' mark");
				assert.equal(outB, b, "same object reference as the original 'B' mark");
			});

			it("returns an empty array for an empty tree", () => {
				assert.deepEqual(treeOf([]).toArray(), []);
			});
		});

		// ====================================================================
		describe("totalCount / entryCount", () => {
			it("totalCount is the sum of every mark's count", () => {
				const tree = treeOf([m("A", 3), m("B", 1), m("C", 2), m("D", 4)]);
				assert.equal(tree.totalCount, 3 + 1 + 2 + 4);
			});

			it("entryCount is the number of marks, regardless of their counts", () => {
				const tree = treeOf([m("A", 3), m("B", 1), m("C", 2), m("D", 4)]);
				assert.equal(tree.entryCount, 4);
			});
		});

		// ====================================================================
		describe("atOffset", () => {
			// Same document as used throughout the design discussion:
			//   marks:  m1(3)  m2(1)  m3(2)  m4(4)
			//   cells:  0 1 2   3      4 5    6 7 8 9
			const tree = treeOf([m("m1", 3), m("m2", 1), m("m3", 2), m("m4", 4)]);

			it("finds the mark covering cell 0 (the very first cell)", () => {
				const { entry, offsetInEntry } = tree.atOffset(0);
				assert.equal(entry.id, "m1");
				assert.equal(offsetInEntry, 0);
			});

			it("finds the mark covering the last cell of a block (cell 2, still inside m1)", () => {
				const { entry, offsetInEntry } = tree.atOffset(2);
				assert.equal(entry.id, "m1");
				assert.equal(offsetInEntry, 2);
			});

			it("finds the mark covering the first cell of the next block (cell 3, start of m2)", () => {
				const { entry, offsetInEntry } = tree.atOffset(3);
				assert.equal(entry.id, "m2");
				assert.equal(offsetInEntry, 0);
			});

			it("reproduces the exact example from the design discussion: offset 5 lands 1 cell into m3", () => {
				const { entry, offsetInEntry } = tree.atOffset(5);
				assert.equal(entry.id, "m3");
				assert.equal(offsetInEntry, 1);
			});

			it("finds the mark covering the final cell (cell 9, last cell of m4)", () => {
				const { entry, offsetInEntry } = tree.atOffset(9);
				assert.equal(entry.id, "m4");
				assert.equal(offsetInEntry, 3);
			});
		});

		// ====================================================================
		describe("splitAt", () => {
			it("splits cleanly on a mark boundary, without splitting any mark in two", () => {
				// Split right between m2 and m3 (offset 4 = 3 + 1).
				const tree = treeOf([m("m1", 3), m("m2", 1), m("m3", 2), m("m4", 4)]);
				const [left, right] = tree.splitAt(4);

				assert.deepEqual(
					left.toArray().map((x) => x.id),
					["m1", "m2"],
				);
				assert.deepEqual(
					right.toArray().map((x) => x.id),
					["m3", "m4"],
				);
				assert.equal(left.totalCount, 4);
				assert.equal(right.totalCount, 6);
			});

			it("splits a mark in two when the split point lands in the middle of it", () => {
				// Same tree, but split at offset 5: 1 cell into m3, as in the
				// atOffset example above. m3(2) must become m3.left(1) + m3.right(1).
				const tree = treeOf([m("m1", 3), m("m2", 1), m("m3", 2), m("m4", 4)]);
				const [left, right] = tree.splitAt(5);

				assert.deepEqual(
					left.toArray().map((x) => `${x.id}(${x.count})`),
					["m1(3)", "m2(1)", "m3.left(1)"],
				);
				assert.deepEqual(
					right.toArray().map((x) => `${x.id}(${x.count})`),
					["m3.right(1)", "m4(4)"],
				);
			});

			it("left and right always recombine into the original sequence of cells", () => {
				const input = [m("A", 5), m("B", 7), m("C", 2), m("D", 9)];
				const total = 5 + 7 + 2 + 9;

				// Try every possible split point, including ones that land
				// mid-mark, and confirm the two halves always add back up.
				for (let offset = 0; offset <= total; offset++) {
					const [left, right] = treeOf(input).splitAt(offset);
					assert.equal(left.totalCount, offset);
					assert.equal(right.totalCount, total - offset);
					assert.equal(left.totalCount + right.totalCount, total);
				}
			});

			it("splitting at 0 puts everything on the right, nothing on the left", () => {
				const tree = treeOf([m("A", 5), m("B", 7)]);
				const [left, right] = tree.splitAt(0);
				assert.deepEqual(left.toArray(), []);
				assert.deepEqual(right.toArray(), [m("A", 5), m("B", 7)]);
			});
		});

		// ====================================================================
		describe("concat", () => {
			it("undoes a splitAt: concatenating the two halves reproduces the original marks", () => {
				const input = [m("A", 5), m("B", 7), m("C", 2), m("D", 9)];
				const tree = treeOf(input);
				const [left, right] = tree.splitAt(9); // lands mid-"B"

				// eslint-disable-next-line unicorn/prefer-spread -- Testing concat() behavior.
				const rejoined = left.concat(right);
				assert.deepEqual(
					rejoined.toArray().map((x) => `${x.id}(${x.count})`),
					["A(5)", "B.left(4)", "B.right(3)", "C(2)", "D(9)"],
				);
			});

			it("can glue together two entirely unrelated trees", () => {
				const first = treeOf([m("A", 1), m("B", 2)]);
				const second = treeOf([m("C", 3)]);

				// eslint-disable-next-line unicorn/prefer-spread -- Testing concat() behavior.
				const combined = first.concat(second);
				assert.deepEqual(
					combined.toArray().map((x) => x.id),
					["A", "B", "C"],
				);
				assert.equal(combined.totalCount, 1 + 2 + 3);
			});

			it("concatenating with an empty tree on either side is a no-op", () => {
				const tree = treeOf([m("A", 1), m("B", 2)]);
				const empty = treeOf([]);

				// eslint-disable-next-line unicorn/prefer-spread -- Testing concat() behavior.
				assert.deepEqual(empty.concat(tree).toArray(), tree.toArray());
				// eslint-disable-next-line unicorn/prefer-spread -- Testing concat() behavior.
				assert.deepEqual(tree.concat(empty).toArray(), tree.toArray());
			});

			// These use a tiny `maxNodeSize` so that a handful of entries already
			// produce a multi-level tree, letting us reach `join`'s "unequal
			// height" (joinRight/joinLeft) and "overflow at the seam" branches
			// without needing thousands of entries.
			describe("with differing heights (exercises join's recursive descent)", () => {
				function manyEntries(count: number, prefix: string): TestMark[] {
					return Array.from({ length: count }, (_, i) => m(`${prefix}${i}`, 1));
				}

				it("attaches a short tree to the right of a much taller one", () => {
					const tall = treeOfSized(manyEntries(40, "t"), 4);
					const short = treeOfSized(manyEntries(2, "s"), 4);
					assert.ok(tall.height > short.height, "test setup: tall must actually be taller");

					// eslint-disable-next-line unicorn/prefer-spread -- Testing concat() behavior.
					const combined = tall.concat(short);
					assert.deepEqual(combined.toArray(), [...manyEntries(40, "t"), ...manyEntries(2, "s")]);
				});

				it("attaches a short tree to the left of a much taller one", () => {
					const tall = treeOfSized(manyEntries(40, "t"), 4);
					const short = treeOfSized(manyEntries(2, "s"), 4);
					assert.ok(tall.height > short.height, "test setup: tall must actually be taller");

					// eslint-disable-next-line unicorn/prefer-spread -- Testing concat() behavior.
					const combined = short.concat(tall);
					assert.deepEqual(combined.toArray(), [...manyEntries(2, "s"), ...manyEntries(40, "t")]);
				});

				it("splits a node at the seam when combining would overflow maxNodeSize", () => {
					// Each side is exactly one full leaf (maxNodeSize=4); gluing
					// them naively would produce an 8-entry leaf, which overflows
					// and must split - exercising joinSameHeight's split branch.
					const left = treeOfSized(manyEntries(4, "l"), 4);
					const right = treeOfSized(manyEntries(4, "r"), 4);

					// eslint-disable-next-line unicorn/prefer-spread -- Testing concat() behavior.
					const combined = left.concat(right);
					assert.deepEqual(combined.toArray(), [...manyEntries(4, "l"), ...manyEntries(4, "r")]);
					assert.equal(combined.entryCount, 8);
				});
			});
		});

		// ====================================================================
		describe("splitAt + concat round trip", () => {
			it("exactly reproduces the original sequence, for every possible split point", () => {
				const input = [m("A", 5), m("B", 7), m("C", 2), m("D", 9)];
				const total = 5 + 7 + 2 + 9;

				for (let offset = 0; offset <= total; offset++) {
					const [left, right] = treeOf(input).splitAt(offset);
					// eslint-disable-next-line unicorn/prefer-spread -- Testing concat() behavior.
					const rejoined = left.concat(right);
					assert.deepEqual(
						rejoined.toArray().map((x) => `${x.id}(${x.count})`),
						expectedAfterSplitRejoin(input, offset).map((x) => `${x.id}(${x.count})`),
						`mismatch at split offset ${offset}`,
					);
				}
			});

			it("is still exact on a multi-level tree forced by a tiny maxNodeSize", () => {
				// 12 entries with varying counts, maxNodeSize=3: deep enough that
				// most split points will produce operands of unequal height,
				// exercising join's recursive descent (not just its single-leaf
				// base case) as part of this same correctness check.
				const input: TestMark[] = [];
				for (let i = 0; i < 12; i++) {
					input.push(m(`e${i}`, (i % 4) + 1));
				}
				const total = input.reduce((sum, e) => sum + e.count, 0);

				for (let offset = 0; offset <= total; offset++) {
					const [left, right] = treeOfSized(input, 3).splitAt(offset);
					// eslint-disable-next-line unicorn/prefer-spread -- Testing concat() behavior.
					const rejoined = left.concat(right);
					assert.deepEqual(
						rejoined.toArray().map((x) => `${x.id}(${x.count})`),
						expectedAfterSplitRejoin(input, offset).map((x) => `${x.id}(${x.count})`),
						`mismatch at split offset ${offset} (maxNodeSize=3)`,
					);
				}
			});

			it("collapseSingleChildChain keeps a tiny split-off piece's height proportional to its own size, not the original tree's height", () => {
				// Without collapsing, splitting off just the first entry from a
				// large tree would leave `left` as a chain of single-child
				// wrapper nodes (one per level of the original tree) around a
				// single leaf - technically correct, but pointlessly tall.
				const bigTree = treeOf(bigMarkList(10_000));
				const [singleEntryPiece] = bigTree.splitAt(1);

				assert.equal(singleEntryPiece.entryCount, 1);
				assert.equal(
					singleEntryPiece.height,
					1,
					"a tree holding exactly one entry should be a single leaf",
				);
			});
		});

		// ====================================================================
		// The whole point of this data structure: splitting/inspecting a tree
		// should cost O(log n), not O(n), no matter how many marks it holds.
		// We validate this the same way the design doc suggests validating the
		// interface before the "real" efficient structure exists: by counting
		// how much internal work actually happens.
		// ====================================================================
		describe("complexity: cheap splitting on large mark lists", () => {
			it("splitAt on a tree of 10,000 marks constructs only a handful of new nodes", () => {
				const tree = treeOf(bigMarkList(10_000));

				nodeConstructionStats.reset();
				tree.splitAt(4321);

				// A tree holding 10,000 marks has depth ~ log_32(10,000) ≈ 2.7
				// (using `markTreeFromArray`'s default `maxNodeSize` of 32 as the
				// branching factor), so depth 3. splitAt allocates at most 2 new
				// nodes per level of depth (one for the left path, one for the
				// right path) - nowhere near the 10,000 marks it's splitting.
				assert.ok(
					nodeConstructionStats.count < 100,
					`expected O(log n) node constructions, got ${nodeConstructionStats.count}`,
				);
			});

			it("node construction count grows logarithmically, not linearly, as the tree grows", () => {
				const sizes = [1000, 10_000, 100_000];
				const constructions: number[] = [];

				for (const size of sizes) {
					const tree = treeOf(bigMarkList(size));
					nodeConstructionStats.reset();
					tree.splitAt(Math.floor(size / 2));
					constructions.push(nodeConstructionStats.count);
				}

				// Growing the tree 100x (1,000 -> 100,000) should barely move the
				// construction count, since log(100,000) / log(1,000) ≈ 1.7 - a
				// world away from the 100x growth a linear (O(n)) algorithm would
				// show here.
				const growthFactor = constructions[2] / constructions[0];
				assert.ok(
					growthFactor < 5,
					`expected sub-linear growth, but construction count went from ` +
						`${constructions[0]} to ${constructions[2]} (${growthFactor}x) as the tree grew 100x`,
				);
			});

			it("carving a sub-range out of a huge changeset and splicing it elsewhere touches ~nothing, even though the range itself is huge", () => {
				// This is the concrete scenario from the design doc: changeset B
				// has thousands of small marks; changeset A has one giant no-op
				// aligned with 2,500 of them. Composing should be able to lift
				// that whole 2,500-mark block out of B and splice it directly
				// into the output, without ever iterating its individual marks.
				const bigChangesetB = treeOf(bigMarkList(5000));
				const changesetAPrefix = treeOf([m("before", 1)]);
				const changesetASuffix = treeOf([m("after", 1)]);

				nodeConstructionStats.reset();
				const [, rest] = bigChangesetB.splitAt(1000); // skip the first 1,000 cells
				const [reusableBlock, tail] = rest.splitAt(2500); // carve out exactly 2,500 more
				// eslint-disable-next-line unicorn/prefer-spread -- Testing concat() behavior.
				const composedOutput = changesetAPrefix.concat(reusableBlock).concat(changesetASuffix);

				// The spliced output covers changeset A's own marks plus the
				// 2,500 marks/cells reused from B...
				assert.equal(composedOutput.entryCount, 1 + 2500 + 1);
				assert.equal(tail.entryCount, 5000 - 1000 - 2500);

				// ...but producing it (two splitAt calls plus two concat calls)
				// only constructed a handful of node objects - it never walked
				// through all 2,500 marks inside the reused block. `toArray`
				// remains the one operation here that's genuinely O(n), because
				// materializing every mark individually is exactly what we're
				// trying to avoid.
				assert.ok(
					nodeConstructionStats.count < 150,
					`expected O(log n) node constructions, got ${nodeConstructionStats.count}`,
				);
			});

			it("concat of two large trees constructs only a handful of new nodes", () => {
				const left = treeOf(bigMarkList(5000));
				const right = treeOf(bigMarkList(5000));

				nodeConstructionStats.reset();
				// eslint-disable-next-line unicorn/prefer-spread -- Testing concat() behavior.
				const combined = left.concat(right);

				assert.equal(combined.entryCount, 10_000);
				// join only visits the O(|height(left) - height(right)|) nodes on
				// the shorter side's own spine (here, 0, since both are the same
				// size/height) plus O(1) work at the seam - nowhere near the
				// 10,000 total marks.
				assert.ok(
					nodeConstructionStats.count < 100,
					`expected O(log n) node constructions, got ${nodeConstructionStats.count}`,
				);
			});

			it("concat's node construction count grows logarithmically, not linearly, as the trees grow", () => {
				const sizes = [1000, 10_000, 100_000];
				const constructions: number[] = [];

				for (const size of sizes) {
					const left = treeOf(bigMarkList(size));
					const right = treeOf(bigMarkList(size));
					nodeConstructionStats.reset();
					// eslint-disable-next-line unicorn/prefer-spread -- Testing concat() behavior.
					left.concat(right);
					constructions.push(nodeConstructionStats.count);
				}

				const growthFactor = constructions[2] / constructions[0];
				assert.ok(
					growthFactor < 5,
					`expected sub-linear growth, but construction count went from ` +
						`${constructions[0]} to ${constructions[2]} (${growthFactor}x) as the trees grew 100x`,
				);
			});
		});

		// ====================================================================
		// Same tree, same operations - but now with real sequence-field `Mark`s
		// instead of the `TestMark` stand-in, to confirm nothing about `MarkTree`
		// is special-cased to fake data.
		// ====================================================================
		describe("works with real sequence-field Marks", () => {
			it("stores and finds real Insert/skip marks by offset", () => {
				// This is the "insert ↷ insert" changeset from the design
				// discussion: [Insert(1,#1), skip(2), Insert(1,#2)].
				// MarkTree only ever sums each mark's raw `count` field - it has
				// no notion of "input" vs "output" cells - so the total here is
				// simply 1 + 2 + 1 = 4, one unit per mark regardless of what
				// kind of mark it is.
				const realMarks = [Mark.insert(1, brand(1)), Mark.skip(2), Mark.insert(1, brand(2))];
				const tree = markTreeFromArray(realMarks, splitMark, () => undefined);

				assert.equal(tree.totalCount, 4);

				// Offset 0 is the first Insert mark itself.
				assert.equal(tree.atOffset(0).entry.type, "Insert");
				// Offsets 1 and 2 are inside the 2-cell skip.
				assert.equal(tree.atOffset(1).entry.type, undefined);
				assert.equal(tree.atOffset(2).entry.type, undefined);
				// Offset 3 is the second Insert mark.
				assert.equal(tree.atOffset(3).entry.type, "Insert");
			});

			it("splits a real skip mark using the real splitMark function", () => {
				const realMarks = [Mark.skip(5)];
				const tree = markTreeFromArray(realMarks, splitMark, () => undefined);

				const [left, right] = tree.splitAt(2);
				assert.deepEqual(left.toArray(), [{ count: 2 }]);
				assert.deepEqual(right.toArray(), [{ count: 3 }]);
			});
		});
	});
}
