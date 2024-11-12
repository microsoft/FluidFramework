/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { SchemaFactory } from "@fluidframework/tree";
import * as z from "zod";

import { SharedTreeBranchManager } from "../../implicit-strategy/index.js";

const schemaFactory = new SchemaFactory("TreeNodeTest");

describe("SharedTreeBranchManager", () => {
	it("Array Node Items - Change, Move, Array, Create scenario", () => {
		class SimpleObjectTreeNode extends schemaFactory.object("SimpleTreeNode", {
			id: schemaFactory.identifier,
			test: schemaFactory.boolean,
		}) {}
		class ObjectTreeNode extends schemaFactory.object("ObjectTreeNode", {
			state: schemaFactory.array("NestedStringTreeArrayNode", [SimpleObjectTreeNode]),
		}) {}

		const treeNode = new ObjectTreeNode({
			state: [
				{ id: "1", test: true },
				{ id: "2", test: true },
			],
		});
		const llmResponse = {
			state: [
				{ id: "3", test: true },
				{ id: "1", test: false },
			],
		};

		const zodSchema = z.object({
			state: z.array(
				z.object({
					id: z.string(),
					test: z.boolean(),
				}),
			),
		});

		const branchManager = new SharedTreeBranchManager({
			objectSchema: zodSchema,
			nodeIdAttributeName: "id",
		});
		const diffs = branchManager.compare(
			treeNode as unknown as Record<string, unknown>,
			llmResponse,
		);
		branchManager.mergeDiffs(diffs, treeNode as unknown as Record<string, unknown>);

		const jsonifiedTreeNode = { state: treeNode.state.map((node) => ({ ...node })) };
		assert.deepStrictEqual(jsonifiedTreeNode, llmResponse);
	});

	it("Object Node - Simple 0 depth partial value updates with property removal", () => {
		class UserObjectTreeNode extends schemaFactory.object("SimpleMapTreeNode", {
			name: schemaFactory.string,
			age: schemaFactory.number,
			isEmployed: schemaFactory.boolean,
			profileLink: schemaFactory.optional(schemaFactory.string),
		}) {}

		const zodSchema = z.object({
			name: z.string(),
			age: z.number(),
			isEmployed: z.boolean(),
			profileLink: z.string().optional(),
		});

		const treeNode = new UserObjectTreeNode({
			name: "John Doe",
			age: 25,
			isEmployed: true,
			profileLink: "https://example.com",
		});

		const llmResponseObject = {
			name: "Gandalf",
			age: 742,
			isEmployed: true,
		};

		const branchManager = new SharedTreeBranchManager({
			objectSchema: zodSchema,
			nodeIdAttributeName: "id",
		});
		branchManager.mergeObject(
			treeNode as unknown as Record<string, unknown>,
			llmResponseObject,
		);
		const jsonifiedTreeNode = { ...treeNode };
		assert.deepStrictEqual(jsonifiedTreeNode, llmResponseObject);
	});

	it("Object - Create new array node at attribute", () => {
		class WorkItem extends schemaFactory.object("WorkItem", {
			title: schemaFactory.string,
			relatedLinks: schemaFactory.optional(
				schemaFactory.array("ChildWorkItemRelatedLinksArray", [schemaFactory.string]),
			),
		}) {}
		const zodSchema = z.object({
			title: z.string(),
			relatedLinks: z.optional(z.array(z.string())),
		});

		const treeNode = new WorkItem({
			title: "Create a new software feature",
		});
		const llmResponseObject = {
			title: "Create a new software feature",
			relatedLinks: ["https://example.com"],
		};

		const branchManager = new SharedTreeBranchManager({
			objectSchema: zodSchema,
			nodeIdAttributeName: "id",
		});
		branchManager.mergeObject(
			treeNode as unknown as Record<string, unknown>,
			llmResponseObject,
		);
		const jsonifiedTreeNode = {
			...treeNode,
			relatedLinks: treeNode.relatedLinks?.map((link) => link),
		};

		assert.deepStrictEqual(jsonifiedTreeNode, llmResponseObject);
	});

	it("Object & Array Node - Nested partial value updates with property removal", () => {
		class ChildWorkItem extends schemaFactory.object("ChildWorkItem", {
			title: schemaFactory.string,
			priority: schemaFactory.number,
			description: schemaFactory.string,
			assignedTo: schemaFactory.optional(schemaFactory.string),
			relatedLinks: schemaFactory.optional(
				schemaFactory.array("ChildWorkItemRelatedLinksArray", [schemaFactory.string]),
			),
		}) {}

		class WorkItem extends schemaFactory.object("WorkItem", {
			title: schemaFactory.string,
			priority: schemaFactory.number,
			description: schemaFactory.string,
			assignedTo: schemaFactory.optional(schemaFactory.string),
			childItems: schemaFactory.array("WorkItemChildItemsArray", [ChildWorkItem]),
			relatedLinks: schemaFactory.array("relatedLinks", [schemaFactory.string]),
		}) {}

		const zodSchema = z.object({
			title: z.string(),
			priority: z.number(),
			description: z.string(),
			assignedTo: z.string().optional(),
			childItems: z.array(
				z.object({
					title: z.string(),
					priority: z.number(),
					description: z.string(),
					assignedTo: z.string().optional(),
					relatedLinks: z.array(z.string()).optional(),
				}),
			),
			relatedLinks: z.array(z.string()),
		});

		const treeNode = new WorkItem({
			title: "Create a new software feature",
			priority: 3,
			description: "Create a feature for our application that people like",
			relatedLinks: ["https://example.com"],
			childItems: [],
		});

		const llmResponseObject = {
			title: "Create a new software feature",
			priority: 3,
			description: "Create a feature for our application that people like",
			relatedLinks: ["https://example.com"],
			childItems: [
				{
					title: "Write the feature proposal",
					priority: 2,
					description: "Create a proposal for the feature",
				},
				{
					title: "Implement the feature",
					priority: 2,
					description: "implement and test the feature",
				},
			],
		};

		const branchManager = new SharedTreeBranchManager({ objectSchema: zodSchema });
		branchManager.mergeObject(
			treeNode as unknown as Record<string, unknown>,
			llmResponseObject,
		);
		const jsonifiedTreeNode = {
			...treeNode,
			relatedLinks: treeNode.relatedLinks?.map((link) => link),
			childItems: treeNode.childItems.map((item) => ({ ...item })),
		};
		assert.deepStrictEqual(jsonifiedTreeNode, llmResponseObject);
	});

	it("Array Item Nodes swap indexes", () => {
		class ArrayItemNode extends schemaFactory.object("ArrayItemNode", {
			id: schemaFactory.identifier,
			test: schemaFactory.boolean,
		}) {}

		class ArrayListNode extends schemaFactory.array("ArrayListNode", [ArrayItemNode]) {}

		const treeNode = new ArrayListNode([
			{ id: "1", test: true },
			{ id: "2", test: true },
		]);

		const llmResponse = [
			{ id: "2", test: true },
			{ id: "1", test: true },
		];

		const branchManager = new SharedTreeBranchManager({ nodeIdAttributeName: "id" });
		branchManager.mergeObject(treeNode as unknown as Record<string, unknown>, llmResponse);

		const jsonifiedTreeNode = treeNode.map((node) => ({ ...node }));
		assert.deepStrictEqual(jsonifiedTreeNode, llmResponse);
	});

	it("Array Item Nodes change & swap indexes", () => {
		class ArrayItemNode extends schemaFactory.object("ArrayItemNode", {
			id: schemaFactory.identifier,
			test: schemaFactory.boolean,
		}) {}

		class ArrayListNode extends schemaFactory.array("ArrayListNode", [ArrayItemNode]) {}

		const treeNode = new ArrayListNode([
			{ id: "1", test: true },
			{ id: "2", test: true },
		]);

		const llmResponse = [
			{ id: "2", test: true },
			{ id: "1", test: false },
		];

		const branchManager = new SharedTreeBranchManager({ nodeIdAttributeName: "id" });
		branchManager.mergeObject(treeNode as unknown as Record<string, unknown>, llmResponse);

		const jsonifiedTreeNode = treeNode.map((node) => ({ ...node }));
		assert.deepStrictEqual(jsonifiedTreeNode, llmResponse);
	});
});
