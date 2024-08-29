import { strict as assert } from "node:assert";

import { SchemaFactory } from "@fluidframework/tree";

import { sharedTreeObjectDiff } from "../../shared-tree-object-diff/index.js";

const schemaFactory = new SchemaFactory("TreeNodeTest");


class TestOptionalObjectTreeNode extends schemaFactory.object("OptionalTreeNode", {
	optionalBoolean: schemaFactory.optional(schemaFactory.boolean),
	optionalString: schemaFactory.optional(schemaFactory.string),
	optionalNumber: schemaFactory.optional(schemaFactory.number),
	optionalArray: schemaFactory.optional(schemaFactory.array("SimpleArrayTreeNode", [schemaFactory.string])),
	optionalObject: schemaFactory.optional(schemaFactory.object("NestedObject", {
		requiredString:  schemaFactory.string,
	})),
}) {}

class TestObjectTreeNode extends schemaFactory.object("TreeNode", {
	attribute1: schemaFactory.boolean,
	requiredBoolean: schemaFactory.boolean,
	requiredString:  schemaFactory.string,
	requiredNumber:  schemaFactory.number,
	requiredObject: schemaFactory.object("NestedObject", {
		requiredString:  schemaFactory.string,
	}),
}) {}

describe("sharedTreeObjectDiff - Object - Change Diffs", () => {

	const TEST_NODE_DATA = {
		attribute1: true,
		requiredBoolean: true,
		requiredString: "test",
		requiredNumber: 0,
		requiredObject: {
			requiredString: "test",
		}
	}

	it("change required string primitive value", () => {
		const treeNode = new TestObjectTreeNode({...TEST_NODE_DATA});
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

	it("change required boolean primitive value", () => {
		const treeNode = new TestObjectTreeNode({...TEST_NODE_DATA});
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

	it("change required number primitive value", () => {
		const treeNode = new TestObjectTreeNode({...TEST_NODE_DATA});
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

	it("change required nested object primitive value", () => {
		const treeNode = new TestObjectTreeNode({...TEST_NODE_DATA, requiredObject: {
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

	it("change optional boolean primitive to undefined", () => {
		const treeNode = new TestOptionalObjectTreeNode({ optionalBoolean: true });
		assert.deepStrictEqual(
			sharedTreeObjectDiff(treeNode as unknown as Record<string, unknown>, { optionalBoolean: undefined}),
			[
				{
					type: "CHANGE",
					path: ["optionalBoolean"],
					oldValue: true,
					value: undefined,
				},
			]
		);
	});

	it("change optional string primitive to undefined", () => {
		const treeNode = new TestOptionalObjectTreeNode({ optionalString: 'true' });
		assert.deepStrictEqual(
			sharedTreeObjectDiff(treeNode as unknown as Record<string, unknown>, {optionalString: undefined}),
			[
				{
					type: "CHANGE",
					path: ["optionalString"],
					oldValue: 'true',
					value: undefined,
				},
			]
		);
	});

	it("change optional number primitive to undefined", () => {
		const treeNode = new TestOptionalObjectTreeNode({ optionalNumber: 1 });
		assert.deepStrictEqual(
			sharedTreeObjectDiff(treeNode as unknown as Record<string, unknown>, {optionalNumber: undefined}),
			[
				{
					type: "CHANGE",
					path: ["optionalNumber"],
					oldValue: 1,
					value: undefined,
				},
			]
		);
	});

	it("change optional nested object to undefined", () => {
		const treeNode = new TestOptionalObjectTreeNode({ optionalObject: { requiredString: "test" } });
		assert.deepStrictEqual(
			sharedTreeObjectDiff(treeNode as unknown as Record<string, unknown>, {
				...treeNode,
				optionalObject: undefined,
			}),
			[
				{
					type: "CHANGE",
					path: ["optionalObject"],
					oldValue: { requiredString: "test" },
					value: undefined,
				},
			]
		);
	});
});

describe("sharedTreeObjectDiff - Object - Create Diffs", () => {
	it("new optional boolean primitive value", () => {
		const treeNode23 = new TestOptionalObjectTreeNode({  });
		const diffs = sharedTreeObjectDiff(treeNode23 as unknown as Record<string, unknown>,  {optionalBoolean: true});
		assert.deepStrictEqual(diffs,
			[
				{
					type: "CREATE",
					path: ["optionalBoolean"],
					value: true,
				},
			]
		);
	});

	it("new optional string primitive value", () => {
		const treeNode23 = new TestOptionalObjectTreeNode({  });
		const diffs = sharedTreeObjectDiff(treeNode23 as unknown as Record<string, unknown>,  {optionalString: 'true'});
		assert.deepStrictEqual(diffs,
			[
				{
					type: "CREATE",
					path: ["optionalString"],
					value: 'true',
				},
			]
		);
	});

	it("new optional boolean primitive value", () => {
		const treeNode23 = new TestOptionalObjectTreeNode({  });
		const diffs = sharedTreeObjectDiff(treeNode23 as unknown as Record<string, unknown>,  {optionalNumber: 1});
		assert.deepStrictEqual(diffs,
			[
				{
					type: "CREATE",
					path: ["optionalNumber"],
					value: 1,
				},
			]
		);
	});

	it("new optional array value", () => {
		const treeNode23 = new TestOptionalObjectTreeNode({  });
		const diffs = sharedTreeObjectDiff(treeNode23 as unknown as Record<string, unknown>,  {optionalArray: []});
		assert.deepStrictEqual(diffs,
			[
				{
					type: "CREATE",
					path: ["optionalArray"],
					value: [],
				},
			]
		);
	});
});
