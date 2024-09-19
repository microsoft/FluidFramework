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
import {
	applyAgentEdit,
	isValidContent,
	getJsonValidator,
	// eslint-disable-next-line import/no-internal-modules
} from "../../agent-editing/agentEditReducer.js";
// eslint-disable-next-line import/no-internal-modules
import type { TreeEdit } from "../../agent-editing/agentEditTypes.js";
import { Tree } from "../../shared-tree/index.js";

const sf = new SchemaFactory("agentSchema");

class Vector extends sf.object("Vector", {
	id: sf.identifier, // will be omitted from the generated JSON schema
	x: sf.number,
	y: sf.number,
	z: sf.optional(sf.number),
}) {}

class Vector2 extends sf.object("Vector2", {
	id: sf.identifier, // will be omitted from the generated JSON schema
	x2: sf.number,
	y2: sf.number,
	z2: sf.optional(sf.number),
}) {}

class RootObject extends sf.object("RootObject", {
	str: sf.string,
	// Two different vector types to handle the polymorphic case
	vectors: sf.array([Vector, Vector2]),
	bools: sf.array(sf.boolean),
}) {}

const config = new TreeViewConfiguration({ schema: [sf.number, RootObject] });

const factory = new TreeFactory({});

describe("applyAgentEdit", () => {
	describe("setRoot edits", () => {
		it("polymorphic root", () => {
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

			const setRootEdit: TreeEdit = {
				type: "setRoot",
				content: {
					schemaType: "agentSchema.RootObject",
					str: "rootStr",
					vectors: [],
					bools: [],
				},
			};

			applyAgentEdit(view, setRootEdit, new Map<number, TreeNode>());

			const expected = [
				{
					type: "agentSchema.RootObject",
					fields: {
						bools: [
							{
								type: 'agentSchema.Array<["com.fluidframework.leaf.boolean"]>',
							},
						],
						str: [
							{
								type: "com.fluidframework.leaf.string",
								value: "rootStr",
							},
						],
						vectors: [
							{
								type: 'agentSchema.Array<["agentSchema.Vector","agentSchema.Vector2"]>',
							},
						],
					},
				},
			];

			assert.deepEqual(jsonableTreeFromForest(view.checkout.forest), expected);
		});

		it("optional root", () => {
			const tree = factory.create(
				new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
				"tree",
			);
			const configOptionalRoot = new TreeViewConfiguration({ schema: sf.optional(sf.number) });
			const view = tree.viewWith(configOptionalRoot);
			view.initialize(1);

			const setRootEdit: TreeEdit = {
				type: "setRoot",
				content: 2,
			};

			applyAgentEdit(view, setRootEdit, new Map<number, TreeNode>());

			const expected = [
				{
					type: "com.fluidframework.leaf.number",
					value: 2,
				},
			];

			assert.deepEqual(jsonableTreeFromForest(view.checkout.forest), expected);
		});
	});

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
			content: { schemaType: "agentSchema.Vector", x: 2, y: 3, z: 4 },
			destination: {
				objectId: 0,
				place: "after",
			},
		};
		applyAgentEdit(view, insertEdit, nodeMap);

		const insertEdit2: TreeEdit = {
			type: "insert",
			content: { schemaType: "agentSchema.Vector2", x2: 3, y2: 4, z2: 5 },
			destination: {
				objectId: 0,
				place: "after",
			},
		};
		applyAgentEdit(view, insertEdit2, nodeMap);

		const identifier1 = ((view.root as RootObject).vectors[0] as Vector).id;
		const identifier2 = ((view.root as RootObject).vectors[1] as Vector).id;
		const identifier3 = ((view.root as RootObject).vectors[2] as Vector).id;

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
											x2: [
												{
													type: "com.fluidframework.leaf.number",
													value: 3,
												},
											],
											y2: [
												{
													type: "com.fluidframework.leaf.number",
													value: 4,
												},
											],
											z2: [
												{
													type: "com.fluidframework.leaf.number",
													value: 5,
												},
											],
										},
										type: "agentSchema.Vector2",
									},
									{
										fields: {
											id: [
												{
													type: "com.fluidframework.leaf.string",
													value: identifier3,
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
							type: 'agentSchema.Array<["agentSchema.Vector","agentSchema.Vector2"]>',
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
							type: 'agentSchema.Array<["agentSchema.Vector","agentSchema.Vector2"]>',
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
			modification: [
				{ schemaType: "agentSchema.Vector", x: 2, y: 3, z: 4 },
				{ schemaType: "agentSchema.Vector2", x2: 3, y2: 4, z2: 5 },
			],
		};
		applyAgentEdit(view, modifyEdit, nodeMap);

		const modifyEdit2: TreeEdit = {
			type: "modify",
			target: { objectId: 0 },
			field: "bools",
			modification: [false],
		};
		applyAgentEdit(view, modifyEdit2, nodeMap);

		nodeMap.set(1, (view.root as RootObject).vectors[0] as Vector);

		const modifyEdit3: TreeEdit = {
			type: "modify",
			target: { objectId: 1 },
			field: "x",
			modification: 111,
		};
		applyAgentEdit(view, modifyEdit3, nodeMap);

		const identifier = ((view.root as RootObject).vectors[0] as Vector).id;
		const identifier2 = ((view.root as RootObject).vectors[1] as Vector2).id;

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
									{
										fields: {
											id: [
												{
													type: "com.fluidframework.leaf.string",
													value: identifier2,
												},
											],
											x2: [
												{
													type: "com.fluidframework.leaf.number",
													value: 3,
												},
											],
											y2: [
												{
													type: "com.fluidframework.leaf.number",
													value: 4,
												},
											],
											z2: [
												{
													type: "com.fluidframework.leaf.number",
													value: 5,
												},
											],
										},
										type: "agentSchema.Vector2",
									},
								],
							},
							type: 'agentSchema.Array<["agentSchema.Vector","agentSchema.Vector2"]>',
						},
					],
				},
			},
		];

		assert.deepEqual(jsonableTreeFromForest(view.checkout.forest), expected);
	});

	it("isValidContent", () => {
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

		const validator = getJsonValidator(Tree.schema((view.root as RootObject).vectors[0]));
		assert(isValidContent(1, validator));
	});
});
