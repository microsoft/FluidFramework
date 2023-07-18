/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { unreachableCase } from "@fluidframework/common-utils";

import { jsonObject, jsonString, singleJsonCursor } from "../../domains";
import { rootFieldKeySymbol, UpPath, moveToDetachedField, FieldUpPath } from "../../core";
import { JsonCompatible, brand, makeArray } from "../../util";
import { makeTreeFromJson, remove, insert, expectJsonTree } from "../utils";
import { SharedTreeView } from "../../shared-tree";
import { singleTextCursor } from "../../feature-libraries";

describe("Editing", () => {
	describe("Sequence Field", () => {
		it("can order concurrent inserts within concurrently deleted content", () => {
			const tree = makeTreeFromJson(["A", "B", "C", "D"]);
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
				.sequenceField({ parent: undefined, field: rootFieldKeySymbol })
				.insert(0, singleTextCursor({ type: jsonObject.name, fields: { foo: [] } }));

			const rootPath = { parent: undefined, parentField: rootFieldKeySymbol, parentIndex: 0 };
			const aEditor = tree3.editor.sequenceField({ parent: rootPath, field: brand("foo") });
			aEditor.insert(0, singleTextCursor({ type: jsonString.name, value: "a" }));

			tree1.merge(tree2, false);
			tree1.merge(tree3, false);

			tree2.rebaseOnto(tree1);
			tree3.rebaseOnto(tree1);

			expectJsonTree([tree1, tree2, tree3], [{ foo: "a" }, "B", "C"]);
		});

		it("can handle competing deletes", () => {
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
				expectJsonTree([tree, tree1, tree2, tree3], expected);
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
				parentField: rootFieldKeySymbol,
				parentIndex: 3,
			};
			assert.deepEqual({ parent, parentField, parentIndex }, expectedPath);
		});

		it("can rebase a local delete", () => {
			const addW = makeTreeFromJson(["x", "y"]);
			const delY = addW.fork();

			remove(delY, 1, 1);
			insert(addW, 0, "w");

			addW.merge(delY, false);
			delY.rebaseOnto(addW);

			expectJsonTree([addW, delY], ["w", "x"]);
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

		// TODO: Enable once local branch repair data is supported
		it.skip("intentional revive", () => {
			const tree1 = makeTreeFromJson(["A", "B", "C"]);
			const tree2 = tree1.fork();

			remove(tree1, 1, 1);

			remove(tree2, 0, 3);
			tree2.undo();

			tree1.merge(tree2);
			tree2.rebaseOnto(tree1);

			expectJsonTree([tree1, tree2], ["A", "B", "C"]);
		});

		it("intra-field move", () => {
			const tree1 = makeTreeFromJson(["A", "B"]);

			tree1.editor
				.sequenceField({
					parent: undefined,
					field: rootFieldKeySymbol,
				})
				.move(0, 1, 1);

			expectJsonTree(tree1, ["B", "A"]);
		});

		it("can rebase intra-field move over insert", () => {
			const tree1 = makeTreeFromJson(["A", "B"]);
			const tree2 = tree1.fork();

			insert(tree1, 2, "C");

			tree2.editor
				.sequenceField({
					parent: undefined,
					field: rootFieldKeySymbol,
				})
				.move(0, 1, 1);

			tree1.merge(tree2, false);
			tree2.rebaseOnto(tree1);
			expectJsonTree(tree1, ["B", "A", "C"]);
			expectJsonTree(tree2, ["B", "A", "C"]);
		});

		it("can concurrently edit and move a subtree", () => {
			const tree1 = makeTreeFromJson(["A", { foo: "B" }]);
			const tree2 = tree1.fork();

			const parent = { parent: undefined, parentField: rootFieldKeySymbol, parentIndex: 1 };
			const editor = tree1.editor.valueField({ parent, field: brand("foo") });
			editor.set(singleTextCursor({ type: jsonString.name, value: "C" }));

			// Move B before A.
			tree2.editor.move(
				{ parent: undefined, field: rootFieldKeySymbol },
				1,
				1,
				{ parent: undefined, field: rootFieldKeySymbol },
				0,
			);

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
			tree1.editor.move(
				{ parent: undefined, field: rootFieldKeySymbol },
				1,
				1,
				{ parent: undefined, field: rootFieldKeySymbol },
				0,
			);

			const parent = { parent: undefined, parentField: rootFieldKeySymbol, parentIndex: 0 };
			const editor = tree1.editor.valueField({ parent, field: brand("foo") });
			editor.set(singleTextCursor({ type: jsonString.name, value: "C" }));

			tree1.merge(tree2, false);
			tree2.rebaseOnto(tree1);

			const expectedState: JsonCompatible = [{ foo: "C" }, "A"];
			expectJsonTree(tree1, expectedState);
			expectJsonTree(tree2, expectedState);
		});

		it("can rebase cross-field move over edit of moved node", () => {
			const tree1 = makeTreeFromJson({
				foo: [{ baz: "A" }],
				bar: ["B"],
			});
			const tree2 = tree1.fork();

			const rootPath = {
				parent: undefined,
				parentField: rootFieldKeySymbol,
				parentIndex: 0,
			};

			const fooList: UpPath = { parent: rootPath, parentField: brand("foo"), parentIndex: 0 };
			const barList: UpPath = { parent: rootPath, parentField: brand("bar"), parentIndex: 0 };

			// Change value of A to C
			const editor = tree1.editor.valueField({
				parent: { parent: fooList, parentField: brand(""), parentIndex: 0 },
				field: brand("baz"),
			});
			editor.set(singleTextCursor({ type: jsonString.name, value: "C" }));

			// Move A after B.
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

			const rootPath = {
				parent: undefined,
				parentField: rootFieldKeySymbol,
				parentIndex: 0,
			};
			const rootField = { parent: undefined, field: rootFieldKeySymbol };

			const fooList: UpPath = { parent: rootPath, parentField: brand("foo"), parentIndex: 0 };

			// Move A out of foo.
			tree1.editor.move({ parent: fooList, field: brand("") }, 0, 1, rootField, 0);

			// Delete root.
			tree2.editor.sequenceField(rootField).delete(0, 1);

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

			const rootPath = {
				parent: undefined,
				parentField: rootFieldKeySymbol,
				parentIndex: 0,
			};

			const fooList: UpPath = { parent: rootPath, parentField: brand("foo"), parentIndex: 0 };
			const barList: UpPath = { parent: rootPath, parentField: brand("bar"), parentIndex: 0 };

			// Move A after B.
			tree1.editor.move(
				{ parent: fooList, field: brand("") },
				0,
				1,
				{ parent: barList, field: brand("") },
				1,
			);

			// Change value of A to C
			const editor = tree2.editor.valueField({
				parent: { parent: fooList, parentField: brand(""), parentIndex: 0 },
				field: brand("baz"),
			});
			editor.set(singleTextCursor({ type: jsonString.name, value: "C" }));

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

		it("move under move-out", () => {
			const tree1 = makeTreeFromJson([{ foo: ["a", "b"] }, "x"]);

			tree1.transaction.start();

			const node1: UpPath = {
				parent: undefined,
				parentField: rootFieldKeySymbol,
				parentIndex: 0,
			};
			const listNode: UpPath = {
				parent: node1,
				parentField: brand("foo"),
				parentIndex: 0,
			};
			const fooField = tree1.editor.sequenceField({ parent: listNode, field: brand("") });
			fooField.move(0, 1, 1);

			const rootField = tree1.editor.sequenceField({
				parent: undefined,
				field: rootFieldKeySymbol,
			});
			rootField.move(0, 1, 1);

			tree1.transaction.commit();

			expectJsonTree(tree1, ["x", { foo: ["b", "a"] }]);
		});

		it("move adjacent nodes to separate destinations", () => {
			const tree = makeTreeFromJson(["A", "B", "C", "D"]);
			const tree2 = tree.fork();

			tree2.transaction.start();

			const sequence = tree2.editor.sequenceField({
				parent: undefined,
				field: rootFieldKeySymbol,
			});
			sequence.move(1, 1, 0);
			sequence.move(2, 1, 3);
			tree2.transaction.commit();
			tree.merge(tree2);
			expectJsonTree([tree, tree2], ["B", "A", "D", "C"]);
		});

		it("move separate nodes to adjacent destinations", () => {
			const tree = makeTreeFromJson(["A", "B", "C", "D"]);
			const tree2 = tree.fork();

			tree2.transaction.start();

			const sequence = tree2.editor.sequenceField({
				parent: undefined,
				field: rootFieldKeySymbol,
			});
			sequence.move(0, 1, 1);
			sequence.move(3, 1, 2);
			tree2.transaction.commit();
			tree.merge(tree2);
			expectJsonTree([tree, tree2], ["B", "A", "D", "C"]);
		});

		// Moving a node into a concurrently deleted subtree should result in the moved node being deleted
		it("ancestor of move destination deleted", () => {
			const tree = makeTreeFromJson([{ foo: ["a"] }, {}]);
			const tree2 = tree.fork();

			const first: UpPath = {
				parent: undefined,
				parentIndex: 0,
				parentField: rootFieldKeySymbol,
			};

			const second: UpPath = {
				parent: undefined,
				parentIndex: 1,
				parentField: rootFieldKeySymbol,
			};

			const sequence = tree.editor.sequenceField({
				parent: undefined,
				field: rootFieldKeySymbol,
			});

			// Delete destination's ancestor concurrently
			sequence.delete(1, 1);

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
		});

		// Tests that a move is aborted if the moved node has been concurrently deleted
		it("ancestor of move source deleted", () => {
			const tree = makeTreeFromJson([{ foo: ["a"] }, {}]);
			const tree2 = tree.fork();

			const first: UpPath = {
				parent: undefined,
				parentIndex: 0,
				parentField: rootFieldKeySymbol,
			};

			const second: UpPath = {
				parent: undefined,
				parentIndex: 1,
				parentField: rootFieldKeySymbol,
			};

			const sequence = tree.editor.sequenceField({
				parent: undefined,
				field: rootFieldKeySymbol,
			});

			// Delete source's ancestor concurrently
			sequence.delete(0, 1);

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
		});

		it("ancestor of move source deleted then revived", () => {
			const tree = makeTreeFromJson([{ foo: ["a"] }, {}]);
			const tree2 = tree.fork();

			const first: UpPath = {
				parent: undefined,
				parentIndex: 0,
				parentField: rootFieldKeySymbol,
			};

			const second: UpPath = {
				parent: undefined,
				parentIndex: 1,
				parentField: rootFieldKeySymbol,
			};

			const sequence = tree.editor.sequenceField({
				parent: undefined,
				field: rootFieldKeySymbol,
			});

			// Delete source's ancestor concurrently
			sequence.delete(0, 1);
			// Revive the ancestor
			tree.undo();

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
		});

		it("node being concurrently moved and deleted with source ancestor revived", () => {
			const tree = makeTreeFromJson([{ foo: ["a"] }, {}]);
			const tree2 = tree.fork();

			const first: UpPath = {
				parent: undefined,
				parentIndex: 0,
				parentField: rootFieldKeySymbol,
			};

			const second: UpPath = {
				parent: undefined,
				parentIndex: 1,
				parentField: rootFieldKeySymbol,
			};

			const sequence = tree.editor.sequenceField({
				parent: undefined,
				field: rootFieldKeySymbol,
			});

			// Delete source's ancestor concurrently
			sequence.delete(0, 1);
			// Revive source's ancestor
			tree.undo();
			// Delete "a"
			tree.editor.sequenceField({ parent: first, field: brand("foo") }).delete(0, 1);

			tree2.editor.move(
				{ parent: first, field: brand("foo") },
				0,
				1,
				{ parent: second, field: brand("bar") },
				0,
			);

			tree.merge(tree2, false);
			tree2.rebaseOnto(tree);

			expectJsonTree([tree, tree2], [{}, {}]);
		});

		it("node being concurrently moved and revived with source ancestor deleted", () => {
			const tree = makeTreeFromJson([{ foo: ["a"] }, {}]);
			const tree2 = tree.fork();

			const first: UpPath = {
				parent: undefined,
				parentIndex: 0,
				parentField: rootFieldKeySymbol,
			};

			const second: UpPath = {
				parent: undefined,
				parentIndex: 1,
				parentField: rootFieldKeySymbol,
			};

			const sequence = tree.editor.sequenceField({
				parent: undefined,
				field: rootFieldKeySymbol,
			});

			// Delete "a"
			tree.editor.sequenceField({ parent: first, field: brand("foo") }).delete(0, 1);
			// Revive "a"
			tree.undo();
			// Delete source's ancestor concurrently
			sequence.delete(0, 1);

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
		});

		it("delete ancestor of return source", () => {
			const tree = makeTreeFromJson([{ foo: ["a"] }, {}]);
			const first: UpPath = {
				parent: undefined,
				parentIndex: 0,
				parentField: rootFieldKeySymbol,
			};

			const second: UpPath = {
				parent: undefined,
				parentIndex: 1,
				parentField: rootFieldKeySymbol,
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

			const sequence = tree.editor.sequenceField({
				parent: undefined,
				field: rootFieldKeySymbol,
			});

			// Delete ancestor of "a"
			sequence.delete(1, 1);
			// Undo move to bar
			tree2.undo();

			tree.merge(tree2, false);
			tree2.rebaseOnto(tree);

			expectJsonTree([tree, tree2], [{}]);
		});

		it("delete ancestor of return destination", () => {
			const tree = makeTreeFromJson([{ foo: ["a"] }, {}]);
			const first: UpPath = {
				parent: undefined,
				parentIndex: 0,
				parentField: rootFieldKeySymbol,
			};

			const second: UpPath = {
				parent: undefined,
				parentIndex: 1,
				parentField: rootFieldKeySymbol,
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

			const sequence = tree.editor.sequenceField({
				parent: undefined,
				field: rootFieldKeySymbol,
			});

			// Delete destination ancestor
			sequence.delete(0, 1);
			// Undo move to bar
			tree2.undo();

			tree.merge(tree2, false);
			tree2.rebaseOnto(tree);

			expectJsonTree([tree, tree2], [{}]);
		});

		it("rebase changes to field untouched by base", () => {
			const tree = makeTreeFromJson({ foo: [{ bar: "A" }, { baz: "B" }] });
			const tree1 = tree.fork();
			const tree2 = tree.fork();

			const rootNode: UpPath = {
				parent: undefined,
				parentField: rootFieldKeySymbol,
				parentIndex: 0,
			};
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
				.set(singleTextCursor({ type: jsonString.name, value: "b" }));
			tree2.editor.sequenceField({ parent: foo1, field: brand("bar") }).delete(0, 1);

			tree.merge(tree1, false);
			tree.merge(tree2, false);
			tree1.rebaseOnto(tree);
			tree2.rebaseOnto(tree);

			expectJsonTree([tree, tree1, tree2], [{ foo: [{}, { baz: "b" }] }]);
		});

		describe.skip("Exhaustive removal tests", () => {
			// Toggle the constant below to run each scenario as a separate test.
			// This is useful to debug a specific scenario but makes CI and the test browser slower.
			// Note that if the numbers of nodes and peers are too high (more than 3 nodes and 3 peers),
			// then the number of scenarios overwhelms the test browser.
			// Should be committed with the constant set to false.
			const individualTests = false;
			const nbNodes = 3;
			const nbPeers = 3;
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
							yield* buildScenariosWithPrefix([
								...scenario,
								{ type: StepType.Undo, peer: p },
							]);
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

			const delAction = (peer: SharedTreeView, idx: number) => remove(peer, idx, 1);
			const srcField: FieldUpPath = { parent: undefined, field: rootFieldKeySymbol };
			const dstField: FieldUpPath = { parent: undefined, field: brand("dst") };
			const moveAction = (peer: SharedTreeView, idx: number) =>
				peer.editor.move(srcField, idx, 1, dstField, 0);

			/**
			 * Runs the given `scenario` using either delete or move operations.
			 * Verifies that the final state is the same as the initial state.
			 * Simulates different peers learning of the same edit at different times.
			 * For example, given the following two (otherwise symmetrical) scenarios:
			 * 1) D(i:0 p:0) D(i:1 p:1) U(1) U(0)
			 * 2) D(i:0 p:1) D(i:1 p:0) U(0) U(1)
			 * In scenario 1, the peer that deletes N1 learns of the deletion of N0 beforehand.
			 * In scenario 2, the peer that deletes N1 learns of the deletion of N0 afterwards.
			 * @param scenario - The scenario to run through.
			 * @param useMove - When `true`, uses move operations. Otherwise, uses delete operations.
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
					// The number of remaining undos available for each peer.
					const undoQueues: number[][] = makeArray(nbPeers, () => []);

					const tree = makeTreeFromJson(startState);
					const peers = makeArray(nbPeers, () => tree.fork());
					for (const step of scenario) {
						const iPeer = step.peer;
						const peer = peers[iPeer];
						let presence: number;
						let affectedNode: number;
						switch (step.type) {
							case StepType.Remove: {
								const idx = present[iPeer]
									.slice(0, step.index)
									.reduce((a, b) => a + b, 0);
								action(peer, idx);
								presence = 0;
								affectedNode = step.index;
								undoQueues[iPeer].push(step.index);
								break;
							}
							case StepType.Undo: {
								peer.undo();
								presence = 1;
								// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
								affectedNode = undoQueues[iPeer].pop()!;
								break;
							}
							default:
								unreachableCase(step);
						}
						tree.merge(peer);
						// We only let peers with a higher index learn of this edit.
						// This breaks the symmetry between scenarios where the permutation of actions is the same
						// except for which peer does which set of actions.
						// It also helps simulate different peers learning of the same edit at different times.
						for (let downhillPeer = iPeer + 1; downhillPeer < nbPeers; downhillPeer++) {
							peers[downhillPeer].rebaseOnto(peer);
							present[downhillPeer][affectedNode] = presence;
						}
						present[iPeer][affectedNode] = presence;
					}
					peers.forEach((peer) => peer.rebaseOnto(tree));
					expectJsonTree([tree, ...peers], startState);
				});
			}

			const startState = makeArray(nbNodes, (n) => `N${n}`);
			const scenarios = buildScenarios();

			outerFixture("All Scenarios", () => {
				for (const scenario of scenarios) {
					if (testRemoveRevive) {
						runScenario(scenario, false);
					}
					if (testMoveReturn) {
						runScenario(scenario, true);
					}
				}
			});
		});
	});

	describe("Optional Field", () => {
		it("can rebase a node replacement and a dependent edit to the new node", () => {
			const tree1 = makeTreeFromJson([]);
			const tree2 = tree1.fork();

			const rootPath = {
				parent: undefined,
				parentField: rootFieldKeySymbol,
				parentIndex: 0,
			};

			tree1.editor
				.optionalField({
					parent: undefined,
					field: rootFieldKeySymbol,
				})
				.set(singleJsonCursor("41"), true);

			tree2.editor
				.optionalField({
					parent: undefined,
					field: rootFieldKeySymbol,
				})
				.set(singleJsonCursor({ foo: "42" }), true);

			const editor = tree2.editor.valueField({ parent: rootPath, field: brand("foo") });
			editor.set(singleTextCursor({ type: jsonString.name, value: "43" }));

			tree1.merge(tree2, false);
			tree2.rebaseOnto(tree1);

			expectJsonTree([tree1, tree2], [{ foo: "43" }]);
		});

		it("can rebase a node edit over the node being replaced and restored", () => {
			const tree1 = makeTreeFromJson([{ foo: "40" }]);
			const tree2 = tree1.fork();

			const rootPath = {
				parent: undefined,
				parentField: rootFieldKeySymbol,
				parentIndex: 0,
			};

			tree1.editor
				.optionalField({
					parent: undefined,
					field: rootFieldKeySymbol,
				})
				.set(singleJsonCursor({ foo: "41" }), false);

			tree1.undo();

			const editor = tree2.editor.valueField({ parent: rootPath, field: brand("foo") });
			editor.set(singleTextCursor({ type: jsonString.name, value: "42" }));

			tree1.merge(tree2, false);
			tree2.rebaseOnto(tree1);

			expectJsonTree([tree1, tree2], [{ foo: "42" }]);
		});

		it("can replace and restore a node", () => {
			const tree1 = makeTreeFromJson(["42"]);

			tree1.editor
				.optionalField({
					parent: undefined,
					field: rootFieldKeySymbol,
				})
				.set(singleJsonCursor("43"), false);

			expectJsonTree(tree1, ["43"]);

			tree1.undo();

			expectJsonTree(tree1, ["42"]);
		});

		it("rebases repair data", () => {
			const tree = makeTreeFromJson(["42"]);
			const tree2 = tree.fork();

			tree.editor
				.optionalField({
					parent: undefined,
					field: rootFieldKeySymbol,
				})
				.set(singleJsonCursor("43"), false);

			tree2.editor
				.optionalField({ parent: undefined, field: rootFieldKeySymbol })
				.set(undefined, false);

			tree.merge(tree2, false);
			tree2.rebaseOnto(tree);

			tree2.undo();

			tree.merge(tree2, false);
			tree2.rebaseOnto(tree);

			expectJsonTree([tree, tree2], ["43"]);
		});
	});

	describe("Constraints", () => {
		describe("Node existence constraint", () => {
			it("handles ancestor revive", () => {
				const tree = makeTreeFromJson([]);

				const aPath = {
					parent: undefined,
					parentField: rootFieldKeySymbol,
					parentIndex: 0,
				};

				const rootSequence = tree.editor.sequenceField({
					parent: undefined,
					field: rootFieldKeySymbol,
				});
				rootSequence.insert(0, singleTextCursor({ type: jsonObject.name }));
				const treeSequence = tree.editor.sequenceField({
					parent: aPath,
					field: brand("foo"),
				});
				treeSequence.insert(0, singleTextCursor({ type: jsonString.name, value: "bar" }));

				const tree2 = tree.fork();

				// Delete a
				remove(tree, 0, 1);
				// Undo delete of a
				tree.undo();

				tree2.transaction.start();
				// Put existence constraint on child field of a
				// Constraint should be not be violated after undo
				tree2.editor.addNodeExistsConstraint({
					parent: aPath,
					parentField: brand("foo"),
					parentIndex: 0,
				});
				const tree2Sequence = tree2.editor.sequenceField({
					parent: undefined,
					field: rootFieldKeySymbol,
				});
				tree2Sequence.insert(1, singleJsonCursor("b"));
				tree2.transaction.commit();

				tree.merge(tree2, false);
				tree2.rebaseOnto(tree);

				expectJsonTree([tree, tree2], [{ foo: "bar" }, "b"]);
			});

			it("handles ancestor delete", () => {
				const tree = makeTreeFromJson([]);

				const aPath = {
					parent: undefined,
					parentField: rootFieldKeySymbol,
					parentIndex: 0,
				};

				const rootSequence = tree.editor.sequenceField({
					parent: undefined,
					field: rootFieldKeySymbol,
				});
				rootSequence.insert(0, singleTextCursor({ type: jsonObject.name }));
				const treeSequence = tree.editor.sequenceField({
					parent: aPath,
					field: brand("foo"),
				});
				treeSequence.insert(0, singleTextCursor({ type: jsonString.name, value: "bar" }));

				const tree2 = tree.fork();

				// Delete a
				remove(tree, 0, 1);

				tree2.transaction.start();
				// Put existence constraint on child field of a
				tree2.editor.addNodeExistsConstraint({
					parent: aPath,
					parentField: brand("foo"),
					parentIndex: 0,
				});
				const tree2Sequence = tree2.editor.sequenceField({
					parent: undefined,
					field: rootFieldKeySymbol,
				});
				tree2Sequence.insert(1, singleTextCursor({ type: jsonString.name, value: "b" }));
				tree2.transaction.commit();

				tree.merge(tree2, false);
				tree2.rebaseOnto(tree);

				expectJsonTree([tree, tree2], []);
			});

			it("sequence field node exists constraint", () => {
				const tree = makeTreeFromJson([]);
				const bPath = {
					parent: undefined,
					parentField: rootFieldKeySymbol,
					parentIndex: 1,
				};

				insert(tree, 0, "a", "b");
				const tree2 = tree.fork();

				// Delete b
				remove(tree, 1, 1);

				tree2.transaction.start();
				// Put an existence constraint on b
				tree2.editor.addNodeExistsConstraint(bPath);
				const tree2RootSequence = tree2.editor.sequenceField({
					parent: undefined,
					field: rootFieldKeySymbol,
				});
				// Should not be inserted because b has been concurrently deleted
				tree2RootSequence.insert(
					0,
					singleTextCursor({ type: jsonString.name, value: "c" }),
				);
				tree2.transaction.commit();

				tree.merge(tree2, false);
				tree2.rebaseOnto(tree);

				expectJsonTree([tree, tree2], ["a"]);
			});

			it("revived sequence field node exists constraint", () => {
				const tree = makeTreeFromJson([]);
				const bPath = {
					parent: undefined,
					parentField: rootFieldKeySymbol,
					parentIndex: 1,
				};

				insert(tree, 0, "a", "b");
				const tree2 = tree.fork();

				// Remove and revive second object in root sequence
				remove(tree, 1, 1);
				tree.undo();

				tree2.transaction.start();
				tree2.editor.addNodeExistsConstraint(bPath);
				const sequence = tree2.editor.sequenceField({
					parent: undefined,
					field: rootFieldKeySymbol,
				});
				sequence.insert(0, singleTextCursor({ type: jsonString.name, value: "c" }));
				tree2.transaction.commit();

				tree.merge(tree2, false);
				tree2.rebaseOnto(tree);

				expectJsonTree([tree, tree2], ["c", "a", "b"]);
			});

			it("optional field node exists constraint", () => {
				const tree = makeTreeFromJson([]);
				const rootSequence = tree.editor.sequenceField({
					parent: undefined,
					field: rootFieldKeySymbol,
				});
				rootSequence.insert(0, singleTextCursor({ type: jsonObject.name }));
				const path = {
					parent: undefined,
					parentField: rootFieldKeySymbol,
					parentIndex: 0,
				};
				const optional = tree.editor.optionalField({ parent: path, field: brand("foo") });
				optional.set(singleTextCursor({ type: jsonString.name, value: "x" }), true);

				const tree2 = tree.fork();

				// Delete foo
				optional.set(undefined, false);

				tree2.transaction.start();
				tree2.editor.addNodeExistsConstraint({
					parent: path,
					parentField: brand("foo"),
					parentIndex: 0,
				});
				tree2.editor
					.sequenceField({ parent: path, field: brand("bar") })
					.insert(0, singleJsonCursor(1));
				tree2.transaction.commit();

				tree.merge(tree2, false);
				tree2.rebaseOnto(tree);

				expectJsonTree([tree, tree2], [{}]);
			});

			it("revived optional field node exists constraint", () => {
				const tree = makeTreeFromJson([]);
				const rootSequence = tree.editor.sequenceField({
					parent: undefined,
					field: rootFieldKeySymbol,
				});
				rootSequence.insert(0, singleTextCursor({ type: jsonObject.name }));

				const path = {
					parent: undefined,
					parentField: rootFieldKeySymbol,
					parentIndex: 0,
				};

				const optional = tree.editor.optionalField({ parent: path, field: brand("foo") });
				optional.set(singleTextCursor({ type: jsonString.name, value: "x" }), true);

				const tree2 = tree.fork();

				optional.set(undefined, false);
				tree.undo();

				tree2.transaction.start();
				tree2.editor.addNodeExistsConstraint({
					parent: path,
					parentField: brand("foo"),
					parentIndex: 0,
				});
				tree2.editor
					.sequenceField({ parent: path, field: brand("bar") })
					.insert(0, singleJsonCursor(1));
				tree2.transaction.commit();

				tree.merge(tree2, false);
				tree2.rebaseOnto(tree);

				expectJsonTree([tree, tree2], [{ foo: "x", bar: 1 }]);
			});

			it("existence constraint on node inserted in prior transaction", () => {
				const tree = makeTreeFromJson([]);
				const tree2 = tree.fork();

				// Insert "a"
				// State should be: ["a"]
				const sequence = tree.editor.sequenceField({
					parent: undefined,
					field: rootFieldKeySymbol,
				});
				sequence.insert(0, singleTextCursor({ type: jsonString.name, value: "a" }));

				// Insert "b" after "a" with constraint that "a" exists.
				// State should be: ["a", "b"]
				tree.transaction.start();
				tree.editor.addNodeExistsConstraint({
					parent: undefined,
					parentField: rootFieldKeySymbol,
					parentIndex: 0,
				});
				const rootSequence = tree.editor.sequenceField({
					parent: undefined,
					field: rootFieldKeySymbol,
				});
				rootSequence.insert(1, singleTextCursor({ type: jsonString.name, value: "b" }));
				tree.transaction.commit();

				// Make a concurrent edit to rebase over that inserts into root sequence
				// State should be (to tree2): ["c"]
				const tree2RootSequence = tree2.editor.sequenceField({
					parent: undefined,
					field: rootFieldKeySymbol,
				});
				tree2RootSequence.insert(
					0,
					singleTextCursor({ type: jsonString.name, value: "c" }),
				);

				tree.merge(tree2, false);
				tree2.rebaseOnto(tree);

				expectJsonTree([tree, tree2], ["c", "a", "b"]);
			});

			it("can add constraint to node inserted in same transaction", () => {
				const tree = makeTreeFromJson([{}]);
				const tree2 = tree.fork();

				const rootPath: UpPath = {
					parent: undefined,
					parentField: rootFieldKeySymbol,
					parentIndex: 0,
				};

				// Constrain on "a" existing and insert "b" if it does
				// State should be (if "a" exists): [{ foo: "a"}, "b"]
				tree.transaction.start();
				const sequence = tree.editor.sequenceField({
					parent: rootPath,
					field: brand("foo"),
				});
				sequence.insert(0, singleTextCursor({ type: jsonString.name, value: "a" }));

				tree.editor.addNodeExistsConstraint({
					parent: rootPath,
					parentField: brand("foo"),
					parentIndex: 0,
				});
				const rootSequence = tree.editor.sequenceField({
					parent: undefined,
					field: rootFieldKeySymbol,
				});
				rootSequence.insert(1, singleTextCursor({ type: jsonString.name, value: "b" }));
				tree.transaction.commit();

				// Insert "c" concurrently so that we rebase over something
				// State should be (to tree2): [{}, "c"]
				const tree2Sequence = tree2.editor.sequenceField({
					parent: undefined,
					field: rootFieldKeySymbol,
				});
				tree2Sequence.insert(1, singleTextCursor({ type: jsonString.name, value: "c" }));

				tree.merge(tree2, false);
				tree2.rebaseOnto(tree);

				expectJsonTree([tree, tree2], [{ foo: "a" }, "c", "b"]);
			});

			// TODO: This doesn't update the constraint properly yet because
			// rebaseChild isn't called inside of handleCurrAttach
			it.skip("transaction dropped when node can't be inserted", () => {
				const tree = makeTreeFromJson([{}]);
				const tree2 = tree.fork();

				const rootPath: UpPath = {
					parent: undefined,
					parentField: rootFieldKeySymbol,
					parentIndex: 0,
				};

				// Delete node from root sequence
				const tree1RootSequence = tree.editor.sequenceField({
					parent: undefined,
					field: rootFieldKeySymbol,
				});
				tree1RootSequence.delete(0, 1);

				// Constrain on "a" existing and insert "b" if it does
				// This insert should be dropped since the node "a" is inserted under is
				// concurrently deleted
				tree2.transaction.start();
				const sequence = tree2.editor.sequenceField({
					parent: rootPath,
					field: brand("foo"),
				});
				sequence.insert(0, singleTextCursor({ type: jsonString.name, value: "a" }));

				tree2.editor.addNodeExistsConstraint({
					parent: rootPath,
					parentField: brand("foo"),
					parentIndex: 0,
				});
				const rootSequence = tree2.editor.sequenceField({
					parent: undefined,
					field: rootFieldKeySymbol,
				});
				rootSequence.insert(1, singleTextCursor({ type: jsonString.name, value: "b" }));
				tree2.transaction.commit();

				tree.merge(tree2);
				tree2.rebaseOnto(tree);

				expectJsonTree([tree, tree2], []);
			});

			it("not violated by move out under delete", () => {
				const tree = makeTreeFromJson([{ foo: ["a"] }, {}]);
				const tree2 = tree.fork();

				const firstPath = {
					parent: undefined,
					parentField: rootFieldKeySymbol,
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

				const rootSequence = tree.editor.sequenceField({
					parent: undefined,
					field: rootFieldKeySymbol,
				});
				rootSequence.delete(0, 1);
				tree.transaction.commit();

				tree2.transaction.start();
				tree2.editor.addNodeExistsConstraint({
					parent: firstPath,
					parentField: brand("foo"),
					parentIndex: 0,
				});
				const tree2RootSequence = tree2.editor.sequenceField({
					parent: undefined,
					field: rootFieldKeySymbol,
				});
				tree2RootSequence.insert(2, singleTextCursor({ type: jsonObject.name }));
				tree2.transaction.commit();

				tree.merge(tree2, false);
				tree2.rebaseOnto(tree);

				expectJsonTree([tree, tree2], [{ foo2: ["a"] }, {}]);
			});

			// TODO: Constraint state isn't updated properly because
			// rebaseChild isn't called when currMark is undefined in rebaseMarkList
			it.skip("violated by move in under delete", () => {
				const tree = makeTreeFromJson([{ foo: ["a"] }, {}]);
				const tree2 = tree.fork();

				const firstPath = {
					parent: undefined,
					parentField: rootFieldKeySymbol,
					parentIndex: 0,
				};

				const secondPath = {
					...firstPath,
					parentIndex: 1,
				};

				// Move "a" from foo to foo2 in the second node in the root sequence and then delete
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

				const rootSequence = tree.editor.sequenceField({
					parent: undefined,
					field: rootFieldKeySymbol,
				});
				rootSequence.delete(1, 1);
				tree.transaction.commit();

				// Put a constraint on "a" existing and insert "b" if it does
				// a's ancestor will be deleted so this insert should be dropped
				tree2.transaction.start();
				tree2.editor.addNodeExistsConstraint({
					parent: firstPath,
					parentField: brand("foo"),
					parentIndex: 0,
				});
				const tree2RootSequence = tree2.editor.sequenceField({
					parent: undefined,
					field: rootFieldKeySymbol,
				});
				tree2RootSequence.insert(
					2,
					singleTextCursor({ type: jsonString.name, value: "b" }),
				);
				tree2.transaction.commit();

				tree.merge(tree2);
				tree2.rebaseOnto(tree);

				expectJsonTree([tree, tree2], [{}]);
			});
		});
	});
});
