/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { SchemaFactory } from "@fluidframework/tree";

import { createMergableIdDiffSeries, sharedTreeDiff } from "../../implicit-strategy/index.js";

const schemaFactory = new SchemaFactory("TreeNodeTest");

describe("sharedTreeDiff() - arrays", () => {
	class StringArrayNode extends schemaFactory.array(
		"StringTreeArrayNode",
		schemaFactory.string,
	) {}

	it("top level array & array diff", () => {
		const treeNode = new StringArrayNode(["test", "testing"]);
		const diffs = sharedTreeDiff(treeNode as unknown as unknown[], ["test"]);
		assert.deepStrictEqual(diffs, [
			{
				type: "REMOVE",
				path: [1],
				objectId: undefined,
				oldValue: "testing",
			},
		]);
	});

	it("nested array", () => {
		class NestedStringArrayNode extends schemaFactory.array("NestedStringTreeArrayNode", [
			schemaFactory.string,
			StringArrayNode,
		]) {}
		const treeNode = new NestedStringArrayNode(["test", ["test"]]);
		assert.deepStrictEqual(
			sharedTreeDiff(treeNode as unknown as unknown[], ["test", ["test", "test2"]]),
			[
				{
					type: "CREATE",
					path: [1, 1],
					value: "test2",
				},
			],
		);
	});

	it("array in object change", () => {
		class SimpleObjectTreeNode extends schemaFactory.object("SimpleTreeNode", {
			test: schemaFactory.boolean,
		}) {}
		class ObjectTreeNode extends schemaFactory.object("ObjectTreeNode", {
			state: schemaFactory.array("NestedStringTreeArrayNode", [
				schemaFactory.string,
				SimpleObjectTreeNode,
			]),
		}) {}
		const treeNode = new ObjectTreeNode({
			state: ["test", new SimpleObjectTreeNode({ test: true })],
		});
		const diffs = sharedTreeDiff(treeNode as unknown as Record<string, unknown>, {
			state: ["test", { test: false }],
		});

		assert.deepStrictEqual(diffs, [
			{
				type: "CHANGE",
				path: ["state", 1, "test"],
				objectId: undefined,
				value: false,
				oldValue: true,
			},
		]);
	});

	it("array to object", () => {
		assert.deepStrictEqual(sharedTreeDiff({ data: [] }, { data: { val: "test" } }), [
			{
				type: "CHANGE",
				path: ["data"],
				objectId: undefined,
				value: { val: "test" },
				oldValue: [],
			},
		]);
	});
});

describe("sharedTreeDiff() - arrays with object ID strategy", () => {
	class SimpleObjectTreeNode extends schemaFactory.object("SimpleTreeNode", {
		id: schemaFactory.identifier,
		test: schemaFactory.boolean,
	}) {}
	class ObjectTreeNode extends schemaFactory.object("ObjectTreeNode", {
		state: schemaFactory.array("NestedStringTreeArrayNode", [
			schemaFactory.string,
			SimpleObjectTreeNode,
		]),
	}) {}

	it("object with id is moved from a new deleted array index", () => {
		const treeNode = new ObjectTreeNode({ state: ["test", { id: "1", test: true }] });
		const diffs = sharedTreeDiff(
			treeNode as unknown as Record<string, unknown>,
			{ state: [{ id: "1", test: true }] },
			{
				cyclesFix: true,
				useObjectIds: {
					idAttributeName: "id",
				},
			},
		);

		assert.deepStrictEqual(diffs, [
			{
				type: "CHANGE",
				path: ["state", 0],
				objectId: undefined,
				value: { id: "1", test: true },
				oldValue: "test",
			},
			{
				type: "MOVE",
				path: ["state", 1],
				objectId: (treeNode.state[1] as SimpleObjectTreeNode).id,
				newIndex: 0,
				value: treeNode.state[1],
			},
		]);
	});

	it("objects with id swap array indexes", () => {
		const treeNode = new ObjectTreeNode({
			state: [
				{ id: "1", test: true },
				{ id: "2", test: true },
			],
		});
		const diffs = sharedTreeDiff(
			treeNode as unknown as Record<string, unknown>,
			{
				state: [
					{ id: "2", test: true },
					{ id: "1", test: true },
				],
			},
			{
				cyclesFix: true,
				useObjectIds: {
					idAttributeName: "id",
				},
			},
		);
		assert.deepStrictEqual(diffs, [
			{
				type: "MOVE",
				path: ["state", 0],
				objectId: (treeNode.state[0] as SimpleObjectTreeNode).id,
				value: treeNode.state[0],
				newIndex: 1,
			},
			{
				type: "MOVE",
				path: ["state", 1],
				objectId: (treeNode.state[1] as SimpleObjectTreeNode).id,
				value: treeNode.state[1],
				newIndex: 0,
			},
		]);
	});

	it("Preexisting objects with id is swapped to an array index with a new object", () => {
		const treeNode = new ObjectTreeNode({
			state: [
				{ id: "1", test: true },
				{ id: "2", test: true },
			],
		});
		const diffs = sharedTreeDiff(
			treeNode as unknown as Record<string, unknown>,
			{
				state: [
					{ id: "3", test: true },
					{ id: "1", test: true },
				],
			},
			{
				cyclesFix: true,
				useObjectIds: {
					idAttributeName: "id",
				},
			},
		);

		assert.deepStrictEqual(diffs, [
			{
				type: "MOVE",
				path: ["state", 0],
				objectId: (treeNode.state[0] as SimpleObjectTreeNode).id,
				value: treeNode.state[0],
				newIndex: 1,
			},
			{
				type: "REMOVE",
				path: ["state", 1],
				objectId: (treeNode.state[1] as SimpleObjectTreeNode).id,
				oldValue: treeNode.state[1],
			},
			{
				type: "CREATE",
				path: ["state", 0],
				value: { id: "3", test: true },
			},
		]);
	});

	it("Preexisting objects with id is changed and swapped to an array index with a new object", () => {
		const treeNode = new ObjectTreeNode({
			state: [
				{ id: "1", test: true },
				{ id: "2", test: true },
			],
		});
		const diffs = sharedTreeDiff(
			treeNode as unknown as Record<string, unknown>,
			{
				state: [
					{ id: "3", test: true },
					{ id: "1", test: false },
				],
			},
			{
				cyclesFix: true,
				useObjectIds: {
					idAttributeName: "id",
				},
			},
		);

		assert.deepStrictEqual(diffs, [
			{
				type: "MOVE",
				path: ["state", 0],
				objectId: (treeNode.state[0] as SimpleObjectTreeNode).id,
				value: treeNode.state[0],
				newIndex: 1,
			},
			{
				type: "CHANGE",
				path: ["state", 0, "test"],
				objectId: (treeNode.state[0] as SimpleObjectTreeNode).id,
				oldValue: true,
				value: false,
			},
			{
				type: "REMOVE",
				path: ["state", 1],
				objectId: (treeNode.state[1] as SimpleObjectTreeNode).id,
				oldValue: treeNode.state[1],
			},
			{
				type: "CREATE",
				path: ["state", 0],
				value: { id: "3", test: true },
			},
		]);
	});

	it("objects with id swap array indexes", () => {
		const treeNode = new ObjectTreeNode({
			state: [
				{ id: "1", test: true },
				{ id: "2", test: true },
			],
		});
		const diffs = sharedTreeDiff(
			treeNode as unknown as Record<string, unknown>,
			{
				state: [
					{ id: "2", test: false },
					{ id: "1", test: true },
				],
			},
			{
				cyclesFix: true,
				useObjectIds: {
					idAttributeName: "id",
				},
			},
		);

		assert.deepStrictEqual(diffs, [
			{
				type: "MOVE",
				path: ["state", 0],
				objectId: (treeNode.state[0] as SimpleObjectTreeNode).id,
				value: treeNode.state[0],
				newIndex: 1,
			},
			{
				type: "MOVE",
				path: ["state", 1],
				objectId: (treeNode.state[1] as SimpleObjectTreeNode).id,
				value: treeNode.state[1],
				newIndex: 0,
			},
			{
				type: "CHANGE",
				path: ["state", 1, "test"],
				objectId: (treeNode.state[1] as SimpleObjectTreeNode).id,
				oldValue: true,
				value: false,
			},
		]);
	});
});

describe("createMergableIdDiffSeries()", () => {
	class SimpleObjectTreeNode extends schemaFactory.object("SimpleTreeNode", {
		id: schemaFactory.identifier,
		test: schemaFactory.boolean,
	}) {}
	class ObjectTreeNode extends schemaFactory.object("ObjectTreeNode", {
		state: schemaFactory.array("NestedStringTreeArrayNode", [
			schemaFactory.string,
			SimpleObjectTreeNode,
		]),
	}) {}

	it("Edge case 0: Remove unecessary move diff due to a swap", () => {
		const treeNode = new ObjectTreeNode({
			state: [
				{ id: "1", test: true },
				{ id: "2", test: true },
			],
		});

		const llmResponse = {
			state: [
				{ id: "2", test: true },
				{ id: "1", test: true },
			],
		};

		const diffs = sharedTreeDiff(treeNode as unknown as Record<string, unknown>, llmResponse, {
			cyclesFix: true,
			useObjectIds: {
				idAttributeName: "id",
			},
		});

		assert.deepStrictEqual(diffs, [
			{
				// good [1, 2] -> [2, 1]
				type: "MOVE",
				path: ["state", 0],
				objectId: (treeNode.state[0] as SimpleObjectTreeNode).id,
				value: treeNode.state[0],
				newIndex: 1,
			},
			{
				// should be removed, as it is redundant due to a swap.
				type: "MOVE",
				path: ["state", 1],
				objectId: (treeNode.state[1] as SimpleObjectTreeNode).id,
				value: treeNode.state[1],
				newIndex: 0,
			},
		]);

		const cleanedDiffs = createMergableIdDiffSeries(treeNode, diffs, "id");
		assert.deepStrictEqual(cleanedDiffs, [
			{
				type: "MOVE",
				path: ["state", 0],
				objectId: (treeNode.state[0] as SimpleObjectTreeNode).id,
				value: treeNode.state[0],
				newIndex: 1,
			},
		]);
	});

	it("Edge case 1: Remove unecessary move diff move when a deletion places an object at the right index", () => {
		const treeNode = new ObjectTreeNode({
			state: [
				{ id: "1", test: true },
				{ id: "2", test: true },
			],
		});

		const llmResponse = {
			state: [{ id: "2", test: true }],
		};

		const expectedDiffs = [
			{
				// good [1, 2,] -> [2]
				type: "REMOVE",
				path: ["state", 0],
				objectId: (treeNode.state[0] as SimpleObjectTreeNode).id,
				oldValue: treeNode.state[0],
			},
			{
				// Should be removed, 2 will be in the right position after the removal of 1
				type: "MOVE",
				path: ["state", 1],
				objectId: (treeNode.state[1] as SimpleObjectTreeNode).id,
				newIndex: 0,
				value: treeNode.state[1],
			},
		];

		const diffs = sharedTreeDiff(treeNode as unknown as Record<string, unknown>, llmResponse, {
			cyclesFix: true,
			useObjectIds: {
				idAttributeName: "id",
			},
		});

		assert.deepStrictEqual(diffs, expectedDiffs);

		const minimalDiffs = createMergableIdDiffSeries(treeNode, diffs, "id");

		assert.deepStrictEqual(minimalDiffs, [
			{
				// [1, 2] -> [2]
				type: "REMOVE",
				path: ["state", 0],
				objectId: (treeNode.state[0] as SimpleObjectTreeNode).id,
				oldValue: treeNode.state[0],
			},
		]);
	});

	it("Edge case 2: A 'REMOVE' diff causes shiting of other diffs backwards", () => {
		const treeNode = new ObjectTreeNode({
			state: [
				{ id: "1", test: true },
				{ id: "2", test: true },
				{ id: "3", test: true },
				{ id: "4", test: true },
			],
		});

		const llmResponse = {
			state: [
				{ id: "1", test: true },
				{ id: "2", test: true },
				{ id: "6", test: true },
				{ id: "5", test: true },
				{ id: "4", test: true },
			],
		};

		const diffs = sharedTreeDiff(treeNode as unknown as Record<string, unknown>, llmResponse, {
			cyclesFix: true,
			useObjectIds: {
				idAttributeName: "id",
			},
		});

		assert.deepStrictEqual(diffs, [
			{
				type: "REMOVE",
				path: ["state", 2],
				objectId: (treeNode.state[2] as SimpleObjectTreeNode).id,
				oldValue: treeNode.state[2],
			},
			{
				// expected to have the path index shifted back due to prior remove.
				type: "MOVE",
				path: ["state", 3],
				objectId: (treeNode.state[3] as SimpleObjectTreeNode).id,
				newIndex: 4,
				value: treeNode.state[3],
			},
			{
				type: "CREATE",
				path: ["state", 2],
				value: { id: "6", test: true },
			},
			{
				type: "CREATE",
				path: ["state", 3],
				value: { id: "5", test: true },
			},
			{
				// expected to be removed TODO: Potential bug - Why does this diff even get created?
				type: "MOVE",
				path: ["state", 4],
				objectId: "4",
				newIndex: 4,
				value: { id: "4", test: true },
			},
		]);

		const minimalDiffs = createMergableIdDiffSeries(treeNode, diffs, "id");

		assert.deepStrictEqual(minimalDiffs, [
			{
				// [1, 2, 3, 4] -> [1, 2, 4]
				type: "REMOVE",
				path: ["state", 2],
				objectId: (treeNode.state[2] as SimpleObjectTreeNode).id,
				oldValue: treeNode.state[2],
			},
			{
				// [1, 2, 4] -> [1, 2, 4, 6]
				type: "CREATE",
				path: ["state", 2],
				value: { id: "6", test: true },
			},
			{
				// [1, 2, 4, 6] -> [1, 2, 4, 6, 5]
				type: "CREATE",
				path: ["state", 3],
				value: { id: "5", test: true },
			},
			{
				// [1, 2, 4, 6, 5] -> [1, 2, 4, 6, 5, 4]
				type: "MOVE",
				path: ["state", 2], // Note the index was shifted back because of the prior remove
				objectId: (treeNode.state[3] as SimpleObjectTreeNode).id,
				newIndex: 4,
				value: treeNode.state[3],
			},
		]);
	});

	it("Edge case 3: A 'MOVE' diff causes shifting of other diffs backwards", () => {
		const treeNode = new ObjectTreeNode({
			state: [
				{ id: "1", test: true },
				{ id: "2", test: true },
				{ id: "3", test: true },
				{ id: "4", test: true },
			],
		});

		const llmResponse = {
			state: [
				{ id: "2", test: true },
				{ id: "4", test: true },
				{ id: "1", test: true },
				{ id: "3", test: true },
			],
		};

		const diffs = sharedTreeDiff(treeNode as unknown as Record<string, unknown>, llmResponse, {
			cyclesFix: true,
			useObjectIds: {
				idAttributeName: "id",
			},
		});

		assert.deepStrictEqual(diffs, [
			{
				type: "MOVE",
				path: ["state", 0],
				objectId: (treeNode.state[0] as SimpleObjectTreeNode).id,
				newIndex: 2,
				value: treeNode.state[0],
			},
			{
				type: "MOVE",
				path: ["state", 1],
				objectId: (treeNode.state[1] as SimpleObjectTreeNode).id,
				newIndex: 0,
				value: treeNode.state[1],
			},
			{
				type: "MOVE",
				path: ["state", 2],
				objectId: (treeNode.state[2] as SimpleObjectTreeNode).id,
				newIndex: 3,
				value: treeNode.state[2],
			},
			{
				type: "MOVE",
				path: ["state", 3],
				objectId: (treeNode.state[3] as SimpleObjectTreeNode).id,
				newIndex: 1,
				value: treeNode.state[3],
			},
		]);

		const minimalDiffs = createMergableIdDiffSeries(treeNode, diffs, "id");

		assert.deepStrictEqual(minimalDiffs, [
			{
				//                  |--|
				// [1, 2, 3, 4] -> [2, 3, 1, 4]
				// obj at index 0 moves to index 2 so move everything it jumped over, back
				type: "MOVE",
				path: ["state", 0],
				objectId: (treeNode.state[0] as SimpleObjectTreeNode).id,
				newIndex: 2,
				value: treeNode.state[0],
			},
			{
				//                     |--|
				// [2, 3, 1, 4] -> [2, 1, 4, 3]
				// obj at index 1 moves to index 3, so move everything < index 3 back. (only applies to index moved over)
				type: "MOVE",
				path: ["state", 1], // source index shifted backwards
				objectId: (treeNode.state[2] as SimpleObjectTreeNode).id,
				newIndex: 3,
				value: treeNode.state[2],
			},
			{
				// [2, 1, 4, 3] -> [2, 4, 1, 3]
				type: "MOVE",
				path: ["state", 2], // source index shifted backwards
				objectId: (treeNode.state[3] as SimpleObjectTreeNode).id,
				newIndex: 1,
				value: treeNode.state[3], // keep in mind we are referencing node locations for eqaulity prior to the moves
			},
		]);
	});

	it("Edge case Z: (TODO) A 'MOVE' diff causes shifting of other diffs forwards", () => {
		// having a hard time figuring out a good test case for this.
	});

	it("Edge case 4: All 'CHANGE' diffs are ordered first before any other diff", () => {
		const treeNode = new ObjectTreeNode({
			state: [
				{ id: "1", test: true },
				{ id: "2", test: true },
				{ id: "3", test: true },
				{ id: "4", test: true },
			],
		});

		const llmResponse = {
			state: [
				{ id: "2", test: true },
				{ id: "4", test: false },
				{ id: "1", test: false },
				{ id: "3", test: true },
			],
		};

		const diffs = sharedTreeDiff(treeNode as unknown as Record<string, unknown>, llmResponse, {
			cyclesFix: true,
			useObjectIds: {
				idAttributeName: "id",
			},
		});

		assert.deepStrictEqual(diffs, [
			{
				type: "MOVE",
				path: ["state", 0],
				objectId: (treeNode.state[0] as SimpleObjectTreeNode).id,
				newIndex: 2,
				value: treeNode.state[0],
			},
			{
				// expected to be reordered to the beginning.
				path: ["state", 0, "test"],
				objectId: (treeNode.state[0] as SimpleObjectTreeNode).id,
				type: "CHANGE",
				value: false,
				oldValue: true,
			},
			{
				// expected to be removed due to other moves placing this in the correct pos.
				type: "MOVE",
				path: ["state", 1],
				objectId: (treeNode.state[1] as SimpleObjectTreeNode).id,
				newIndex: 0,
				value: treeNode.state[1],
			},
			{
				type: "MOVE",
				path: ["state", 2],
				objectId: (treeNode.state[2] as SimpleObjectTreeNode).id,
				newIndex: 3,
				value: treeNode.state[2],
			},
			{
				type: "MOVE",
				path: ["state", 3],
				objectId: (treeNode.state[3] as SimpleObjectTreeNode).id,
				newIndex: 1,
				value: treeNode.state[3],
			},
			{
				// expected to be reordered to the beginning.
				path: ["state", 3, "test"],
				objectId: (treeNode.state[3] as SimpleObjectTreeNode).id,
				type: "CHANGE",
				value: false,
				oldValue: true,
			},
		]);

		const minimalDiffs = createMergableIdDiffSeries(treeNode, diffs, "id");

		assert.deepStrictEqual(minimalDiffs, [
			{
				// reordered to the beginning
				path: ["state", 0, "test"],
				objectId: (treeNode.state[0] as SimpleObjectTreeNode).id,
				type: "CHANGE",
				value: false,
				oldValue: true,
			},
			{
				// reordered to the beginning
				path: ["state", 3, "test"],
				objectId: (treeNode.state[3] as SimpleObjectTreeNode).id,
				type: "CHANGE",
				value: false,
				oldValue: true,
			},
			{
				// [1, 2, 3, 4] -> [2, 3, 1, 4]
				type: "MOVE",
				path: ["state", 0],
				objectId: (treeNode.state[0] as SimpleObjectTreeNode).id,
				newIndex: 2,
				value: treeNode.state[0],
			},
			{
				// [2, 3, 1, 4] -> [2, 1, 4, 3]
				type: "MOVE",
				path: ["state", 1],
				objectId: (treeNode.state[2] as SimpleObjectTreeNode).id,
				newIndex: 3,
				value: treeNode.state[2],
			},
			{
				// [2, 1, 4, 3] -> [2, 4, 1, 3]
				type: "MOVE",
				path: ["state", 2],
				objectId: (treeNode.state[3] as SimpleObjectTreeNode).id,
				newIndex: 1,
				value: treeNode.state[3],
			},
		]);
	});

	it("Edge case 5: Reorder early move to index that doesn't exist & dependent on CREATE diffs so the index is valid.", () => {
		const treeNode = new ObjectTreeNode({
			state: [
				{ id: "1", test: true },
				{ id: "4", test: true },
			],
		});

		const llmResponse = {
			state: [
				{ id: "1", test: true },
				{ id: "6", test: true },
				{ id: "5", test: true },
				{ id: "4", test: true },
			],
		};

		const diffs = sharedTreeDiff(treeNode as unknown as Record<string, unknown>, llmResponse, {
			cyclesFix: true,
			useObjectIds: {
				idAttributeName: "id",
			},
		});

		assert.deepStrictEqual(diffs, [
			{
				// expected to be reordered to to the end of the array.
				type: "MOVE",
				path: ["state", 1],
				objectId: (treeNode.state[1] as SimpleObjectTreeNode).id,
				newIndex: 3,
				value: treeNode.state[1],
			},
			{
				type: "CREATE",
				path: ["state", 1],
				value: { id: "6", test: true },
			},
			{
				type: "CREATE",
				path: ["state", 2],
				value: { id: "5", test: true },
			},
			{
				// Expected to be removed TODO: Potential BUG - Why does this diff even get created?
				type: "MOVE",
				path: ["state", 3],
				objectId: "4",
				newIndex: 3,
				value: { id: "4", test: true }, // also records this value as pojo instead of the tree node?
			},
		]);

		const minimalDiffs = createMergableIdDiffSeries(treeNode, diffs, "id");

		assert.deepStrictEqual(minimalDiffs, [
			{
				// [1, 4] -> [1, 4, 6]
				type: "CREATE",
				path: ["state", 1],
				value: { id: "6", test: true },
			},
			{
				// [1, 4, 6] -> [1, 4, 6, 5]
				type: "CREATE",
				path: ["state", 2],
				value: { id: "5", test: true },
			},
			{
				// [1, 4, 6, 5] -> [1, 6, 5, 4]
				type: "MOVE",
				path: ["state", 1],
				objectId: (treeNode.state[1] as SimpleObjectTreeNode).id,
				newIndex: 3,
				value: treeNode.state[1],
			},
		]);
	});

	it("Edge case 6: handle edge cases across multiple arrays within an object", () => {
		class SimpleObjectTreeNodeWithObjectArray extends schemaFactory.object(
			"SimpleObjectTreeNodeWithObjectArray",
			{
				id: schemaFactory.identifier,
				innerArray: schemaFactory.array("NestedStringTreeArrayNode1", [SimpleObjectTreeNode]),
			},
		) {}
		class ComplexObjectTreeNode extends schemaFactory.object("ComplexObjectTreeNode", {
			state: schemaFactory.array("NestedStringTreeArrayNode2", [
				SimpleObjectTreeNodeWithObjectArray,
			]),
			stateArrayTwo: schemaFactory.array("NestedStringTreeArrayNode3", [
				SimpleObjectTreeNodeWithObjectArray,
			]),
		}) {}

		const treeNode = new ComplexObjectTreeNode({
			state: [
				{
					id: "1",
					innerArray: [
						{ id: "2", test: true },
						{ id: "3", test: true },
					],
				},
				{
					id: "2",
					innerArray: [
						{ id: "2", test: true },
						{ id: "3", test: true },
					],
				},
				{
					id: "3",
					innerArray: [
						{ id: "2", test: true },
						{ id: "3", test: true },
					],
				},
			],
			stateArrayTwo: [
				{
					id: "6",
					innerArray: [
						{ id: "7", test: true },
						{ id: "8", test: true },
					],
				},
			],
		});

		const llmResponse = {
			state: [
				{
					id: "2",
					innerArray: [
						{ id: "2", test: true },
						{ id: "3", test: true },
					],
				},
				{
					// Swapped 0 & 1
					id: "1",
					innerArray: [
						{ id: "3", test: true }, // swap 0 & 1
						{ id: "2", test: true },
						{ id: "4", test: true }, // new obj
					],
				},
				// Deleted obj at index 2
			],
			stateArrayTwo: [
				{
					id: "6",
					innerArray: [
						{ id: "8", test: true }, // swap 0 & 1
						{ id: "7", test: true },
						{ id: "9", test: true }, // new obj
					],
				},
			],
		};

		const diffs = sharedTreeDiff(treeNode as unknown as Record<string, unknown>, llmResponse, {
			cyclesFix: true,
			useObjectIds: {
				idAttributeName: "id",
			},
		});

		const minimalDiffs = createMergableIdDiffSeries(treeNode, diffs, "id");

		assert.deepStrictEqual(minimalDiffs, [
			{
				type: "MOVE",
				path: ["state", 0],
				objectId: treeNode.state[0]?.id,
				newIndex: 1,
				value: treeNode.state[0],
			},
			{
				type: "MOVE",
				path: ["state", 0, "innerArray", 0],
				objectId: treeNode.state[0]?.innerArray[0]?.id,
				newIndex: 1,
				value: treeNode.state[0]?.innerArray[0],
			},
			{
				type: "CREATE",
				path: ["state", 0, "innerArray", 2],
				value: { id: "4", test: true },
			},
			{
				type: "REMOVE",
				path: ["state", 2],
				objectId: (treeNode.state[2] as SimpleObjectTreeNodeWithObjectArray).id,
				oldValue: treeNode.state[2],
			},
			{
				type: "MOVE",
				path: ["stateArrayTwo", 0, "innerArray", 0],
				objectId: treeNode.stateArrayTwo[0]?.innerArray[0]?.id,
				newIndex: 1,
				value: treeNode.stateArrayTwo[0]?.innerArray[0],
			},
			{
				type: "CREATE",
				path: ["stateArrayTwo", 0, "innerArray", 2],
				value: { id: "9", test: true },
			},
		]);
	});

	it("Edge case 7: handle edge cases across multiple arrays within an object with repeating ID's", () => {
		class SimpleObjectTreeNodeWithObjectArray extends schemaFactory.object(
			"SimpleObjectTreeNodeWithObjectArray",
			{
				id: schemaFactory.identifier,
				innerArray: schemaFactory.array("NestedStringTreeArrayNode1", [SimpleObjectTreeNode]),
			},
		) {}
		class ComplexObjectTreeNode extends schemaFactory.object("ComplexObjectTreeNode", {
			state: schemaFactory.array("NestedStringTreeArrayNode2", [
				SimpleObjectTreeNodeWithObjectArray,
			]),
			stateArrayTwo: schemaFactory.array("NestedStringTreeArrayNode3", [
				SimpleObjectTreeNodeWithObjectArray,
			]),
		}) {}

		const treeNode = new ComplexObjectTreeNode({
			state: [
				{
					id: "1",
					innerArray: [
						{ id: "2", test: true },
						{ id: "3", test: true },
					],
				},
			],
			stateArrayTwo: [
				{
					id: "1",
					innerArray: [
						{ id: "2", test: true },
						{ id: "3", test: true },
					],
				},
			],
		});

		const llmResponse = {
			state: [
				{
					id: "1",
					innerArray: [
						{ id: "3", test: true }, // swap 0 & 1
						{ id: "2", test: true },
						{ id: "4", test: true }, // new obj
					],
				},
			],
			stateArrayTwo: [
				{
					id: "1",
					innerArray: [
						{ id: "3", test: true }, // swap 0 & 1
						{ id: "2", test: true },
						{ id: "4", test: true }, // new obj
					],
				},
			],
		};

		const diffs = sharedTreeDiff(treeNode as unknown as Record<string, unknown>, llmResponse, {
			cyclesFix: true,
			useObjectIds: {
				idAttributeName: "id",
			},
		});

		const minimalDiffs = createMergableIdDiffSeries(treeNode, diffs, "id");

		assert.deepStrictEqual(minimalDiffs, [
			{
				type: "MOVE",
				path: ["state", 0, "innerArray", 0],
				objectId: treeNode.state[0]?.innerArray[0]?.id,
				newIndex: 1,
				value: treeNode.state[0]?.innerArray[0],
			},
			{
				type: "CREATE",
				path: ["state", 0, "innerArray", 2],
				value: {
					id: "4",
					test: true,
				},
			},
			{
				type: "MOVE",
				path: ["stateArrayTwo", 0, "innerArray", 0],
				objectId: treeNode.stateArrayTwo[0]?.innerArray[0]?.id,
				newIndex: 1,
				value: treeNode.stateArrayTwo[0]?.innerArray[0],
			},
			{
				type: "CREATE",
				path: ["stateArrayTwo", 0, "innerArray", 2],
				value: {
					id: "4",
					test: true,
				},
			},
		]);
	});
});
