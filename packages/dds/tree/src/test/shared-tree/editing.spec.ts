/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import { FieldKinds, singleTextCursor } from "../../feature-libraries";
import { jsonSchemaData, jsonString, singleJsonCursor } from "../../domains";
import { rootFieldKeySymbol, UpPath, fieldSchema, rootFieldKey, SchemaData } from "../../core";
import { JsonCompatible, brand } from "../../util";
import { fakeRepair } from "../utils";
import { ISharedTree, ISharedTreeBranch, SharedTreeFactory } from "../../shared-tree";
import { Sequencer, TestTree, TestTreeEdit } from "./testTree";

const factory = new SharedTreeFactory();
const runtime = new MockFluidDataStoreRuntime();
// For now, require tree to be a list of strings.
const schema: SchemaData = {
	treeSchema: jsonSchemaData.treeSchema,
	globalFieldSchema: new Map([
		[rootFieldKey, fieldSchema(FieldKinds.sequence, [jsonString.name])],
	]),
};

function makeTree(...json: string[]): ISharedTree {
	const tree = factory.create(runtime, "TestSharedTree");
	tree.storedSchema.update(schema);
	const field = tree.editor.sequenceField(undefined, rootFieldKeySymbol);
	field.insert(0, json.map(singleJsonCursor));
	return tree;
}

describe("Editing", () => {
	describe("Sequence Field", () => {
		it("can order concurrent inserts within concurrently deleted content", () => {
			const tree = makeTree("A", "B", "C", "D");
			const delAB = tree.fork();
			const delCD = tree.fork();
			const addX = tree.fork();
			const addY = tree.fork();

			// Make deletions in two steps to ensure that gap tracking handles comparing insertion places that
			// were affected by different deletes.
			remove(delAB, 0, 2);
			remove(delCD, 2, 2);
			insert(addX, 1, "x");
			insert(addY, 3, "y");

			delAB.merge();
			delCD.merge();
			addX.merge();
			addY.merge();

			expectJsonTree(tree, ["x", "y"]);
		});

		it("can handle competing deletes", () => {
			for (const index of [0, 1, 2, 3]) {
				const startingState = ["A", "B", "C", "D"];
				const tree = makeTree(...startingState);
				const tree1 = tree.fork();
				const tree2 = tree.fork();
				const tree3 = tree.fork();
				const tree4 = tree.fork();

				remove(tree1, index, 1);
				remove(tree2, index, 1);
				remove(tree3, index, 1);

				tree1.merge();
				tree2.merge();
				tree3.merge();
				tree4.pull();

				const expected = [...startingState];
				expected.splice(index, 1);
				expectJsonTree([tree, tree4], expected);
			}
		});

		it("can rebase local dependent inserts", () => {
			const tree1 = makeTree("y");
			const tree2 = tree1.fork();
			insert(tree1, 0, "x");
			insert(tree2, 1, "a", "c");
			insert(tree2, 2, "b");
			tree2.merge();
			expectJsonTree([tree1], ["x", "y", "a", "b", "c"]);
		});

		it("can rebase a local delete", () => {
			const addW = makeTree("x", "y");
			const delY = addW.fork();

			remove(delY, 1, 1);
			insert(addW, 0, "w");

			delY.merge();

			expectJsonTree([addW, delY], ["w", "x"]);
		});

		it("inserts that concurrently target the same insertion point do not interleave their contents", () => {
			const tree = makeTree();
			const abc = tree.fork();
			const rst = tree.fork();
			const xyz = tree.fork();

			insert(abc, 0, "a", "b", "c");
			insert(rst, 0, "r", "s", "t");
			insert(xyz, 0, "x", "y", "z");

			xyz.merge();
			rst.merge();
			abc.merge();

			expectJsonTree(tree, ["a", "b", "c", "r", "s", "t", "x", "y", "z"]);
		});

		// Branches can not currently perform this scenario
		// TODO: make branch merging more flexible (so it can do all merges remote clients can)
		// And port the remaining tests here to branches.
		// When done, delete testTree.ts
		it.skip("merge-left tie-breaking does not interleave concurrent left to right inserts with branches", () => {
			const tree = makeTree();
			const a = tree.fork();
			const r = tree.fork();
			const x = tree.fork();

			insert(a, 0, "a");
			const b = a.fork();
			insert(b, 1, "b");
			const c = b.fork();
			insert(c, 2, "c");

			insert(r, 0, "r");
			const s = r.fork();
			insert(s, 1, "s");
			const t = s.fork();
			insert(s, 2, "t");

			insert(x, 0, "x");
			const y = x.fork();
			insert(y, 1, "y");
			const z = y.fork();
			insert(z, 2, "z");

			x.merge();
			r.merge();
			a.merge();
			s.merge();
			b.merge();
			y.merge();
			c.merge();
			z.merge();
			t.merge();

			expectJsonTree(tree, ["a", "b", "c", "r", "s", "t", "x", "y", "z"]);
		});

		it("merge-left tie-breaking does not interleave concurrent left to right inserts", () => {
			const sequencer = new Sequencer();
			const tree1 = TestTree.fromJson([]);
			const tree2 = tree1.fork();
			const tree3 = tree1.fork();
			const tree4 = tree1.fork();

			const a = insertLegacy(tree1, 0, "a");
			const b = insertLegacy(tree1, 1, "b");
			const c = insertLegacy(tree1, 2, "c");

			const r = insertLegacy(tree2, 0, "r");
			const s = insertLegacy(tree2, 1, "s");
			const t = insertLegacy(tree2, 2, "t");

			const x = insertLegacy(tree3, 0, "x");
			const y = insertLegacy(tree3, 1, "y");
			const z = insertLegacy(tree3, 2, "z");

			const sequenced = sequencer.sequence([x, r, a, s, b, y, c, z, t]);
			tree1.receive(sequenced);
			tree2.receive(sequenced);
			tree3.receive(sequenced);
			tree4.receive(sequenced);

			expectJsonTreeLegacy(
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

			const c = insertLegacy(tree1, 0, "c");
			const b = insertLegacy(tree1, 0, "b");
			const a = insertLegacy(tree1, 0, "a");

			const t = insertLegacy(tree2, 0, "t");
			const s = insertLegacy(tree2, 0, "s");
			const r = insertLegacy(tree2, 0, "r");

			const z = insertLegacy(tree3, 0, "z");
			const y = insertLegacy(tree3, 0, "y");
			const x = insertLegacy(tree3, 0, "x");

			const sequenced = sequencer.sequence([z, t, c, s, b, y, a, x, r]);
			tree1.receive(sequenced);
			tree2.receive(sequenced);
			tree3.receive(sequenced);
			tree4.receive(sequenced);

			expectJsonTreeLegacy(
				[tree1, tree2, tree3, tree4],
				["a", "b", "c", "r", "s", "t", "x", "y", "z"],
			);
		});

		// TODO: Enable once local branch repair data is supported
		it.skip("revert-only revive", () => {
			const sequencer = new Sequencer();
			const tree1 = TestTree.fromJson(["a", "b", "c"]);
			const tree2 = tree1.fork();

			const delB = removeLegacy(tree1, 1, 1);

			const delABC = removeLegacy(tree2, 0, 3);

			const seqDelB = sequencer.sequence(delB);
			const seqDelABC = sequencer.sequence(delABC);

			const revABC = tree2.runTransaction((forest, editor) => {
				const field = editor.sequenceField(undefined, rootFieldKeySymbol);
				field.revive(0, 3, seqDelABC.revision, fakeRepair, 1);
			});

			const seqRevABC = sequencer.sequence(revABC);
			const sequenced = [seqDelB, seqDelABC, seqRevABC];
			tree1.receive(sequenced);
			tree2.receive(sequenced);

			expectJsonTreeLegacy([tree1, tree2], ["a", "c"]);
		});

		// TODO: Enable once local branch repair data is supported
		it.skip("intentional revive", () => {
			const sequencer = new Sequencer();
			const tree1 = TestTree.fromJson(["a", "b", "c"]);
			const tree2 = tree1.fork();

			const delB = removeLegacy(tree1, 1, 1);

			const delABC = removeLegacy(tree2, 0, 3);

			const seqDelB = sequencer.sequence(delB);
			const seqDelABC = sequencer.sequence(delABC);

			const revABC = tree2.runTransaction((forest, editor) => {
				const field = editor.sequenceField(undefined, rootFieldKeySymbol);
				field.revive(0, 3, seqDelABC.revision, fakeRepair, 1, true);
			});

			const seqRevABC = sequencer.sequence(revABC);
			const sequenced = [seqDelB, seqDelABC, seqRevABC];
			tree1.receive(sequenced);
			tree2.receive(sequenced);

			expectJsonTreeLegacy([tree1, tree2], ["a", "b", "c"]);
		});

		// TODO: Re-enable test once TASK 3601 (Fix intra-field move editor API) is completed
		it.skip("intra-field move", () => {
			const sequencer = new Sequencer();
			const tree1 = TestTree.fromJson(["a", "b"]);

			const change = tree1.runTransaction((forest, editor) => {
				const rootField = editor.sequenceField(undefined, rootFieldKeySymbol);
				rootField.move(0, 1, 1);
			});

			const seqChange = sequencer.sequence(change);
			tree1.receive(seqChange);

			expectJsonTreeLegacy(tree1, ["b", "a"]);
		});

		// TODO: Re-enable test once TASK 3601 (Fix intra-field move editor API) is completed
		it.skip("move under move-out", () => {
			const sequencer = new Sequencer();
			const tree1 = TestTree.fromJson([{ foo: ["a", "b"] }, "x"]);

			const change = tree1.runTransaction((forest, editor) => {
				const node1: UpPath = {
					parent: undefined,
					parentField: rootFieldKeySymbol,
					parentIndex: 0,
				};
				const fooField = editor.sequenceField(node1, brand("foo"));
				fooField.move(0, 1, 1);
				const rootField = editor.sequenceField(undefined, rootFieldKeySymbol);
				rootField.move(0, 1, 1);
			});

			const seqChange = sequencer.sequence(change);
			tree1.receive(seqChange);

			expectJsonTreeLegacy(tree1, ["x", { foo: ["b", "a"] }]);
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
function insert(tree: ISharedTreeBranch, index: number, ...values: string[]): void {
	const field = tree.editor.sequenceField(undefined, rootFieldKeySymbol);
	const nodes = values.map((value) => singleTextCursor({ type: jsonString.name, value }));
	field.insert(index, nodes);
}

function remove(tree: ISharedTreeBranch, index: number, count: number): void {
	const field = tree.editor.sequenceField(undefined, rootFieldKeySymbol);
	field.delete(index, count);
}

function expectJsonTree(actual: ISharedTreeBranch | ISharedTreeBranch[], expected: string[]): void {
	const trees = Array.isArray(actual) ? actual : [actual];
	for (const tree of trees) {
		const roots = [...tree.context.root];
		assert.deepEqual(roots, expected);
	}
}

function insertLegacy(tree: TestTree, index: number, ...values: string[]): TestTreeEdit {
	return tree.runTransaction((forest, editor) => {
		const field = editor.sequenceField(undefined, rootFieldKeySymbol);
		const nodes = values.map((value) => singleTextCursor({ type: jsonString.name, value }));
		field.insert(index, nodes);
	});
}

function removeLegacy(tree: TestTree, index: number, count: number): TestTreeEdit {
	return tree.runTransaction((forest, editor) => {
		const field = editor.sequenceField(undefined, rootFieldKeySymbol);
		field.delete(index, count);
	});
}
function expectJsonTreeLegacy(actual: TestTree | TestTree[], expected: JsonCompatible[]): void {
	const trees = Array.isArray(actual) ? actual : [actual];
	for (const tree of trees) {
		const roots = tree.jsonRoots();
		assert.deepEqual(roots, expected);
	}
}
