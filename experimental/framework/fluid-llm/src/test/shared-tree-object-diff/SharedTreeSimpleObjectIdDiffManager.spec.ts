// import { strict as assert } from "node:assert";

import { SchemaFactory } from "@fluidframework/tree";
import * as z from "zod";

import { SharedTreeSimpleObjectDiffManager } from "../../shared-tree-object-diff/index.js";


const schemaFactory = new SchemaFactory("TreeNodeTest");

describe("SharedTreeSimpleObjectIdDiffManager", () => {


	it("Simple map value update", () => {
		class SimpleMapTreeNode extends schemaFactory.map("SimpleMapTreeNode", [schemaFactory.boolean]) {};
		const zodSchema = z.object({
			test: z.boolean(),
		});

		const treeNode = new SimpleMapTreeNode({ test: true });
		const llmResponseObject = { test: false };

		const diffManager = new SharedTreeSimpleObjectDiffManager({zodSchema});

		diffManager.compareAndApplyDiffs(treeNode as unknown as Record<string, unknown>, llmResponseObject);

		const treeNodeValue = treeNode.get("test");

		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/dot-notation
		const treeNodeValue2 = treeNode['test'];

		// debugger

		// assert.equal(treeNode.get("test"), false);
	});


	it("Testing move, remove create scenarios", () => {
		class SimpleObjectTreeNode extends schemaFactory.object("SimpleTreeNode", {
			id: schemaFactory.identifier,
			test: schemaFactory.boolean,
		}) {};
		class ObjectTreeNode extends schemaFactory.object("ObjectTreeNode", {
			state: schemaFactory.array("NestedStringTreeArrayNode", [schemaFactory.string, SimpleObjectTreeNode]),
		}) {};

		const treeNode = new ObjectTreeNode({ state: [{ id: '1', test: true }, { id: '2', test: true }] });


		treeNode.state.moveToIndex(0, 1);

		const itemAt0 = treeNode.state[0];

		debugger;



	})

	// it("Simple object value update", () => {
	// 	class UserObjectTreeNode extends schemaFactory.object("SimpleMapTreeNode", {
	// 		name: schemaFactory.string,
	// 		age: schemaFactory.number,
	// 		isEmployed: schemaFactory.boolean,
	// 		profileLink: schemaFactory.optional(schemaFactory.string)
	// 	}) {};

	// 	const zodSchema = z.object({
	// 		name: z.string(),
	// 		age: z.number(),
	// 		isEmployed: z.boolean(),
	// 		profileLink: z.string().optional()
	// 	});

	// 	const treeNode = new UserObjectTreeNode({
	// 		name: "John Doe",
	// 		age: 25,
	// 		isEmployed: true,
	// 		profileLink: "https://example.com"
	// 	 });

	// 	const llmResponseObject = {
	// 		name: "Gandalf",
	// 		age: 742,
	// 		isEmployed: false,
	// 	};

	// 	const diffManager = new SharedTreeSimpleObjectDiffManager({zodSchema});

	// 	diffManager.compareAndApplyDiffs(treeNode as unknown as Record<string, unknown>, llmResponseObject);

	// 	debugger;
	// 	assert.equal(treeNode, false);
	// });



});
