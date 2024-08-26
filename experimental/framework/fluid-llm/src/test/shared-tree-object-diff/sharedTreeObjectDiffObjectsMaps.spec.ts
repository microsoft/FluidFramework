import { strict as assert } from "node:assert";

import { SchemaFactory } from "@fluidframework/tree";

import { sharedTreeObjectDiff } from "../../shared-tree-object-diff/index.js";

const schemaFactory = new SchemaFactory("TreeNodeTest");

describe("sharedTreeObjectDiff - Objects & Maps", () => {
	class SimpleObjectTreeNode extends schemaFactory.object("SimpleTreeNode", {
		test: schemaFactory.boolean,
	}) {}
	class SimpleMapTreeNode extends schemaFactory.map("SimpleMapTreeNode", [
		schemaFactory.boolean,
	]) {}

	it("new raw value", () => {
		const treeNode = new SimpleMapTreeNode({ test: true });
		assert.deepStrictEqual(
			sharedTreeObjectDiff(treeNode as unknown as Record<string, unknown>, {
				test: true,
				test2: true,
			}),
			[
				{
					type: "CREATE",
					path: ["test2"],
					value: true,
				},
			],
		);
	});

	it("change raw value", () => {
		const treeNode = new SimpleObjectTreeNode({ test: true });
		assert.deepStrictEqual(
			sharedTreeObjectDiff(treeNode as unknown as Record<string, unknown>, { test: false }),
			[
				{
					type: "CHANGE",
					path: ["test"],
					value: false,
					oldValue: true,
				},
			],
		);
	});

	it("remove raw value", () => {
		const treeMapNode = new SimpleMapTreeNode({ test: true, test2: true });
		const diffs = sharedTreeObjectDiff(treeMapNode as unknown as Record<string, unknown>, {
			test: true,
		});
		assert.deepStrictEqual(diffs, [
			{
				type: "REMOVE",
				path: ["test2"],
				oldValue: true,
			},
		]);
	});

	it("replace object with null", () => {
		class SimpleObjectTreeNode2 extends schemaFactory.map("SimpleMapTreeNode2", [
			SimpleObjectTreeNode,
			schemaFactory.null,
		]) {}
		const innerTreeNode = new SimpleObjectTreeNode({ test: true });
		const treeNode = new SimpleObjectTreeNode2({ object: innerTreeNode });
		const diffs = sharedTreeObjectDiff(treeNode as unknown as Record<string, unknown>, {
			object: null,
		});
		assert.deepStrictEqual(diffs, [
			{
				type: "CHANGE",
				path: ["object"],
				value: null,
				oldValue: innerTreeNode,
			},
		]);
	});

	it("replace object with other value", () => {
		class SimpleObjectTreeNode2 extends schemaFactory.map("SimpleMapTreeNode2", [
			SimpleObjectTreeNode,
			schemaFactory.string,
		]) {}
		const innerTreeNode = new SimpleObjectTreeNode({ test: true });
		const treeNode = new SimpleObjectTreeNode2({ object: innerTreeNode });
		const diffs = sharedTreeObjectDiff(treeNode as unknown as Record<string, unknown>, {
			object: "string",
		});
		assert.deepStrictEqual(diffs, [
			{
				type: "CHANGE",
				path: ["object"],
				value: "string",
				oldValue: innerTreeNode,
			},
		]);
	});
});
