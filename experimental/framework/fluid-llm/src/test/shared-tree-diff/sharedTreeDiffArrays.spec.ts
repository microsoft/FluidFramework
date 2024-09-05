import { strict as assert } from "node:assert";

import { SchemaFactory } from "@fluidframework/tree";

import {
	createMinimalArrayDiffSets,
	sharedTreeDiff,
	type DifferenceMove,
} from "../../shared-tree-diff/index.js";

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
				value: false,
				oldValue: true,
			},
		]);
	});

	it("array to object", () => {
		assert.deepStrictEqual(sharedTreeDiff({ data: [] }, { data: { val: "test" } }), [
			{ type: "CHANGE", path: ["data"], value: { val: "test" }, oldValue: [] },
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
				value: { id: "1", test: true },
				oldValue: "test",
			},
			{
				type: "MOVE",
				path: ["state", 1],
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
				value: treeNode.state[0],
				newIndex: 1,
			},
			{
				type: "MOVE",
				path: ["state", 1],
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
				value: treeNode.state[0],
				newIndex: 1,
			},
			{
				type: "REMOVE",
				path: ["state", 1],
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
				value: treeNode.state[0],
				newIndex: 1,
			},
			{
				type: "CHANGE",
				path: ["state", 0, "test"],
				oldValue: true,
				value: false,
			},
			{
				type: "REMOVE",
				path: ["state", 1],
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
				value: treeNode.state[0],
				newIndex: 1,
			},
			{
				type: "MOVE",
				path: ["state", 1],
				value: treeNode.state[1],
				newIndex: 0,
			},
			{
				type: "CHANGE",
				path: ["state", 1, "test"],
				oldValue: true,
				value: false,
			},
		]);
	});
});

describe("clean Diffs", () => {
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

	it("edge case 0: should remove unecessary move diff from a swap", () => {
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

		const expectedDiffs: DifferenceMove[] = [
			{
				// good [1, 2] -> [2, 1]
				type: "MOVE",
				path: ["state", 0],
				value: treeNode.state[0],
				newIndex: 1,
			},
			{
				// should be removed, as it is redundant due to a swap.
				type: "MOVE",
				path: ["state", 1],
				value: treeNode.state[1],
				newIndex: 0,
			},
		];
		assert.deepStrictEqual(
			expectedDiffs,
			sharedTreeDiff(treeNode as unknown as Record<string, unknown>, llmResponse, {
				cyclesFix: true,
				useObjectIds: {
					idAttributeName: "id",
				},
			}),
		);

		const cleanedDiffs = createMinimalArrayDiffSets(treeNode, expectedDiffs, "id");
		assert.deepStrictEqual(cleanedDiffs, [
			{
				type: "MOVE",
				path: ["state", 0],
				value: treeNode.state[0],
				newIndex: 1,
			},
		]);
	});

	it("Edge case 1: should remove unecessary diff from a swap and reorder early move to index dependant on CREATE diffs", () => {
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
				// good [1, 2, 3, 4] -> [2, 1, 3, 4]
				type: "MOVE",
				path: ["state", 0],
				newIndex: 1,
				value: treeNode.state[0],
			},
			{
				// expected to be removed, unecessary due to swap
				type: "MOVE",
				path: ["state", 1],
				newIndex: 0,
				value: treeNode.state[1],
			},
			{
				// good [2, 1, 3, 4] -> [2, 1, 4]
				type: "REMOVE",
				path: ["state", 2],
				oldValue: treeNode.state[2],
			},
			{
				// expected to be reordered to the end [2, 1, 4, 6, 5] -> [2, 1, 4, 6, 5, 4]
				type: "MOVE",
				path: ["state", 3],
				newIndex: 4,
				value: treeNode.state[3],
			},
			{
				// good [2, 1, 4] -> [2, 1, 4, 6]
				type: "CREATE",
				path: ["state", 2],
				value: { id: "6", test: true },
			},
			{
				// good [2, 1, 4, 6] -> [2, 1, 4, 6, 5]
				type: "CREATE",
				path: ["state", 3],
				value: { id: "5", test: true },
			},
			{
				// expected to be removed TODO: Potential bug - Why does this diff even get created?
				type: "MOVE",
				path: ["state", 4],
				newIndex: 4,
				value: { id: "4", test: true },
			},
		]);

		const minimalDiffs = createMinimalArrayDiffSets(treeNode, diffs, "id");

		assert.deepStrictEqual(minimalDiffs, [
			{
				type: "MOVE",
				path: ["state", 0],
				newIndex: 1,
				value: treeNode.state[0],
			},
			{
				type: "REMOVE",
				path: ["state", 2],
				oldValue: treeNode.state[2],
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
				type: "MOVE",
				path: ["state", 2],
				newIndex: 4,
				value: treeNode.state[3],
			},
		]);

		debugger;
	});

	it("edge case 2: should remove unecessary diff move when a deletion places an object at the right index", () => {
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
				{ id: "6", test: true },
				{ id: "5", test: true },
				{ id: "4", test: true },
			],
		};

		const expectedDiffs = [
			{
				// good [1, 2, 3, 4] -> [2, 3, 4]
				type: "REMOVE",
				path: ["state", 0],
				oldValue: treeNode.state[0],
			},
			{
				// Should be ignored, 2 will be in the right position after the removal of 1
				type: "MOVE",
				path: ["state", 1],
				newIndex: 0,
				value: treeNode.state[1],
			},
			{
				// good [2, 3, 4] -> [2, 4]
				type: "REMOVE",
				path: ["state", 2],
				oldValue: treeNode.state[2],
			},
			{
				// good [2, 4] -> [2, 6, 4]
				type: "CREATE",
				path: ["state", 1],
				value: {
					id: "6",
					test: true,
				},
			},
			{
				// good [2, 6, 4] -> [2, 6, 5, 4]
				type: "CREATE",
				path: ["state", 2],
				value: {
					id: "5",
					test: true,
				},
			},
		];

		const diffs = sharedTreeDiff(treeNode as unknown as Record<string, unknown>, llmResponse, {
			cyclesFix: true,
			useObjectIds: {
				idAttributeName: "id",
			},
		});

		assert.deepStrictEqual(diffs, expectedDiffs);

		const minimalDiffs = createMinimalArrayDiffSets(treeNode, diffs, "id");

		assert.deepStrictEqual(minimalDiffs, [
			{
				// good [1, 2, 3, 4] -> [2, 3, 4]
				type: "REMOVE",
				path: ["state", 0],
				oldValue: treeNode.state[0],
			},
			{
				// good [2, 3, 4] -> [2, 4]
				type: "REMOVE",
				path: ["state", 2],
				oldValue: treeNode.state[2],
			},
			{
				// good [2, 4] -> [2, 6, 4]
				type: "CREATE",
				path: ["state", 1],
				value: {
					id: "6",
					test: true,
				},
			},
			{
				// good [2, 6, 4] -> [2, 6, 5, 4]
				type: "CREATE",
				path: ["state", 2],
				value: {
					id: "5",
					test: true,
				},
			},
		]);
	});

	it("edge case 4: handle edge cases across multiple arrays within an object", () => {
		class SimpleObjectTreeNodeWithObjectArray extends schemaFactory.object(
			"SimpleObjectTreeNodeWithObjectArray",
			{
				id: schemaFactory.identifier,
				innerArray: schemaFactory.array("NestedStringTreeArrayNode1", [
					SimpleObjectTreeNode,
				]),
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

		const minimalDiffs = createMinimalArrayDiffSets(treeNode, diffs, "id");

		assert.deepStrictEqual(minimalDiffs, [
			{
				type: "MOVE",
				path: ["state", 0],
				newIndex: 1,
				value: treeNode.state[0],
			},
			{
				type: "MOVE",
				path: ["state", 0, "innerArray", 0],
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
				oldValue: treeNode.state[2],
			},
			{
				type: "MOVE",
				path: ["stateArrayTwo", 0, "innerArray", 0],
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

	it("edge case 5: handle edge cases across multiple arrays within an object with repeating ID's", () => {
		class SimpleObjectTreeNodeWithObjectArray extends schemaFactory.object(
			"SimpleObjectTreeNodeWithObjectArray",
			{
				id: schemaFactory.identifier,
				innerArray: schemaFactory.array("NestedStringTreeArrayNode1", [
					SimpleObjectTreeNode,
				]),
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

		const minimalDiffs = createMinimalArrayDiffSets(treeNode, diffs, "id");

		assert.deepStrictEqual(minimalDiffs, [
			{
				type: "MOVE",
				path: ["state", 0, "innerArray", 0],
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

		debugger;
	});
});
