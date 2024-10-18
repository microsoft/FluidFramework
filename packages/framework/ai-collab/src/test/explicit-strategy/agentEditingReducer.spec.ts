/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "node:assert";

// eslint-disable-next-line import/no-internal-modules
import { createIdCompressor } from "@fluidframework/id-compressor/internal";
// eslint-disable-next-line import/no-internal-modules
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";
import {
	getSimpleSchema,
	normalizeFieldSchema,
	SchemaFactory,
	TreeViewConfiguration,
	// type TreeNode,
	// jsonableTreeFromForest,
	SharedTree,
	type TreeNode,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/tree/internal";

import {
	applyAgentEdit,
	typeField,
	// eslint-disable-next-line import/no-internal-modules
} from "../../explicit-strategy/agentEditReducer.js";
import {
	objectIdKey,
	// eslint-disable-next-line import/no-internal-modules
} from "../../explicit-strategy/agentEditTypes.js";
// eslint-disable-next-line import/order
import type {
	TreeEdit,
	// eslint-disable-next-line import/no-internal-modules
} from "../../explicit-strategy/agentEditTypes.js";

// eslint-disable-next-line import/no-internal-modules
import { IdGenerator } from "../../explicit-strategy/idGenerator.js";

import { validateUsageError } from "./utils.js";
// import { validateUsageError } from "./utils.js";

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

class RootObjectWithNonArrayVectorField extends sf.object("RootObject", {
	singleVector: sf.optional(Vector),
	// Two different vector types to handle the polymorphic case
	vectors: sf.array([Vector]),
	bools: sf.array(sf.boolean),
}) {}

const config = new TreeViewConfiguration({ schema: [sf.number, RootObjectPolymorphic] });

const factory = SharedTree.getFactory();

describe("applyAgentEdit", () => {
	let idGenerator: IdGenerator;
	beforeEach(() => {
		idGenerator = new IdGenerator();
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

			applyAgentEdit(view, setRootEdit, idGenerator, simpleSchema.definitions);

			const expected = {
				str: "rootStr",
				vectors: [],
				bools: [],
			};

			assert.deepEqual(
				JSON.stringify(view.root, undefined, 2),
				JSON.stringify(expected, undefined, 2),
			);
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

			applyAgentEdit(view, setRootEdit, idGenerator, simpleSchema.definitions);

			const expectedTreeView = factory
				.create(
					new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
					"expectedTree",
				)
				.viewWith(configOptionalRoot);
			expectedTreeView.initialize(2);

			assert.deepEqual(view.root, expectedTreeView.root);
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
			idGenerator.assignIds(view.root);
			const vectorId =
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				idGenerator.getId((view.root as RootObjectPolymorphic).vectors[0]!) ??
				fail("ID expected.");

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
			applyAgentEdit(view, insertEdit, idGenerator, simpleSchema.definitions);

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
			applyAgentEdit(view, insertEdit2, idGenerator, simpleSchema.definitions);

			const identifier1 = ((view.root as RootObjectPolymorphic).vectors[0] as Vector).id;
			const identifier2 = ((view.root as RootObjectPolymorphic).vectors[1] as Vector).id;
			const identifier3 = ((view.root as RootObjectPolymorphic).vectors[2] as Vector).id;

			const expected = {
				"str": "testStr",
				"vectors": [
					{
						"id": identifier1,
						"x": 1,
						"y": 2,
						"z": 3,
					},
					{
						"id": identifier2,
						"x2": 3,
						"y2": 4,
						"z2": 5,
					},
					{
						"id": identifier3,
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

			idGenerator.assignIds(view.root);
			const vectorId =
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				idGenerator.getId((view.root as RootObject).vectors[0]!) ?? fail("ID expected.");

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
			applyAgentEdit(view, insertEdit, idGenerator, simpleSchema.definitions);

			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const identifier1 = (view.root as RootObject).vectors[0]!.id;
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const identifier2 = (view.root as RootObject).vectors[1]!.id;

			const expected = {
				"str": "testStr",
				"vectors": [
					{
						"id": identifier1,
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

		it("insert edit into an empty array", () => {
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
				vectors: [],
				bools: [true],
			});

			idGenerator.assignIds(view.root);
			const vectorId = idGenerator.getId(view.root as RootObject) ?? fail("ID expected.");

			const insertEdit: TreeEdit = {
				explanation: "Insert a vector",
				type: "insert",
				content: { [typeField]: Vector.identifier, x: 2, y: 3, z: 4 },
				destination: {
					type: "arrayPlace",
					parentId: vectorId,
					field: "vectors",
					location: "start",
				},
			};
			applyAgentEdit(view, insertEdit, idGenerator, simpleSchema.definitions);

			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const identifier1 = (view.root as RootObject).vectors[0]!.id;

			const expected = {
				"str": "testStr",
				"vectors": [
					{
						"id": identifier1,
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

		it("fails for invalid content for schema type", () => {
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

			idGenerator.assignIds(view.root);
			const vectorId =
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				idGenerator.getId((view.root as RootObject).vectors[0]!) ?? fail("ID expected.");

			const insertEdit: TreeEdit = {
				explanation: "Insert a vector",
				type: "insert",
				content: { [typeField]: Vector.identifier, x: 2, nonVectorField: "invalid", z: 4 },
				destination: {
					type: "objectPlace",
					[objectIdKey]: vectorId,
					place: "after",
				},
			};

			assert.throws(
				() => applyAgentEdit(view, insertEdit, idGenerator, simpleSchema.definitions),
				validateUsageError(/invalid data provided for schema/),
			);
		});

		it("inserting node into an non array node fails", () => {
			const tree = factory.create(
				new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
				"tree",
			);
			const config2 = new TreeViewConfiguration({ schema: RootObjectWithNonArrayVectorField });
			const view = tree.viewWith(config2);
			const schema = normalizeFieldSchema(view.schema);
			const simpleSchema = getSimpleSchema(schema.allowedTypes);

			view.initialize({
				singleVector: new Vector({ x: 1, y: 2, z: 3 }),
				vectors: [new Vector({ x: 2, y: 3, z: 4 })],
				bools: [true],
			});

			idGenerator.assignIds(view.root);
			assert(view.root.singleVector !== undefined);
			const vectorId = idGenerator.getId(view.root.singleVector) ?? fail("ID expected.");

			const insertEdit: TreeEdit = {
				explanation: "Insert a vector",
				type: "insert",
				content: { [typeField]: Vector.identifier, x: 3, y: 4, z: 5 },
				destination: {
					type: "objectPlace",
					[objectIdKey]: vectorId,
					place: "before",
				},
			};
			assert.throws(
				() => applyAgentEdit(view, insertEdit, idGenerator, simpleSchema.definitions),
				validateUsageError(/Expected child to be in an array node/),
			);
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

		idGenerator.assignIds(view.root);
		const vectorId = idGenerator.getId(view.root as TreeNode) ?? fail("ID expected.");

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
		applyAgentEdit(view, modifyEdit, idGenerator, simpleSchema.definitions);

		const modifyEdit2: TreeEdit = {
			explanation: "Modify a vector",
			type: "modify",
			target: { __fluid_objectId: vectorId },
			field: "bools",
			modification: [false],
		};
		applyAgentEdit(view, modifyEdit2, idGenerator, simpleSchema.definitions);

		idGenerator.assignIds(view.root);
		const vectorId2 =
			idGenerator.getId((view.root as RootObjectPolymorphic).vectors[0] as Vector) ??
			fail("ID expected.");

		const modifyEdit3: TreeEdit = {
			explanation: "Modify a vector",
			type: "modify",
			target: { __fluid_objectId: vectorId2 },
			field: "x",
			modification: 111,
		};
		applyAgentEdit(view, modifyEdit3, idGenerator, simpleSchema.definitions);

		const identifier = ((view.root as RootObjectPolymorphic).vectors[0] as Vector).id;
		const identifier2 = ((view.root as RootObjectPolymorphic).vectors[1] as Vector2).id;

		const expected = {
			"str": "testStr",
			"vectors": [
				{
					"id": identifier,
					"x": 111,
					"y": 3,
					"z": 4,
				},
				{
					"id": identifier2,
					"x2": 3,
					"y2": 4,
					"z2": 5,
				},
			],
			"bools": [false],
		};

		assert.deepEqual(
			JSON.stringify(view.root, undefined, 2),
			JSON.stringify(expected, undefined, 2),
		);
	});

	describe("remove edits", () => {
		it("removes a single item in an array", () => {
			const tree = factory.create(
				new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
				"tree",
			);
			const configWithMultipleVectors = new TreeViewConfiguration({
				schema: [RootObject],
			});
			const view = tree.viewWith(configWithMultipleVectors);
			const schema = normalizeFieldSchema(view.schema);
			const simpleSchema = getSimpleSchema(schema.allowedTypes);

			view.initialize({
				str: "testStr",
				vectors: [new Vector({ x: 1, y: 2, z: 3 })],
				bools: [true],
			});

			idGenerator.assignIds(view.root);
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const vectorId1 = idGenerator.getId(view.root.vectors[0]!) ?? fail("ID expected.");

			const removeEdit: TreeEdit = {
				explanation: "remove a vector",
				type: "remove",
				source: { [objectIdKey]: vectorId1 },
			};
			applyAgentEdit(view, removeEdit, idGenerator, simpleSchema.definitions);

			const expected = {
				"str": "testStr",
				"vectors": [],
				"bools": [true],
			};
			assert.deepEqual(
				JSON.stringify(view.root, undefined, 2),
				JSON.stringify(expected, undefined, 2),
			);
		});

		it("removes an item in a non array field", () => {
			const tree = factory.create(
				new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
				"tree",
			);
			const configWithMultipleVectors = new TreeViewConfiguration({
				schema: [RootObjectWithNonArrayVectorField],
			});
			const view = tree.viewWith(configWithMultipleVectors);
			const schema = normalizeFieldSchema(view.schema);
			const simpleSchema = getSimpleSchema(schema.allowedTypes);

			view.initialize({
				singleVector: new Vector({ x: 1, y: 2, z: 3 }),
				vectors: [],
				bools: [true],
			});

			idGenerator.assignIds(view.root);
			assert(view.root.singleVector !== undefined);

			const singleVectorId = idGenerator.getId(view.root.singleVector) ?? fail("ID expected.");

			const removeEdit: TreeEdit = {
				explanation: "remove a vector",
				type: "remove",
				source: { [objectIdKey]: singleVectorId },
			};
			applyAgentEdit(view, removeEdit, idGenerator, simpleSchema.definitions);

			const expected = {
				"vectors": [],
				"bools": [true],
			};
			assert.deepEqual(
				JSON.stringify(view.root, undefined, 2),
				JSON.stringify(expected, undefined, 2),
			);
		});

		it("can remove an optional root", () => {
			const tree = factory.create(
				new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
				"tree",
			);
			const configWithMultipleVectors = new TreeViewConfiguration({
				schema: sf.optional(RootObject),
			});
			const view = tree.viewWith(configWithMultipleVectors);
			const schema = normalizeFieldSchema(view.schema);
			const simpleSchema = getSimpleSchema(schema.allowedTypes);

			view.initialize({
				str: "testStr",
				vectors: [new Vector({ x: 1, y: 2, z: 3 })],
				bools: [true],
			});

			idGenerator.assignIds(view.root);
			assert(view.root !== undefined);
			const rootId = idGenerator.getId(view.root) ?? fail("ID expected.");

			const removeEdit: TreeEdit = {
				explanation: "remove the root",
				type: "remove",
				source: { [objectIdKey]: rootId },
			};
			applyAgentEdit(view, removeEdit, idGenerator, simpleSchema.definitions);
			assert.equal(view.root, undefined);
		});

		it("removing a required root fails", () => {
			const tree = factory.create(
				new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
				"tree",
			);
			const configWithMultipleVectors = new TreeViewConfiguration({
				schema: [RootObject],
			});
			const view = tree.viewWith(configWithMultipleVectors);
			const schema = normalizeFieldSchema(view.schema);
			const simpleSchema = getSimpleSchema(schema.allowedTypes);

			view.initialize({
				str: "testStr",
				vectors: [new Vector({ x: 1, y: 2, z: 3 })],
				bools: [true],
			});

			idGenerator.assignIds(view.root);
			const rootId = idGenerator.getId(view.root) ?? fail("ID expected.");

			const removeEdit: TreeEdit = {
				explanation: "remove the root",
				type: "remove",
				source: { [objectIdKey]: rootId },
			};

			assert.throws(
				() => applyAgentEdit(view, removeEdit, idGenerator, simpleSchema.definitions),

				validateUsageError(
					/The root is required, and cannot be removed. Please use modify edit instead./,
				),
			);
		});

		it("removes a range of items", () => {
			const tree = factory.create(
				new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
				"tree",
			);
			const configWithMultipleVectors = new TreeViewConfiguration({
				schema: [RootObject],
			});
			const view = tree.viewWith(configWithMultipleVectors);
			const schema = normalizeFieldSchema(view.schema);
			const simpleSchema = getSimpleSchema(schema.allowedTypes);

			view.initialize({
				str: "testStr",
				vectors: [new Vector({ x: 1, y: 2, z: 3 }), new Vector({ x: 2, y: 3, z: 4 })],
				bools: [true],
			});

			idGenerator.assignIds(view.root);
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const vectorId1 = idGenerator.getId(view.root.vectors[0]!) ?? fail("ID expected.");
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const vectorId2 = idGenerator.getId(view.root.vectors[1]!) ?? fail("ID expected.");

			const removeEdit: TreeEdit = {
				explanation: "remove a vector",
				type: "remove",
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
			};
			applyAgentEdit(view, removeEdit, idGenerator, simpleSchema.definitions);

			const expected = {
				"str": "testStr",
				"vectors": [],
				"bools": [true],
			};
			assert.deepEqual(
				JSON.stringify(view.root, undefined, 2),
				JSON.stringify(expected, undefined, 2),
			);
		});

		it("invalid range of items fails", () => {
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
				vectors2: [new Vector({ x: 3, y: 4, z: 5 }), new Vector({ x: 4, y: 5, z: 6 })],
				bools: [true],
			});

			idGenerator.assignIds(view.root);
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const vectorId1 = idGenerator.getId(view.root.vectors[0]!) ?? fail("ID expected.");
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const vectorId2 = idGenerator.getId(view.root.vectors2[0]!) ?? fail("ID expected.");

			const removeEdit: TreeEdit = {
				explanation: "remove a vector",
				type: "remove",
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
			};

			assert.throws(
				() => applyAgentEdit(view, removeEdit, idGenerator, simpleSchema.definitions),
				validateUsageError(
					/The "from" node and "to" nodes of the range must be in the same parent array./,
				),
			);
		});
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

			idGenerator.assignIds(view.root);
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const vectorId1 = idGenerator.getId(view.root.vectors[0]!) ?? fail("ID expected.");
			const vectorId2 = idGenerator.getId(view.root) ?? fail("ID expected.");

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
			applyAgentEdit(view, moveEdit, idGenerator, simpleSchema.definitions);
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const identifier = view.root.vectors2[0]!.id;
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const identifier2 = view.root.vectors2[1]!.id;

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

			idGenerator.assignIds(view.root);
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const vectorId1 = idGenerator.getId(view.root.vectors[0]!) ?? fail("ID expected.");
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const vectorId2 = idGenerator.getId(view.root.vectors[1]!) ?? fail("ID expected.");
			const vectorId3 = idGenerator.getId(view.root) ?? fail("ID expected.");

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
			applyAgentEdit(view, moveEdit, idGenerator, simpleSchema.definitions);
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const identifier = view.root.vectors2[0]!.id;
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const identifier2 = view.root.vectors2[1]!.id;
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const identifier3 = view.root.vectors2[2]!.id;

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

			idGenerator.assignIds(view.root);
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const vectorId1 = idGenerator.getId(view.root.vectors[0]!) ?? fail("ID expected.");
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const vectorId2 = idGenerator.getId(view.root.vectors[1]!) ?? fail("ID expected.");
			const vectorId3 = idGenerator.getId(view.root) ?? fail("ID expected.");

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
				() => applyAgentEdit(view, moveEdit, idGenerator, simpleSchema.definitions),
				validateUsageError(/Illegal node type in destination array/),
			);
		});

		it("moving invalid range fails", () => {
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

			idGenerator.assignIds(view.root);
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const vectorId1 = idGenerator.getId(view.root.vectors[0]!) ?? fail("ID expected.");
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const vectorId2 = idGenerator.getId(view.root.vectors2[0]!) ?? fail("ID expected.");
			const vectorId3 = idGenerator.getId(view.root) ?? fail("ID expected.");

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
				() => applyAgentEdit(view, moveEdit, idGenerator, simpleSchema.definitions),
				validateUsageError(
					/The "from" node and "to" nodes of the range must be in the same parent array./,
				),
			);
		});

		it("moving elements which aren't under an array fails", () => {
			const tree = factory.create(
				new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
				"tree",
			);
			const configWithMultipleVectors = new TreeViewConfiguration({
				schema: [RootObjectWithNonArrayVectorField],
			});
			const view = tree.viewWith(configWithMultipleVectors);
			const schema = normalizeFieldSchema(view.schema);
			const simpleSchema = getSimpleSchema(schema.allowedTypes);

			view.initialize({
				singleVector: new Vector({ x: 1, y: 2, z: 3 }),
				vectors: [new Vector({ x: 2, y: 3, z: 4 })],
				bools: [true],
			});

			idGenerator.assignIds(view.root);
			assert(view.root.singleVector !== undefined);

			const strId = idGenerator.getId(view.root.singleVector) ?? fail("ID expected.");
			const vectorId = idGenerator.getId(view.root) ?? fail("ID expected.");

			const moveEdit: TreeEdit = {
				type: "move",
				explanation: "Move a vector",
				source: {
					[objectIdKey]: strId,
				},
				destination: {
					type: "arrayPlace",
					parentId: vectorId,
					field: "vectors",
					location: "start",
				},
			};

			assert.throws(
				() => applyAgentEdit(view, moveEdit, idGenerator, simpleSchema.definitions),
				validateUsageError(/the source node must be within an arrayNode/),
			);
		});

		it("providing arrayPlace with non-existant field fails", () => {
			const tree = factory.create(
				new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
				"tree",
			);
			const configWithMultipleVectors = new TreeViewConfiguration({
				schema: [RootObjectWithNonArrayVectorField],
			});
			const view = tree.viewWith(configWithMultipleVectors);
			const schema = normalizeFieldSchema(view.schema);
			const simpleSchema = getSimpleSchema(schema.allowedTypes);

			view.initialize({
				singleVector: new Vector({ x: 1, y: 2, z: 3 }),
				vectors: [new Vector({ x: 2, y: 3, z: 4 })],
				bools: [true],
			});

			idGenerator.assignIds(view.root);
			assert(view.root.singleVector !== undefined);

			const strId = idGenerator.getId(view.root.singleVector) ?? fail("ID expected.");
			const vectorId = idGenerator.getId(view.root) ?? fail("ID expected.");

			const moveEdit: TreeEdit = {
				type: "move",
				explanation: "Move a vector",
				source: {
					[objectIdKey]: strId,
				},
				destination: {
					type: "arrayPlace",
					parentId: vectorId,
					field: "nonExistantField",
					location: "start",
				},
			};

			assert.throws(
				() => applyAgentEdit(view, moveEdit, idGenerator, simpleSchema.definitions),
				validateUsageError(/No child under field field/),
			);
		});
	});

	it("treeEdits with object ids that don't exist", () => {
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

		const insertEdit: TreeEdit = {
			explanation: "Insert a vector",
			type: "insert",
			content: { [typeField]: Vector.identifier, x: 2, nonVectorField: "invalid", z: 4 },
			destination: {
				type: "objectPlace",
				[objectIdKey]: "testObjectId",
				place: "after",
			},
		};

		assert.throws(
			() => applyAgentEdit(view, insertEdit, idGenerator, simpleSchema.definitions),
			validateUsageError(/objectIdKey testObjectId does not exist/),
		);

		const insertEdit2: TreeEdit = {
			explanation: "Insert a vector",
			type: "insert",
			content: { [typeField]: Vector.identifier, x: 2, nonVectorField: "invalid", z: 4 },
			destination: {
				type: "arrayPlace",
				parentId: "testObjectId",
				field: "vectors",
				location: "start",
			},
		};

		assert.throws(
			() => applyAgentEdit(view, insertEdit2, idGenerator, simpleSchema.definitions),
			validateUsageError(/objectIdKey testObjectId does not exist/),
		);

		const moveEdit: TreeEdit = {
			type: "move",
			explanation: "Move a vector",
			source: {
				from: {
					[objectIdKey]: "testObjectId1",
					type: "objectPlace",
					place: "before",
				},
				to: {
					[objectIdKey]: "testObjectId2",
					type: "objectPlace",
					place: "after",
				},
			},
			destination: {
				type: "arrayPlace",
				parentId: "testObjectId3",
				field: "vectors2",
				location: "start",
			},
		};
		const objectIdKeys = ["testObjectId1", "testObjectId2", "testObjectId3"];
		const errorMessage = `objectIdKeys [${objectIdKeys.join(",")}] does not exist`;
		assert.throws(
			() => applyAgentEdit(view, moveEdit, idGenerator, simpleSchema.definitions),
			validateUsageError(errorMessage),
		);

		const moveEdit2: TreeEdit = {
			type: "move",
			explanation: "Move a vector",
			source: {
				[objectIdKey]: "testObjectId1",
			},
			destination: {
				type: "objectPlace",
				[objectIdKey]: "testObjectId2",
				place: "before",
			},
		};

		const objectIdKeys2 = ["testObjectId1", "testObjectId2"];
		const errorMessage2 = `objectIdKeys [${objectIdKeys2.join(",")}] does not exist`;
		assert.throws(
			() => applyAgentEdit(view, moveEdit2, idGenerator, simpleSchema.definitions),
			validateUsageError(errorMessage2),
		);

		const modifyEdit: TreeEdit = {
			explanation: "Modify a vector",
			type: "modify",
			target: { __fluid_objectId: "testObjectId" },
			field: "x",
			modification: 111,
		};

		assert.throws(
			() => applyAgentEdit(view, modifyEdit, idGenerator, simpleSchema.definitions),
			validateUsageError(/objectIdKey testObjectId does not exist/),
		);
	});
});
