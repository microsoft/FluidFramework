import { strict as assert } from "node:assert";

import { SchemaFactory } from "@fluidframework/tree";

import { sharedTreeObjectDiff } from "../../shared-tree-object-diff/index.js";

const schemaFactory = new SchemaFactory("TreeNodeTest");

class TestMapTreeNode extends schemaFactory.map("TestMapTreeNode", [
	schemaFactory.string,
	schemaFactory.boolean,
	schemaFactory.number,
	schemaFactory.object("NestedObject", {
		stringKey: schemaFactory.string,
	}),
	schemaFactory.array("SimpleArrayTreeNode", [schemaFactory.string])
]) {}

describe("sharedTreeObjectDiff - Maps - Change Diffs", () => {

	const TEST_NODE_DATA = {
		attribute1: true,
		booleanKey: true,
		stringKey: "test",
		numberKey: 0,
		objectKey: {
			stringKey: "test",
		}
	}

	it("change string primitive value", () => {
		const treeNode = new TestMapTreeNode({...TEST_NODE_DATA});
		assert.deepStrictEqual(
			sharedTreeObjectDiff(treeNode as unknown as Record<string, unknown>, {
			...treeNode,
			stringKey: "true",
		}),
			[
				{
					type: "CHANGE",
					path: ["stringKey"],
					oldValue: 'test',
					value: 'true',
				},
			]
		);
	});

	it("change boolean primitive value", () => {
		const treeNode = new TestMapTreeNode({...TEST_NODE_DATA});
		assert.deepStrictEqual(
			sharedTreeObjectDiff(treeNode as unknown as Record<string, unknown>, {
				...treeNode,
				booleanKey: false,
			}),
			[
				{
					type: "CHANGE",
					path: ["booleanKey"],
					oldValue: true,
					value: false,
				},
			]
		);
	});

	it("change number primitive value", () => {
		const treeNode = new TestMapTreeNode({...TEST_NODE_DATA});
		assert.deepStrictEqual(
			sharedTreeObjectDiff(treeNode as unknown as Record<string, unknown>, {
				...treeNode,
				numberKey: 1
			}),
			[
				{
					type: "CHANGE",
					path: ["numberKey"],
					oldValue: 0,
					value: 1,
				},
			]
		);
	});

	it("change nested object primitive value", () => {
		const treeNode = new TestMapTreeNode({...TEST_NODE_DATA, objectKey: {
			stringKey: "test",
		}});

		const diffs = sharedTreeObjectDiff(treeNode as unknown as Record<string, unknown>, {
			...treeNode,
			objectKey: {
				stringKey: "SomethingDifferent",
			}
		});

		assert.deepStrictEqual(
			diffs,
			[
				{
					type: "CHANGE",
					path: ["objectKey", "stringKey"],
					oldValue: "test",
					value: "SomethingDifferent",
				},
			]
		);
	});

	it("change array to undefined", () => {
		const treeNode = new TestMapTreeNode({ arrayKey: [] });
		assert.deepStrictEqual(
			sharedTreeObjectDiff(treeNode as unknown as Record<string, unknown>, {arrayKey: undefined}),
			[
				{
					type: "CHANGE",
					path: ["arrayKey"],
					oldValue: [],
					value: undefined,
				},
			]
		);
	});
});
