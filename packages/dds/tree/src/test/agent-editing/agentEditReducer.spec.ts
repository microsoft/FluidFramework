/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";
import {
	SchemaFactory,
	TreeViewConfiguration,
	type TreeNode,
} from "../../simple-tree/index.js";
import { TreeFactory } from "../../treeFactory.js";
import { createIdCompressor } from "@fluidframework/id-compressor/internal";
import { strict as assert } from "node:assert";
// eslint-disable-next-line import/no-internal-modules
import { jsonableTreeFromForest } from "../../feature-libraries/treeTextCursor.js";
// eslint-disable-next-line import/no-internal-modules
import { applyAgentEdit } from "../../agent-editing/agentEditReducer.js";
// eslint-disable-next-line import/no-internal-modules
import type { TreeEdit } from "../../agent-editing/agentEditTypes.js";

const sf = new SchemaFactory("agentSchema");

class Vector extends sf.object("Vector", {
	id: sf.identifier, // will be omitted from the generated JSON schema
	x: sf.number,
	y: sf.number,
	z: sf.optional(sf.number),
}) {}

class RootObject extends sf.object("RootObject", {
	str: sf.string,
	vectors: sf.array([Vector, sf.number]),
	bools: sf.array(sf.boolean),
}) {}

const config = new TreeViewConfiguration({ schema: [sf.number, RootObject] });

const factory = new TreeFactory({});

describe("applyAgentEdit", () => {
	it("insert edits", () => {
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view = tree.viewWith(config);
		view.initialize({
			str: "testStr",
			vectors: [new Vector({ x: 1, y: 2, z: 3 })],
			bools: [true],
		});

		const vectorNode = (view.root as RootObject).vectors[0];

		const nodeMap: Map<number, TreeNode> = new Map<number, TreeNode>();
		nodeMap.set(0, vectorNode as Vector);

		const insertEdit: TreeEdit = {
			type: "insert",
			content: { x: 2, y: 3, z: 4 },
			destination: {
				objectId: 0,
				place: "after",
			},
		};
		applyAgentEdit(view, insertEdit, nodeMap);
		const identifier1 = ((view.root as RootObject).vectors[0] as Vector).id;
		const identifier2 = ((view.root as RootObject).vectors[1] as Vector).id;

		const expected = [
			{
				type: "agentSchema.RootObject",
				fields: {
					bools: [
						{
							fields: {
								"": [
									{
										type: "com.fluidframework.leaf.boolean",
										value: true,
									},
								],
							},
							type: 'agentSchema.Array<["com.fluidframework.leaf.boolean"]>',
						},
					],
					str: [
						{
							type: "com.fluidframework.leaf.string",
							value: "testStr",
						},
					],
					vectors: [
						{
							fields: {
								"": [
									{
										fields: {
											id: [
												{
													type: "com.fluidframework.leaf.string",
													value: identifier1,
												},
											],
											x: [
												{
													type: "com.fluidframework.leaf.number",
													value: 1,
												},
											],
											y: [
												{
													type: "com.fluidframework.leaf.number",
													value: 2,
												},
											],
											z: [
												{
													type: "com.fluidframework.leaf.number",
													value: 3,
												},
											],
										},
										type: "agentSchema.Vector",
									},
									{
										fields: {
											id: [
												{
													type: "com.fluidframework.leaf.string",
													value: identifier2,
												},
											],
											x: [
												{
													type: "com.fluidframework.leaf.number",
													value: 2,
												},
											],
											y: [
												{
													type: "com.fluidframework.leaf.number",
													value: 3,
												},
											],
											z: [
												{
													type: "com.fluidframework.leaf.number",
													value: 4,
												},
											],
										},
										type: "agentSchema.Vector",
									},
								],
							},
							type: 'agentSchema.Array<["agentSchema.Vector","com.fluidframework.leaf.number"]>',
						},
					],
				},
			},
		];

		assert.deepEqual(jsonableTreeFromForest(view.checkout.forest), expected);
	});
	it("remove edits", () => {
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view = tree.viewWith(config);

		view.initialize({
			str: "testStr",
			vectors: [new Vector({ x: 1, y: 2, z: 3 })],
			bools: [true],
		});

		const vectorNode = (view.root as RootObject).vectors[0];

		const nodeMap: Map<number, TreeNode> = new Map<number, TreeNode>();
		nodeMap.set(0, vectorNode as Vector);

		const removeEdit: TreeEdit = {
			type: "remove",
			source: { objectId: 0 },
		};
		applyAgentEdit(view, removeEdit, nodeMap);

		const expected = [
			{
				type: "agentSchema.RootObject",
				fields: {
					bools: [
						{
							fields: {
								"": [
									{
										type: "com.fluidframework.leaf.boolean",
										value: true,
									},
								],
							},
							type: 'agentSchema.Array<["com.fluidframework.leaf.boolean"]>',
						},
					],
					str: [
						{
							type: "com.fluidframework.leaf.string",
							value: "testStr",
						},
					],
					vectors: [
						{
							type: 'agentSchema.Array<["agentSchema.Vector","com.fluidframework.leaf.number"]>',
						},
					],
				},
			},
		];

		assert.deepEqual(jsonableTreeFromForest(view.checkout.forest), expected);
	});
	it("modify edits", () => {
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view = tree.viewWith(config);

		view.initialize({
			str: "testStr",
			vectors: [new Vector({ x: 1, y: 2, z: 3 })],
			bools: [true],
		});


		const nodeMap: Map<number, TreeNode> = new Map<number, TreeNode>();
		nodeMap.set(0, view.root as TreeNode);

		const modifyEdit: TreeEdit = {
			type: "modify",
			target: { objectId: 0 },
			field: "vectors",
			modification: [{ x: 11, y: 22, z: 33 }, 2],
		};
		applyAgentEdit(view, modifyEdit, nodeMap);

		const modifyEdit2: TreeEdit = {
			type: "modify",
			target: { objectId: 0 },
			field: "bools",
			modification: [false],
		};
		applyAgentEdit(view, modifyEdit2, nodeMap);


		nodeMap.set(1, (view.root as RootObject).vectors[0] as Vector)

		const modifyEdit3: TreeEdit = {
			type: "modify",
			target: { objectId: 1 },
			field: "x",
			modification: 111,
		};
		applyAgentEdit(view, modifyEdit3, nodeMap);
		
		const identifier = ((view.root as RootObject).vectors[0] as Vector).id;

		const expected = [
			{
				type: "agentSchema.RootObject",
				fields: {
					bools: [
						{
							fields: {
								"": [
									{
										type: "com.fluidframework.leaf.boolean",
										value: false,
									},
								],
							},
							type: 'agentSchema.Array<["com.fluidframework.leaf.boolean"]>',
						},
					],
					str: [
						{
							type: "com.fluidframework.leaf.string",
							value: "testStr",
						},
					],
					vectors: [
						{
							fields: {
								"": [
									{
										fields: {
											id: [
												{
													type: "com.fluidframework.leaf.string",
													value: identifier,
												},
											],
											x: [
												{
													type: "com.fluidframework.leaf.number",
													value: 111,
												},
											],
											y: [
												{
													type: "com.fluidframework.leaf.number",
													value: 22,
												},
											],
											z: [
												{
													type: "com.fluidframework.leaf.number",
													value: 33,
												},
											],
										},
										type: "agentSchema.Vector",
									},
									{
										type: "com.fluidframework.leaf.number",
										value: 2,
									},
								],
							},
							type: 'agentSchema.Array<["agentSchema.Vector","com.fluidframework.leaf.number"]>',
						},
					],
				},
			},
		];

		assert.deepEqual(jsonableTreeFromForest(view.checkout.forest), expected);
	});
});
