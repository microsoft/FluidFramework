/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

// Allow importing from this specific file which is being tested:
/* eslint-disable-next-line import-x/no-internal-modules */
import { LabelTree } from "../../util/labelTree.js";

describe("LabelTree", () => {
	describe("constructor", () => {
		it("creates a leaf node with no children", () => {
			const tree = new LabelTree("root");
			assert.equal(tree.label, "root");
			assert.deepEqual(tree.children, []);
		});

		it("creates a node with children", () => {
			const child1 = new LabelTree("child1");
			const child2 = new LabelTree("child2");
			const tree = new LabelTree("root", [child1, child2]);
			assert.equal(tree.label, "root");
			assert.equal(tree.children.length, 2);
			assert.equal(tree.children[0], child1);
			assert.equal(tree.children[1], child2);
		});
	});

	describe("has", () => {
		it("finds the label at the root", () => {
			const tree = new LabelTree("root");
			assert.equal(tree.has("root"), true);
		});

		it("finds a label in a direct child", () => {
			const tree = new LabelTree("root", [new LabelTree("child1"), new LabelTree("child2")]);
			assert.equal(tree.has("child1"), true);
			assert.equal(tree.has("child2"), true);
		});

		it("finds a label in a deeply nested descendant", () => {
			const tree = new LabelTree("root", [
				new LabelTree("level1", [new LabelTree("level2", [new LabelTree("deep")])]),
			]);
			assert.equal(tree.has("deep"), true);
		});

		it("returns false for a label not in the tree", () => {
			const tree = new LabelTree("root", [new LabelTree("child1"), new LabelTree("child2")]);
			assert.equal(tree.has("missing"), false);
		});

		it("uses reference equality for non-primitive labels", () => {
			const objA = { id: 1 };
			const objB = { id: 1 }; // Same contents, different reference
			const tree = new LabelTree(objA);
			assert.equal(tree.has(objA), true);
			assert.equal(tree.has(objB), false);
		});
	});

	describe("values", () => {
		it("yields the single label for a leaf node", () => {
			const tree = new LabelTree("only");
			assert.deepEqual([...tree.values()], ["only"]);
		});

		it("yields all labels in depth-first pre-order", () => {
			const tree = new LabelTree("root", [
				new LabelTree("a", [new LabelTree("a1"), new LabelTree("a2")]),
				new LabelTree("b"),
			]);
			assert.deepEqual([...tree.values()], ["root", "a", "a1", "a2", "b"]);
		});
	});

	describe("forEach", () => {
		it("calls back for each label in depth-first pre-order", () => {
			const tree = new LabelTree<string>("root", [
				new LabelTree("a", [new LabelTree("a1"), new LabelTree("a2")]),
				new LabelTree("b"),
			]);
			const visited: string[] = [];
			// eslint-disable-next-line unicorn/no-array-for-each -- Testing the forEach method itself
			tree.forEach((value) => {
				visited.push(value);
			});
			assert.deepEqual(visited, ["root", "a", "a1", "a2", "b"]);
		});
	});

	describe("size", () => {
		it("returns 1 for a leaf node", () => {
			const tree = new LabelTree("leaf");
			assert.equal(tree.size, 1);
		});

		it("returns the correct count for a tree with children", () => {
			const tree = new LabelTree("root", [
				new LabelTree("a", [new LabelTree("a1"), new LabelTree("a2")]),
				new LabelTree("b"),
			]);
			assert.equal(tree.size, 5);
		});
	});
});
