/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { singleTextCursor } from "../../feature-libraries";
import { jsonString } from "../../domains";
import { brand, JsonCompatible } from "../../util";
import { rootFieldKeySymbol } from "../../core";
import { Sequencer, TestTree, TestTreeEdit } from "./testTree";

describe("Editing", () => {
	describe("Sequence Field", () => {
		it("can order concurrent inserts within concurrently deleted content", () => {
			const sequencer = new Sequencer();
			const tree1 = TestTree.fromJson(["A", "B", "C", "D"]);
			const tree2 = tree1.fork();
			const tree3 = tree1.fork();
			const tree4 = tree1.fork();

			// Make deletions in two steps to ensure that gap tracking handles comparing insertion places that
			// were affected by different deletes.
			const delAB = remove(tree1, 0, 2);
			const delCD = remove(tree2, 2, 2);
			const addX = insert(tree3, 1, "x");
			const addY = insert(tree4, 3, "y");

			const sequenced = sequencer.sequence([delAB, delCD, addX, addY]);
			tree1.receive(sequenced);
			tree2.receive(sequenced);
			tree3.receive(sequenced);
			tree4.receive(sequenced);

			expectJsonTree([tree1, tree2, tree3, tree4], ["x", "y"]);
		});

		it("can rebase local dependent inserts", () => {
			const sequencer = new Sequencer();
			const tree1 = TestTree.fromJson("y");
			const tree2 = tree1.fork();

			const x = insert(tree1, 0, "x");

			const ac = insert(tree2, 1, "a", "c");
			const b = insert(tree2, 2, "b");

			const sequenced = sequencer.sequence([x, ac, b]);
			tree1.receive(sequenced);
			tree2.receive(sequenced);

			expectJsonTree([tree1, tree2], ["x", "y", "a", "b", "c"]);
		});

		it("can rebase a local delete", () => {
			const sequencer = new Sequencer();
			const tree1 = TestTree.fromJson(["x", "y"]);
			const tree2 = tree1.fork();

			const delY = remove(tree1, 1, 1);

			const addW = insert(tree2, 0, "w");

			const sequenced = sequencer.sequence([addW, delY]);
			tree1.receive(sequenced);
			tree2.receive(sequenced);

			expectJsonTree([tree1, tree2], ["w", "x"]);
		});

		it("inserts that concurrently target the same insertion point do not interleave their contents", () => {
			const sequencer = new Sequencer();
			const tree1 = TestTree.fromJson([]);
			const tree2 = tree1.fork();
			const tree3 = tree1.fork();
			const tree4 = tree1.fork();

			const abc = insert(tree1, 0, "a", "b", "c");
			const rst = insert(tree2, 0, "r", "s", "t");
			const xyz = insert(tree3, 0, "x", "y", "z");

			const sequenced = sequencer.sequence([xyz, rst, abc]);
			tree1.receive(sequenced);
			tree2.receive(sequenced);
			tree3.receive(sequenced);
			tree4.receive(sequenced);

			expectJsonTree(
				[tree1, tree2, tree3, tree4],
				["a", "b", "c", "r", "s", "t", "x", "y", "z"],
			);
		});

		it("merge-left tie-breaking does not interleave concurrent left to right inserts", () => {
			const sequencer = new Sequencer();
			const tree1 = TestTree.fromJson([]);
			const tree2 = tree1.fork();
			const tree3 = tree1.fork();
			const tree4 = tree1.fork();

			const a = insert(tree1, 0, "a");
			const b = insert(tree1, 1, "b");
			const c = insert(tree1, 2, "c");

			const r = insert(tree2, 0, "r");
			const s = insert(tree2, 1, "s");
			const t = insert(tree2, 2, "t");

			const x = insert(tree3, 0, "x");
			const y = insert(tree3, 1, "y");
			const z = insert(tree3, 2, "z");

			const sequenced = sequencer.sequence([x, r, a, s, b, y, c, z, t]);
			tree1.receive(sequenced);
			tree2.receive(sequenced);
			tree3.receive(sequenced);
			tree4.receive(sequenced);

			expectJsonTree(
				[tree1, tree2, tree3, tree4],
				["a", "b", "c", "r", "s", "t", "x", "y", "z"],
			);
		});

		// The current implementation orders the letters from inserted last to inserted first.
		// This is due to the hard-coded merge-left policy.
		// Having merge-right tie-breaking does preserve groupings but in a first-to-last order
		// which is the desired outcome for RTL text.
		// TODO: update and activate this test once merge-right is supported.
		it.skip("merge-right tie-breaking does not interleave concurrent right to left inserts", () => {
			const sequencer = new Sequencer();
			const tree1 = TestTree.fromJson([]);
			const tree2 = tree1.fork();
			const tree3 = tree1.fork();
			const tree4 = tree1.fork();

			const c = insert(tree1, 0, "c");
			const b = insert(tree1, 0, "b");
			const a = insert(tree1, 0, "a");

			const t = insert(tree2, 0, "t");
			const s = insert(tree2, 0, "s");
			const r = insert(tree2, 0, "r");

			const z = insert(tree3, 0, "z");
			const y = insert(tree3, 0, "y");
			const x = insert(tree3, 0, "x");

			const sequenced = sequencer.sequence([z, t, c, s, b, y, a, x, r]);
			tree1.receive(sequenced);
			tree2.receive(sequenced);
			tree3.receive(sequenced);
			tree4.receive(sequenced);

			expectJsonTree(
				[tree1, tree2, tree3, tree4],
				["a", "b", "c", "r", "s", "t", "x", "y", "z"],
			);
		});

		// TODO: Enable once local branch repair data is supported
		it.skip("revert-only revive", () => {
			const sequencer = new Sequencer();
			const tree1 = TestTree.fromJson(["a", "b", "c"]);
			const tree2 = tree1.fork();

			const delB = remove(tree1, 1, 1);

			const delABC = remove(tree2, 0, 3);

			const seqDelB = sequencer.sequence(delB);
			const seqDelABC = sequencer.sequence(delABC);

			const revABC = tree2.runTransaction((forest, editor) => {
				const field = editor.sequenceField(undefined, rootFieldKeySymbol);
				field.revive(0, 3, brand(seqDelABC.seqNumber), 1);
			});

			const seqRevABC = sequencer.sequence(revABC);
			const sequenced = [seqDelB, seqDelABC, seqRevABC];
			tree1.receive(sequenced);
			tree2.receive(sequenced);

			expectJsonTree([tree1, tree2], ["a", "c"]);
		});

		// TODO: Enable once local branch repair data is supported
		it.skip("intentional revive", () => {
			const sequencer = new Sequencer();
			const tree1 = TestTree.fromJson(["a", "b", "c"]);
			const tree2 = tree1.fork();

			const delB = remove(tree1, 1, 1);

			const delABC = remove(tree2, 0, 3);

			const seqDelB = sequencer.sequence(delB);
			const seqDelABC = sequencer.sequence(delABC);

			const revABC = tree2.runTransaction((forest, editor) => {
				const field = editor.sequenceField(undefined, rootFieldKeySymbol);
				field.revive(0, 3, brand(seqDelABC.seqNumber), 1, true);
			});

			const seqRevABC = sequencer.sequence(revABC);
			const sequenced = [seqDelB, seqDelABC, seqRevABC];
			tree1.receive(sequenced);
			tree2.receive(sequenced);

			expectJsonTree([tree1, tree2], ["a", "b", "c"]);
		});
	});
});

/**
 * Helper function to insert node at a given index.
 *
 * @param tree - The tree on which to perform the insert.
 * @param index - The index in the root field at which to insert.
 * @param value - The value of the inserted node.
 */
function insert(tree: TestTree, index: number, ...values: string[]): TestTreeEdit {
	return tree.runTransaction((forest, editor) => {
		const field = editor.sequenceField(undefined, rootFieldKeySymbol);
		const nodes = values.map((value) => singleTextCursor({ type: jsonString.name, value }));
		field.insert(index, nodes);
	});
}

function remove(tree: TestTree, index: number, count: number): TestTreeEdit {
	return tree.runTransaction((forest, editor) => {
		const field = editor.sequenceField(undefined, rootFieldKeySymbol);
		field.delete(index, count);
	});
}

function expectJsonTree(actual: TestTree | TestTree[], expected: JsonCompatible[]): void {
	const trees = Array.isArray(actual) ? actual : [actual];
	for (const tree of trees) {
		const roots = tree.jsonRoots();
		assert.deepEqual(roots, expected);
	}
}
