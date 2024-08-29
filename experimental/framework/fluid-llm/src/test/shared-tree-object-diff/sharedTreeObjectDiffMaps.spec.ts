import { strict as assert } from "node:assert";

import { SchemaFactory } from "@fluidframework/tree";

import { sharedTreeObjectDiff } from "../../shared-tree-object-diff/index.js";

const schemaFactory = new SchemaFactory("TreeNodeTest");

class TestMapTreeNode extends schemaFactory.map("TestMapTreeNode", [
	schemaFactory.string,
	schemaFactory.boolean,
	schemaFactory.number,
	schemaFactory.object("NestedObject", {
		requiredString: schemaFactory.string,
	}),
	schemaFactory.array("SimpleArrayTreeNode", [schemaFactory.string])
]) {}

describe("sharedTreeObjectDiff - Maps - Change Diffs", () => {

	const TEST_NODE_DATA = {
		attribute1: true,
		requiredBoolean: true,
		requiredString: "test",
		requiredNumber: 0,
		requiredObject: {
			requiredString: "test",
		}
	}

	it("change string primitive value", () => {
		const treeNode = new TestMapTreeNode({...TEST_NODE_DATA});
		assert.deepStrictEqual(
			sharedTreeObjectDiff(treeNode as unknown as Record<string, unknown>, {
			...treeNode,
			requiredString: "true",
		}),
			[
				{
					type: "CHANGE",
					path: ["requiredString"],
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
				requiredBoolean: false,
			}),
			[
				{
					type: "CHANGE",
					path: ["requiredBoolean"],
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
				requiredNumber: 1
			}),
			[
				{
					type: "CHANGE",
					path: ["requiredNumber"],
					oldValue: 0,
					value: 1,
				},
			]
		);
	});

	it("change nested object primitive value", () => {
		const treeNode = new TestMapTreeNode({...TEST_NODE_DATA, requiredObject: {
			requiredString: "test",
		}});

		const diffs = sharedTreeObjectDiff(treeNode as unknown as Record<string, unknown>, {
			...treeNode,
			requiredObject: {
				requiredString: "SomethingDifferent",
			}
		});

		assert.deepStrictEqual(
			diffs,
			[
				{
					type: "CHANGE",
					path: ["requiredObject", "requiredString"],
					oldValue: "test",
					value: "SomethingDifferent",
				},
			]
		);
	});
});
