/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { ChangeAtomId, RevisionTag } from "../../../core/index.js";
import {
	MarkSegmentTree,
	type MarkContext,
	type MarkSegmentNode,
	// eslint-disable-next-line import-x/no-internal-modules -- Tests exercise the internal segment tree.
} from "../../../feature-libraries/sequence-field/markSegmentTree.js";
// eslint-disable-next-line import-x/no-internal-modules -- Test fixtures use internal mark types.
import type { Mark } from "../../../feature-libraries/sequence-field/types.js";
import { brand } from "../../../util/index.js";
import { mintRevisionTag } from "../../utils.js";

const revision1: RevisionTag = mintRevisionTag();
const revision2: RevisionTag = mintRevisionTag();

function id(localId: number, revision?: RevisionTag): ChangeAtomId {
	return revision === undefined
		? { localId: brand(localId) }
		: { localId: brand(localId), revision };
}

describe("MarkSegmentTree", () => {
	it("indexes empty trees", () => {
		const tree = MarkSegmentTree.fromMarks([]);
		assert.equal(tree.root, undefined);
		assert.equal(tree.count, 0);
		assert.equal(tree.markCount, 0);
		assert.equal(tree.inputLength, 0);
		assert.equal(tree.outputLength, 0);
		assert.equal(tree.reusable, true);
		assert.deepEqual(tree.marks, []);
		for (const context of ["input", "output"] as const) {
			assert.equal(tree.findByIndex(0, context), undefined);
			assert.equal(tree.findById(id(0), context), undefined);
			assert.deepEqual(tree.getCellSources(context), new Set());
		}
		assert.equal(tree.findById(id(0), "detach"), undefined);
	});

	it("counts cells and locates populated cells in both contexts", () => {
		const marks: Mark[] = [
			{ count: 2, cellId: id(20, revision1) },
			{ count: 3 },
			{ type: "Insert", count: 4, cellId: id(30, revision1), id: brand(30) },
			{ type: "Remove", count: 5, id: brand(40), revision: revision2 },
			{ count: 1 },
			{ count: 2, cellId: id(50) },
		];
		const tree = MarkSegmentTree.fromMarks(marks);
		assert.equal(tree.count, 17);
		assert.equal(tree.markCount, 6);
		assert.equal(tree.inputLength, 9);
		assert.equal(tree.outputLength, 8);
		for (const [context, expected] of [
			["input", [1, 3, 4]],
			["output", [1, 2, 4]],
		] as const) {
			let index = 0;
			for (const markIndex of expected) {
				const mark = marks[markIndex];
				for (let offset = 0; offset < mark.count; offset++, index++) {
					assert.equal(tree.findByIndex(index, context), markIndex);
				}
			}
			assert.equal(tree.findByIndex(index, context), undefined);
			for (const invalid of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
				assert.equal(tree.findByIndex(invalid, context), undefined);
			}
		}
	});

	it("skips segments with zero length in the queried context", () => {
		const inserted: Mark = { type: "Insert", count: 3, id: brand(0), cellId: id(0) };
		const removed: Mark = { type: "Remove", count: 2, id: brand(10) };
		assert.equal(MarkSegmentTree.fromMarks([inserted]).findByIndex(0, "input"), undefined);
		assert.equal(MarkSegmentTree.fromMarks([removed]).findByIndex(0, "output"), undefined);
		const tree = MarkSegmentTree.fromMarks([{ count: 0 }, inserted, removed, { count: 0 }]);
		assert.equal(tree.findByIndex(0, "input"), 2);
		assert.equal(tree.findByIndex(0, "output"), 1);
	});

	it("indexes empty IDs across revisions, including anonymous IDs", () => {
		const marks: Mark[] = [
			{ count: 2, cellId: id(10, revision1) },
			{ count: 3 },
			{ count: 3, cellId: id(10, revision2) },
			{ count: 4, cellId: id(10) },
		];
		const tree = MarkSegmentTree.fromMarks(marks);
		for (const context of ["input", "output"] as const) {
			for (const markIndex of [0, 2, 3]) {
				const mark = marks[markIndex];
				assert(mark.cellId !== undefined);
				for (let offset = 0; offset < mark.count; offset++) {
					assert.equal(
						tree.findById(id(10 + offset, mark.cellId.revision), context),
						markIndex,
					);
				}
				assert.equal(
					tree.findById(id(10 + mark.count, mark.cellId.revision), context),
					undefined,
				);
				assert.equal(tree.findById(id(9, mark.cellId.revision), context), undefined);
			}
			assert.deepEqual(
				tree.getCellSources(context),
				new Set([revision1, revision2, undefined]),
			);
		}
	});

	for (const type of ["Remove", "MoveOut"] as const) {
		it(`separates ${type} operation IDs from overridden output IDs`, () => {
			const mark: Mark = {
				type,
				count: 3,
				id: brand(10),
				revision: revision1,
				idOverride: id(20, revision2),
			};
			const tree = MarkSegmentTree.fromMarks([{ count: 5 }, mark]);
			assert.equal(tree.findById(id(12, revision1), "detach"), 1);
			assert.equal(tree.findById(id(22, revision2), "output"), 1);
			assert.equal(tree.findById(id(12, revision1), "output"), undefined);
			assert.equal(tree.findById(id(22, revision2), "detach"), undefined);
			assert.deepEqual(tree.getCellSources("input"), new Set());
			assert.deepEqual(tree.getCellSources("output"), new Set([revision2]));
		});
	}

	it("indexes AttachAndDetach's detach, not its attach or overridden output ID", () => {
		const mark: Mark = {
			type: "AttachAndDetach",
			count: 3,
			cellId: id(5),
			attach: { type: "MoveIn", id: brand(10), revision: revision1 },
			detach: {
				type: "Remove",
				id: brand(20),
				revision: revision1,
				idOverride: id(30, revision2),
			},
		};
		const tree = MarkSegmentTree.fromMarks([mark]);
		assert.equal(tree.inputLength, 0);
		assert.equal(tree.outputLength, 0);
		for (const [context, firstId] of [
			["input", id(5)],
			["output", id(30, revision2)],
			["detach", id(20, revision1)],
		] as const) {
			assert.equal(tree.findById(id(firstId.localId + 1, firstId.revision), context), 0);
		}
		assert.equal(tree.findById(id(10, revision1), "detach"), undefined);
		assert.equal(tree.findById(id(30, revision2), "detach"), undefined);
	});

	it("indexes Rename output cells without treating it as a detach operation", () => {
		const mark: Mark = {
			type: "Rename",
			count: 2,
			cellId: id(10, revision1),
			idOverride: id(20, revision2),
		};
		const tree = MarkSegmentTree.fromMarks([mark]);
		assert.equal(tree.findById(id(21, revision2), "output"), 0);
		assert.equal(tree.findById(id(21, revision2), "detach"), undefined);
	});

	it("selects the first mark for overlapping ID ranges", () => {
		const marks: Mark[] = [
			{ count: 3, cellId: id(10) },
			{ count: 4, cellId: id(11) },
		];
		const tree = MarkSegmentTree.fromMarks(marks);
		assert.equal(tree.findById(id(12), "input"), 0);
		assert.equal(tree.findById(id(14), "input"), 1);
	});

	it("only summarizes whole contiguous empty-cell runs", () => {
		for (const context of ["input", "output"] as const) {
			const field = context === "input" ? "inputCellId" : "outputCellId";
			const first: Mark = { count: 2, cellId: id(10, revision1) };
			const second: Mark = { count: 3, cellId: id(12, revision1) };
			const tree = MarkSegmentTree.fromMarks([first, second]);
			assert.strictEqual(tree.root?.[field], first.cellId);
			for (const other of [
				{ count: 1 },
				{ count: 3, cellId: id(13, revision1) },
				{ count: 3, cellId: id(12, revision2) },
			]) {
				assert.equal(MarkSegmentTree.fromMarks([first, other]).root?.[field], undefined);
			}
		}
		const removed: Mark[] = [
			{ type: "Remove", count: 2, id: brand(0), idOverride: id(10, revision1) },
			{ type: "Remove", count: 3, id: brand(20), idOverride: id(12, revision1) },
		];
		const removedTree = MarkSegmentTree.fromMarks(removed);
		assert.deepEqual(removedTree.root?.outputCellId, id(10, revision1));
		assert.equal(removedTree.root?.inputCellId, undefined);
	});

	it("conservatively summarizes reusable marks", () => {
		const safe: Mark[] = [
			{ count: 1 },
			{ count: 1, cellId: id(0) },
			{ type: "Insert", count: 1, id: brand(1), cellId: id(1) },
			{ type: "Remove", count: 1, id: brand(2) },
			{ type: "Remove", count: 1, id: brand(0), cellId: id(1) },
			{
				type: "Remove",
				count: 1,
				id: brand(0),
				cellId: id(0),
				idOverride: id(1),
			},
			{ type: "Rename", count: 1, cellId: id(0), idOverride: id(1) },
			{ type: "Rename", count: 1, cellId: id(0), idOverride: id(0) },
		];
		assert.equal(MarkSegmentTree.fromMarks(safe).reusable, true);
		for (const mark of safe) {
			assert.equal(MarkSegmentTree.fromMarks([mark]).reusable, true);
			assert.equal(MarkSegmentTree.fromMarks([{ ...mark, changes: id(10) }]).reusable, false);
		}
		const unsafe: Mark[] = [
			{ count: 1, changes: id(0) },
			{ type: "Insert", count: 1, id: brand(0) },
			{ type: "Remove", count: 1, id: brand(0), cellId: id(0) },
			{
				type: "Remove",
				count: 1,
				id: brand(0),
				cellId: id(1),
				idOverride: id(1),
			},
			{ type: "MoveIn", count: 1, id: brand(0), cellId: id(1) },
			{ type: "MoveOut", count: 1, id: brand(0) },
			{
				type: "AttachAndDetach",
				count: 1,
				cellId: id(0),
				attach: { type: "MoveIn", id: brand(0) },
				detach: { type: "Remove", id: brand(1) },
			},
		];
		for (const mark of unsafe) {
			assert.equal(MarkSegmentTree.fromMarks([mark]).reusable, false);
			assert.equal(MarkSegmentTree.fromMarks([...safe, mark]).reusable, false);
		}
	});

	it("retains frozen marks and balances by mark count", () => {
		const marks: readonly Mark[] = Object.freeze(
			Array.from({ length: 17 }, (_, index) => Object.freeze({ count: index + 1 })),
		);
		const tree = MarkSegmentTree.fromMarks(marks);
		assert.strictEqual(tree.marks, marks);
		function check(node: MarkSegmentNode): void {
			if ("mark" in node) {
				assert.equal(node.markCount, 1);
				assert(marks.includes(node.mark));
			} else {
				assert(Math.abs(node.left.markCount - node.right.markCount) <= 1);
				check(node.left);
				check(node.right);
			}
		}
		assert(tree.root !== undefined);
		check(tree.root);
	});

	it("queries array positions and cell sources without accessing mark properties", () => {
		let visits = 0;
		const marks: Mark[] = Array.from({ length: 8 }, (_, index) => ({
			get count() {
				visits++;
				return 2;
			},
			get cellId() {
				visits++;
				return id(2 * index, revision1);
			},
		}));
		const tree = MarkSegmentTree.fromMarks(marks);
		visits = 0;
		for (const context of ["input", "output"] satisfies MarkContext[]) {
			assert.deepEqual(tree.getCellSources(context), new Set([revision1]));
			assert.equal(tree.findById(id(11, revision1), context), 5);
			assert.equal(
				tree.findReusableEnd(0, { count: 11, cellId: id(0, revision1) }, context),
				5,
			);
			assert.equal(
				tree.findReusableEnd(3, { count: 8, cellId: id(6, revision1) }, context),
				7,
			);
		}
		assert.equal(visits, 0);
	});

	it("finds whole-mark boundaries from any array position with unequal mark counts", () => {
		const marks: Mark[] = Array.from({ length: 17 }, (_, index) => ({ count: index + 1 }));
		const tree = MarkSegmentTree.fromMarks(marks);
		for (const context of ["input", "output"] as const) {
			for (let start = 0; start <= marks.length; start++) {
				let count = 0;
				for (let end = start; end <= marks.length; end++) {
					assert.equal(tree.findReusableEnd(start, { count }, context), end);
					if (end < marks.length) {
						assert.equal(
							tree.findReusableEnd(start, { count: count + marks[end].count - 1 }, context),
							end,
						);
						count += marks[end].count;
					}
				}
				assert.equal(tree.findReusableEnd(start, undefined, context), marks.length);
			}
		}
	});

	it("stops at child changes, move effects, and unsettled marks instead of jumping past them", () => {
		for (const blocker of [
			{ count: 1, changes: id(0) },
			{ type: "MoveOut", count: 1, id: brand(0) },
			{ type: "Insert", count: 1, id: brand(0) },
		] satisfies Mark[]) {
			const tree = MarkSegmentTree.fromMarks([{ count: 2 }, blocker, { count: 2 }]);
			for (const context of ["input", "output"] as const) {
				assert.equal(tree.findReusableEnd(0, { count: 5 }, context), 1);
				assert.equal(tree.findReusableEnd(1, undefined, context), 1);
				assert.equal(tree.findReusableEnd(2, undefined, context), 3);
			}
		}
	});

	it("finds a non-tree-aligned endpoint without scanning leaf summaries", () => {
		const tree = MarkSegmentTree.fromMarks(
			Array.from({ length: 2048 }, (): Mark => ({ count: 1 })),
		);
		let leafReads = 0;
		const watchLeaves = (node: MarkSegmentNode): void => {
			if ("mark" in node) {
				Object.defineProperty(node, "reusable", {
					get: () => {
						leafReads++;
						return true;
					},
				});
			} else {
				watchLeaves(node.left);
				watchLeaves(node.right);
			}
		};
		assert(tree.root !== undefined);
		watchLeaves(tree.root);
		assert.equal(tree.findReusableEnd(3, { count: 1531 }, "input"), 1534);
		assert(leafReads <= 4, `Boundary query read ${leafReads} leaf summaries`);
	});

	it("validates query starts and rejects edits as opposing no-ops", () => {
		const tree = MarkSegmentTree.fromMarks([{ count: 2 }]);
		for (const start of [-1, 0.5, 2, Number.NaN, Number.POSITIVE_INFINITY]) {
			assert.throws(() => tree.findReusableEnd(start, undefined, "input"));
		}
		assert.throws(() => tree.findReusableEnd(0, { count: 1, changes: id(0) }, "input"));
		assert.throws(() =>
			tree.findReusableEnd(0, { type: "Remove", count: 1, id: brand(0) }, "input"),
		);
		assert.equal(MarkSegmentTree.fromMarks([]).findReusableEnd(0, undefined, "input"), 0);
	});
});
