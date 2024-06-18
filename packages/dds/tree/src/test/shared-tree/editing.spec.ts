/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { unreachableCase } from "@fluidframework/core-utils/internal";

import {
	type AnchorNode,
	type DetachedPlaceUpPath,
	type DetachedRangeUpPath,
	EmptyKey,
	type FieldUpPath,
	type PathVisitor,
	type PlaceUpPath,
	type ProtoNodes,
	type RangeUpPath,
	TreeNavigationResult,
	type UpPath,
	moveToDetachedField,
	rootFieldKey,
} from "../../core/index.js";
import { jsonObject, leaf, singleJsonCursor } from "../../domains/index.js";
import { cursorForJsonableTreeNode } from "../../feature-libraries/index.js";
import type { ITreeCheckout } from "../../shared-tree/index.js";
import { type JsonCompatible, brand, makeArray } from "../../util/index.js";
import {
	createTestUndoRedoStacks,
	expectJsonTree,
	insert,
	makeTreeFromJson,
	remove,
	validateUsageError,
} from "../utils.js";

const rootField: FieldUpPath = {
	parent: undefined,
	field: rootFieldKey,
};

const rootNode: UpPath = {
	parent: undefined,
	parentField: rootFieldKey,
	parentIndex: 0,
};

const rootNode2: UpPath = {
	parent: undefined,
	parentField: rootFieldKey,
	parentIndex: 1,
};

describe("Editing", () => {
	describe("Sequence Field", () => {
		it("concurrent inserts", () => {
			const tree1 = makeTreeFromJson([]);
			insert(tree1, 0, "y");
			const tree2 = tree1.fork();

			insert(tree1, 0, "x");
			insert(tree2, 1, "a", "c");
			insert(tree2, 2, "b");
			tree2.rebaseOnto(tree1);
			tree1.merge(tree2);

			const expected = ["x", "y", "a", "b", "c"];
			expectJsonTree([tree1, tree2], expected);
		});

		it("can rebase remove over move", () => {
			const tree1 = makeTreeFromJson([]);
			const tree2 = tree1.fork();
			insert(tree1, 0, "a", "b");
			tree2.rebaseOnto(tree1);

			// Move b before a
			tree1.editor.move(rootField, 1, 1, rootField, 0);

			// Remove b
			remove(tree2, 1, 1);

			tree2.rebaseOnto(tree1);
			tree1.merge(tree2);

			const expected = ["a"];
			expectJsonTree([tree1, tree2], expected);
		});

		it("can rebase intra-field move over inter-field move of same node and its parent", () => {
			const tree1 = makeTreeFromJson([[], ["X", "Y"]]);
			const tree2 = tree1.fork();

			tree1.transaction.start();
			tree1.editor.move(
				{ parent: rootNode2, field: brand("") },
				0,
				1,
				{ parent: rootNode, field: brand("") },
				0,
			);
			tree1.editor.sequenceField(rootField).move(1, 1, 0);
			tree1.transaction.commit();

			tree2.editor.sequenceField({ parent: rootNode2, field: brand("") }).move(0, 1, 0);

			tree2.rebaseOnto(tree1);
			tree1.merge(tree2);

			expectJsonTree([tree1, tree2], [["X", "Y"], []]);
		});

		it("can rebase remove over cross-field move", () => {
			const tree1 = makeTreeFromJson([
				{
					foo: ["a", "b", "c"],
					bar: ["d", "e"],
				},
			]);

			const tree2 = tree1.fork();

			const fooArrayPath: UpPath = {
				parent: rootNode,
				parentField: brand("foo"),
				parentIndex: 0,
			};

			const barArrayPath: UpPath = {
				parent: rootNode,
				parentField: brand("bar"),
				parentIndex: 0,
			};

			// Move bc between d and e.
			tree1.editor.move(
				{ parent: fooArrayPath, field: brand("") },
				1,
				2,
				{ parent: barArrayPath, field: brand("") },
				1,
			);

			// Remove c
			const field = tree2.editor.sequenceField({ parent: fooArrayPath, field: brand("") });
			field.remove(2, 1);

			tree2.rebaseOnto(tree1);
			tree1.merge(tree2);

			const expectedState = {
				foo: ["a"],
				bar: ["d", "b", "e"],
			};

			expectJsonTree([tree1, tree2], [expectedState]);
		});

		it("can rebase cross-field move over remove", () => {
			const tree1 = makeTreeFromJson([
				{
					foo: ["a", "b", "c"],
					bar: ["d", "e"],
				},
			]);

			const tree2 = tree1.fork();

			const fooArrayPath: UpPath = {
				parent: rootNode,
				parentField: brand("foo"),
				parentIndex: 0,
			};

			const barArrayPath: UpPath = {
				parent: rootNode,
				parentField: brand("bar"),
				parentIndex: 0,
			};

			// Remove c
			const field = tree1.editor.sequenceField({ parent: fooArrayPath, field: brand("") });
			field.remove(2, 1);

			// Move bc between d and e.
			tree2.editor.move(
				{ parent: fooArrayPath, field: brand("") },
				1,
				2,
				{ parent: barArrayPath, field: brand("") },
				1,
			);

			tree2.rebaseOnto(tree1);
			tree1.merge(tree2);

			const expectedState = [
				{
					foo: ["a"],
					bar: ["d", "b", "c", "e"],
				},
			];

			expectJsonTree([tree1, tree2], expectedState);
		});

		it("can order concurrent inserts within concurrently removed content", () => {
			const tree = makeTreeFromJson(["A", "B", "C", "D"]);
			const delAB = tree.fork();
			const delCD = tree.fork();
			const addX = tree.fork();
			const addY = tree.fork();

			// Make deletions in two steps to ensure that gap tracking handles comparing insertion places that
			// were affected by different removes.
			remove(delAB, 0, 2);
			remove(delCD, 2, 2);
			insert(addX, 1, "x");
			insert(addY, 3, "y");

			tree.merge(delAB, false);
			tree.merge(delCD, false);
			tree.merge(addX, false);
			tree.merge(addY, false);

			delAB.rebaseOnto(tree);
			delCD.rebaseOnto(tree);
			addX.rebaseOnto(tree);
			addY.rebaseOnto(tree);

			expectJsonTree([tree, delAB, delCD, addX, addY], ["x", "y"]);
		});

		it("can rebase a change under a node whose insertion is also rebased", () => {
			const tree1 = makeTreeFromJson(["B"]);
			const tree2 = tree1.fork();
			const tree3 = tree1.fork();

			insert(tree2, 1, "C");
			tree3.editor
				.sequenceField(rootField)
				.insert(0, cursorForJsonableTreeNode({ type: jsonObject.name }));

			const aEditor = tree3.editor.sequenceField({ parent: rootNode, field: brand("foo") });
			aEditor.insert(0, cursorForJsonableTreeNode({ type: leaf.string.name, value: "a" }));

			tree1.merge(tree2, false);
			tree1.merge(tree3, false);

			tree2.rebaseOnto(tree1);
			tree3.rebaseOnto(tree1);

			expectJsonTree([tree1, tree2, tree3], [{ foo: "a" }, "B", "C"]);
		});

		it("can handle competing removes", () => {
			for (const index of [0, 1, 2, 3]) {
				const startingState = ["A", "B", "C", "D"];
				const tree = makeTreeFromJson(startingState);
				const tree1 = tree.fork();
				const tree2 = tree.fork();
				const tree3 = tree.fork();

				remove(tree1, index, 1);
				remove(tree2, index, 1);
				remove(tree3, index, 1);

				tree.merge(tree1, false);
				tree.merge(tree2, false);
				tree.merge(tree3, false);

				tree1.rebaseOnto(tree);
				tree2.rebaseOnto(tree);
				tree3.rebaseOnto(tree);

				const expected = [...startingState];
				expected.splice(index, 1);
				expectJsonTree([tree, tree1, tree2, tree3], expected, true);
			}
		});

		it("can rebase local dependent inserts", () => {
			const tree1 = makeTreeFromJson(["y"]);
			const tree2 = tree1.fork();

			insert(tree1, 0, "x");

			insert(tree2, 1, "a", "c");
			insert(tree2, 2, "b");

			expectJsonTree(tree2, ["y", "a", "b", "c"]);

			// Get an anchor to node b
			const cursor = tree2.forest.allocateCursor();
			moveToDetachedField(tree2.forest, cursor);
			cursor.enterNode(2);
			assert.equal(cursor.value, "b");
			const anchor = cursor.buildAnchor();
			cursor.free();

			tree1.merge(tree2, false);
			tree2.rebaseOnto(tree1);

			expectJsonTree([tree1, tree2], ["x", "y", "a", "b", "c"]);

			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const { parent, parentField, parentIndex } = tree2.locate(anchor)!;
			const expectedPath: UpPath = {
				parent: undefined,
				parentField: rootFieldKey,
				parentIndex: 3,
			};
			assert.deepEqual({ parent, parentField, parentIndex }, expectedPath);
		});

		it("can rebase a local remove", () => {
			const addW = makeTreeFromJson(["x", "y"]);
			const delY = addW.fork();

			remove(delY, 1, 1);
			insert(addW, 0, "w");

			addW.merge(delY, false);
			delY.rebaseOnto(addW);

			expectJsonTree([addW, delY], ["w", "x"]);
		});

		it("can edit a concurrently removed tree", () => {
			const fooList: UpPath = { parent: rootNode, parentField: brand("foo"), parentIndex: 0 };
			const tree1 = makeTreeFromJson({ foo: ["A", "B", "C"] });
			const tree2 = tree1.fork();

			const { undoStack } = createTestUndoRedoStacks(tree1.events);
			remove(tree1, 0, 1);
			const removal = undoStack.pop();

			const listEditor = tree2.editor.sequenceField({ parent: fooList, field: brand("") });
			listEditor.move(2, 1, 1);
			listEditor.insert(3, cursorForJsonableTreeNode({ type: leaf.string.name, value: "D" }));
			listEditor.remove(0, 1);
			expectJsonTree(tree2, [{ foo: ["C", "B", "D"] }]);

			tree1.merge(tree2, false);
			tree2.rebaseOnto(tree1);

			expectJsonTree([tree1, tree2], []);

			removal?.revert();

			tree1.merge(tree2, false);
			tree2.rebaseOnto(tree1);

			expectJsonTree([tree1, tree2], [{ foo: ["C", "B", "D"] }]);
		});

		it("inserts that concurrently target the same insertion point do not interleave their contents", () => {
			const tree = makeTreeFromJson([]);
			const abc = tree.fork();
			const rst = tree.fork();
			const xyz = tree.fork();

			insert(abc, 0, "a", "b", "c");
			insert(rst, 0, "r", "s", "t");
			insert(xyz, 0, "x", "y", "z");

			tree.merge(xyz, false);
			tree.merge(rst, false);
			tree.merge(abc, false);

			xyz.rebaseOnto(tree);
			rst.rebaseOnto(tree);
			abc.rebaseOnto(tree);

			expectJsonTree([tree, abc, rst, xyz], ["a", "b", "c", "r", "s", "t", "x", "y", "z"]);
		});

		it("merge-left tie-breaking does not interleave concurrent left to right inserts", () => {
			const tree = makeTreeFromJson([]);
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

			tree.merge(x);
			tree.merge(r);
			tree.merge(a);
			tree.merge(s);
			tree.merge(b);
			tree.merge(y);
			tree.merge(c, false);
			tree.merge(z, false);
			tree.merge(t, false);

			c.rebaseOnto(tree);
			t.rebaseOnto(tree);
			z.rebaseOnto(tree);

			expectJsonTree([tree, c, t, z], ["a", "b", "c", "r", "s", "t", "x", "y", "z"]);
		});

		// The current implementation orders the letters from inserted last to inserted first.
		// This is due to the hard-coded merge-left policy.
		// Having merge-right tie-breaking does preserve groupings but in a first-to-last order
		// which is the desired outcome for RTL text.
		// TODO: update and activate this test once merge-right is supported.
		it.skip("merge-right tie-breaking does not interleave concurrent right to left inserts", () => {
			const tree = makeTreeFromJson([]);
			const c = tree.fork();
			const t = tree.fork();
			const z = tree.fork();

			insert(c, 0, "c");
			const b = c.fork();
			insert(b, 0, "b");
			const a = b.fork();
			insert(a, 0, "a");

			insert(t, 0, "t");
			const s = t.fork();
			insert(s, 0, "s");
			const r = s.fork();
			insert(r, 0, "r");

			insert(z, 0, "z");
			const y = z.fork();
			insert(y, 0, "y");
			const x = y.fork();
			insert(x, 0, "x");

			tree.merge(z);
			tree.merge(t);
			tree.merge(c);
			tree.merge(s);
			tree.merge(b);
			tree.merge(y);
			tree.merge(a);
			tree.merge(x);
			tree.merge(r);

			a.rebaseOnto(tree);
			r.rebaseOnto(tree);
			x.rebaseOnto(tree);

			expectJsonTree([tree, a, r, x], ["a", "b", "c", "r", "s", "t", "x", "y", "z"]);
		});

		it("intra-field move", () => {
			const tree1 = makeTreeFromJson(["A", "B"]);

			tree1.editor.sequenceField(rootField).move(0, 1, 2);

			expectJsonTree(tree1, ["B", "A"]);
		});

		it("can rebase insert and remove over insert in the same gap", () => {
			const tree1 = makeTreeFromJson([]);
			const tree2 = tree1.fork();

			insert(tree1, 0, "B");

			insert(tree2, 0, "A");
			remove(tree2, 0, 1);

			tree1.merge(tree2, false);
			tree2.rebaseOnto(tree1);
			expectJsonTree([tree1, tree2], ["B"]);
		});

		it("concurrent insert with nested change", () => {
			const tree1 = makeTreeFromJson([]);
			const tree2 = tree1.fork();

			insert(tree1, 0, "a");
			expectJsonTree(tree1, ["a"]);

			tree2.editor
				.sequenceField(rootField)
				.insert(0, cursorForJsonableTreeNode({ type: jsonObject.name }));
			tree2.editor
				.sequenceField({ parent: rootNode, field: brand("foo") })
				.insert(0, cursorForJsonableTreeNode({ type: jsonObject.name }));
			expectJsonTree(tree2, [{ foo: {} }]);

			tree2.rebaseOnto(tree1);
			tree1.merge(tree2);

			expectJsonTree([tree1, tree2], [{ foo: {} }, "a"]);
		});

		it("can rebase intra-field move over insert", () => {
			const tree1 = makeTreeFromJson(["A", "B"]);
			const tree2 = tree1.fork();

			insert(tree1, 2, "C");

			tree2.editor.sequenceField(rootField).move(0, 1, 2);

			tree1.merge(tree2, false);
			tree2.rebaseOnto(tree1);
			expectJsonTree(tree1, ["B", "A", "C"]);
			expectJsonTree(tree2, ["B", "A", "C"]);
		});

		it("can concurrently edit and move a subtree", () => {
			const tree1 = makeTreeFromJson(["A", { foo: "B" }]);
			const tree2 = tree1.fork();

			const parent = { parent: undefined, parentField: rootFieldKey, parentIndex: 1 };
			const editor = tree1.editor.valueField({ parent, field: brand("foo") });
			editor.set(cursorForJsonableTreeNode({ type: leaf.string.name, value: "C" }));

			// Move B before A.
			tree2.editor.move(rootField, 1, 1, rootField, 0);

			tree1.merge(tree2, false);
			tree2.rebaseOnto(tree1);

			const expectedState: JsonCompatible = [{ foo: "C" }, "A"];
			expectJsonTree(tree1, expectedState);
			expectJsonTree(tree2, expectedState);
		});

		it("can concurrently edit and move a subtree (Move first)", () => {
			const tree1 = makeTreeFromJson(["A", { foo: "B" }]);
			const tree2 = tree1.fork();

			// Move B before A.
			tree1.editor.move(rootField, 1, 1, rootField, 0);

			const editor = tree2.editor.valueField({
				parent: {
					parent: undefined,
					parentField: rootFieldKey,
					parentIndex: 1,
				},
				field: brand("foo"),
			});
			editor.set(cursorForJsonableTreeNode({ type: leaf.string.name, value: "C" }));

			tree1.merge(tree2, false);
			tree2.rebaseOnto(tree1);

			const expectedState: JsonCompatible = [{ foo: "C" }, "A"];
			expectJsonTree(tree1, expectedState);
			expectJsonTree(tree2, expectedState);
		});

		it("can concurrently edit and move a subtree (Move first) in a list under a node", () => {
			const tree1 = makeTreeFromJson([{ seq: [{ foo: "A" }, "B"] }]);
			const tree2 = tree1.fork();

			const seqList: UpPath = { parent: rootNode, parentField: brand("seq"), parentIndex: 0 };
			const seqField: FieldUpPath = { parent: seqList, field: brand("") };
			const fooField: FieldUpPath = {
				parent: { parent: seqList, parentField: brand(""), parentIndex: 0 },
				field: brand("foo"),
			};
			tree1.editor.move(seqField, 0, 1, seqField, 1);

			tree2.editor.valueField(fooField).set(singleJsonCursor("a"));

			tree2.rebaseOnto(tree1);
			tree1.merge(tree2, false);

			const expectedState: JsonCompatible = [{ seq: [{ foo: "a" }, "B"] }];
			expectJsonTree(tree1, expectedState);
			expectJsonTree(tree2, expectedState);
		});

		it("can rebase cross-field move over edit of moved node", () => {
			const tree1 = makeTreeFromJson({
				foo: [{ baz: "A" }],
				bar: ["B"],
			});
			const tree2 = tree1.fork();

			const fooList: UpPath = { parent: rootNode, parentField: brand("foo"), parentIndex: 0 };
			const barList: UpPath = { parent: rootNode, parentField: brand("bar"), parentIndex: 0 };

			// Change value of A to C
			const editor = tree1.editor.valueField({
				parent: { parent: fooList, parentField: brand(""), parentIndex: 0 },
				field: brand("baz"),
			});
			editor.set(cursorForJsonableTreeNode({ type: leaf.string.name, value: "C" }));

			// Move object from foo list to bar list
			tree2.editor.move(
				{ parent: fooList, field: brand("") },
				0,
				1,
				{ parent: barList, field: brand("") },
				1,
			);

			const expectedState: JsonCompatible = [
				{
					foo: [],
					bar: ["B", { baz: "C" }],
				},
			];

			tree1.merge(tree2, false);
			tree2.rebaseOnto(tree1);

			expectJsonTree([tree1, tree2], expectedState);
		});

		it("can rebase node deletion over cross-field move of descendant", () => {
			const tree1 = makeTreeFromJson({
				foo: ["A"],
			});
			const tree2 = tree1.fork();

			const fooList: UpPath = { parent: rootNode, parentField: brand("foo"), parentIndex: 0 };

			// Move A out of foo.
			tree1.editor.move({ parent: fooList, field: brand("") }, 0, 1, rootField, 0);

			// Remove root.
			tree2.editor.sequenceField(rootField).remove(0, 1);

			const expectedState: JsonCompatible = ["A"];

			tree1.merge(tree2, false);
			tree2.rebaseOnto(tree1);

			expectJsonTree([tree1, tree2], expectedState);
		});

		it("can rebase edit over cross-field move of changed node", () => {
			const tree1 = makeTreeFromJson({
				foo: [{ baz: "A" }],
				bar: ["B"],
			});
			const tree2 = tree1.fork();

			const fooList: UpPath = { parent: rootNode, parentField: brand("foo"), parentIndex: 0 };
			const barList: UpPath = { parent: rootNode, parentField: brand("bar"), parentIndex: 0 };

			// Move A after B.
			tree1.editor.move(
				{ parent: fooList, field: brand("") },
				0,
				1,
				{ parent: barList, field: brand("") },
				1,
			);

			// Remove A
			const editor = tree2.editor.sequenceField({
				parent: { parent: fooList, parentField: brand(""), parentIndex: 0 },
				field: brand("baz"),
			});
			editor.remove(0, 1);

			const expectedState: JsonCompatible = [
				{
					foo: [],
					bar: ["B", {}],
				},
			];

			tree1.merge(tree2, false);
			tree2.rebaseOnto(tree1);
			expectJsonTree([tree1, tree2], expectedState);
		});

		it("move under move-out", () => {
			const tree1 = makeTreeFromJson([{ foo: ["a", "b"] }, "x"]);

			tree1.transaction.start();

			const listNode: UpPath = {
				parent: rootNode,
				parentField: brand("foo"),
				parentIndex: 0,
			};
			const fooField = tree1.editor.sequenceField({ parent: listNode, field: brand("") });
			fooField.move(0, 1, 2);

			const rootSequence = tree1.editor.sequenceField(rootField);
			rootSequence.move(0, 1, 2);

			tree1.transaction.commit();

			expectJsonTree(tree1, ["x", { foo: ["b", "a"] }]);
		});

		it("move, remove, restore", () => {
			const tree1 = makeTreeFromJson(["a", "b"]);
			const tree2 = tree1.fork();

			const cursor = tree1.forest.allocateCursor();
			moveToDetachedField(tree1.forest, cursor);
			cursor.enterNode(1);
			const anchorB = cursor.buildAnchor();
			cursor.free();

			const { undoStack } = createTestUndoRedoStacks(tree2.events);

			tree2.editor.sequenceField(rootField).move(1, 1, 0);
			tree2.editor.sequenceField(rootField).remove(0, 1);

			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			undoStack.pop()!.revert();

			// This merge causes the move, remove, and restore to be composed and applied in one changeset on tree1
			tree1.merge(tree2, false);
			tree2.rebaseOnto(tree1);

			expectJsonTree([tree1, tree2], ["b", "a"]);

			const nodeBPath = tree1.locate(anchorB) ?? assert.fail();
			const actual = {
				parent: nodeBPath.parent,
				parentField: nodeBPath.parentField,
				parentIndex: nodeBPath.parentIndex,
			};
			const expected = { parent: undefined, parentField: rootFieldKey, parentIndex: 0 };
			assert.deepEqual(actual, expected);
		});

		it("move adjacent nodes to separate destinations", () => {
			const tree = makeTreeFromJson(["A", "B", "C", "D"]);
			const tree2 = tree.fork();

			tree2.transaction.start();

			const sequence = tree2.editor.sequenceField(rootField);
			sequence.move(1, 1, 0);
			sequence.move(2, 1, 4);
			tree2.transaction.commit();
			tree.merge(tree2);
			expectJsonTree([tree, tree2], ["B", "A", "D", "C"]);
		});

		it("move separate nodes to adjacent destinations", () => {
			const tree = makeTreeFromJson(["A", "B", "C", "D"]);
			const tree2 = tree.fork();

			tree2.transaction.start();

			const sequence = tree2.editor.sequenceField(rootField);
			sequence.move(0, 1, 2);
			sequence.move(3, 1, 2);
			tree2.transaction.commit();
			tree.merge(tree2);
			expectJsonTree([tree, tree2], ["B", "A", "D", "C"]);
		});

		it("ancestor of move destination removed", () => {
			const tree = makeTreeFromJson([{ foo: ["a"] }, {}]);
			const tree2 = tree.fork();

			const first: UpPath = {
				parent: undefined,
				parentIndex: 0,
				parentField: rootFieldKey,
			};

			const second: UpPath = {
				parent: undefined,
				parentIndex: 1,
				parentField: rootFieldKey,
			};

			const { undoStack } = createTestUndoRedoStacks(tree.events);

			const sequence = tree.editor.sequenceField(rootField);
			// Remove destination's ancestor concurrently
			sequence.remove(1, 1);

			const deletion = undoStack.pop();

			tree2.editor.move(
				{ parent: first, field: brand("foo") },
				0,
				1,
				{ parent: second, field: brand("bar") },
				0,
			);

			tree.merge(tree2, false);
			tree2.rebaseOnto(tree);

			expectJsonTree([tree, tree2], [{}]);

			deletion?.revert();
			tree2.rebaseOnto(tree);

			expectJsonTree([tree, tree2], [{}, { bar: ["a"] }]);
		});

		it("ancestor of move source removed", () => {
			const tree = makeTreeFromJson([{ foo: ["a"] }, {}]);
			const tree2 = tree.fork();

			const first: UpPath = {
				parent: undefined,
				parentIndex: 0,
				parentField: rootFieldKey,
			};

			const second: UpPath = {
				parent: undefined,
				parentIndex: 1,
				parentField: rootFieldKey,
			};

			const { undoStack } = createTestUndoRedoStacks(tree.events);

			const sequence = tree.editor.sequenceField(rootField);
			// Remove source's ancestor concurrently
			sequence.remove(0, 1);

			const deletion = undoStack.pop();

			tree2.editor.move(
				{ parent: first, field: brand("foo") },
				0,
				1,
				{ parent: second, field: brand("bar") },
				0,
			);

			tree.merge(tree2, false);
			tree2.rebaseOnto(tree);

			expectJsonTree([tree, tree2], [{ bar: ["a"] }]);

			deletion?.revert();
			tree2.rebaseOnto(tree);

			expectJsonTree([tree, tree2], [{}, { bar: ["a"] }]);
		});

		it("ancestor of move source removed then revived", () => {
			const tree = makeTreeFromJson([{ foo: ["a"] }, {}]);
			const tree2 = tree.fork();
			const { undoStack, unsubscribe } = createTestUndoRedoStacks(tree.events);

			const first: UpPath = {
				parent: undefined,
				parentIndex: 0,
				parentField: rootFieldKey,
			};

			const second: UpPath = {
				parent: undefined,
				parentIndex: 1,
				parentField: rootFieldKey,
			};

			const sequence = tree.editor.sequenceField(rootField);

			// Remove source's ancestor concurrently
			sequence.remove(0, 1);
			// Revive the ancestor
			undoStack.pop()?.revert();

			tree2.editor.move(
				{ parent: first, field: brand("foo") },
				0,
				1,
				{ parent: second, field: brand("bar") },
				0,
			);

			tree.merge(tree2, false);
			tree2.rebaseOnto(tree);

			expectJsonTree([tree, tree2], [{}, { bar: ["a"] }]);
			unsubscribe();
		});

		it("node being concurrently moved and removed with source ancestor revived", () => {
			const tree = makeTreeFromJson([{ foo: ["a"] }, {}]);
			const tree2 = tree.fork();
			const { undoStack, unsubscribe } = createTestUndoRedoStacks(tree.events);

			const first: UpPath = {
				parent: undefined,
				parentIndex: 0,
				parentField: rootFieldKey,
			};

			const second: UpPath = {
				parent: undefined,
				parentIndex: 1,
				parentField: rootFieldKey,
			};

			// Remove source's ancestor concurrently
			tree.editor.sequenceField(rootField).remove(0, 1);
			expectJsonTree(tree, [{}]);
			// Revive source's ancestor
			undoStack.pop()?.revert();
			expectJsonTree(tree, [{ foo: ["a"] }, {}]);
			// Remove ["a"]
			tree.editor.sequenceField({ parent: first, field: brand("foo") }).remove(0, 1);
			expectJsonTree(tree, [{}, {}]);

			tree2.editor.move(
				{ parent: first, field: brand("foo") },
				0,
				1,
				{ parent: second, field: brand("bar") },
				0,
			);

			tree.merge(tree2, false);
			tree2.rebaseOnto(tree);

			expectJsonTree([tree, tree2], [{}, { bar: ["a"] }]);
			unsubscribe();
		});

		it("remove, undo, childchange rebased over childchange", () => {
			const tree = makeTreeFromJson([{ foo: ["b"] }]);
			const tree2 = tree.fork();
			const { undoStack, unsubscribe } = createTestUndoRedoStacks(tree2.events);

			const first: UpPath = {
				parent: undefined,
				parentIndex: 0,
				parentField: rootFieldKey,
			};

			const sequenceUpPath: UpPath = {
				parent: first,
				parentIndex: 0,
				parentField: brand("foo"),
			};

			const sequence = tree2.editor.sequenceField(rootField);

			sequence.remove(0, 1);
			undoStack.pop()?.revert();
			tree2.editor
				.sequenceField({ parent: sequenceUpPath, field: EmptyKey })
				.insert(1, cursorForJsonableTreeNode({ type: leaf.string.name, value: "c" }));

			tree.editor
				.sequenceField({ parent: sequenceUpPath, field: EmptyKey })
				.insert(0, cursorForJsonableTreeNode({ type: leaf.string.name, value: "a" }));

			tree2.rebaseOnto(tree);

			expectJsonTree([tree2], [{ foo: ["a", "b", "c"] }]);
			unsubscribe();
		});

		it("childchange rebase over remove, undo, childchange", () => {
			const tree = makeTreeFromJson([{ foo: ["b"] }]);
			const tree2 = tree.fork();
			const { undoStack, redoStack, unsubscribe } = createTestUndoRedoStacks(tree.events);

			const first: UpPath = {
				parent: undefined,
				parentIndex: 0,
				parentField: rootFieldKey,
			};

			const sequenceUpPath: UpPath = {
				parent: first,
				parentIndex: 0,
				parentField: brand("foo"),
			};

			const sequence = tree.editor.sequenceField(rootField);

			sequence.remove(0, 1);
			undoStack.pop()?.revert();
			redoStack.pop()?.revert();
			undoStack.pop()?.revert();
			tree.editor
				.sequenceField({ parent: sequenceUpPath, field: EmptyKey })
				.insert(1, cursorForJsonableTreeNode({ type: leaf.string.name, value: "c" }));

			tree2.editor
				.sequenceField({ parent: sequenceUpPath, field: EmptyKey })
				.insert(0, cursorForJsonableTreeNode({ type: leaf.string.name, value: "a" }));

			tree2.rebaseOnto(tree);

			expectJsonTree([tree2], [{ foo: ["a", "b", "c"] }]);
			unsubscribe();
		});

		it("node being concurrently moved and revived with source ancestor removed", () => {
			const tree = makeTreeFromJson([{ foo: ["a"] }, {}]);
			const tree2 = tree.fork();
			const { undoStack, unsubscribe } = createTestUndoRedoStacks(tree.events);

			const first: UpPath = {
				parent: undefined,
				parentIndex: 0,
				parentField: rootFieldKey,
			};

			const second: UpPath = {
				parent: undefined,
				parentIndex: 1,
				parentField: rootFieldKey,
			};

			// Remove ["a"]
			tree.editor.sequenceField({ parent: first, field: brand("foo") }).remove(0, 1);
			expectJsonTree(tree, [{}, {}]);
			// Revive ["a"]
			undoStack.pop()?.revert();
			expectJsonTree(tree, [{ foo: ["a"] }, {}]);
			// Remove source's ancestor concurrently
			tree.editor.sequenceField(rootField).remove(0, 1);
			expectJsonTree(tree, [{}]);

			tree2.editor.move(
				{ parent: first, field: brand("foo") },
				0,
				1,
				{ parent: second, field: brand("bar") },
				0,
			);

			tree.merge(tree2, false);
			tree2.rebaseOnto(tree);

			expectJsonTree([tree, tree2], [{ bar: ["a"] }]);
			unsubscribe();
		});

		it("remove ancestor of return source", () => {
			const tree = makeTreeFromJson([{ foo: ["a"] }, {}]);
			const first: UpPath = {
				parent: undefined,
				parentIndex: 0,
				parentField: rootFieldKey,
			};

			const second: UpPath = {
				parent: undefined,
				parentIndex: 1,
				parentField: rootFieldKey,
			};

			// Move to bar: [{}, { bar: ["a"] }}]
			tree.editor.move(
				{ parent: first, field: brand("foo") },
				0,
				1,
				{ parent: second, field: brand("bar") },
				0,
			);

			const tree2 = tree.fork();

			const undoTree1 = createTestUndoRedoStacks(tree.events);
			const undoTree2 = createTestUndoRedoStacks(tree2.events);

			const sequence = tree.editor.sequenceField(rootField);

			// Remove ancestor of "a"
			sequence.remove(1, 1);
			// Undo move to bar
			undoTree2.undoStack.pop()?.revert();

			tree.merge(tree2, false);
			tree2.rebaseOnto(tree);

			expectJsonTree([tree, tree2], [{}]);

			// Undo deletion of ancestor of "a"
			undoTree1.undoStack.pop()?.revert();
			tree2.rebaseOnto(tree);

			expectJsonTree([tree, tree2], [{}, { bar: ["a"] }]);

			undoTree1.unsubscribe();
			undoTree2.unsubscribe();
		});

		it("remove ancestor of return destination", () => {
			const tree = makeTreeFromJson([{ foo: ["a"] }, {}]);
			const first: UpPath = {
				parent: undefined,
				parentIndex: 0,
				parentField: rootFieldKey,
			};

			const second: UpPath = {
				parent: undefined,
				parentIndex: 1,
				parentField: rootFieldKey,
			};

			const { undoStack, unsubscribe } = createTestUndoRedoStacks(tree.events);
			// Move to bar: [{}, { bar: ["a"] }}]
			tree.editor.move(
				{ parent: first, field: brand("foo") },
				0,
				1,
				{ parent: second, field: brand("bar") },
				0,
			);

			const tree2 = tree.fork();

			const sequence = tree.editor.sequenceField(rootField);

			// Remove destination ancestor
			sequence.remove(0, 1);
			// Undo move to bar
			undoStack[0].revert();

			tree.merge(tree2, false);
			tree2.rebaseOnto(tree);

			expectJsonTree([tree, tree2], [{}]);
			unsubscribe();
		});

		it("can move nodes from field, and back to the source field", () => {
			const tree = makeTreeFromJson({
				foo: ["A", "B", "C", "D"],
				bar: ["E"],
			});

			const fooList: UpPath = { parent: rootNode, parentField: brand("foo"), parentIndex: 0 };
			const barList: UpPath = { parent: rootNode, parentField: brand("bar"), parentIndex: 0 };

			tree.transaction.start();
			// Move nodes from foo into bar.
			tree.editor.move(
				{ parent: fooList, field: brand("") },
				0,
				3,
				{ parent: barList, field: brand("") },
				0,
			);
			// Move the same nodes from bar back to foo.
			tree.editor.move(
				{ parent: barList, field: brand("") },
				0,
				3,
				{ parent: fooList, field: brand("") },
				0,
			);
			tree.transaction.commit();

			const expectedState: JsonCompatible = [
				{
					foo: ["A", "B", "C", "D"],
					bar: ["E"],
				},
			];

			expectJsonTree(tree, expectedState);
		});

		it("can handle concurrent moves of the same node", () => {
			const tree1 = makeTreeFromJson([{ foo: [], bar: [] }, "A"]);
			const tree2 = tree1.fork();

			const fooList: UpPath = { parent: rootNode, parentField: brand("foo"), parentIndex: 0 };
			const barList: UpPath = { parent: rootNode, parentField: brand("bar"), parentIndex: 0 };

			tree1.editor.move(rootField, 1, 1, { parent: fooList, field: brand("") }, 0);
			expectJsonTree(tree1, [{ foo: ["A"], bar: [] }]);
			tree2.editor.move(rootField, 1, 1, { parent: barList, field: brand("") }, 0);
			expectJsonTree(tree2, [{ foo: [], bar: ["A"] }]);

			tree1.merge(tree2, false);
			tree2.rebaseOnto(tree1);

			expectJsonTree([tree1, tree2], [{ foo: [], bar: ["A"] }]);
		});

		it("can move different nodes with 3 different fields", () => {
			const tree = makeTreeFromJson({
				foo: ["A", "B", "C", "D"],
				bar: ["E", "F", "G", "H"],
				baz: ["I", "J", "K", "L"],
			});

			const fooList: UpPath = { parent: rootNode, parentField: brand("foo"), parentIndex: 0 };
			const barList: UpPath = { parent: rootNode, parentField: brand("bar"), parentIndex: 0 };
			const bazList: UpPath = { parent: rootNode, parentField: brand("baz"), parentIndex: 0 };

			tree.transaction.start();
			// Move nodes from foo into bar.
			tree.editor.move(
				{ parent: fooList, field: brand("") },
				0,
				2,
				{ parent: barList, field: brand("") },
				0,
			);
			// Move different nodes from bar into baz.
			tree.editor.move(
				{ parent: barList, field: brand("") },
				2,
				2,
				{ parent: bazList, field: brand("") },
				0,
			);
			// Move different nodes from baz into foo.
			tree.editor.move(
				{ parent: bazList, field: brand("") },
				2,
				2,
				{ parent: fooList, field: brand("") },
				0,
			);
			tree.transaction.commit();

			const expectedState: JsonCompatible = [
				{
					foo: ["I", "J", "C", "D"],
					bar: ["A", "B", "G", "H"],
					baz: ["E", "F", "K", "L"],
				},
			];

			expectJsonTree(tree, expectedState);
		});

		it("can move inserted nodes to a different field", () => {
			const tree = makeTreeFromJson({
				foo: ["D"],
				bar: ["E"],
			});

			const fooList: UpPath = { parent: rootNode, parentField: brand("foo"), parentIndex: 0 };
			const barList: UpPath = { parent: rootNode, parentField: brand("bar"), parentIndex: 0 };

			tree.transaction.start();
			// inserts nodes to move
			const field = tree.editor.sequenceField({ parent: fooList, field: brand("") });
			field.insert(0, cursorForJsonableTreeNode({ type: leaf.string.name, value: "C" }));
			field.insert(0, cursorForJsonableTreeNode({ type: leaf.string.name, value: "B" }));
			field.insert(0, cursorForJsonableTreeNode({ type: leaf.string.name, value: "A" }));
			// Move nodes from foo into bar.
			tree.editor.move(
				{ parent: fooList, field: brand("") },
				0,
				3,
				{ parent: barList, field: brand("") },
				0,
			);
			tree.transaction.commit();

			const expectedState: JsonCompatible = [
				{
					foo: ["D"],
					bar: ["A", "B", "C", "E"],
				},
			];

			expectJsonTree(tree, expectedState);
		});

		it("can move nodes to another field and remove them", () => {
			const tree = makeTreeFromJson({
				foo: ["A", "B", "C", "D"],
				bar: ["E"],
			});

			const fooList: UpPath = { parent: rootNode, parentField: brand("foo"), parentIndex: 0 };
			const barList: UpPath = { parent: rootNode, parentField: brand("bar"), parentIndex: 0 };

			tree.transaction.start();
			// Move nodes from foo into bar.
			tree.editor.move(
				{ parent: fooList, field: brand("") },
				0,
				3,
				{ parent: barList, field: brand("") },
				0,
			);
			// Removes moved nodes
			const field = tree.editor.sequenceField({ parent: barList, field: brand("") });
			field.remove(0, 3);
			tree.transaction.commit();

			const expectedState: JsonCompatible = [
				{
					foo: ["D"],
					bar: ["E"],
				},
			];

			expectJsonTree(tree, expectedState);
		});

		it("can move nodes to another field and remove a subset of them", () => {
			const tree = makeTreeFromJson({
				foo: ["A", "B", "C", "D", "E"],
				bar: ["F"],
			});

			const fooList: UpPath = { parent: rootNode, parentField: brand("foo"), parentIndex: 0 };
			const barList: UpPath = { parent: rootNode, parentField: brand("bar"), parentIndex: 0 };

			tree.transaction.start();
			// Move nodes from foo into bar.
			tree.editor.move(
				{ parent: fooList, field: brand("") },
				0,
				4,
				{ parent: barList, field: brand("") },
				0,
			);
			// Removes subset of moved nodes
			const field = tree.editor.sequenceField({ parent: barList, field: brand("") });
			field.remove(1, 2);
			tree.transaction.commit();

			const expectedState: JsonCompatible = [
				{
					foo: ["E"],
					bar: ["A", "D", "F"],
				},
			];

			expectJsonTree(tree, expectedState);
		});

		it("can move nodes to one field, and move remaining nodes to another field", () => {
			const tree = makeTreeFromJson({
				foo: ["A", "B", "C", "D"],
				bar: ["E"],
				baz: ["F"],
			});

			const fooList: UpPath = { parent: rootNode, parentField: brand("foo"), parentIndex: 0 };
			const barList: UpPath = { parent: rootNode, parentField: brand("bar"), parentIndex: 0 };
			const bazList: UpPath = { parent: rootNode, parentField: brand("baz"), parentIndex: 0 };

			tree.transaction.start();
			// Move nodes from foo into bar.
			tree.editor.move(
				{ parent: fooList, field: brand("") },
				0,
				2,
				{ parent: barList, field: brand("") },
				0,
			);

			// Move nodes from foo into baz.
			tree.editor.move(
				{ parent: fooList, field: brand("") },
				0,
				2,
				{ parent: bazList, field: brand("") },
				0,
			);
			tree.transaction.commit();

			const expectedState: JsonCompatible = [
				{
					foo: [],
					bar: ["A", "B", "E"],
					baz: ["C", "D", "F"],
				},
			];

			expectJsonTree(tree, expectedState);
		});

		it("can move nodes to one field, and move its child node to another field", () => {
			const tree = makeTreeFromJson({
				foo: ["A", { foo: "B" }],
				bar: ["C"],
				baz: ["D"],
			});

			const fooList: UpPath = { parent: rootNode, parentField: brand("foo"), parentIndex: 0 };
			const barList: UpPath = { parent: rootNode, parentField: brand("bar"), parentIndex: 0 };
			const barListChild: UpPath = {
				parent: barList,
				parentField: brand(""),
				parentIndex: 0,
			};
			const bazList: UpPath = { parent: rootNode, parentField: brand("baz"), parentIndex: 0 };

			tree.transaction.start();
			// Move node from foo into bar.
			tree.editor.move(
				{ parent: fooList, field: brand("") },
				1,
				1,
				{ parent: barList, field: brand("") },
				0,
			);
			// Move child node from bar into baz.
			tree.editor.move(
				{ parent: barListChild, field: brand("foo") },
				0,
				1,
				{ parent: bazList, field: brand("") },
				0,
			);
			tree.transaction.commit();

			const expectedState: JsonCompatible = [
				{
					foo: ["A"],
					bar: [{}, "C"],
					baz: ["B", "D"],
				},
			];

			expectJsonTree(tree, expectedState);
		});

		it("can move child node to one field, and move its parent node to another field", () => {
			const tree = makeTreeFromJson({
				foo: ["A", { foo: "B" }],
				bar: ["C"],
				baz: ["D"],
			});

			const fooList: UpPath = { parent: rootNode, parentField: brand("foo"), parentIndex: 0 };
			const fooListChild: UpPath = {
				parent: fooList,
				parentField: brand(""),
				parentIndex: 1,
			};
			const barList: UpPath = { parent: rootNode, parentField: brand("bar"), parentIndex: 0 };
			const bazList: UpPath = { parent: rootNode, parentField: brand("baz"), parentIndex: 0 };

			tree.transaction.start();
			// Move child node from foo into baz.
			tree.editor.move(
				{ parent: fooListChild, field: brand("foo") },
				0,
				1,
				{ parent: bazList, field: brand("") },
				0,
			);
			// Move node from foo into bar.
			tree.editor.move(
				{ parent: fooList, field: brand("") },
				1,
				1,
				{ parent: barList, field: brand("") },
				0,
			);
			tree.transaction.commit();

			const expectedState: JsonCompatible = [
				{
					foo: ["A"],
					bar: [{}, "C"],
					baz: ["B", "D"],
				},
			];

			expectJsonTree(tree, expectedState);
		});

		it("can move a node out from under its parent, and remove that parent from its containing sequence field", () => {
			const tree = makeTreeFromJson({ src: ["A"], dst: ["B"] });
			const srcList: UpPath = { parent: rootNode, parentField: brand("src"), parentIndex: 0 };
			const dstList: UpPath = { parent: rootNode, parentField: brand("dst"), parentIndex: 0 };

			tree.transaction.start();
			// Move node from foo into rootField.
			tree.editor.move(
				{ parent: srcList, field: brand("") },
				0,
				1,
				{ parent: dstList, field: brand("") },
				0,
			);
			// Removes parent node
			const field = tree.editor.sequenceField({
				parent: rootNode,
				field: brand("src"),
			});
			field.remove(0, 1);
			tree.transaction.commit();

			const expectedState: JsonCompatible = [{ dst: ["A", "B"] }];
			expectJsonTree(tree, expectedState);
		});

		it("can move a node out from under its parent, and remove that parent from its containing optional field", () => {
			const tree = makeTreeFromJson({ src: ["A"], dst: ["B"] });
			const srcList: UpPath = { parent: rootNode, parentField: brand("src"), parentIndex: 0 };
			const dstList: UpPath = { parent: rootNode, parentField: brand("dst"), parentIndex: 0 };

			tree.transaction.start();
			// Move node from foo into rootField.
			tree.editor.move(
				{ parent: srcList, field: brand("") },
				0,
				1,
				{ parent: dstList, field: brand("") },
				0,
			);
			// Removes parent node
			const field = tree.editor.optionalField({
				parent: rootNode,
				field: brand("src"),
			});
			field.set(undefined, false);
			tree.transaction.commit();

			const expectedState: JsonCompatible = [{ dst: ["A", "B"] }];
			expectJsonTree(tree, expectedState);
		});

		it("can move a node out from under its parent, and remove that parent from its containing value field", () => {
			const tree = makeTreeFromJson({ src: ["A"], dst: ["B"] });
			const srcList: UpPath = { parent: rootNode, parentField: brand("src"), parentIndex: 0 };
			const dstList: UpPath = { parent: rootNode, parentField: brand("dst"), parentIndex: 0 };

			tree.transaction.start();
			// Move node from foo into rootField.
			tree.editor.move(
				{ parent: srcList, field: brand("") },
				0,
				1,
				{ parent: dstList, field: brand("") },
				0,
			);
			// Removes parent node
			const field = tree.editor.valueField({
				parent: rootNode,
				field: brand("src"),
			});
			field.set(cursorForJsonableTreeNode({ type: jsonObject.name }));
			tree.transaction.commit();

			const expectedState: JsonCompatible = [{ src: {}, dst: ["A", "B"] }];
			expectJsonTree(tree, expectedState);
		});

		it("can move a node out from a field and into a field under a sibling", () => {
			const tree = makeTreeFromJson(["A", {}]);
			tree.editor.move(rootField, 0, 1, { parent: rootNode2, field: brand("foo") }, 0);
			const expectedState: JsonCompatible = [{ foo: "A" }];
			expectJsonTree(tree, expectedState);
		});

		it("can rebase a move over the deletion of the source parent", () => {
			const tree = makeTreeFromJson({ src: ["A", "B"], dst: ["C", "D"] });
			const childBranch = tree.fork();

			const srcList: UpPath = { parent: rootNode, parentField: brand("src"), parentIndex: 0 };
			const dstList: UpPath = { parent: rootNode, parentField: brand("dst"), parentIndex: 0 };

			// In the child branch, move a node from src to dst.
			childBranch.editor.move(
				{ parent: srcList, field: brand("") },
				0,
				1,
				{ parent: dstList, field: brand("") },
				0,
			);

			// Removes parent node of the src field
			tree.editor
				.optionalField({ parent: rootNode, field: brand("src") })
				.set(undefined, false);

			// Edits to removed subtrees are applied
			const expectedState: JsonCompatible = [{ dst: ["A", "C", "D"] }];

			childBranch.rebaseOnto(tree);
			expectJsonTree(childBranch, expectedState);

			tree.merge(childBranch);
			expectJsonTree(tree, expectedState);
		});

		it("can rebase a move over the deletion of the destination parent", () => {
			const tree = makeTreeFromJson({ src: ["A", "B"], dst: ["C", "D"] });
			const childBranch = tree.fork();

			const srcList: UpPath = { parent: rootNode, parentField: brand("src"), parentIndex: 0 };
			const dstList: UpPath = { parent: rootNode, parentField: brand("dst"), parentIndex: 0 };

			// In the child branch, move a node from src to dst.
			childBranch.editor.move(
				{ parent: srcList, field: brand("") },
				0,
				1,
				{ parent: dstList, field: brand("") },
				0,
			);

			// Removes parent node of the dst field
			tree.editor
				.optionalField({ parent: rootNode, field: brand("dst") })
				.set(undefined, false);

			// Edits to removed subtrees are applied
			const expectedState: JsonCompatible = [{ src: ["B"] }];

			childBranch.rebaseOnto(tree);
			expectJsonTree(childBranch, expectedState);

			tree.merge(childBranch);
			expectJsonTree(tree, expectedState);
		});

		it("can rebase a move over the deletion of the source and destination parents", () => {
			const tree = makeTreeFromJson({ src: ["A", "B"], dst: ["C", "D"] });
			const childBranch = tree.fork();

			const srcList: UpPath = { parent: rootNode, parentField: brand("src"), parentIndex: 0 };
			const dstList: UpPath = { parent: rootNode, parentField: brand("dst"), parentIndex: 0 };

			// In the child branch, move a node from src to dst.
			childBranch.editor.move(
				{ parent: srcList, field: brand("") },
				0,
				1,
				{ parent: dstList, field: brand("") },
				0,
			);

			tree.transaction.start();
			// Removes parent node of the src field
			tree.editor
				.optionalField({ parent: rootNode, field: brand("src") })
				.set(undefined, false);
			// Removes parent node of the dst field
			tree.editor
				.optionalField({ parent: rootNode, field: brand("dst") })
				.set(undefined, false);
			tree.transaction.commit();

			// Edits to removed subtrees are currently ignored
			const expectedState: JsonCompatible = [{}];

			childBranch.rebaseOnto(tree);
			expectJsonTree(childBranch, expectedState);

			tree.merge(childBranch);
			expectJsonTree(tree, expectedState);
		});

		it("rebase changes to field untouched by base", () => {
			const tree = makeTreeFromJson({ foo: [{ bar: "A" }, { baz: "B" }] });
			const tree1 = tree.fork();
			const tree2 = tree.fork();

			const fooList: UpPath = {
				parent: rootNode,
				parentField: brand("foo"),
				parentIndex: 0,
			};
			const foo1: UpPath = {
				parent: fooList,
				parentField: brand(""),
				parentIndex: 0,
			};
			const nodeB: UpPath = {
				parent: fooList,
				parentField: brand(""),
				parentIndex: 1,
			};

			tree1.editor
				.valueField({ parent: nodeB, field: brand("baz") })
				.set(cursorForJsonableTreeNode({ type: leaf.string.name, value: "b" }));
			tree2.editor.sequenceField({ parent: foo1, field: brand("bar") }).remove(0, 1);

			tree.merge(tree1, false);
			tree.merge(tree2, false);
			tree1.rebaseOnto(tree);
			tree2.rebaseOnto(tree);

			expectJsonTree([tree, tree1, tree2], [{ foo: [{}, { baz: "b" }] }]);
		});

		// Skipped because we don't currently support undoing edits from a parent branch
		it.skip("undo restores a removed node even when that node was never present on the branch", () => {
			const tree = makeTreeFromJson([]);
			const tree2 = tree.fork();

			tree.editor.sequenceField(rootField).insert(0, singleJsonCursor("43"));
			tree.editor.sequenceField(rootField).remove(0, 1);

			const tree3 = tree.fork();
			const { undoStack, unsubscribe } = createTestUndoRedoStacks(tree3.events);
			undoStack.pop()?.revert(); // Restores "43"

			tree.merge(tree3, false);
			tree3.rebaseOnto(tree);

			expectJsonTree([tree, tree3], ["43"]);

			// This rebase should introduce/restore 43 even though tree2 never saw 43 before
			tree2.rebaseOnto(tree);

			expectJsonTree([tree2], ["43"]);
			unsubscribe();
		});

		it("can be registered a path visitor that can read new content being inserted into the tree when afterAttach is invoked", () => {
			const tree = makeTreeFromJson({ foo: [{ bar: "A" }, { baz: "B" }] });
			const cursor = tree.forest.allocateCursor();
			moveToDetachedField(tree.forest, cursor);
			cursor.enterNode(0);
			const anchor = cursor.buildAnchor();
			const node = tree.locate(anchor) ?? assert.fail();
			cursor.free();

			let valueAfterInsert: string | undefined;
			const pathVisitor: PathVisitor = {
				onRemove(path: UpPath, count: number): void {},
				onInsert(path: UpPath, content: ProtoNodes): void {},
				afterCreate(content: DetachedRangeUpPath): void {},
				beforeReplace(
					newContent: DetachedRangeUpPath,
					oldContent: RangeUpPath,
					oldContentDestination: DetachedPlaceUpPath,
				): void {},

				afterReplace(
					newContentSource: DetachedPlaceUpPath,
					newContent: RangeUpPath,
					oldContent: DetachedRangeUpPath,
				): void {},
				beforeDestroy(content: DetachedRangeUpPath): void {},
				beforeAttach(source: DetachedRangeUpPath, destination: PlaceUpPath): void {},
				afterAttach(source: DetachedPlaceUpPath, destination: RangeUpPath): void {
					const cursor2 = tree.forest.allocateCursor();
					moveToDetachedField(tree.forest, cursor2);
					cursor2.enterNode(0);
					cursor2.enterField(brand("foo"));
					cursor2.enterNode(1);
					valueAfterInsert = cursor2.value as string;
					cursor2.free();
				},
				beforeDetach(source: RangeUpPath, destination: DetachedPlaceUpPath): void {},
				afterDetach(source: PlaceUpPath, destination: DetachedRangeUpPath): void {},
			};
			const unsubscribePathVisitor = node.on(
				"subtreeChanging",
				(n: AnchorNode) => pathVisitor,
			);
			const field = tree.editor.sequenceField({
				parent: rootNode,
				field: brand("foo"),
			});
			field.insert(1, cursorForJsonableTreeNode({ type: leaf.string.name, value: "C" }));
			assert.equal(valueAfterInsert, "C");
			unsubscribePathVisitor();
		});

		it("throws when moved under child node", () => {
			const tree = makeTreeFromJson({ foo: { bar: "A" } });
			const fooPath: UpPath = {
				parent: rootNode,
				parentField: brand("foo"),
				parentIndex: 0,
			};
			assert.throws(
				() =>
					tree.editor.move(
						{ parent: rootNode, field: brand("foo") },
						0,
						1,
						{ parent: fooPath, field: brand("bar") },
						0,
					),
				validateUsageError(
					/Invalid move operation: the destination is located under one of the moved elements/,
				),
			);
		});

		it("concurrent cycle creating move", () => {
			const tree = makeTreeFromJson([["foo"], ["bar"]]);
			const tree2 = tree.fork();

			const fooList: UpPath = {
				parent: undefined,
				parentField: rootFieldKey,
				parentIndex: 0,
			};
			const barList: UpPath = {
				parent: undefined,
				parentField: rootFieldKey,
				parentIndex: 1,
			};

			const fooSequence: FieldUpPath = { field: brand(""), parent: fooList };
			const barSequence: FieldUpPath = { field: brand(""), parent: barList };

			tree.editor.move(rootField, 0, 1, barSequence, 0);
			expectJsonTree(tree, [[["foo"], "bar"]]);
			tree2.editor.move(rootField, 1, 1, fooSequence, 0);
			expectJsonTree(tree2, [[["bar"], "foo"]]);

			tree.merge(tree2, false);
			tree2.rebaseOnto(tree);
			expectJsonTree([tree, tree2], []);
		});

		it("rebase insert within revive", () => {
			const tree = makeTreeFromJson(["y"]);
			const tree1 = tree.fork();

			const { undoStack } = createTestUndoRedoStacks(tree1.events);
			insert(tree1, 1, "a", "c");
			remove(tree1, 1, 2); // Remove ac

			const tree2 = tree1.fork();

			undoStack.pop()?.revert(); // Restores ac
			insert(tree1, 2, "b");
			expectJsonTree(tree1, ["y", "a", "b", "c"]);

			insert(tree2, 0, "x");
			tree1.rebaseOnto(tree2);
			tree2.merge(tree1);

			const expected = ["x", "y", "a", "b", "c"];
			expectJsonTree([tree1, tree2], expected);
		});

		it("repro scenario that requires correct rebase metadata", () => {
			const startState = [{ seq: ["A"] }, { seq: [] }, { seq: ["B"] }];
			const tree = makeTreeFromJson(startState);

			const [root0Array, root1Array, root2Array]: FieldUpPath[] = makeArray(3, (i) => ({
				parent: {
					parent: {
						parent: undefined,
						parentField: rootFieldKey,
						parentIndex: i,
					},
					parentField: brand("seq"),
					parentIndex: 0,
				},
				field: brand(""),
			}));

			const treeA = tree.fork();
			const treeC = tree.fork();
			const treeD = tree.fork();

			treeD.editor.move(root0Array, 0, 1, root1Array, 0);
			tree.merge(treeD, false);
			treeA.editor.sequenceField(root2Array).move(0, 1, 0);
			tree.merge(treeA, false);
			treeC.editor.sequenceField(root0Array).move(0, 1, 1);
			tree.merge(treeC, false);
			treeC.editor.sequenceField(rootField).move(1, 1, 1);
			tree.merge(treeC, false);

			treeC.rebaseOnto(treeD);
			treeC.rebaseOnto(treeA);
			expectJsonTree([tree, treeC], startState);
		});

		describe("Exhaustive removal tests", () => {
			// Toggle the constant below to run each scenario as a separate test.
			// This is useful to debug a specific scenario but makes CI and the test browser slower.
			// Note that if the numbers of nodes and peers are too high (more than 3 nodes and 3 peers),
			// then the number of scenarios overwhelms the test browser.
			// Should be committed with the constant set to false.
			const individualTests = false;
			const nbNodes = 3;
			const nbPeers = 2;
			const testRemoveRevive = true;
			const testMoveReturn = true;
			assert(testRemoveRevive || testMoveReturn, "No scenarios to run");

			const [outerFixture, innerFixture] = individualTests
				? [describe, it]
				: [it, (title: string, fn: () => void) => fn()];

			enum StepType {
				Remove,
				Undo,
			}
			interface RemoveStep {
				readonly type: StepType.Remove;
				/**
				 * The index of the removed node.
				 * Note that this index does not account for the removal of earlier nodes.
				 */
				readonly index: number;
				/**
				 * The index of the peer that removes the node.
				 */
				readonly peer: number;
			}

			interface UndoStep {
				readonly type: StepType.Undo;
				/**
				 * The index of the peer that performs the undo.
				 */
				readonly peer: number;
			}

			type ScenarioStep = RemoveStep | UndoStep;

			/**
			 * Generates all permutations for `nbNodes` and `nbPeers` such that:
			 * - Each node is removed exactly once.
			 * - Each removal is undone by the peer that removed it.
			 * The order of removals and undos is unique when considering which peer does what.
			 * This does mean that this function produces symmetrical scenarios such as:
			 * - D(i:0 p:0) D(i:1 p:1) U(1) U(0)
			 * - D(i:0 p:1) D(i:1 p:0) U(0) U(1)
			 * This is taken advantage of to test different network conditions (see {@link runScenario}).
			 */
			function buildScenarios(): Generator<readonly ScenarioStep[]> {
				interface ScenarioBuilderState {
					/**
					 * Whether the `i`th node has been removed.
					 * The index does not account for the removal of earlier nodes.
					 */
					removed: boolean[];
					/**
					 * The number of operations that the `i`th peer has yet to undo.
					 */
					peerUndoStack: number[];
				}

				const buildState: ScenarioBuilderState = {
					removed: makeArray(nbNodes, () => false),
					peerUndoStack: makeArray(nbPeers, () => 0),
				};

				/**
				 * Generates all permutations with prefix `scenario`
				 */
				function* buildScenariosWithPrefix(
					scenario: ScenarioStep[] = [],
				): Generator<readonly ScenarioStep[]> {
					let done = true;
					for (let p = 0; p < nbPeers; p++) {
						for (let i = 0; i < nbNodes; i++) {
							if (!buildState.removed[i]) {
								buildState.removed[i] = true;
								buildState.peerUndoStack[p] += 1;
								yield* buildScenariosWithPrefix([
									...scenario,
									{ type: StepType.Remove, index: i, peer: p },
								]);
								buildState.peerUndoStack[p] -= 1;
								buildState.removed[i] = false;
								done = false;
							}
						}
						if (buildState.peerUndoStack[p] > 0) {
							buildState.peerUndoStack[p] -= 1;
							yield* buildScenariosWithPrefix([...scenario, { type: StepType.Undo, peer: p }]);
							buildState.peerUndoStack[p] += 1;
							done = false;
						}
					}
					if (done) {
						yield scenario;
					}
				}
				return buildScenariosWithPrefix();
			}

			const delAction = (peer: ITreeCheckout, idx: number) => remove(peer, idx, 1);
			const srcField: FieldUpPath = rootField;
			const dstField: FieldUpPath = { parent: undefined, field: brand("dst") };
			const moveAction = (peer: ITreeCheckout, idx: number) =>
				peer.editor.move(srcField, idx, 1, dstField, 0);

			/**
			 * Runs the given `scenario` using either remove or move operations.
			 * Verifies that the final state is the same as the initial state.
			 * Simulates different peers learning of the same edit at different times.
			 * For example, given the following two (otherwise symmetrical) scenarios:
			 * 1) D(i:0 p:0) D(i:1 p:1) U(1) U(0)
			 * 2) D(i:0 p:1) D(i:1 p:0) U(0) U(1)
			 * In scenario 1, the peer that removes N1 learns of the deletion of N0 beforehand.
			 * In scenario 2, the peer that removes N1 learns of the deletion of N0 afterwards.
			 * @param scenario - The scenario to run through.
			 * @param useMove - When `true`, uses move operations. Otherwise, uses remove operations.
			 */
			function runScenario(scenario: readonly ScenarioStep[], useMove: boolean): void {
				const [verb, action] = useMove ? ["M", moveAction] : ["D", delAction];
				const title = scenario
					.map((s) => {
						switch (s.type) {
							case StepType.Remove:
								return `${verb}(i:${s.index} p:${s.peer})`;
							case StepType.Undo:
								return `U(${s.peer})`;
							default:
								unreachableCase(s);
						}
					})
					.join(" ");
				innerFixture(title, () => {
					// Indicator which keeps track of which nodes are present in the root field for a given peer.
					// Represented as an integer (0: removed, 1: present) to facilitate summing.
					// Used to compute the index of the next node to remove.
					const present = makeArray(nbPeers, () => makeArray(nbNodes, () => 1));
					// Same as `present` but for `tree` branch.
					const presentOnTree = makeArray(nbNodes, () => 1);
					// The number of remaining undos available for each peer.
					const undoQueues: number[][] = makeArray(nbPeers, () => []);

					const tree = makeTreeFromJson(startState);
					const peers = makeArray(nbPeers, () => tree.fork());
					const peerUndoStacks = peers.map((peer) => createTestUndoRedoStacks(peer.events));
					for (const step of scenario) {
						const iPeer = step.peer;
						const peer = peers[iPeer];
						let presence: number;
						let affectedNode: number;
						switch (step.type) {
							case StepType.Remove: {
								const idx = present[iPeer].slice(0, step.index).reduce((a, b) => a + b, 0);
								action(peer, idx);
								presence = 0;
								affectedNode = step.index;
								undoQueues[iPeer].push(step.index);
								break;
							}
							case StepType.Undo: {
								peerUndoStacks[iPeer].undoStack.pop()?.revert();
								presence = 1;
								// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
								affectedNode = undoQueues[iPeer].pop()!;
								break;
							}
							default:
								unreachableCase(step);
						}
						tree.merge(peer, false);
						presentOnTree[affectedNode] = presence;
						// We only let peers with a higher index learn of this edit.
						// This breaks the symmetry between scenarios where the permutation of actions is the same
						// except for which peer does which set of actions.
						// It also helps simulate different peers learning of the same edit at different times.
						for (let downhillPeer = iPeer + 1; downhillPeer < nbPeers; downhillPeer++) {
							peers[downhillPeer].rebaseOnto(tree);
							// The peer should now be in the same state as `tree`.
							present[downhillPeer] = [...presentOnTree];
						}
						present[iPeer][affectedNode] = presence;
					}
					peers.forEach((peer) => peer.rebaseOnto(tree));
					expectJsonTree([tree, ...peers], startState);
					peerUndoStacks.forEach(({ unsubscribe }) => unsubscribe());
				});
			}

			const startState = makeArray(nbNodes, (n) => `N${n}`);
			const scenarios = buildScenarios();

			// Increased timeout because the default in CI is 2s but this test fixture naturally takes longer and was
			// timing out frequently
			outerFixture("All Scenarios", () => {
				for (const scenario of scenarios) {
					if (testRemoveRevive) {
						runScenario(scenario, false);
					}
					if (testMoveReturn) {
						runScenario(scenario, true);
					}
				}
			}).timeout(10000);
		});

		describe("revert semantics", () => {
			const fooField: FieldUpPath = { parent: rootNode, field: brand("foo") };
			const barField: FieldUpPath = { parent: rootNode, field: brand("bar") };
			const bazField: FieldUpPath = { parent: rootNode, field: brand("baz") };

			const revertibleAction = [
				{
					title: "move from foo to bar",
					delegate: (tree: ITreeCheckout) => tree.editor.move(fooField, 0, 1, barField, 0),
					nodeDst: barField,
				},
				{
					title: "remove from foo",
					delegate: (tree: ITreeCheckout) => tree.editor.sequenceField(fooField).remove(0, 1),
					nodeDst: undefined,
				},
			];
			const disruptions = [
				{
					title: "moved to baz",
					delegate: (tree: ITreeCheckout, srcField: FieldUpPath) =>
						tree.editor.move(srcField, 0, 1, bazField, 0),
				},
				{
					title: "removed",
					delegate: (tree: ITreeCheckout, srcField: FieldUpPath) =>
						tree.editor.sequenceField(srcField).remove(0, 1),
				},
			];

			for (const action of revertibleAction) {
				describe(`reverting [${action.title}] returns the content to foo`, () => {
					for (const disruption of disruptions) {
						if (action.nodeDst !== undefined) {
							it(`even if it was ${disruption.title} before the revert`, () => {
								const tree = makeTreeFromJson([{ foo: "X" }]);

								const { undoStack, unsubscribe } = createTestUndoRedoStacks(tree.events);
								action.delegate(tree);
								const revertibleMove = undoStack.pop();

								disruption.delegate(tree, action.nodeDst);

								revertibleMove?.revert();
								expectJsonTree(tree, [{ foo: "X" }]);
								unsubscribe();
							});
						}

						it(`even if it was ${disruption.title} concurrently to (and sequenced before) the revert`, () => {
							const tree1 = makeTreeFromJson([{ foo: "X" }]);
							const tree2 = tree1.fork();

							const { undoStack, unsubscribe } = createTestUndoRedoStacks(tree1.events);
							action.delegate(tree1);
							const revertibleMove = undoStack.pop();

							disruption.delegate(tree2, fooField);

							tree1.merge(tree2, false);
							tree2.rebaseOnto(tree1);

							revertibleMove?.revert();
							expectJsonTree(tree1, [{ foo: "X" }]);

							tree1.merge(tree2, false);
							tree2.rebaseOnto(tree1);
							expectJsonTree([tree1, tree2], [{ foo: "X" }]);
							unsubscribe();
						});

						it(`even if it was ${disruption.title} concurrently to (and sequenced before) the ${action.title}`, () => {
							const tree1 = makeTreeFromJson([{ foo: "X" }]);
							const tree2 = tree1.fork();

							disruption.delegate(tree1, fooField);

							const { undoStack, unsubscribe } = createTestUndoRedoStacks(tree2.events);
							action.delegate(tree2);
							const revertibleMove = undoStack.pop();

							tree1.merge(tree2, false);
							tree2.rebaseOnto(tree1);

							revertibleMove?.revert();
							expectJsonTree(tree2, [{ foo: "X" }]);

							tree1.merge(tree2, false);
							tree2.rebaseOnto(tree1);
							expectJsonTree([tree1, tree2], [{ foo: "X" }]);
							unsubscribe();
						});
					}
				});
			}
		});
	});

	describe("Optional Field", () => {
		describe("can rebase a set over another set", () => {
			it("from a non-empty state", () => {
				const tree1 = makeTreeFromJson([{ foo: "1" }]);
				const tree2 = tree1.fork();
				const tree3 = tree1.fork();

				tree2.editor
					.valueField({ parent: rootNode, field: brand("foo") })
					.set(cursorForJsonableTreeNode({ type: leaf.string.name, value: "2" }));

				tree3.editor
					.valueField({ parent: rootNode, field: brand("foo") })
					.set(cursorForJsonableTreeNode({ type: leaf.string.name, value: "3" }));

				tree1.merge(tree2, false);
				tree1.merge(tree3, false);
				tree2.rebaseOnto(tree1);
				tree3.rebaseOnto(tree2);

				expectJsonTree([tree1, tree2, tree3], [{ foo: "3" }]);
			});

			it("from an empty state", () => {
				const tree1 = makeTreeFromJson([{}]);
				const tree2 = tree1.fork();
				const tree3 = tree1.fork();

				tree2.editor
					.optionalField({ parent: rootNode, field: brand("foo") })
					.set(cursorForJsonableTreeNode({ type: leaf.string.name, value: "2" }), true);

				tree3.editor
					.optionalField({ parent: rootNode, field: brand("foo") })
					.set(cursorForJsonableTreeNode({ type: leaf.string.name, value: "3" }), true);

				tree3.rebaseOnto(tree2);
				tree2.merge(tree3, false);
				tree1.merge(tree3, false);

				expectJsonTree([tree1, tree2, tree3], [{ foo: "3" }]);
			});
		});

		it("can rebase a node replacement and a dependent edit to the new node", () => {
			const tree1 = makeTreeFromJson([]);
			const tree2 = tree1.fork();

			tree1.editor.optionalField(rootField).set(singleJsonCursor("41"), true);

			tree2.editor.optionalField(rootField).set(singleJsonCursor({ foo: "42" }), true);

			expectJsonTree([tree1], ["41"]);
			expectJsonTree([tree2], [{ foo: "42" }]);

			const editor = tree2.editor.valueField({ parent: rootNode, field: brand("foo") });
			editor.set(cursorForJsonableTreeNode({ type: leaf.string.name, value: "43" }));
			expectJsonTree([tree2], [{ foo: "43" }]);

			tree1.merge(tree2, false);
			tree2.rebaseOnto(tree1);

			expectJsonTree([tree1, tree2], [{ foo: "43" }]);
		});

		it("can rebase a node replacement and a dependent edit to the new node incrementally", () => {
			const tree1 = makeTreeFromJson([]);
			const tree2 = tree1.fork();

			tree1.editor.optionalField(rootField).set(singleJsonCursor("41"), true);

			tree2.editor.optionalField(rootField).set(singleJsonCursor({ foo: "42" }), true);

			tree1.merge(tree2, false);

			const editor = tree2.editor.valueField({ parent: rootNode, field: brand("foo") });
			editor.set(cursorForJsonableTreeNode({ type: leaf.string.name, value: "43" }));

			tree1.merge(tree2, false);
			tree2.rebaseOnto(tree1);

			expectJsonTree([tree1, tree2], [{ foo: "43" }]);
		});

		it("can rebase a node edit over an unrelated edit", () => {
			const tree1 = makeTreeFromJson([{ foo: "40", bar: "123" }]);
			const tree2 = tree1.fork();

			tree1.editor
				.optionalField({
					parent: rootNode,
					field: brand("bar"),
				})
				.set(singleJsonCursor("456"), false);

			const editor = tree2.editor.valueField({ parent: rootNode, field: brand("foo") });
			editor.set(cursorForJsonableTreeNode({ type: leaf.string.name, value: "42" }));

			tree1.merge(tree2, false);
			tree2.rebaseOnto(tree1);

			expectJsonTree([tree1, tree2], [{ foo: "42", bar: "456" }]);
		});

		it("can rebase a node edit over the node being replaced and restored", () => {
			const tree1 = makeTreeFromJson([{ foo: "40" }]);
			const tree2 = tree1.fork();
			const { undoStack, unsubscribe } = createTestUndoRedoStacks(tree1.events);

			tree1.editor.optionalField(rootField).set(singleJsonCursor({ foo: "41" }), false);

			undoStack.pop()?.revert();

			const editor = tree2.editor.valueField({ parent: rootNode, field: brand("foo") });
			editor.set(cursorForJsonableTreeNode({ type: leaf.string.name, value: "42" }));

			tree1.merge(tree2, false);
			tree2.rebaseOnto(tree1);

			expectJsonTree([tree1, tree2], [{ foo: "42" }]);
			unsubscribe();
		});

		it("can rebase over successive sets", () => {
			const tree1 = makeTreeFromJson([]);
			const tree2 = tree1.fork();

			tree1.editor.optionalField(rootField).set(singleJsonCursor("1"), true);
			tree2.editor.optionalField(rootField).set(singleJsonCursor("2"), true);

			tree2.rebaseOnto(tree1);
			tree1.editor.optionalField(rootField).set(singleJsonCursor("1 again"), false);

			tree2.rebaseOnto(tree1);
			expectJsonTree(tree2, ["2"]);
		});

		it("can replace and restore a node", () => {
			const tree1 = makeTreeFromJson(["42"]);
			const { undoStack, unsubscribe } = createTestUndoRedoStacks(tree1.events);

			tree1.editor.optionalField(rootField).set(singleJsonCursor("43"), false);

			expectJsonTree(tree1, ["43"]);

			undoStack.pop()?.revert();

			expectJsonTree(tree1, ["42"]);
			unsubscribe();
		});

		it("can rebase populating a new node over an unrelated change", () => {
			const tree1 = makeTreeFromJson({});
			const tree2 = tree1.fork();

			tree1.editor
				.optionalField({ parent: rootNode, field: brand("foo") })
				.set(singleJsonCursor("A"), true);

			tree2.editor
				.optionalField({ parent: rootNode, field: brand("bar") })
				.set(singleJsonCursor("B"), true);

			expectJsonTree(tree1, [{ foo: "A" }]);
			expectJsonTree(tree2, [{ bar: "B" }]);

			tree1.merge(tree2, false);
			tree2.rebaseOnto(tree1);

			expectJsonTree(tree1, [{ foo: "A", bar: "B" }]);
			expectJsonTree(tree2, [{ foo: "A", bar: "B" }]);
		});

		describe("revert semantics", () => {
			const revertibleAction = [
				{
					title: "replace A with B",
					delegate: (tree: ITreeCheckout) =>
						tree.editor.optionalField(rootField).set(singleJsonCursor("B"), false),
					isEmptyAfter: false,
				},
				{
					title: "clear A",
					delegate: (tree: ITreeCheckout) =>
						tree.editor.optionalField(rootField).set(undefined, false),
					isEmptyAfter: true,
				},
			];
			const disruptions = [
				{
					title: "replaced with C",
					delegate: (tree: ITreeCheckout, isEmpty: boolean) =>
						tree.editor.optionalField(rootField).set(singleJsonCursor("C"), isEmpty),
				},
				{
					title: "cleared",
					delegate: (tree: ITreeCheckout, isEmpty: boolean) =>
						tree.editor.optionalField(rootField).set(undefined, isEmpty),
				},
			];

			for (const action of revertibleAction) {
				describe(`reverting [${action.title}] restores A`, () => {
					for (const disruption of disruptions) {
						it(`even if it was ${disruption.title} before the revert`, () => {
							const tree = makeTreeFromJson(["A"]);

							const { undoStack, unsubscribe } = createTestUndoRedoStacks(tree.events);
							action.delegate(tree);
							const revertible = undoStack.pop();

							disruption.delegate(tree, action.isEmptyAfter);

							revertible?.revert();
							expectJsonTree(tree, ["A"]);
							unsubscribe();
						});

						it(`even if it was ${disruption.title} concurrently to (and sequenced before) the revert`, () => {
							const tree1 = makeTreeFromJson(["A"]);
							const tree2 = tree1.fork();

							const { undoStack, unsubscribe } = createTestUndoRedoStacks(tree1.events);
							action.delegate(tree1);
							const revertible = undoStack.pop();

							disruption.delegate(tree2, false);

							tree1.merge(tree2, false);
							tree2.rebaseOnto(tree1);

							revertible?.revert();
							expectJsonTree(tree1, ["A"]);

							tree1.merge(tree2, false);
							tree2.rebaseOnto(tree1);
							expectJsonTree([tree1, tree2], ["A"]);
							unsubscribe();
						});

						it(`even if it was ${disruption.title} concurrently to (and sequenced before) the ${action.title}`, () => {
							const tree1 = makeTreeFromJson(["A"]);
							const tree2 = tree1.fork();

							disruption.delegate(tree1, false);

							const { undoStack, unsubscribe } = createTestUndoRedoStacks(tree2.events);
							action.delegate(tree2);
							const revertible = undoStack.pop();

							tree1.merge(tree2, false);
							tree2.rebaseOnto(tree1);

							revertible?.revert();
							expectJsonTree(tree2, ["A"]);

							tree1.merge(tree2, false);
							tree2.rebaseOnto(tree1);
							expectJsonTree([tree1, tree2], ["A"]);
							unsubscribe();
						});
					}
				});
			}
		});

		it("undo restores the removed node even when that node has been concurrently replaced", () => {
			const tree = makeTreeFromJson(["42"]);
			const tree2 = tree.fork();
			const { undoStack, unsubscribe } = createTestUndoRedoStacks(tree2.events);

			tree.editor.optionalField(rootField).set(singleJsonCursor("43"), false);

			// Replace 42 with undefined
			tree2.editor.optionalField(rootField).set(undefined, false);

			tree.merge(tree2, false);
			tree2.rebaseOnto(tree);

			// Restore 42
			undoStack.pop()?.revert();

			tree.merge(tree2, false);
			tree2.rebaseOnto(tree);

			expectJsonTree([tree, tree2], ["42"]);
			unsubscribe();
		});

		it.skip("undo restores a removed node even when that node was never present on the branch", () => {
			const tree = makeTreeFromJson(["42"]);
			const tree2 = tree.fork();

			tree.editor.optionalField(rootField).set(singleJsonCursor("43"), false);
			tree.editor.optionalField(rootField).set(singleJsonCursor("44"), false);

			const tree3 = tree.fork();
			const { undoStack, unsubscribe } = createTestUndoRedoStacks(tree3.events);
			undoStack.pop()?.revert(); // Restores "43"

			tree.editor.optionalField(rootField).set(singleJsonCursor("45"), false);

			tree.merge(tree3, false);
			tree3.rebaseOnto(tree);

			expectJsonTree([tree, tree3], ["43"]);

			// This rebase should introduce/restore 43 even though tree2 never saw 43 before
			tree2.rebaseOnto(tree);

			expectJsonTree([tree2], ["43"]);
			unsubscribe();
		});

		describe("Transactions", () => {
			// Exercises a scenario where a transaction's inverse must be computed as part of a rebase sandwich.
			it("Can rebase a series of edits including a transaction", () => {
				const tree = makeTreeFromJson(["42"]);
				const tree2 = tree.fork();

				tree2.transaction.start();
				tree2.editor.optionalField(rootField).set(singleJsonCursor("43"), false);
				tree2.editor.optionalField(rootField).set(singleJsonCursor("44"), false);
				tree2.transaction.commit();

				tree2.editor.optionalField(rootField).set(singleJsonCursor("45"), false);

				tree.editor.optionalField(rootField).set(singleJsonCursor("46"), false);

				tree2.rebaseOnto(tree);
				tree.merge(tree2, false);

				expectJsonTree([tree, tree2], ["45"]);
			});

			it("can rebase a transaction containing a node replacement and a dependent edit to the new node", () => {
				const tree1 = makeTreeFromJson([]);
				const tree2 = tree1.fork();

				tree1.editor.optionalField(rootField).set(singleJsonCursor("41"), true);

				tree2.transaction.start();
				tree2.editor.optionalField(rootField).set(singleJsonCursor({ foo: "42" }), true);

				expectJsonTree([tree1], ["41"]);
				expectJsonTree([tree2], [{ foo: "42" }]);

				tree2.editor
					.valueField({ parent: rootNode, field: brand("foo") })
					.set(cursorForJsonableTreeNode({ type: leaf.string.name, value: "43" }));

				expectJsonTree([tree2], [{ foo: "43" }]);
				tree2.transaction.commit();

				tree1.merge(tree2, false);
				tree2.rebaseOnto(tree1);

				expectJsonTree([tree1, tree2], [{ foo: "43" }]);
			});

			it("Can set and remove a node within a transaction", () => {
				const tree = makeTreeFromJson([]);
				const tree2 = tree.fork();

				tree2.transaction.start();
				tree2.editor.optionalField(rootField).set(singleJsonCursor("42"), true);
				tree2.editor.optionalField(rootField).set(undefined, false);
				tree2.transaction.commit();

				tree.editor.optionalField(rootField).set(singleJsonCursor("43"), true);

				tree2.rebaseOnto(tree);
				tree.merge(tree2, false);
				expectJsonTree([tree, tree2], []);
			});
		});

		it("can be registered a path visitor that can read new content being inserted into the tree when afterAttach is invoked", () => {
			const tree = makeTreeFromJson({ foo: "A" });
			const cursor = tree.forest.allocateCursor();
			moveToDetachedField(tree.forest, cursor);
			cursor.enterNode(0);
			const anchor = cursor.buildAnchor();
			const node = tree.locate(anchor) ?? assert.fail();
			cursor.free();

			let valueAfterInsert: string | undefined;
			const pathVisitor: PathVisitor = {
				onRemove(path: UpPath, count: number): void {},
				onInsert(path: UpPath, content: ProtoNodes): void {},
				afterCreate(content: DetachedRangeUpPath): void {},
				beforeReplace(
					newContent: DetachedRangeUpPath,
					oldContent: RangeUpPath,
					oldContentDestination: DetachedPlaceUpPath,
				): void {},

				afterReplace(
					newContentSource: DetachedPlaceUpPath,
					newContent: RangeUpPath,
					oldContent: DetachedRangeUpPath,
				): void {},
				beforeDestroy(content: DetachedRangeUpPath): void {},
				beforeAttach(source: DetachedRangeUpPath, destination: PlaceUpPath): void {},
				afterAttach(source: DetachedPlaceUpPath, destination: RangeUpPath): void {
					const cursor2 = tree.forest.allocateCursor();
					moveToDetachedField(tree.forest, cursor2);
					cursor2.enterNode(0);
					cursor2.enterField(brand("foo"));
					cursor2.enterNode(0);
					valueAfterInsert = cursor2.value as string;
					cursor2.free();
				},
				beforeDetach(source: RangeUpPath, destination: DetachedPlaceUpPath): void {},
				afterDetach(source: PlaceUpPath, destination: DetachedRangeUpPath): void {},
			};
			const unsubscribePathVisitor = node.on(
				"subtreeChanging",
				(n: AnchorNode) => pathVisitor,
			);
			tree.editor
				.optionalField({ parent: rootNode, field: brand("foo") })
				.set(singleJsonCursor("43"), true);
			assert.equal(valueAfterInsert, "43");
			unsubscribePathVisitor();
		});

		it("simplified repro for 0x7cf from anchors-undo-redo fuzz seed 0", () => {
			const tree = makeTreeFromJson([1]);
			const fork = tree.fork();

			tree.editor.optionalField(rootField).set(singleJsonCursor(2), false);

			const { undoStack, redoStack } = createTestUndoRedoStacks(fork.events);
			fork.editor.optionalField(rootField).set(undefined, false);
			undoStack.pop()?.revert();
			redoStack.pop()?.revert();

			fork.rebaseOnto(tree);
			tree.merge(fork, false);
			expectJsonTree([fork, tree], []);
		});
	});

	describe("Constraints", () => {
		describe("Node existence constraint", () => {
			it("handles ancestor revive", () => {
				const tree = makeTreeFromJson([]);
				const { undoStack, unsubscribe } = createTestUndoRedoStacks(tree.events);

				const rootSequence = tree.editor.sequenceField(rootField);
				rootSequence.insert(0, cursorForJsonableTreeNode({ type: jsonObject.name }));
				const treeSequence = tree.editor.sequenceField({
					parent: rootNode,
					field: brand("foo"),
				});
				treeSequence.insert(
					0,
					cursorForJsonableTreeNode({ type: leaf.string.name, value: "bar" }),
				);

				const tree2 = tree.fork();

				// Remove a
				remove(tree, 0, 1);
				// Undo remove of a
				undoStack.pop()?.revert();

				tree2.transaction.start();
				// Put existence constraint on child field of a
				// Constraint should be not be violated after undo
				tree2.editor.addNodeExistsConstraint({
					parent: rootNode,
					parentField: brand("foo"),
					parentIndex: 0,
				});
				const tree2Sequence = tree2.editor.sequenceField(rootField);
				tree2Sequence.insert(1, singleJsonCursor("b"));
				tree2.transaction.commit();

				tree.merge(tree2, false);
				tree2.rebaseOnto(tree);

				expectJsonTree([tree, tree2], [{ foo: "bar" }, "b"]);
				unsubscribe();
			});

			it("handles ancestor remove", () => {
				const tree = makeTreeFromJson([]);

				const rootSequence = tree.editor.sequenceField(rootField);
				rootSequence.insert(0, cursorForJsonableTreeNode({ type: jsonObject.name }));
				const treeSequence = tree.editor.sequenceField({
					parent: rootNode,
					field: brand("foo"),
				});
				treeSequence.insert(
					0,
					cursorForJsonableTreeNode({ type: leaf.string.name, value: "A" }),
				);

				const tree2 = tree.fork();

				const fooPath: FieldUpPath = { parent: rootNode, field: brand("foo") };

				// Modify the field containing the node existence constraint then remove its ancestor
				tree.transaction.start();
				tree.editor
					.sequenceField(fooPath)
					.insert(0, cursorForJsonableTreeNode({ type: leaf.string.name, value: "C" }));
				remove(tree, 0, 1);
				tree.transaction.commit();

				tree2.transaction.start();

				// Put existence constraint on child of A
				tree2.editor.addNodeExistsConstraint({
					parent: rootNode,
					parentField: brand("foo"),
					parentIndex: 0,
				});
				const tree2Sequence = tree2.editor.sequenceField(rootField);

				// Insert B if the child of A is still attached
				tree2Sequence.insert(
					1,
					cursorForJsonableTreeNode({ type: leaf.string.name, value: "B" }),
				);
				tree2.transaction.commit();

				tree.merge(tree2, false);
				tree2.rebaseOnto(tree);

				expectJsonTree([tree, tree2], []);
			});

			it("sequence field node exists constraint", () => {
				const tree = makeTreeFromJson([]);
				const { undoStack, unsubscribe } = createTestUndoRedoStacks(tree.events);

				insert(tree, 0, "A", "D");
				const tree2 = tree.fork();

				// Remove D
				remove(tree, 1, 1);
				const removalRevertible = undoStack.at(-1);
				assert(removalRevertible !== undefined);

				tree2.transaction.start();

				const dPath = {
					parent: undefined,
					parentField: rootFieldKey,
					parentIndex: 1,
				};

				// Put an existence constraint on D
				tree2.editor.addNodeExistsConstraint(dPath);
				const tree2RootSequence = tree2.editor.sequenceField(rootField);
				// Should not be inserted because D has been concurrently removed
				tree2RootSequence.insert(
					1,
					cursorForJsonableTreeNode({ type: leaf.string.name, value: "B" }),
				);
				tree2.transaction.commit();

				tree2.rebaseOnto(tree);
				expectJsonTree([tree2], ["A"]);

				insert(tree, 1, "C");
				tree2.rebaseOnto(tree);

				// The insert of B should still fail after rebasing over an unrelated change.
				expectJsonTree([tree2], ["A", "C"]);

				removalRevertible.revert();
				tree.merge(tree2, false);
				tree2.rebaseOnto(tree);

				// The insert of B should succeed after rebasing over the revive of D.
				expectJsonTree([tree, tree2], ["A", "B", "C", "D"]);

				unsubscribe();
			});

			it("optional field node exists constraint", () => {
				const tree = makeTreeFromJson([]);
				const rootSequence = tree.editor.sequenceField(rootField);
				rootSequence.insert(0, cursorForJsonableTreeNode({ type: jsonObject.name }));
				const optional = tree.editor.optionalField({
					parent: rootNode,
					field: brand("foo"),
				});
				optional.set(cursorForJsonableTreeNode({ type: leaf.string.name, value: "x" }), true);

				const tree2 = tree.fork();

				// Remove foo
				optional.set(undefined, false);

				tree2.transaction.start();
				tree2.editor.addNodeExistsConstraint({
					parent: rootNode,
					parentField: brand("foo"),
					parentIndex: 0,
				});
				tree2.editor
					.sequenceField({ parent: rootNode, field: brand("bar") })
					.insert(0, singleJsonCursor(1));
				tree2.transaction.commit();

				tree.merge(tree2, false);
				tree2.rebaseOnto(tree);

				expectJsonTree([tree, tree2], [{}]);
			});

			it("revived optional field node exists constraint", () => {
				const tree = makeTreeFromJson([]);
				const { undoStack, unsubscribe } = createTestUndoRedoStacks(tree.events);
				const rootSequence = tree.editor.sequenceField(rootField);
				rootSequence.insert(0, cursorForJsonableTreeNode({ type: jsonObject.name }));

				const optional = tree.editor.optionalField({
					parent: rootNode,
					field: brand("foo"),
				});
				optional.set(cursorForJsonableTreeNode({ type: leaf.string.name, value: "x" }), true);

				const tree2 = tree.fork();

				optional.set(undefined, false);
				undoStack.pop()?.revert();

				tree2.transaction.start();
				tree2.editor.addNodeExistsConstraint({
					parent: rootNode,
					parentField: brand("foo"),
					parentIndex: 0,
				});
				tree2.editor
					.sequenceField({ parent: rootNode, field: brand("bar") })
					.insert(0, singleJsonCursor(1));
				tree2.transaction.commit();

				tree.merge(tree2, false);
				tree2.rebaseOnto(tree);

				expectJsonTree([tree, tree2], [{ foo: "x", bar: 1 }]);
				unsubscribe();
			});

			it("existence constraint on node inserted in prior transaction", () => {
				const tree = makeTreeFromJson([]);
				const tree2 = tree.fork();

				// Insert "a"
				// State should be: ["a"]
				const sequence = tree.editor.sequenceField(rootField);
				sequence.insert(0, cursorForJsonableTreeNode({ type: leaf.string.name, value: "a" }));

				// Insert "b" after "a" with constraint that "a" exists.
				// State should be: ["a", "b"]
				tree.transaction.start();
				tree.editor.addNodeExistsConstraint(rootNode);
				const rootSequence = tree.editor.sequenceField(rootField);
				rootSequence.insert(
					1,
					cursorForJsonableTreeNode({ type: leaf.string.name, value: "b" }),
				);
				tree.transaction.commit();

				// Make a concurrent edit to rebase over that inserts into root sequence
				// State should be (to tree2): ["c"]
				const tree2RootSequence = tree2.editor.sequenceField(rootField);
				tree2RootSequence.insert(
					0,
					cursorForJsonableTreeNode({ type: leaf.string.name, value: "c" }),
				);

				tree.merge(tree2, false);
				tree2.rebaseOnto(tree);

				expectJsonTree([tree, tree2], ["c", "a", "b"]);
			});

			it("can add constraint to node inserted in same transaction", () => {
				const tree = makeTreeFromJson([{}]);
				const tree2 = tree.fork();

				// Constrain on "a" existing and insert "b" if it does
				// State should be (if "a" exists): [{ foo: "a"}, "b"]
				tree.transaction.start();
				const sequence = tree.editor.sequenceField({
					parent: rootNode,
					field: brand("foo"),
				});
				sequence.insert(0, cursorForJsonableTreeNode({ type: leaf.string.name, value: "a" }));

				tree.editor.addNodeExistsConstraint({
					parent: rootNode,
					parentField: brand("foo"),
					parentIndex: 0,
				});
				const rootSequence = tree.editor.sequenceField(rootField);
				rootSequence.insert(
					1,
					cursorForJsonableTreeNode({ type: leaf.string.name, value: "b" }),
				);
				tree.transaction.commit();

				// Insert "c" concurrently so that we rebase over something
				// State should be (to tree2): [{}, "c"]
				const tree2Sequence = tree2.editor.sequenceField(rootField);
				tree2Sequence.insert(
					1,
					cursorForJsonableTreeNode({ type: leaf.string.name, value: "c" }),
				);

				tree.merge(tree2, false);
				tree2.rebaseOnto(tree);

				expectJsonTree([tree, tree2], [{ foo: "a" }, "c", "b"]);
			});

			it("a change can depend on the existence of a node that is built in a prior change whose constraint was violated", () => {
				const tree = makeTreeFromJson([]);
				const rootSequence = tree.editor.sequenceField(rootField);
				rootSequence.insert(0, cursorForJsonableTreeNode({ type: jsonObject.name }));
				const optional = tree.editor.optionalField({
					parent: rootNode,
					field: brand("foo"),
				});
				optional.set(cursorForJsonableTreeNode({ type: leaf.string.name, value: "x" }), true);

				const tree2 = tree.fork();

				// Remove foo
				optional.set(undefined, false);

				tree2.transaction.start();
				tree2.editor.addNodeExistsConstraint({
					parent: rootNode,
					parentField: brand("foo"),
					parentIndex: 0,
				});
				tree2.editor
					.sequenceField({ parent: rootNode, field: brand("bar") })
					.insert(0, singleJsonCursor({ baz: 42 }));
				tree2.transaction.commit();
				expectJsonTree([tree2], [{ foo: "x", bar: { baz: 42 } }]);
				// This edit require the node `{ baz: 42 }` to have been built
				tree2.editor
					.optionalField({
						parent: {
							parent: rootNode,
							parentField: brand("bar"),
							parentIndex: 0,
						},
						field: brand("baz"),
					})
					.set(singleJsonCursor(43), false);

				tree.merge(tree2, false);
				tree2.rebaseOnto(tree);

				expectJsonTree([tree, tree2], [{}]);
			});

			// TODO: This doesn't update the constraint properly yet because
			// rebaseChild isn't called inside of handleCurrAttach
			it.skip("transaction dropped when node can't be inserted", () => {
				const tree = makeTreeFromJson([{}]);
				const tree2 = tree.fork();

				// Remove node from root sequence
				const tree1RootSequence = tree.editor.sequenceField(rootField);
				tree1RootSequence.remove(0, 1);

				// Constrain on "a" existing and insert "b" if it does
				// This insert should be dropped since the node "a" is inserted under is
				// concurrently removed
				tree2.transaction.start();
				const sequence = tree2.editor.sequenceField({
					parent: rootNode,
					field: brand("foo"),
				});
				sequence.insert(0, cursorForJsonableTreeNode({ type: leaf.string.name, value: "a" }));

				tree2.editor.addNodeExistsConstraint({
					parent: rootNode,
					parentField: brand("foo"),
					parentIndex: 0,
				});
				const rootSequence = tree2.editor.sequenceField(rootField);
				rootSequence.insert(
					1,
					cursorForJsonableTreeNode({ type: leaf.string.name, value: "b" }),
				);
				tree2.transaction.commit();

				tree.merge(tree2);
				tree2.rebaseOnto(tree);

				expectJsonTree([tree, tree2], []);
			});

			it("not violated by move out under remove", () => {
				const tree = makeTreeFromJson([{ foo: ["a"] }, {}]);
				const tree2 = tree.fork();

				const firstPath = {
					parent: undefined,
					parentField: rootFieldKey,
					parentIndex: 0,
				};

				const secondPath = {
					...firstPath,
					parentIndex: 1,
				};

				tree.transaction.start();
				tree.editor.move(
					{ field: brand("foo"), parent: firstPath },
					0,
					1,
					{
						field: brand("foo2"),
						parent: secondPath,
					},
					0,
				);

				const rootSequence = tree.editor.sequenceField(rootField);
				rootSequence.remove(0, 1);
				tree.transaction.commit();

				tree2.transaction.start();
				tree2.editor.addNodeExistsConstraint({
					parent: firstPath,
					parentField: brand("foo"),
					parentIndex: 0,
				});
				const tree2RootSequence = tree2.editor.sequenceField(rootField);
				tree2RootSequence.insert(2, cursorForJsonableTreeNode({ type: jsonObject.name }));
				tree2.transaction.commit();

				tree.merge(tree2, false);
				tree2.rebaseOnto(tree);

				expectJsonTree([tree, tree2], [{ foo2: ["a"] }, {}]);
			});

			// TODO: Constraint state isn't updated properly because
			// rebaseChild isn't called when currMark is undefined in rebaseMarkList
			it.skip("violated by move in under remove", () => {
				const tree = makeTreeFromJson([{ foo: ["a"] }, {}]);
				const tree2 = tree.fork();

				const firstPath = {
					parent: undefined,
					parentField: rootFieldKey,
					parentIndex: 0,
				};

				const secondPath = {
					...firstPath,
					parentIndex: 1,
				};

				// Move "a" from foo to foo2 in the second node in the root sequence and then remove
				// the second node in the root sequence
				tree.transaction.start();
				tree.editor.move(
					{ field: brand("foo"), parent: firstPath },
					0,
					1,
					{
						field: brand("foo2"),
						parent: secondPath,
					},
					0,
				);

				const rootSequence = tree.editor.sequenceField(rootField);
				rootSequence.remove(1, 1);
				tree.transaction.commit();

				// Put a constraint on "a" existing and insert "b" if it does
				// a's ancestor will be removed so this insert should be dropped
				tree2.transaction.start();
				tree2.editor.addNodeExistsConstraint({
					parent: firstPath,
					parentField: brand("foo"),
					parentIndex: 0,
				});
				const tree2RootSequence = tree2.editor.sequenceField(rootField);
				tree2RootSequence.insert(
					2,
					cursorForJsonableTreeNode({ type: leaf.string.name, value: "b" }),
				);
				tree2.transaction.commit();

				tree.merge(tree2);
				tree2.rebaseOnto(tree);

				expectJsonTree([tree, tree2], [{}]);
			});
		});
	});

	it.skip("edit removed content", () => {
		const tree = makeTreeFromJson({ foo: "A" });
		const cursor = tree.forest.allocateCursor();
		moveToDetachedField(tree.forest, cursor);
		cursor.enterNode(0);
		const anchor = cursor.buildAnchor();
		cursor.free();

		// Fork the tree so we can undo the removal of the root without undoing later changes
		// Note: if forking of the undo/redo stack is supported, this test can be simplified
		// slightly by deleting the root node before forking.
		const restoreRoot = tree.fork();
		const { undoStack, unsubscribe } = createTestUndoRedoStacks(restoreRoot.events);
		restoreRoot.editor.sequenceField(rootField).remove(0, 1);
		tree.merge(restoreRoot, false);
		expectJsonTree([tree, restoreRoot], []);

		undoStack.pop()?.revert();
		expectJsonTree(restoreRoot, [{ foo: "A" }]);

		// Get access to the removed node
		const parent = tree.locate(anchor) ?? assert.fail();
		// Make some nested change to it (remove A)
		tree.editor.sequenceField({ parent, field: brand("foo") }).remove(0, 1);

		// Restore the root node so we can see the effect of the edit
		tree.merge(restoreRoot, false);
		expectJsonTree(tree, [{}]);

		// TODO: this doesn't work because the removal of A was described as occurring under the detached field where
		// the root resided while removed. The rebaser is unable to associate that with the ChangeAtomId of the root.
		// That removal of A is therefore carried out under that detached field even though the root is restored.
		restoreRoot.rebaseOnto(tree);
		expectJsonTree(restoreRoot, [{}]);
		unsubscribe();
	});

	describe("Anchors", () => {
		it("anchors to content created on a branch survive rebasing of the branch", () => {
			const tree = makeTreeFromJson({});
			const branch = tree.fork();

			branch.editor
				.sequenceField({ parent: rootNode, field: brand("seq") })
				.insert(0, singleJsonCursor(1));
			branch.editor
				.optionalField({ parent: rootNode, field: brand("opt") })
				.set(singleJsonCursor(2), true);

			let cursor = branch.forest.allocateCursor();
			branch.forest.moveCursorToPath(
				{ parent: rootNode, parentField: brand("seq"), parentIndex: 0 },
				cursor,
			);
			const anchor1 = cursor.buildAnchor();
			branch.forest.moveCursorToPath(
				{ parent: rootNode, parentField: brand("opt"), parentIndex: 0 },
				cursor,
			);
			const anchor2 = cursor.buildAnchor();
			cursor.free();

			tree.editor
				.sequenceField({ parent: rootNode, field: brand("foo") })
				.insert(0, singleJsonCursor(3));

			tree.merge(branch, false);
			branch.rebaseOnto(tree);
			expectJsonTree([tree, branch], [{ seq: 1, opt: 2, foo: 3 }]);

			cursor = branch.forest.allocateCursor();
			assert.equal(
				branch.forest.tryMoveCursorToNode(anchor1, cursor),
				TreeNavigationResult.Ok,
			);
			assert.equal(cursor.value, 1);
			assert.equal(
				branch.forest.tryMoveCursorToNode(anchor2, cursor),
				TreeNavigationResult.Ok,
			);
			assert.equal(cursor.value, 2);
			cursor.free();
		});
	});

	describe("Can abort transactions", () => {
		function getInnerSequenceFieldPath(outer: FieldUpPath): FieldUpPath {
			return {
				parent: { parent: outer.parent, parentField: outer.field, parentIndex: 0 },
				field: brand(""),
			};
		}
		const initialState = { foo: [0, 1, 2] };
		function abortTransaction(branch: ITreeCheckout): void {
			branch.transaction.start();
			const rootSequence = branch.editor.sequenceField(rootField);
			const root0Path = {
				parent: undefined,
				parentField: rootFieldKey,
				parentIndex: 0,
			};
			const root1Path = {
				parent: undefined,
				parentField: rootFieldKey,
				parentIndex: 1,
			};
			const foo0 = branch.editor.sequenceField(
				getInnerSequenceFieldPath({ parent: root0Path, field: brand("foo") }),
			);
			const foo1 = branch.editor.sequenceField(
				getInnerSequenceFieldPath({ parent: root1Path, field: brand("foo") }),
			);
			foo0.remove(1, 1);
			foo0.insert(1, cursorForJsonableTreeNode({ type: brand("Number"), value: 41 }));
			foo0.remove(2, 1);
			foo0.insert(2, cursorForJsonableTreeNode({ type: brand("Number"), value: 42 }));
			foo0.remove(0, 1);
			rootSequence.insert(0, cursorForJsonableTreeNode({ type: brand("Test") }));
			foo1.remove(0, 1);
			foo1.insert(
				0,
				cursorForJsonableTreeNode({ type: brand("Number"), value: "RootValue2" }),
			);
			foo1.insert(0, cursorForJsonableTreeNode({ type: brand("Test") }));
			foo1.remove(1, 1);
			foo1.insert(1, cursorForJsonableTreeNode({ type: brand("Number"), value: 82 }));

			// Aborting the transaction should restore the forest
			branch.transaction.abort();

			expectJsonTree(branch, [initialState]);
		}

		it("on the main branch", () => {
			const tree = makeTreeFromJson(initialState);
			abortTransaction(tree);
		});

		it("on a child branch", () => {
			const tree = makeTreeFromJson(initialState);
			const child = tree.fork();
			abortTransaction(child);
		});
	});

	it("invert a composite change that include a mix of nested changes in a field that requires an amend pass", () => {
		const tree = makeTreeFromJson([{}]);

		tree.transaction.start();
		tree.transaction.start();
		tree.editor
			.optionalField({ parent: rootNode, field: brand("foo") })
			.set(singleJsonCursor("A"), true);
		tree.editor.sequenceField(rootField).move(0, 1, 0);
		tree.editor.sequenceField(rootField).insert(0, singleJsonCursor({}));
		tree.editor
			.optionalField({ parent: rootNode, field: brand("bar") })
			.set(singleJsonCursor("B"), true);
		tree.transaction.commit();
		tree.transaction.abort();

		expectJsonTree(tree, [{}]);
	});
});
