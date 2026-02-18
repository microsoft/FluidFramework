/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { ValueTreeNode } from "../../util/index.js";

// Allow importing from this specific file which is being tested:

describe("ValueTree", () => {
	describe("constructor", () => {
		it("creates a leaf node with no children", () => {
			const tree = new ValueTreeNode("root");
			assert.equal(tree.value, "root");
			assert.deepEqual(tree.children, []);
		});

		it("creates a node with children", () => {
			const child1 = new ValueTreeNode("child1");
			const child2 = new ValueTreeNode("child2");
			const tree = new ValueTreeNode("root", [child1, child2]);
			assert.equal(tree.value, "root");
			assert.equal(tree.children.length, 2);
			assert.equal(tree.children[0], child1);
			assert.equal(tree.children[1], child2);
		});
	});

	describe("has", () => {
		it("finds the value at the root", () => {
			const tree = new ValueTreeNode("root");
			assert.equal(tree.has("root"), true);
		});

		it("finds a value in a direct child", () => {
			const tree = new ValueTreeNode("root", [
				new ValueTreeNode("child1"),
				new ValueTreeNode("child2"),
			]);
			assert.equal(tree.has("child1"), true);
			assert.equal(tree.has("child2"), true);
		});

		it("finds a value in a deeply nested descendant", () => {
			const tree = new ValueTreeNode("root", [
				new ValueTreeNode("level1", [
					new ValueTreeNode("level2", [new ValueTreeNode("deep")]),
				]),
			]);
			assert.equal(tree.has("deep"), true);
		});

		it("returns false for a value not in the tree", () => {
			const tree = new ValueTreeNode("root", [
				new ValueTreeNode("child1"),
				new ValueTreeNode("child2"),
			]);
			assert.equal(tree.has("missing"), false);
		});

		it("uses reference equality for non-primitive values", () => {
			const objA = { id: 1 };
			const objB = { id: 1 }; // Same contents, different reference
			const tree = new ValueTreeNode(objA);
			assert.equal(tree.has(objA), true);
			assert.equal(tree.has(objB), false);
		});
	});

	describe("values", () => {
		it("yields the single value for a leaf node", () => {
			const tree = new ValueTreeNode("only");
			assert.deepEqual([...tree.values()], ["only"]);
		});

		it("yields all values in depth-first pre-order", () => {
			const tree = new ValueTreeNode("root", [
				new ValueTreeNode("a", [new ValueTreeNode("a1"), new ValueTreeNode("a2")]),
				new ValueTreeNode("b"),
			]);
			assert.deepEqual([...tree.values()], ["root", "a", "a1", "a2", "b"]);
		});
	});

	describe("forEach", () => {
		it("calls back for each value in depth-first pre-order", () => {
			const tree = new ValueTreeNode<string>("root", [
				new ValueTreeNode("a", [new ValueTreeNode("a1"), new ValueTreeNode("a2")]),
				new ValueTreeNode("b"),
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
			const tree = new ValueTreeNode("leaf");
			assert.equal(tree.size, 1);
		});

		it("returns the correct count for a tree with children", () => {
			const tree = new ValueTreeNode("root", [
				new ValueTreeNode("a", [new ValueTreeNode("a1"), new ValueTreeNode("a2")]),
				new ValueTreeNode("b"),
			]);
			assert.equal(tree.size, 5);
		});
	});
});
