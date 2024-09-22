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
import { strict as assert, fail } from "node:assert";
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
import { objectIdKey, type TreeEdit } from "../../agent-editing/agentEditTypes.js";
import { validateUsageError } from "../utils.js";
// eslint-disable-next-line import/no-internal-modules
import { assignIds } from "../../agent-editing/promptGeneration.js";

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

class RootObjectWithMultipleVectorArrays extends sf.object("RootObject", {
	str: sf.string,
	// Two different vector types to handle the polymorphic case
	vectors: sf.array([Vector]),
	vectors2: sf.array([Vector]),
	bools: sf.array(sf.boolean),
}) {}

class RootObjectWithDifferentVectorArrayTypes extends sf.object("RootObject", {
	str: sf.string,
	// Two different vector types to handle the polymorphic case
	vectors: sf.array([Vector]),
	vectors2: sf.array([Vector2]),
	bools: sf.array(sf.boolean),
}) {}
const config = new TreeViewConfiguration({ schema: [sf.number, RootObjectPolymorphic] });

const factory = new TreeFactory({});

describe("applyAgentEdit", () => {
	let log: TreeEdit[];
	let idCount: { current: 0 };
	let idToNode: Map<number, TreeNode>;
	let nodeToId: Map<TreeNode, number>;
	beforeEach(() => {
		log = [];
		idCount = { current: 0 };
		idToNode = new Map<number, TreeNode>();
		nodeToId = new Map<TreeNode, number>();
	});
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
				explanation: "Set root to object",
				type: "setRoot",
				content: {
					[typeField]: RootObjectPolymorphic.identifier,
					str: "rootStr",
					vectors: [],
					bools: [],
				},
			};

			applyAgentEdit(
				view,
				log,
				setRootEdit,
				idCount,
				idToNode,
				nodeToId,
				simpleSchema.definitions,
			);

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
				explanation: "Set root to 2",
				type: "setRoot",
				content: 2,
			};

			applyAgentEdit(
				view,
				log,
				setRootEdit,
				idCount,
				idToNode,
				nodeToId,
				simpleSchema.definitions,
			);

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
			assignIds(view.root, idCount, idToNode, nodeToId);
			const vectorId =
				nodeToId.get((view.root as RootObjectPolymorphic).vectors[0]) ?? fail("ID expected.");

			const insertEdit: TreeEdit = {
				explanation: "Insert a vector",
				type: "insert",
				content: { [typeField]: Vector.identifier, x: 2, y: 3, z: 4 },
				destination: {
					type: "objectPlace",
					[objectIdKey]: vectorId,
					place: "after",
				},
			};
			applyAgentEdit(
				view,
				log,
				insertEdit,
				idCount,
				idToNode,
				nodeToId,
				simpleSchema.definitions,
			);

			const insertEdit2: TreeEdit = {
				explanation: "Insert a vector",
				type: "insert",
				content: { [typeField]: Vector2.identifier, x2: 3, y2: 4, z2: 5 },
				destination: {
					type: "objectPlace",
					[objectIdKey]: vectorId,
					place: "after",
				},
			};
			applyAgentEdit(
				view,
				log,
				insertEdit2,
				idCount,
				idToNode,
				nodeToId,
				simpleSchema.definitions,
			);

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

			assignIds(view.root, idCount, idToNode, nodeToId);
			const vectorId =
				nodeToId.get((view.root as RootObject).vectors[0]) ?? fail("ID expected.");

			const insertEdit: TreeEdit = {
				explanation: "Insert a vector",
				type: "insert",
				content: { [typeField]: Vector.identifier, x: 2, y: 3, z: 4 },
				destination: {
					type: "objectPlace",
					[objectIdKey]: vectorId,
					place: "after",
				},
			};
			applyAgentEdit(
				view,
				log,
				insertEdit,
				idCount,
				idToNode,
				nodeToId,
				simpleSchema.definitions,
			);

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

		assignIds(view.root, idCount, idToNode, nodeToId);
		const vectorId = nodeToId.get(view.root as TreeNode) ?? fail("ID expected.");

		const modifyEdit: TreeEdit = {
			explanation: "Modify a vector",
			type: "modify",
			target: { __fluid_objectId: vectorId },
			field: "vectors",
			modification: [
				{ [typeField]: Vector.identifier, x: 2, y: 3, z: 4 },
				{ [typeField]: Vector2.identifier, x2: 3, y2: 4, z2: 5 },
			],
		};
		applyAgentEdit(
			view,
			log,
			modifyEdit,
			idCount,
			idToNode,
			nodeToId,
			simpleSchema.definitions,
		);

		const modifyEdit2: TreeEdit = {
			explanation: "Modify a vector",
			type: "modify",
			target: { __fluid_objectId: vectorId },
			field: "bools",
			modification: [false],
		};
		applyAgentEdit(
			view,
			log,
			modifyEdit2,
			idCount,
			idToNode,
			nodeToId,
			simpleSchema.definitions,
		);

		assignIds(view.root, idCount, idToNode, nodeToId);
		const vectorId2 =
			nodeToId.get((view.root as RootObjectPolymorphic).vectors[0] as Vector) ??
			fail("ID expected.");

		const modifyEdit3: TreeEdit = {
			explanation: "Modify a vector",
			type: "modify",
			target: { __fluid_objectId: vectorId2 },
			field: "x",
			modification: 111,
		};
		applyAgentEdit(
			view,
			log,
			modifyEdit3,
			idCount,
			idToNode,
			nodeToId,
			simpleSchema.definitions,
		);

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
				schema: [RootObjectWithMultipleVectorArrays],
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

			assignIds(view.root, idCount, idToNode, nodeToId);
			const vectorId1 = nodeToId.get(view.root.vectors[0]) ?? fail("ID expected.");
			const vectorId2 = nodeToId.get(view.root) ?? fail("ID expected.");

			const moveEdit: TreeEdit = {
				explanation: "Move a vector",
				type: "move",
				source: { [objectIdKey]: vectorId1 },
				destination: {
					type: "arrayPlace",
					parentId: vectorId2,
					field: "vectors2",
					location: "start",
				},
			};
			applyAgentEdit(
				view,
				log,
				moveEdit,
				idCount,
				idToNode,
				nodeToId,
				simpleSchema.definitions,
			);
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
				schema: [RootObjectWithMultipleVectorArrays],
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

			assignIds(view.root, idCount, idToNode, nodeToId);
			const vectorId1 = nodeToId.get(view.root.vectors[0]) ?? fail("ID expected.");
			const vectorId2 = nodeToId.get(view.root.vectors[1]) ?? fail("ID expected.");
			const vectorId3 = nodeToId.get(view.root) ?? fail("ID expected.");

			const moveEdit: TreeEdit = {
				explanation: "Move a vector",
				type: "move",
				source: {
					from: {
						[objectIdKey]: vectorId1,
						type: "objectPlace",
						place: "before",
					},
					to: {
						[objectIdKey]: vectorId2,
						type: "objectPlace",
						place: "after",
					},
				},
				destination: {
					type: "arrayPlace",
					parentId: vectorId3,
					field: "vectors2",
					location: "start",
				},
			};
			applyAgentEdit(
				view,
				log,
				moveEdit,
				idCount,
				idToNode,
				nodeToId,
				simpleSchema.definitions,
			);
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

		it("moving invalid types fails", () => {
			const tree = factory.create(
				new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
				"tree",
			);
			const configWithMultipleVectors = new TreeViewConfiguration({
				schema: [RootObjectWithDifferentVectorArrayTypes],
			});
			const view = tree.viewWith(configWithMultipleVectors);
			const schema = normalizeFieldSchema(view.schema);
			const simpleSchema = getSimpleSchema(schema.allowedTypes);

			view.initialize({
				str: "testStr",
				vectors: [new Vector({ x: 1, y: 2, z: 3 }), new Vector({ x: 2, y: 3, z: 4 })],
				vectors2: [new Vector2({ x2: 3, y2: 4, z2: 5 })],
				bools: [true],
			});

			assignIds(view.root, idCount, idToNode, nodeToId);
			const vectorId1 = nodeToId.get(view.root.vectors[0]) ?? fail("ID expected.");
			const vectorId2 = nodeToId.get(view.root.vectors[1]) ?? fail("ID expected.");
			const vectorId3 = nodeToId.get(view.root) ?? fail("ID expected.");

			const moveEdit: TreeEdit = {
				type: "move",
				explanation: "Move a vector",
				source: {
					from: {
						[objectIdKey]: vectorId1,
						type: "objectPlace",
						place: "before",
					},
					to: {
						[objectIdKey]: vectorId2,
						type: "objectPlace",
						place: "after",
					},
				},
				destination: {
					type: "arrayPlace",
					parentId: vectorId3,
					field: "vectors2",
					location: "start",
				},
			};
			assert.throws(
				() =>
					applyAgentEdit(
						view,
						log,
						moveEdit,
						idCount,
						idToNode,
						nodeToId,
						simpleSchema.definitions,
					),
				validateUsageError(/Illegal node type in destination array/),
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
