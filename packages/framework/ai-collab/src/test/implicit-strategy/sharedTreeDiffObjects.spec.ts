/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { SchemaFactory } from "@fluidframework/tree";

import { sharedTreeDiff } from "../../implicit-strategy/index.js";

const schemaFactory = new SchemaFactory("TreeNodeTest");

class TestOptionalObjectTreeNode extends schemaFactory.object("OptionalTreeNode", {
	optionalBoolean: schemaFactory.optional(schemaFactory.boolean),
	optionalString: schemaFactory.optional(schemaFactory.string),
	optionalNumber: schemaFactory.optional(schemaFactory.number),
	optionalArray: schemaFactory.optional(
		schemaFactory.array("SimpleArrayTreeNode", [schemaFactory.string]),
	),
	optionalObject: schemaFactory.optional(
		schemaFactory.object("NestedObject", {
			requiredString: schemaFactory.string,
		}),
	),
}) {}

class TestObjectTreeNode extends schemaFactory.object("TreeNode", {
	attribute1: schemaFactory.boolean,
	requiredBoolean: schemaFactory.boolean,
	requiredString: schemaFactory.string,
	requiredNumber: schemaFactory.number,
	requiredObject: schemaFactory.object("NestedObject", {
		requiredString: schemaFactory.string,
	}),
}) {}

describe("sharedTreeDiff() - Object - Change Diffs", () => {
	const TEST_NODE_DATA = {
		attribute1: true,
		requiredBoolean: true,
		requiredString: "test",
		requiredNumber: 0,
		requiredObject: {
			requiredString: "test",
		},
	};

	it("change required string primitive value", () => {
		const treeNode = new TestObjectTreeNode({ ...TEST_NODE_DATA });
		assert.deepStrictEqual(
			sharedTreeDiff(treeNode as unknown as Record<string, unknown>, {
				...treeNode,
				requiredString: "true",
			}),
			[
				{
					type: "CHANGE",
					path: ["requiredString"],
					objectId: undefined,
					oldValue: "test",
					value: "true",
				},
			],
		);
	});

	it("change required boolean primitive value", () => {
		const treeNode = new TestObjectTreeNode({ ...TEST_NODE_DATA });
		assert.deepStrictEqual(
			sharedTreeDiff(treeNode as unknown as Record<string, unknown>, {
				...treeNode,
				requiredBoolean: false,
			}),
			[
				{
					type: "CHANGE",
					path: ["requiredBoolean"],
					objectId: undefined,
					oldValue: true,
					value: false,
				},
			],
		);
	});

	it("change required number primitive value", () => {
		const treeNode = new TestObjectTreeNode({ ...TEST_NODE_DATA });
		assert.deepStrictEqual(
			sharedTreeDiff(treeNode as unknown as Record<string, unknown>, {
				...treeNode,
				requiredNumber: 1,
			}),
			[
				{
					type: "CHANGE",
					path: ["requiredNumber"],
					objectId: undefined,
					oldValue: 0,
					value: 1,
				},
			],
		);
	});

	it("change required nested object primitive value", () => {
		const treeNode = new TestObjectTreeNode({
			...TEST_NODE_DATA,
			requiredObject: {
				requiredString: "test",
			},
		});

		const diffs = sharedTreeDiff(treeNode as unknown as Record<string, unknown>, {
			...treeNode,
			requiredObject: {
				requiredString: "SomethingDifferent",
			},
		});

		assert.deepStrictEqual(diffs, [
			{
				type: "CHANGE",
				path: ["requiredObject", "requiredString"],
				objectId: undefined,
				oldValue: "test",
				value: "SomethingDifferent",
			},
		]);
	});

	it("change optional boolean primitive to undefined", () => {
		const treeNode = new TestOptionalObjectTreeNode({ optionalBoolean: true });
		assert.deepStrictEqual(
			sharedTreeDiff(treeNode as unknown as Record<string, unknown>, {
				optionalBoolean: undefined,
			}),
			[
				{
					type: "CHANGE",
					path: ["optionalBoolean"],
					objectId: undefined,
					oldValue: true,
					value: undefined,
				},
			],
		);
	});

	it("change optional string primitive to undefined", () => {
		const treeNode = new TestOptionalObjectTreeNode({ optionalString: "true" });
		assert.deepStrictEqual(
			sharedTreeDiff(treeNode as unknown as Record<string, unknown>, {
				optionalString: undefined,
			}),
			[
				{
					type: "CHANGE",
					path: ["optionalString"],
					objectId: undefined,
					oldValue: "true",
					value: undefined,
				},
			],
		);
	});

	it("change optional number primitive to undefined", () => {
		const treeNode = new TestOptionalObjectTreeNode({ optionalNumber: 1 });
		assert.deepStrictEqual(
			sharedTreeDiff(treeNode as unknown as Record<string, unknown>, {
				optionalNumber: undefined,
			}),
			[
				{
					type: "CHANGE",
					path: ["optionalNumber"],
					objectId: undefined,
					oldValue: 1,
					value: undefined,
				},
			],
		);
	});

	it("change optional nested object to undefined", () => {
		const treeNode = new TestOptionalObjectTreeNode({
			optionalObject: { requiredString: "test" },
		});
		assert.deepStrictEqual(
			sharedTreeDiff(treeNode as unknown as Record<string, unknown>, {
				...treeNode,
				optionalObject: undefined,
			}),
			[
				{
					type: "CHANGE",
					path: ["optionalObject"],
					objectId: undefined,
					oldValue: { requiredString: "test" },
					value: undefined,
				},
			],
		);
	});

	it("change optional array to undefined", () => {
		class ArrayNode extends schemaFactory.array("ArrayTreeNode", [schemaFactory.string]) {}
		class TestOptionalObjectTreeNode2 extends schemaFactory.object("OptionalTreeNode2", {
			optionalArray: schemaFactory.optional(ArrayNode),
		}) {}
		const arrayNode = new ArrayNode([]);
		const treeNode = new TestOptionalObjectTreeNode2({ optionalArray: arrayNode });
		assert.deepStrictEqual(
			sharedTreeDiff(treeNode as unknown as Record<string, unknown>, {
				optionalArray: undefined,
			}),
			[
				{
					type: "CHANGE",
					path: ["optionalArray"],
					objectId: undefined,
					oldValue: arrayNode,
					value: undefined,
				},
			],
		);
	});
});

describe("sharedTreeDiff() - Object - Create Diffs", () => {
	it("new optional boolean primitive value", () => {
		const treeNode = new TestOptionalObjectTreeNode({});
		const diffs = sharedTreeDiff(treeNode as unknown as Record<string, unknown>, {
			optionalBoolean: true,
		});
		assert.deepStrictEqual(diffs, [
			{
				type: "CREATE",
				path: ["optionalBoolean"],
				value: true,
			},
		]);
	});

	it("new optional string primitive value", () => {
		const treeNode = new TestOptionalObjectTreeNode({});
		const diffs = sharedTreeDiff(treeNode as unknown as Record<string, unknown>, {
			optionalString: "true",
		});
		assert.deepStrictEqual(diffs, [
			{
				type: "CREATE",
				path: ["optionalString"],
				value: "true",
			},
		]);
	});

	it("new optional boolean primitive value", () => {
		const treeNode = new TestOptionalObjectTreeNode({});
		const diffs = sharedTreeDiff(treeNode as unknown as Record<string, unknown>, {
			optionalNumber: 1,
		});
		assert.deepStrictEqual(diffs, [
			{
				type: "CREATE",
				path: ["optionalNumber"],
				value: 1,
			},
		]);
	});

	it("new optional array value", () => {
		const treeNode = new TestOptionalObjectTreeNode({});
		const diffs = sharedTreeDiff(treeNode as unknown as Record<string, unknown>, {
			optionalArray: [],
		});
		assert.deepStrictEqual(diffs, [
			{
				type: "CREATE",
				path: ["optionalArray"],
				value: [],
			},
		]);
	});

	it("new optional object value", () => {
		const treeNode = new TestOptionalObjectTreeNode({});
		const diffs = sharedTreeDiff(treeNode as unknown as Record<string, unknown>, {
			optionalObject: { requiredString: "test" },
		});
		assert.deepStrictEqual(diffs, [
			{
				type: "CREATE",
				path: ["optionalObject"],
				value: { requiredString: "test" },
			},
		]);
	});
});

describe("sharedTreeDiff() - Object - Remove Diffs", () => {
	it("remove optional boolean primitive value", () => {
		const treeNode = new TestOptionalObjectTreeNode({ optionalBoolean: true });
		const diffs = sharedTreeDiff(treeNode as unknown as Record<string, unknown>, {});
		assert.deepStrictEqual(diffs, [
			{
				type: "REMOVE",
				objectId: undefined,
				path: ["optionalBoolean"],
				oldValue: true,
			},
		]);
	});

	it("remove optional string primitive value", () => {
		const treeNode = new TestOptionalObjectTreeNode({ optionalString: "true" });
		const diffs = sharedTreeDiff(treeNode as unknown as Record<string, unknown>, {});
		assert.deepStrictEqual(diffs, [
			{
				type: "REMOVE",
				path: ["optionalString"],
				objectId: undefined,
				oldValue: "true",
			},
		]);
	});

	it("remove optional number primitive value", () => {
		const treeNode = new TestOptionalObjectTreeNode({ optionalNumber: 1 });
		const diffs = sharedTreeDiff(treeNode as unknown as Record<string, unknown>, {});
		assert.deepStrictEqual(diffs, [
			{
				type: "REMOVE",
				path: ["optionalNumber"],
				objectId: undefined,
				oldValue: 1,
			},
		]);
	});

	it("remove optional array value", () => {
		class ArrayNode extends schemaFactory.array("ArrayTreeNode", [schemaFactory.string]) {}
		class TestOptionalObjectTreeNode2 extends schemaFactory.object("OptionalTreeNode2", {
			optionalArray: schemaFactory.optional(ArrayNode),
		}) {}
		const arrayNode = new ArrayNode([]);
		const treeNode = new TestOptionalObjectTreeNode2({ optionalArray: arrayNode });
		const diffs = sharedTreeDiff(treeNode as unknown as Record<string, unknown>, {});
		assert.deepStrictEqual(diffs, [
			{
				type: "REMOVE",
				path: ["optionalArray"],
				objectId: undefined,
				oldValue: arrayNode,
			},
		]);
	});

	it("remove optional object value", () => {
		const treeNode = new TestOptionalObjectTreeNode({
			optionalObject: { requiredString: "test" },
		});
		const diffs = sharedTreeDiff(treeNode as unknown as Record<string, unknown>, {});
		assert.deepStrictEqual(diffs, [
			{
				type: "REMOVE",
				path: ["optionalObject"],
				objectId: undefined,
				oldValue: { requiredString: "test" },
			},
		]);
	});
});
