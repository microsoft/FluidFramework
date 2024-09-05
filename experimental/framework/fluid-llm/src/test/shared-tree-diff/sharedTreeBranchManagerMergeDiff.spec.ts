import { strict as assert } from "node:assert";

import { SchemaFactory } from "@fluidframework/tree";

import { SharedTreeBranchManager } from "../../shared-tree-diff/index.js";

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

describe("SharedTreeBranchManager.mergeDiff() - Objects - Change Diffs", () => {
	const TEST_NODE_DATA = {
		attribute1: true,
		requiredBoolean: true,
		requiredString: "test",
		requiredNumber: 0,
		requiredObject: {
			requiredString: "test",
		},
	};
	const branchManager = new SharedTreeBranchManager();

	it("change required string primitive value", () => {
		const treeNode = new TestObjectTreeNode({ ...TEST_NODE_DATA });
		branchManager.mergeDiffs(
			[
				{
					type: "CHANGE",
					path: ["requiredString"],
					oldValue: "test",
					value: "true",
				},
			],
			treeNode as unknown as Record<string, unknown>,
		);
		const expectedMergedBranch = {
			...treeNode,
			requiredString: "true",
		};
		assert.deepStrictEqual({ ...treeNode }, expectedMergedBranch);
	});

	it("change required boolean primitive value", () => {
		const treeNode = new TestObjectTreeNode({ ...TEST_NODE_DATA });
		branchManager.mergeDiffs(
			[
				{
					type: "CHANGE",
					path: ["requiredBoolean"],
					oldValue: true,
					value: false,
				},
			],
			treeNode as unknown as Record<string, unknown>,
		);
		const expectedMergedBranch = {
			...treeNode,
			requiredBoolean: false,
		};

		assert.deepStrictEqual({ ...treeNode }, expectedMergedBranch);
	});

	it("change required number primitive value", () => {
		const treeNode = new TestObjectTreeNode({ ...TEST_NODE_DATA });
		branchManager.mergeDiffs(
			[
				{
					type: "CHANGE",
					path: ["requiredNumber"],
					oldValue: 0,
					value: 1,
				},
			],
			treeNode as unknown as Record<string, unknown>,
		);
		const expectedMergedBranch = {
			...treeNode,
			requiredNumber: 1,
		};

		assert.deepStrictEqual({ ...treeNode }, expectedMergedBranch);
	});

	it("change required nested object primitive value", () => {
		const treeNode = new TestObjectTreeNode({
			...TEST_NODE_DATA,
			requiredObject: {
				requiredString: "test",
			},
		});
		branchManager.mergeDiffs(
			[
				{
					type: "CHANGE",
					path: ["requiredObject", "requiredString"],
					oldValue: "test",
					value: "SomethingDifferent",
				},
			],
			treeNode as unknown as Record<string, unknown>,
		);
		const expectedMergedBranch = {
			...treeNode,
			requiredObject: {
				requiredString: "SomethingDifferent",
			},
		};
		assert.deepStrictEqual({ ...treeNode }, expectedMergedBranch);
	});

	it("change optional boolean primitive to undefined", () => {
		const treeNode = new TestOptionalObjectTreeNode({
			optionalString: "true",
			optionalBoolean: true,
		});
		branchManager.mergeDiffs(
			[
				{
					type: "CHANGE",
					path: ["optionalBoolean"],
					oldValue: true,
					value: undefined,
				},
			],
			treeNode as unknown as Record<string, unknown>,
		);
		const expectedMergedBranch = { optionalString: "true" };
		assert.deepStrictEqual({ ...treeNode }, expectedMergedBranch);
	});

	it("change optional string primitive to undefined", () => {
		const treeNode = new TestOptionalObjectTreeNode({ optionalString: "true" });
		branchManager.mergeDiffs(
			[
				{
					type: "CHANGE",
					path: ["optionalString"],
					oldValue: "true",
					value: undefined,
				},
			],
			treeNode as unknown as Record<string, unknown>,
		);
		const expectedMergedBranch = {};
		assert.deepStrictEqual({ ...treeNode }, expectedMergedBranch);
	});

	it("change optional number primitive to undefined", () => {
		const treeNode = new TestOptionalObjectTreeNode({
			optionalString: "test",
			optionalNumber: 1,
		});
		branchManager.mergeDiffs(
			[
				{
					type: "CHANGE",
					path: ["optionalNumber"],
					oldValue: 1,
					value: undefined,
				},
			],
			treeNode as unknown as Record<string, unknown>,
		);
		const expectedMergedBranch = { optionalString: "test" };
		assert.deepStrictEqual({ ...treeNode }, expectedMergedBranch);
	});

	it("change optional nested object to undefined", () => {
		const treeNode = new TestOptionalObjectTreeNode({
			optionalString: "test",
			optionalObject: { requiredString: "test" },
		});
		branchManager.mergeDiffs(
			[
				{
					type: "CHANGE",
					path: ["optionalObject"],
					oldValue: { requiredString: "test" },
					value: undefined,
				},
			],
			treeNode as unknown as Record<string, unknown>,
		);
		const expectedMergedBranch = { optionalString: "test" };
		assert.deepStrictEqual({ ...treeNode }, expectedMergedBranch);
	});

	it("change optional array to undefined", () => {
		class ArrayNode extends schemaFactory.array("ArrayTreeNode", [schemaFactory.string]) {}
		class TestOptionalObjectTreeNode2 extends schemaFactory.object("OptionalTreeNode2", {
			optionalString: schemaFactory.optional(schemaFactory.string),
			optionalArray: schemaFactory.optional(ArrayNode),
		}) {}
		const arrayNode = new ArrayNode([]);
		const treeNode = new TestOptionalObjectTreeNode2({
			optionalString: "test",
			optionalArray: arrayNode,
		});
		branchManager.mergeDiffs(
			[
				{
					type: "CHANGE",
					path: ["optionalArray"],
					oldValue: arrayNode,
					value: undefined,
				},
			],
			treeNode as unknown as Record<string, unknown>,
		);
		const expectedMergedBranch = { optionalString: "test" };
		assert.deepStrictEqual({ ...treeNode }, expectedMergedBranch);
	});
});

describe("SharedTreeBranchManager.mergeDiff() - Objects - Create Diffs", () => {
	const branchManager = new SharedTreeBranchManager();

	it("new optional boolean primitive value", () => {
		const treeNode = new TestOptionalObjectTreeNode({ optionalString: "test" });
		branchManager.mergeDiffs(
			[
				{
					type: "CREATE",
					path: ["optionalBoolean"],
					value: true,
				},
			],
			treeNode as unknown as Record<string, unknown>,
		);
		const expectedMergedBranch = { optionalString: "test", optionalBoolean: true };
		assert.deepStrictEqual({ ...treeNode }, expectedMergedBranch);
	});

	it("new optional string primitive value", () => {
		const treeNode = new TestOptionalObjectTreeNode({ optionalBoolean: true });
		branchManager.mergeDiffs(
			[
				{
					type: "CREATE",
					path: ["optionalString"],
					value: "true",
				},
			],
			treeNode as unknown as Record<string, unknown>,
		);
		const expectedMergedBranch = { optionalBoolean: true, optionalString: "true" };
		assert.deepStrictEqual({ ...treeNode }, expectedMergedBranch);
	});

	it("new optional boolean primitive value", () => {
		const treeNode = new TestOptionalObjectTreeNode({ optionalString: "test" });
		branchManager.mergeDiffs(
			[
				{
					type: "CREATE",
					path: ["optionalNumber"],
					value: 1,
				},
			],
			treeNode as unknown as Record<string, unknown>,
		);
		const expectedMergedBranch = { optionalString: "test", optionalNumber: 1 };
		assert.deepStrictEqual({ ...treeNode }, expectedMergedBranch);
	});

	it("new optional array value", () => {
		class ArrayNode extends schemaFactory.array("ArrayTreeNode", [schemaFactory.string]) {}
		class TestOptionalObjectTreeNode2 extends schemaFactory.object("OptionalTreeNode2", {
			optionalString: schemaFactory.optional(schemaFactory.string),
			optionalArray: schemaFactory.optional(ArrayNode),
		}) {}
		const arrayNode = new ArrayNode([]);
		const treeNode = new TestOptionalObjectTreeNode2({ optionalString: "test" });
		branchManager.mergeDiffs(
			[
				{
					type: "CREATE",
					path: ["optionalArray"],
					value: arrayNode,
				},
			],
			treeNode as unknown as Record<string, unknown>,
		);
		const expectedMergedBranch = { optionalString: "test", optionalArray: arrayNode };
		assert.deepStrictEqual({ ...treeNode }, expectedMergedBranch);
	});

	it("new optional object value", () => {
		const treeNode = new TestOptionalObjectTreeNode({ optionalString: "test" });
		branchManager.mergeDiffs(
			[
				{
					type: "CREATE",
					path: ["optionalObject"],
					value: { requiredString: "test" },
				},
			],
			treeNode as unknown as Record<string, unknown>,
		);
		const expectedMergedBranch = {
			optionalString: "test",
			optionalObject: { requiredString: "test" },
		};
		assert.deepStrictEqual({ ...treeNode }, expectedMergedBranch);
	});
});

describe("SharedTreeBranchManager.mergeDiff() - Objects - Remove Diffs", () => {
	const branchManager = new SharedTreeBranchManager();

	it("remove optional boolean primitive value", () => {
		const treeNode = new TestOptionalObjectTreeNode({
			optionalString: "test",
			optionalBoolean: true,
		});
		branchManager.mergeDiffs(
			[
				{
					type: "REMOVE",
					path: ["optionalBoolean"],
					oldValue: true,
				},
			],
			treeNode as unknown as Record<string, unknown>,
		);
		const expectedMergedBranch = { optionalString: "test" };
		assert.deepStrictEqual({ ...treeNode }, expectedMergedBranch);
	});

	it("remove optional string primitive value", () => {
		const treeNode = new TestOptionalObjectTreeNode({
			optionalString: "test",
			optionalBoolean: true,
		});
		branchManager.mergeDiffs(
			[
				{
					type: "REMOVE",
					path: ["optionalString"],
					oldValue: "true",
				},
			],
			treeNode as unknown as Record<string, unknown>,
		);
		const expectedMergedBranch = { optionalBoolean: true };
		assert.deepStrictEqual({ ...treeNode }, expectedMergedBranch);
	});

	it("remove optional number primitive value", () => {
		const treeNode = new TestOptionalObjectTreeNode({
			optionalString: "test",
			optionalNumber: 1,
		});
		branchManager.mergeDiffs(
			[
				{
					type: "REMOVE",
					path: ["optionalNumber"],
					oldValue: 1,
				},
			],
			treeNode as unknown as Record<string, unknown>,
		);
		const expectedMergedBranch = { optionalString: "test" };
		assert.deepStrictEqual({ ...treeNode }, expectedMergedBranch);
	});

	it("remove optional array value", () => {
		class ArrayNode extends schemaFactory.array("ArrayTreeNode", [schemaFactory.string]) {}
		class TestOptionalObjectTreeNode2 extends schemaFactory.object("OptionalTreeNode2", {
			optionalString: schemaFactory.optional(schemaFactory.string),
			optionalArray: schemaFactory.optional(ArrayNode),
		}) {}
		const arrayNode = new ArrayNode([]);
		const treeNode = new TestOptionalObjectTreeNode2({
			optionalString: "test",
			optionalArray: arrayNode,
		});
		branchManager.mergeDiffs(
			[
				{
					type: "REMOVE",
					path: ["optionalArray"],
					oldValue: arrayNode,
				},
			],
			treeNode as unknown as Record<string, unknown>,
		);
		const expectedMergedBranch = { optionalString: "test" };
		assert.deepStrictEqual({ ...treeNode }, expectedMergedBranch);
	});

	it("remove optional object value", () => {
		const treeNode = new TestOptionalObjectTreeNode({
			optionalString: "test",
			optionalObject: { requiredString: "test" },
		});
		branchManager.mergeDiffs(
			[
				{
					type: "REMOVE",
					path: ["optionalObject"],
					oldValue: { requiredString: "test" },
				},
			],
			treeNode as unknown as Record<string, unknown>,
		);
		const expectedMergedBranch = { optionalString: "test" };
		assert.deepStrictEqual({ ...treeNode }, expectedMergedBranch);
	});
});

// describe("SharedTreeBranchManager.mergeDiff() Arrays - Move/Swap Diff Scenarios", () => {
// 	class ArrayItemNode extends schemaFactory.object("ArrayItemNode", {
// 		id: schemaFactory.identifier,
// 		test: schemaFactory.boolean,
// 	}) {}

// 	class ArrayListNode extends schemaFactory.array("ArrayListNode", [ArrayItemNode]) {}

// 	const branchManager = new SharedTreeBranchManager({ nodeIdAttributeName: "id" });

// 	it("Array Item Nodes swap indexes", () => {
// 		const treeNode = new ArrayListNode([
// 			{ id: "1", test: true },
// 			{ id: "2", test: true },
// 		]);

// 		const moveDiffs = [
// 			{
// 				type: "MOVE",
// 				path: [0],
// 				value: treeNode[0],
// 				newIndex: 1,
// 			},
// 			{
// 				type: "MOVE",
// 				path: [1],
// 				value: treeNode[1],
// 				newIndex: 0,
// 			},
// 		] as const;



// 		branchManager.mergeDiffs(
// 			[
// 				{
// 					type: "MOVE",
// 					path: [0],
// 					value: treeNode[0],
// 					newIndex: 1,
// 				},
// 				{
// 					type: "MOVE",
// 					path: [1],
// 					value: treeNode[1],
// 					newIndex: 0,
// 				},
// 			],
// 			treeNode,
// 		);

// 		const expectedMergedBranch = [
// 			{ id: "2", test: true },
// 			{ id: "1", test: true },
// 		];

// 		const jsonifiedTreeNode = treeNode.map((node) => ({ ...node }));
// 		assert.deepStrictEqual(jsonifiedTreeNode, expectedMergedBranch);
// 	});

// 	it("Array Item Node complex swapping", () => {
// 		const treeNode = new ArrayListNode([
// 			{ id: "1", test: true },
// 			{ id: "2", test: true },
// 			{ id: "3", test: true },
// 			{ id: "4", test: true },
// 			{ id: "5", test: true },
// 			{ id: "6", test: true },
// 		]);


// 		// {
// 		// 	type: "MOVE",
// 		// 	path: [0],
// 		// 	newIndex: 1,
// 		// 	value: {id: "1", test: true},
// 		// },
// 		treeNode.moveToIndex(1 + 1, 0); // move {id : 1 } at 0 forward to index 1
// 		const jsonifiedTreeNode0 = treeNode.map((node) => ({ ...node }));

// 		// {
// 		// 	type: "MOVE",
// 		// 	path: [1],
// 		// 	newIndex: 0,
// 		// 	value: {id: "2", test: true },
// 		// },
// 		// treeNode.moveToIndex(0, 1); move { id: 2 } at index 1 backwards to index 0
// 		//
// 		// IGNORED because 2 will already be at the correct position from the last move.

// 		// {
// 		// 	type: "MOVE",
// 		// 	path: [2],
// 		// 	newIndex: 5,
// 		// 	value: {id: "3", test: true},
// 		// },
// 		treeNode.moveToIndex(5 + 1, 2); //  move {id: 3} at 2 forward to index 5
// 		const jsonifiedTreeNode1 = treeNode.map((node) => ({ ...node }));

// 		// ADJUST ALL MOVES AFTER index 2 to be index - 1 because they have been shifted backwards.


// 		// {
// 		// 	type: "MOVE",
// 		// 	path: [3],
// 		// 	newIndex: 4,
// 		// 	value: {id: "4", test: true},
// 		// },
// 		treeNode.moveToIndex(4 + 1, 3); //  move {id: 4} at 3 forwards to index 4
// 		const jsonifiedTreeNode2 = treeNode.map((node) => ({ ...node }));




// 		// {
// 		// 	type: "MOVE",
// 		// 	path: [4],
// 		// 	newIndex: 3,
// 		// 	value: {id: "5", test: true},
// 		// },
// 		treeNode.moveToIndex(3 + 1, 3); //  move {id: 5} at 4 backwards to index 3
// 		const jsonifiedTreeNode3 = treeNode.map((node) => ({ ...node }));

// 		// {
// 		// 	type: "MOVE",
// 		// 	path: [5],
// 		// 	newIndex: 2,
// 		// 	value: {id: "6", test: true},
// 		// },
// 		treeNode.moveToIndex(2 + 1, 2); //  move {id: 6} at 5 backwards to index 2
// 		const jsonifiedTreeNode4 = treeNode.map((node) => ({ ...node }));

// 		const expectedMergedBranch = [
// 			{ id: "2", test: true },
// 			{ id: "1", test: true },
// 			{ id: "6", test: true },
// 			{ id: "5", test: true },
// 			{ id: "4", test: true },
// 			{ id: "3", test: true },
// 		];

// 		const diffs = branchManager.compare(treeNode, expectedMergedBranch);



// 		branchManager.mergeDiffs(
// 			[
// 				// {
// 				// 	type: "MOVE",
// 				// 	path: [0],
// 				// 	newIndex: 1,
// 				// 	value: {id: "1", test: true},
// 				// },
// 				// {
// 				// 	type: "MOVE",
// 				// 	path: [1],
// 				// 	newIndex: 0,
// 				// 	value: {id: "2", test: true },
// 				// },
// 				{
// 					type: "MOVE",
// 					path: [2],
// 					newIndex: 5,
// 					value: {id: "3", test: true},
// 				},
// 				{
// 					type: "MOVE",
// 					path: [3],
// 					newIndex: 4,
// 					value: {id: "4", test: true},
// 				},
// 				{
// 					type: "MOVE",
// 					path: [4],
// 					newIndex: 3,
// 					value: {id: "5", test: true},
// 				},
// 				{
// 					type: "MOVE",
// 					path: [5],
// 					newIndex: 2,
// 					value: {id: "6", test: true},
// 				},
// 			],
// 			treeNode,
// 		);

// 		const jsonifiedTreeNode = treeNode.map((node) => ({ ...node }));
// 		assert.deepStrictEqual(jsonifiedTreeNode, expectedMergedBranch);
// 	});

// 	it("Array Item Nodes change AND swap indexes", () => {
// 		const treeNode = new ArrayListNode([
// 			{ id: "1", test: true },
// 			{ id: "2", test: true },
// 		]);

// 		branchManager.mergeDiffs(
// 			[
// 				{
// 					type: "MOVE",
// 					path: [0],
// 					value: treeNode[0],
// 					newIndex: 1,
// 				},
// 				{
// 					type: "CHANGE",
// 					path: [0, "test"],
// 					oldValue: true,
// 					value: false,
// 				},
// 				{
// 					type: "MOVE",
// 					path: [1],
// 					value: treeNode[1],
// 					newIndex: 0,
// 				},
// 			],
// 			treeNode,
// 		);

// 		const expectedMergedBranch = [
// 			{ id: "2", test: true },
// 			{ id: "1", test: false },
// 		];

// 		const jsonifiedTreeNode = treeNode.map((node) => ({ ...node }));
// 		assert.deepStrictEqual(jsonifiedTreeNode, expectedMergedBranch);
// 	});

// 	it("Array Item Node is swapped to an array index, deleted and then replaced with a new node", () => {
// 		const treeNode = new ArrayListNode([
// 			{ id: "1", test: true },
// 			{ id: "2", test: true },
// 		]);

// 		branchManager.mergeDiffs(
// 			[
// 				{
// 					type: "MOVE",
// 					path: [0],
// 					value: treeNode[0],
// 					newIndex: 1,
// 				},
// 				{
// 					type: "REMOVE",
// 					path: [1],
// 					oldValue: treeNode[1],
// 				},
// 				{
// 					type: "CREATE",
// 					path: [0],
// 					value: { id: "3", test: true },
// 				},
// 			],
// 			treeNode,
// 		);

// 		const expectedMergedBranch = [
// 			{ id: "3", test: true },
// 			{ id: "1", test: true },
// 		];

// 		const jsonifiedTreeNode = treeNode.map((node) => ({ ...node }));
// 		assert.deepStrictEqual(jsonifiedTreeNode, expectedMergedBranch);
// 	});
// });
