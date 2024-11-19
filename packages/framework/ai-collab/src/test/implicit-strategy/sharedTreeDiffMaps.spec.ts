/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { SchemaFactory } from "@fluidframework/tree";

import { sharedTreeDiff } from "../../implicit-strategy/index.js";

const schemaFactory = new SchemaFactory("TreeNodeTest");

class TestMapTreeNode extends schemaFactory.map("TestMapTreeNode", [
	schemaFactory.string,
	schemaFactory.boolean,
	schemaFactory.number,
	schemaFactory.object("NestedObject", {
		stringKey: schemaFactory.string,
	}),
	schemaFactory.array("SimpleArrayTreeNode", [schemaFactory.string]),
]) {}

describe("sharedTreeDiff() - Maps - Change Diffs", () => {
	const TEST_NODE_DATA = {
		attribute1: true,
		booleanKey: true,
		stringKey: "test",
		numberKey: 0,
		objectKey: {
			stringKey: "test",
		},
	};

	it("change string primitive value", () => {
		const treeNode = new TestMapTreeNode({ ...TEST_NODE_DATA });
		assert.deepStrictEqual(
			sharedTreeDiff(treeNode as unknown as Record<string, unknown>, {
				...TEST_NODE_DATA, // we can't spread map entries from a TreeMapNode.
				stringKey: "true",
			}),
			[
				{
					type: "CHANGE",
					path: ["stringKey"],
					objectId: undefined,
					oldValue: "test",
					value: "true",
				},
			],
		);
	});

	it("change boolean primitive value", () => {
		const treeNode = new TestMapTreeNode({ ...TEST_NODE_DATA });
		assert.deepStrictEqual(
			sharedTreeDiff(treeNode as unknown as Record<string, unknown>, {
				...TEST_NODE_DATA,
				booleanKey: false,
			}),
			[
				{
					type: "CHANGE",
					path: ["booleanKey"],
					objectId: undefined,
					oldValue: true,
					value: false,
				},
			],
		);
	});

	it("change number primitive value", () => {
		const treeNode = new TestMapTreeNode({ ...TEST_NODE_DATA });
		assert.deepStrictEqual(
			sharedTreeDiff(treeNode as unknown as Record<string, unknown>, {
				...TEST_NODE_DATA,
				numberKey: 1,
			}),
			[
				{
					type: "CHANGE",
					path: ["numberKey"],
					objectId: undefined,
					oldValue: 0,
					value: 1,
				},
			],
		);
	});

	it("change nested object primitive value", () => {
		const treeNode = new TestMapTreeNode({
			...TEST_NODE_DATA,
			objectKey: {
				stringKey: "test",
			},
		});

		const diffs = sharedTreeDiff(treeNode as unknown as Record<string, unknown>, {
			...TEST_NODE_DATA,
			objectKey: {
				stringKey: "SomethingDifferent",
			},
		});

		assert.deepStrictEqual(diffs, [
			{
				type: "CHANGE",
				path: ["objectKey", "stringKey"],
				objectId: undefined,
				oldValue: "test",
				value: "SomethingDifferent",
			},
		]);
	});

	it("change array to undefined", () => {
		class ArrayNode extends schemaFactory.array("ArrayTreeNode", [schemaFactory.string]) {}
		class TestMapTreeNode2 extends schemaFactory.map("TestMapTreeNode", [ArrayNode]) {}
		const arrayNode = new ArrayNode([]);
		const treeNode = new TestMapTreeNode2({ arrayKey: arrayNode });
		assert.deepStrictEqual(
			sharedTreeDiff(treeNode as unknown as Record<string, unknown>, { arrayKey: undefined }),
			[
				{
					type: "CHANGE",
					path: ["arrayKey"],
					objectId: undefined,
					oldValue: arrayNode,
					value: undefined,
				},
			],
		);
	});
});
