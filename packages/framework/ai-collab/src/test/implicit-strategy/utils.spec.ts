/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { SchemaFactory } from "@fluidframework/tree";

import { sharedTreeTraverse } from "../../implicit-strategy/index.js";

const schemaFactory = new SchemaFactory("TreeTraversalTest");

describe("sharedTreeTraverse", () => {
	it("Simple Object Traversal", () => {
		class TreeNode extends schemaFactory.object("TreeNode", {
			test: schemaFactory.boolean,
		}) {}

		const treeNode = new TreeNode({ test: true });
		const path = ["test"];

		assert.strictEqual(
			sharedTreeTraverse(treeNode as unknown as Record<string, unknown>, path),
			true,
		);
	});

	it("Object With Nested Object Traversal", () => {
		class TreeNode extends schemaFactory.object("TreeNode", {
			nestedObj: schemaFactory.object("NestedObj", {
				nestedTest: schemaFactory.boolean,
			}),
		}) {}

		const treeNode = new TreeNode({ nestedObj: { nestedTest: true } });
		const path = ["nestedObj", "nestedTest"];

		assert.strictEqual(
			sharedTreeTraverse(treeNode as unknown as Record<string, unknown>, path),
			true,
		);
	});

	it("Object With Nested Array Traversal", () => {
		class TreeNode extends schemaFactory.object("TreeNode", {
			nestedArr: schemaFactory.array(schemaFactory.boolean),
		}) {}

		const treeNode = new TreeNode({ nestedArr: [true, false] });
		const path = ["nestedArr", 1];

		assert.strictEqual(
			sharedTreeTraverse(treeNode as unknown as Record<string, unknown>, path),
			false,
		);
	});

	it("Object With Nested Map Traversal", () => {
		class TreeNode extends schemaFactory.object("TreeNode", {
			nestedMap: schemaFactory.map("TreeMap", [schemaFactory.boolean]),
		}) {}

		const treeNode = new TreeNode({ nestedMap: { "key": true } });
		const path = ["nestedMap", "key"];

		assert.strictEqual(
			sharedTreeTraverse(treeNode as unknown as Record<string, unknown>, path),
			true,
		);
	});

	// --------------------------------------------------------

	it("Simple Map Traversal", () => {
		class TreeNode extends schemaFactory.map("TreeNode", [schemaFactory.boolean]) {}

		const treeNode = new TreeNode({ test: true });
		const path = ["test"];

		assert.strictEqual(
			sharedTreeTraverse(treeNode as unknown as Record<string, unknown>, path),
			true,
		);
	});

	it("Map With Nested Object Traversal", () => {
		class TreeNode extends schemaFactory.map("TreeNode", [
			schemaFactory.object("NestedObj", {
				nestedTest: schemaFactory.boolean,
			}),
		]) {}

		const treeNode = new TreeNode({ nestedObj: { nestedTest: true } });
		const path = ["nestedObj", "nestedTest"];

		assert.strictEqual(
			sharedTreeTraverse(treeNode as unknown as Record<string, unknown>, path),
			true,
		);
	});

	it("Map With Nested Array Traversal", () => {
		class TreeNode extends schemaFactory.map("TreeNode", [
			schemaFactory.array(schemaFactory.boolean),
		]) {}

		const treeNode = new TreeNode({ nestedArr: [true, false] });
		const path = ["nestedArr", 1];

		assert.strictEqual(
			sharedTreeTraverse(treeNode as unknown as Record<string, unknown>, path),
			false,
		);
	});

	it("Map With Nested Map Traversal", () => {
		class TreeNode extends schemaFactory.map("TreeNode", [
			schemaFactory.map("NestedMap", [schemaFactory.boolean]),
		]) {}

		const treeNode = new TreeNode({ nestedMap: { "key": true } });
		const path = ["nestedMap", "key"];

		assert.strictEqual(
			sharedTreeTraverse(treeNode as unknown as Record<string, unknown>, path),
			true,
		);
	});

	// --------------------------------------------------------

	it("Simple Array Traversal", () => {
		class TreeNode extends schemaFactory.array("Array", schemaFactory.boolean) {}

		const treeNode = new TreeNode([true]);
		const path = [0];

		assert.strictEqual(
			sharedTreeTraverse(treeNode as unknown as Record<string, unknown>, path),
			true,
		);
	});

	it("Array With Nested Object Traversal", () => {
		class TreeNode extends schemaFactory.array(
			"Array",
			schemaFactory.object("NestedObj", {
				nestedTest: schemaFactory.boolean,
			}),
		) {}

		const treeNode = new TreeNode([{ nestedTest: true }]);
		const path = [0, "nestedTest"];

		assert.strictEqual(
			sharedTreeTraverse(treeNode as unknown as Record<string, unknown>, path),
			true,
		);
	});

	it("Array With Nested Array Traversal", () => {
		class TreeNode extends schemaFactory.array(
			"Array",
			schemaFactory.array(schemaFactory.boolean),
		) {}

		const treeNode = new TreeNode([[true, false]]);
		const path = [0, 1];

		assert.strictEqual(
			sharedTreeTraverse(treeNode as unknown as Record<string, unknown>, path),
			false,
		);
	});

	it("Array With Nested Map Traversal", () => {
		class TreeNode extends schemaFactory.array(
			"Array",
			schemaFactory.map("NestedMap", [schemaFactory.boolean]),
		) {}

		const treeNode = new TreeNode([{ "key": true }]);
		const path = [0, "key"];

		assert.strictEqual(
			sharedTreeTraverse(treeNode as unknown as Record<string, unknown>, path),
			true,
		);
	});
});
