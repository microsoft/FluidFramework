/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";
import {
	getSimpleSchema,
	normalizeFieldSchema,
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
	assertValidContent,
	getJsonValidator,
	typeField,
	// eslint-disable-next-line import/no-internal-modules
} from "../../agent-editing/agentEditReducer.js";
// eslint-disable-next-line import/no-internal-modules
import type { TreeEdit } from "../../agent-editing/agentEditTypes.js";
import { validateUsageError } from "../utils.js";

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

class RootObjectPolymorphic extends sf.object("RootObject", {
	str: sf.string,
	// Two different vector types to handle the polymorphic case
	vectors: sf.array([Vector, Vector2]),
	bools: sf.array(sf.boolean),
}) {}

class RootObject extends sf.object("RootObject", {
	str: sf.string,
	// Two different vector types to handle the polymorphic case
	vectors: sf.array([Vector]),
	bools: sf.array(sf.boolean),
}) {}

class RootObjectWithMultipleVectors extends sf.object("RootObject", {
	str: sf.string,
	// Two different vector types to handle the polymorphic case
	vectors: sf.array([Vector]),
	vectors2: sf.array([Vector]),
	bools: sf.array(sf.boolean),
}) {}
const config = new TreeViewConfiguration({ schema: [sf.number, RootObjectPolymorphic] });

const factory = new TreeFactory({});

describe("applyAgentEdit", () => {
	describe("setRoot edits", () => {
		it("polymorphic root", () => {
			const tree = factory.create(
				new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
				"tree",
			);
			const view = tree.viewWith(config);
			const schema = normalizeFieldSchema(view.schema);
			const simpleSchema = getSimpleSchema(schema.allowedTypes);
			view.initialize({
				str: "testStr",
				vectors: [new Vector({ x: 1, y: 2, z: 3 })],
				bools: [true],
			});

			const setRootEdit: TreeEdit = {
				type: "setRoot",
				content: {
					[typeField]: RootObjectPolymorphic.identifier,
					str: "rootStr",
					vectors: [],
					bools: [],
				},
			};

			applyAgentEdit(view, setRootEdit, new Map<number, TreeNode>(), simpleSchema.definitions);

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
			const schema = normalizeFieldSchema(view.schema);
			const simpleSchema = getSimpleSchema(schema.allowedTypes);
			view.initialize(1);

			const setRootEdit: TreeEdit = {
				type: "setRoot",
				content: 2,
			};

			applyAgentEdit(view, setRootEdit, new Map<number, TreeNode>(), simpleSchema.definitions);

			const expected = [
				{
					type: "com.fluidframework.leaf.number",
					value: 2,
				},
			];

			assert.deepEqual(jsonableTreeFromForest(view.checkout.forest), expected);
		});
	});

	describe("insert edits", () => {
		it("polymorphic insert edits", () => {
			const tree = factory.create(
				new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
				"tree",
			);
			const view = tree.viewWith(config);
			const schema = normalizeFieldSchema(view.schema);
			const simpleSchema = getSimpleSchema(schema.allowedTypes);

			view.initialize({
				str: "testStr",
				vectors: [new Vector({ x: 1, y: 2, z: 3 })],
				bools: [true],
			});

			const vectorNode = (view.root as RootObjectPolymorphic).vectors[0];

			const nodeMap: Map<number, TreeNode> = new Map<number, TreeNode>();
			nodeMap.set(0, vectorNode as Vector);

			const insertEdit: TreeEdit = {
				type: "insert",
				content: { [typeField]: Vector.identifier, x: 2, y: 3, z: 4 },
				destination: {
					objectId: 0,
					place: "after",
				},
			};
			applyAgentEdit(view, insertEdit, nodeMap, simpleSchema.definitions);

			const insertEdit2: TreeEdit = {
				type: "insert",
				content: { [typeField]: Vector2.identifier, x2: 3, y2: 4, z2: 5 },
				destination: {
					objectId: 0,
					place: "after",
				},
			};
			applyAgentEdit(view, insertEdit2, nodeMap, simpleSchema.definitions);

			const identifier1 = ((view.root as RootObjectPolymorphic).vectors[0] as Vector).id;
			const identifier2 = ((view.root as RootObjectPolymorphic).vectors[1] as Vector).id;
			const identifier3 = ((view.root as RootObjectPolymorphic).vectors[2] as Vector).id;

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

		it("non polymorphic insert edits", () => {
			const tree = factory.create(
				new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
				"tree",
			);
			const config2 = new TreeViewConfiguration({ schema: [sf.number, RootObject] });
			const view = tree.viewWith(config2);
			const schema = normalizeFieldSchema(view.schema);
			const simpleSchema = getSimpleSchema(schema.allowedTypes);

			view.initialize({
				str: "testStr",
				vectors: [new Vector({ x: 1, y: 2, z: 3 })],
				bools: [true],
			});

			const vectorNode = (view.root as RootObject).vectors[0];

			const nodeMap: Map<number, TreeNode> = new Map<number, TreeNode>();
			nodeMap.set(0, vectorNode);

			const insertEdit: TreeEdit = {
				type: "insert",
				content: { [typeField]: Vector.identifier, x: 2, y: 3, z: 4 },
				destination: {
					objectId: 0,
					place: "after",
				},
			};
			applyAgentEdit(view, insertEdit, nodeMap, simpleSchema.definitions);

			const identifier1 = (view.root as RootObject).vectors[0].id;
			const identifier2 = (view.root as RootObject).vectors[1].id;

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
								type: 'agentSchema.Array<["agentSchema.Vector"]>',
							},
						],
					},
				},
			];

			assert.deepEqual(jsonableTreeFromForest(view.checkout.forest), expected);
		});
	});

	it("modify edits", () => {
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const view = tree.viewWith(config);
		const schema = normalizeFieldSchema(view.schema);
		const simpleSchema = getSimpleSchema(schema.allowedTypes);

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
				{ [typeField]: Vector.identifier, x: 2, y: 3, z: 4 },
				{ [typeField]: Vector2.identifier, x2: 3, y2: 4, z2: 5 },
			],
		};
		applyAgentEdit(view, modifyEdit, nodeMap, simpleSchema.definitions);

		const modifyEdit2: TreeEdit = {
			type: "modify",
			target: { objectId: 0 },
			field: "bools",
			modification: [false],
		};
		applyAgentEdit(view, modifyEdit2, nodeMap, simpleSchema.definitions);

		nodeMap.set(1, (view.root as RootObjectPolymorphic).vectors[0] as Vector);

		const modifyEdit3: TreeEdit = {
			type: "modify",
			target: { objectId: 1 },
			field: "x",
			modification: 111,
		};
		applyAgentEdit(view, modifyEdit3, nodeMap, simpleSchema.definitions);

		const identifier = ((view.root as RootObjectPolymorphic).vectors[0] as Vector).id;
		const identifier2 = ((view.root as RootObjectPolymorphic).vectors[1] as Vector2).id;

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

	describe("Move Edits", () => {
		it("move a single item", () => {
			const tree = factory.create(
				new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
				"tree",
			);
			const configWithMultipleVectors = new TreeViewConfiguration({
				schema: [RootObjectWithMultipleVectors],
			});
			const view = tree.viewWith(configWithMultipleVectors);
			const schema = normalizeFieldSchema(view.schema);
			const simpleSchema = getSimpleSchema(schema.allowedTypes);

			view.initialize({
				str: "testStr",
				vectors: [new Vector({ x: 1, y: 2, z: 3 })],
				vectors2: [new Vector({ x: 2, y: 3, z: 4 })],
				bools: [true],
			});

			const nodeMap: Map<number, TreeNode> = new Map<number, TreeNode>();
			nodeMap.set(0, view.root.vectors[0]);
			nodeMap.set(1, view.root.vectors2[0]);

			const moveEdit: TreeEdit = {
				type: "move",
				source: { objectId: 0 },
				destination: { place: "before", objectId: 1 },
			};
			applyAgentEdit(view, moveEdit, nodeMap, simpleSchema.definitions);
			const identifier = view.root.vectors2[0].id;
			const identifier2 = view.root.vectors2[1].id;

			const expected = {
				"str": "testStr",
				"vectors": [],
				"vectors2": [
					{
						"id": identifier,
						"x": 1,
						"y": 2,
						"z": 3,
					},
					{
						"id": identifier2,
						"x": 2,
						"y": 3,
						"z": 4,
					},
				],
				"bools": [true],
			};
			assert.deepEqual(
				JSON.stringify(view.root, undefined, 2),
				JSON.stringify(expected, undefined, 2),
			);
		});

		it("move range of items", () => {
			const tree = factory.create(
				new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
				"tree",
			);
			const configWithMultipleVectors = new TreeViewConfiguration({
				schema: [RootObjectWithMultipleVectors],
			});
			const view = tree.viewWith(configWithMultipleVectors);
			const schema = normalizeFieldSchema(view.schema);
			const simpleSchema = getSimpleSchema(schema.allowedTypes);

			view.initialize({
				str: "testStr",
				vectors: [new Vector({ x: 1, y: 2, z: 3 }), new Vector({ x: 2, y: 3, z: 4 })],
				vectors2: [new Vector({ x: 3, y: 4, z: 5 })],
				bools: [true],
			});

			const nodeMap: Map<number, TreeNode> = new Map<number, TreeNode>();
			nodeMap.set(0, view.root.vectors[0]);
			nodeMap.set(1, view.root.vectors[1]);
			nodeMap.set(2, view.root.vectors2[0]);

			const moveEdit: TreeEdit = {
				type: "move",
				source: {
					from: { place: "before", objectId: 0 },
					to: { place: "after", objectId: 1 },
				},
				destination: { place: "before", objectId: 2 },
			};
			applyAgentEdit(view, moveEdit, nodeMap, simpleSchema.definitions);
			const identifier = view.root.vectors2[0].id;
			const identifier2 = view.root.vectors2[1].id;
			const identifier3 = view.root.vectors2[2].id;

			const expected = {
				"str": "testStr",
				"vectors": [],
				"vectors2": [
					{
						"id": identifier,
						"x": 1,
						"y": 2,
						"z": 3,
					},
					{
						"id": identifier2,
						"x": 2,
						"y": 3,
						"z": 4,
					},
					{
						"id": identifier3,
						"x": 3,
						"y": 4,
						"z": 5,
					},
				],
				"bools": [true],
			};
			assert.deepEqual(
				JSON.stringify(view.root, undefined, 2),
				JSON.stringify(expected, undefined, 2),
			);
		});
	});

	describe("assertValidContent content", () => {
		it("invalid content throws", () => {
			const validator = getJsonValidator(Vector);
			assert.throws(
				() => assertValidContent(12, validator),
				validateUsageError(/invalid data with schema/),
			);
		});

		it("valid content passes", () => {
			const validator = getJsonValidator(Vector);
			assertValidContent({ x: 1, y: 2, z: 3 }, validator);
		});
	});
});
