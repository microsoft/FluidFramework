import { strict as assert } from "node:assert";

import { SchemaFactory } from "@fluidframework/tree";

import { sharedTreeObjectDiff } from "../../shared-tree-object-diff/index.js";

const schemaFactory = new SchemaFactory("TreeNodeTest");

describe("sharedTreeObjectDiff - arrays", () => {
	class StringArrayNode extends schemaFactory.array(
		"StringTreeArrayNode",
		schemaFactory.string,
	) {}

	it("top level array & array diff", () => {
		const treeNode = new StringArrayNode(["test", "testing"]);
		const diffs = sharedTreeObjectDiff(treeNode as unknown as unknown[], ["test"]);
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
			sharedTreeObjectDiff(treeNode as unknown as unknown[], ["test", ["test", "test2"]]),
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
		const diffs = sharedTreeObjectDiff(treeNode as unknown as Record<string, unknown>, {
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
		assert.deepStrictEqual(sharedTreeObjectDiff({ data: [] }, { data: { val: "test" } }), [
			{ type: "CHANGE", path: ["data"], value: { val: "test" }, oldValue: [] },
		]);
	});
});

describe("sharedTreeObjectDiff - arrays with object ID strategy", () => {
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
		const diffs = sharedTreeObjectDiff(
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
		const diffs = sharedTreeObjectDiff(
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
		const diffs = sharedTreeObjectDiff(
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
		const diffs = sharedTreeObjectDiff(
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
		const diffs = sharedTreeObjectDiff(
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
