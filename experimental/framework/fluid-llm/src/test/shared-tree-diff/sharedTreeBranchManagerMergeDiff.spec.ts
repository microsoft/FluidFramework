import { strict as assert } from "node:assert";

import { SchemaFactory } from "@fluidframework/tree";

import { SharedTreeBranchManager } from "../../shared-tree-diff/index.js";

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
		requiredString:  schemaFactory.string
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
		}
	}
	const branchManager = new SharedTreeBranchManager();


	it("change required string primitive value", () => {
		const treeNode = new TestObjectTreeNode({...TEST_NODE_DATA});
		branchManager.mergeDiffs(
			[
				{
					type: "CHANGE",
					path: ["requiredString"],
					oldValue: 'test',
					value: 'true',
				},
			],
			treeNode as unknown as Record<string, unknown>
		);
		const expectedMergedBranch = {
			...treeNode,
			requiredString: "true",
		}
		assert.deepStrictEqual({...treeNode}, expectedMergedBranch);
	});

	it("change required boolean primitive value", () => {
		const treeNode = new TestObjectTreeNode({...TEST_NODE_DATA});
		branchManager.mergeDiffs(
			[
				{
					type: "CHANGE",
					path: ["requiredBoolean"],
					oldValue: true,
					value: false,
				},
			],
			treeNode as unknown as Record<string, unknown>
		);
		const expectedMergedBranch = {
			...treeNode,
			requiredBoolean: false,
		}

		assert.deepStrictEqual({...treeNode}, expectedMergedBranch);
	});

	it("change required number primitive value", () => {
		const treeNode = new TestObjectTreeNode({...TEST_NODE_DATA});
		branchManager.mergeDiffs(
			[
				{
					type: "CHANGE",
					path: ["requiredNumber"],
					oldValue: 0,
					value: 1,
				},
			],
			treeNode as unknown as Record<string, unknown>
		);
		const expectedMergedBranch = {
			...treeNode,
			requiredNumber: 1
		}

		assert.deepStrictEqual({...treeNode}, expectedMergedBranch);
	});

	it("change required nested object primitive value", () => {
		const treeNode = new TestObjectTreeNode({...TEST_NODE_DATA, requiredObject: {
			requiredString: "test",
		}});
		branchManager.mergeDiffs(
			[
				{
					type: "CHANGE",
					path: ["requiredObject", "requiredString"],
					oldValue: "test",
					value: "SomethingDifferent",
				},
			],
			treeNode as unknown as Record<string, unknown>
		);
		const expectedMergedBranch = {
			...treeNode,
			requiredObject: {
				requiredString: "SomethingDifferent",
			}
		}
		assert.deepStrictEqual({...treeNode}, expectedMergedBranch);
	});

	it("change optional boolean primitive to undefined", () => {
		const treeNode = new TestOptionalObjectTreeNode({ optionalString: 'true', optionalBoolean: true });
		branchManager.mergeDiffs(
			[
				{
					type: "CHANGE",
					path: ["optionalBoolean"],
					oldValue: true,
					value: undefined,
				},
			],
			treeNode as unknown as Record<string, unknown>
		);
		const expectedMergedBranch = { optionalString: 'true' };
		assert.deepStrictEqual({...treeNode}, expectedMergedBranch);
	});

	it("change optional string primitive to undefined", () => {
		const treeNode = new TestOptionalObjectTreeNode({ optionalString: 'true' });
		branchManager.mergeDiffs(
			[
				{
					type: "CHANGE",
					path: ["optionalString"],
					oldValue: 'true',
					value: undefined,
				},
			],
			treeNode as unknown as Record<string, unknown>
		);
		const expectedMergedBranch = { };
		assert.deepStrictEqual({...treeNode}, expectedMergedBranch);
	});

	it("change optional number primitive to undefined", () => {
		const treeNode = new TestOptionalObjectTreeNode({ optionalString: 'test', optionalNumber: 1 });
		branchManager.mergeDiffs(
			[
				{
					type: "CHANGE",
					path: ["optionalNumber"],
					oldValue: 1,
					value: undefined,
				},
			],
			treeNode as unknown as Record<string, unknown>
		);
		const expectedMergedBranch = {optionalString: 'test' };
		assert.deepStrictEqual({...treeNode}, expectedMergedBranch);
	});

	it("change optional nested object to undefined", () => {
		const treeNode = new TestOptionalObjectTreeNode({ optionalString: 'test', optionalObject: { requiredString: "test" } });
		branchManager.mergeDiffs(
			[
				{
					type: "CHANGE",
					path: ["optionalObject"],
					oldValue: { requiredString: "test" },
					value: undefined,
				},
			],
			treeNode as unknown as Record<string, unknown>
		);
		const expectedMergedBranch = { optionalString: 'test' };
		assert.deepStrictEqual({...treeNode}, expectedMergedBranch);
	});

	it("change optional array to undefined", () => {
		class ArrayNode extends schemaFactory.array("ArrayTreeNode", [schemaFactory.string]) {}
		class TestOptionalObjectTreeNode2 extends schemaFactory.object("OptionalTreeNode2", {
			optionalString: schemaFactory.optional(schemaFactory.string),
			optionalArray: schemaFactory.optional(ArrayNode),
		}) {}
		const arrayNode = new ArrayNode([]);
		const treeNode = new TestOptionalObjectTreeNode2({ optionalString: 'test', optionalArray: arrayNode });
		branchManager.mergeDiffs(
			[
				{
					type: "CHANGE",
					path: ["optionalArray"],
					oldValue: arrayNode,
					value: undefined,
				},
			],
			treeNode as unknown as Record<string, unknown>
		);
		const expectedMergedBranch = { optionalString: 'test' };
		assert.deepStrictEqual({...treeNode}, expectedMergedBranch);
	});
});

describe("SharedTreeBranchManager.mergeDiff() - Objects - Create Diffs", () => {
	const branchManager = new SharedTreeBranchManager();

	it("new optional boolean primitive value", () => {
		const treeNode = new TestOptionalObjectTreeNode({ optionalString: 'test' });
		branchManager.mergeDiffs(
			[
				{
					type: "CREATE",
					path: ["optionalBoolean"],
					value: true,
				},
			],
			treeNode as unknown as Record<string, unknown>
		);
		const expectedMergedBranch = { optionalString: 'test', optionalBoolean: true };
		assert.deepStrictEqual({...treeNode}, expectedMergedBranch);
	});

	it("new optional string primitive value", () => {
		const treeNode = new TestOptionalObjectTreeNode({ optionalBoolean: true });
		branchManager.mergeDiffs(
			[
				{
					type: "CREATE",
					path: ["optionalString"],
					value: 'true',
				},
			],
			treeNode as unknown as Record<string, unknown>
		);
		const expectedMergedBranch = { optionalBoolean: true, optionalString: "true" };
		assert.deepStrictEqual({...treeNode}, expectedMergedBranch);
	});

	it("new optional boolean primitive value", () => {
		const treeNode = new TestOptionalObjectTreeNode({ optionalString: 'test' });
		branchManager.mergeDiffs(
			[
				{
					type: "CREATE",
					path: ["optionalNumber"],
					value: 1,
				},
			],
			treeNode as unknown as Record<string, unknown>
		);
		const expectedMergedBranch = { optionalString: 'test', optionalNumber: 1 };
		assert.deepStrictEqual({...treeNode}, expectedMergedBranch);
	});

	it("new optional array value", () => {
		class ArrayNode extends schemaFactory.array("ArrayTreeNode", [schemaFactory.string]) {};
		class TestOptionalObjectTreeNode2 extends schemaFactory.object("OptionalTreeNode2", {
			optionalString: schemaFactory.optional(schemaFactory.string),
			optionalArray: schemaFactory.optional(ArrayNode),
		}) {};
		const arrayNode = new ArrayNode([]);
		const treeNode = new TestOptionalObjectTreeNode2({ optionalString: 'test' });
		branchManager.mergeDiffs(
			[
				{
					type: "CREATE",
					path: ["optionalArray"],
					value: arrayNode,
				},
			],
			treeNode as unknown as Record<string, unknown>
		);
		const expectedMergedBranch = { optionalString: 'test', optionalArray: arrayNode }
		assert.deepStrictEqual({...treeNode}, expectedMergedBranch);
	});

	it("new optional object value", () => {
		const treeNode = new TestOptionalObjectTreeNode({ optionalString: 'test' });
		branchManager.mergeDiffs(
			[
				{
					type: "CREATE",
					path: ["optionalObject"],
					value: {requiredString: "test"} ,
				},
			],
			treeNode as unknown as Record<string, unknown>
		);
		const expectedMergedBranch = { optionalString: 'test', optionalObject: {requiredString: "test"} }
		assert.deepStrictEqual({...treeNode}, expectedMergedBranch);
	});
});

describe("SharedTreeBranchManager.mergeDiff() - Objects - Remove Diffs", () => {
	const branchManager = new SharedTreeBranchManager();

	it("remove optional boolean primitive value", () => {
		const treeNode = new TestOptionalObjectTreeNode({ optionalString: 'test', optionalBoolean: true });
		branchManager.mergeDiffs(
			[
				{
					type: "REMOVE",
					path: ["optionalBoolean"],
					oldValue: true,
				},
			],
			treeNode as unknown as Record<string, unknown>
		);
		const expectedMergedBranch = { optionalString: 'test' };
		assert.deepStrictEqual({...treeNode}, expectedMergedBranch);
	});

	it("remove optional string primitive value", () => {
		const treeNode = new TestOptionalObjectTreeNode({ optionalString: 'test', optionalBoolean: true });
		branchManager.mergeDiffs(
			[
				{
					type: "REMOVE",
					path: ["optionalString"],
					oldValue: 'true',
				},
			],
			treeNode as unknown as Record<string, unknown>
		);
		const expectedMergedBranch = { optionalBoolean: true };
		assert.deepStrictEqual({...treeNode}, expectedMergedBranch);
	});

	it("remove optional number primitive value", () => {
		const treeNode = new TestOptionalObjectTreeNode({ optionalString: 'test', optionalNumber: 1 });
		branchManager.mergeDiffs(
			[
				{
					type: "REMOVE",
					path: ["optionalNumber"],
					oldValue: 1,
				},
			],
			treeNode as unknown as Record<string, unknown>
		);
		const expectedMergedBranch = { optionalString: 'test' };
		assert.deepStrictEqual({...treeNode}, expectedMergedBranch);
	});

	it("remove optional array value", () => {
		class ArrayNode extends schemaFactory.array("ArrayTreeNode", [schemaFactory.string]) {}
		class TestOptionalObjectTreeNode2 extends schemaFactory.object("OptionalTreeNode2", {
			optionalString: schemaFactory.optional(schemaFactory.string),
			optionalArray: schemaFactory.optional(ArrayNode),
		}) {}
		const arrayNode = new ArrayNode([]);
		const treeNode = new TestOptionalObjectTreeNode2({ optionalString: 'test', optionalArray: arrayNode });
		branchManager.mergeDiffs(
			[
				{
					type: "REMOVE",
					path: ["optionalArray"],
					oldValue: arrayNode,
				},
			],
			treeNode as unknown as Record<string, unknown>
		);
		const expectedMergedBranch = { optionalString: 'test' };
		assert.deepStrictEqual({...treeNode}, expectedMergedBranch);
	});

	it("remove optional object value", () => {
		const treeNode = new TestOptionalObjectTreeNode({ optionalString: 'test', optionalObject: {requiredString: "test"} });
		branchManager.mergeDiffs(
			[
				{
					type: "REMOVE",
					path: ["optionalObject"],
					oldValue: {requiredString: "test"} ,
				},
			],
			treeNode as unknown as Record<string, unknown>
		);
		const expectedMergedBranch = { optionalString: 'test' };
		assert.deepStrictEqual({...treeNode}, expectedMergedBranch);
	});
});


	// it("Array Node Items - Change, Move, Array, Create scenario", () => {
	// 	class SimpleObjectTreeNode extends schemaFactory.object("SimpleTreeNode", {
	// 		id: schemaFactory.identifier,
	// 		test: schemaFactory.boolean,
	// 	}) {}
	// 	class ObjectTreeNode extends schemaFactory.object("ObjectTreeNode", {
	// 		state: schemaFactory.array("NestedStringTreeArrayNode", [SimpleObjectTreeNode]),
	// 	}) {}

	// 	const treeNode = new ObjectTreeNode({
	// 		state: [
	// 			{ id: "1", test: true },
	// 			{ id: "2", test: true },
	// 		],
	// 	});
	// 	const llmResponse = {
	// 		state: [
	// 			{ id: "3", test: true },
	// 			{ id: "1", test: false },
	// 		],
	// 	};

	// 	const zodSchema = z.object({
	// 		state: z.array(
	// 			z.object({
	// 				id: z.string(),
	// 				test: z.boolean(),
	// 			}),
	// 		),
	// 	});

	// 	const branchManager = new SharedTreeBranchManager({ objectSchema: zodSchema });
	// 	const diffs = branchManager.compare(
	// 		treeNode as unknown as Record<string, unknown>,
	// 		llmResponse,
	// 	);
	// 	branchManager.mergeDiffs(diffs, treeNode as unknown as Record<string, unknown>);

	// 	const jsonifiedTreeNode = { state: treeNode.state.map((node) => ({ ...node })) };
	// 	assert.deepStrictEqual(jsonifiedTreeNode, llmResponse);
	// });

	// it("Object Node - Simple 0 depth partial value updates with property removal", () => {
	// 	class UserObjectTreeNode extends schemaFactory.object("SimpleMapTreeNode", {
	// 		name: schemaFactory.string,
	// 		age: schemaFactory.number,
	// 		isEmployed: schemaFactory.boolean,
	// 		profileLink: schemaFactory.optional(schemaFactory.string),
	// 	}) {}

	// 	const zodSchema = z.object({
	// 		name: z.string(),
	// 		age: z.number(),
	// 		isEmployed: z.boolean(),
	// 		profileLink: z.string().optional(),
	// 	});

	// 	const treeNode = new UserObjectTreeNode({
	// 		name: "John Doe",
	// 		age: 25,
	// 		isEmployed: true,
	// 		profileLink: "https://example.com",
	// 	});

	// 	const llmResponseObject = {
	// 		name: "Gandalf",
	// 		age: 742,
	// 		isEmployed: true,
	// 	};

	// 	const branchManager = new SharedTreeBranchManager({ objectSchema: zodSchema });
	// 	branchManager.merge(
	// 		treeNode as unknown as Record<string, unknown>,
	// 		llmResponseObject,
	// 	);
	// 	const jsonifiedTreeNode = { ...treeNode };
	// 	assert.deepStrictEqual(jsonifiedTreeNode, llmResponseObject);
	// });

	// it("Object - Create new array node at attribute", () => {
	// 	class WorkItem extends schemaFactory.object("WorkItem", {
	// 		title: schemaFactory.string,
	// 		relatedLinks: schemaFactory.optional(
	// 			schemaFactory.array("ChildWorkItemRelatedLinksArray", [schemaFactory.string]),
	// 		),
	// 	}) {}
	// 	const zodSchema = z.object({
	// 		title: z.string(),
	// 		relatedLinks: z.optional(z.array(z.string())),
	// 	});

	// 	const treeNode = new WorkItem({
	// 		title: "Create a new software feature",
	// 	});
	// 	const llmResponseObject = {
	// 		title: "Create a new software feature",
	// 		relatedLinks: ["https://example.com"],
	// 	};

	// 	const branchManager = new SharedTreeBranchManager({ objectSchema: zodSchema });
	// 	branchManager.merge(
	// 		treeNode as unknown as Record<string, unknown>,
	// 		llmResponseObject,
	// 	);
	// 	const jsonifiedTreeNode = { ...treeNode, relatedLinks: treeNode.relatedLinks?.map((link) => link) };

	// 	assert.deepStrictEqual(jsonifiedTreeNode, llmResponseObject);
	// });

	// it("Object & Array Node - Nested partial value updates with property removal", () => {

	// 	class ChildWorkItem extends schemaFactory.object("ChildWorkItem", {
	// 		title: schemaFactory.string,
	// 		priority: schemaFactory.number,
	// 		description: schemaFactory.string,
	// 		assignedTo: schemaFactory.optional(schemaFactory.string),
	// 		relatedLinks: schemaFactory.optional(schemaFactory.array("ChildWorkItemRelatedLinksArray", [schemaFactory.string]))
	// 	}) {}

	// 	class WorkItem extends schemaFactory.object("WorkItem", {
	// 		title: schemaFactory.string,
	// 		priority: schemaFactory.number,
	// 		description: schemaFactory.string,
	// 		assignedTo: schemaFactory.optional(schemaFactory.string),
	// 		childItems: schemaFactory.array("WorkItemChildItemsArray", [ChildWorkItem]),
	// 		relatedLinks: schemaFactory.array("relatedLinks", [schemaFactory.string])
	// 	}) {}

	// 	const zodSchema = z.object({
	// 		title: z.string(),
	// 		priority: z.number(),
	// 		description: z.string(),
	// 		assignedTo: z.string().optional(),
	// 		childItems: z.array(z.object({
	// 			title: z.string(),
	// 			priority: z.number(),
	// 			description: z.string(),
	// 			assignedTo: z.string().optional(),
	// 			relatedLinks: z.array(z.string()).optional()
	// 		})),
	// 		relatedLinks: z.array(z.string())
	// 	});

	// 	const treeNode = new WorkItem({
	// 		title: "Create a new software feature",
	// 		priority: 3,
	// 		description: "Create a feature for our application that people like",
	// 		relatedLinks: ["https://example.com"],
	// 		childItems: []
	// 	 });

	// 	const llmResponseObject = {
	// 		title: "Create a new software feature",
	// 		priority: 3,
	// 		description: "Create a feature for our application that people like",
	// 		relatedLinks: ["https://example.com"],
	// 		childItems: [
	// 			{
	// 				title: "Write the feature proposal",
	// 				priority: 2,
	// 				description: "Create a proposal for the feature",
	// 			},
	// 			{
	// 				title: "Implement the feature",
	// 				priority: 2,
	// 				description: "implement and test the feature",
	// 			}
	// 		]
	// 	 }

	// 	const branchManager = new SharedTreeBranchManager({objectSchema: zodSchema});
	// 	branchManager.merge(treeNode as unknown as Record<string, unknown>, llmResponseObject);
	// 	const jsonifiedTreeNode = {...treeNode, relatedLinks: treeNode.relatedLinks?.map((link) => link),  childItems: treeNode.childItems.map((item) => ({ ...item }))};
	// 	assert.deepStrictEqual(jsonifiedTreeNode, llmResponseObject);
	// });
