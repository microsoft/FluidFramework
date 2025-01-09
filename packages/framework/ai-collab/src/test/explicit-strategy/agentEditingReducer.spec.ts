/* eslint-disable @typescript-eslint/no-unsafe-member-access */
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
	SchemaFactory,
	TreeViewConfiguration,
	SharedTree,
	type TreeNode,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/tree/internal";

import {
	applyAgentEdit,
	// eslint-disable-next-line import/no-internal-modules
} from "../../explicit-strategy/agentEditReducer.js";
import {
	typeField,
	// eslint-disable-next-line import/no-internal-modules
} from "../../explicit-strategy/agentEditTypes.js";
import type {
	TreeEdit,
	// eslint-disable-next-line import/no-internal-modules
} from "../../explicit-strategy/agentEditTypes.js";
// eslint-disable-next-line import/no-internal-modules
import { IdGenerator } from "../../explicit-strategy/idGenerator.js";

import { validateUsageError } from "./utils.js";

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

class RootObjectPolymorphic extends sf.object("RootObjectPolymorphic", {
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

class RootObjectWithMultipleVectorArrays extends sf.object(
	"RootObjectWithMultipleVectorArrays",
	{
		str: sf.string,
		// Two different vector types to handle the polymorphic case
		vectors: sf.array([Vector]),
		vectors2: sf.array([Vector]),
		bools: sf.array(sf.boolean),
	},
) {}

class RootObjectWithDifferentVectorArrayTypes extends sf.object(
	"RootObjectWithDifferentVectorArrayTypes",
	{
		str: sf.string,
		// Two different vector types to handle the polymorphic case
		vectors: sf.array([Vector]),
		vectors2: sf.array([Vector2]),
		bools: sf.array(sf.boolean),
	},
) {}

class RootObjectWithNonArrayVectorField extends sf.object(
	"RootObjectWithNonArrayVectorField",
	{
		singleVector: sf.optional(Vector),
		// Two different vector types to handle the polymorphic case
		vectors: sf.array([Vector]),
		bools: sf.array(sf.boolean),
	},
) {}

class RootObjectWithSubtree extends sf.object("RootObjectWithSubtree", {
	innerObject: sf.object("InnerObject", {
		str: sf.string,
		vectors: sf.array([Vector]),
		bools: sf.array(sf.boolean),
		singleVector: sf.optional(Vector),
	}),
}) {}

const factory = SharedTree.getFactory();

describe("applyAgentEdit", () => {
	let idGenerator: IdGenerator;
	beforeEach(() => {
		idGenerator = new IdGenerator();
	});

	describe("insert edits", () => {
		it("inner polymorphic tree node insert edits", () => {
			const tree = factory.create(
				new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
				"tree",
			);
			const view = tree.viewWith(new TreeViewConfiguration({ schema: RootObjectPolymorphic }));
			const simpleSchema = getSimpleSchema(view.schema);

			view.initialize({
				str: "testStr",
				vectors: [new Vector({ x: 1, y: 2, z: 3 })],
				bools: [true],
			});
			idGenerator.assignIds(view.root);
			const vectorId =
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				idGenerator.getId(view.root.vectors[0]!) ?? fail("ID expected.");

			const insertEdit: TreeEdit = {
				explanation: "Insert a vector",
				type: "insert",
				content: { [typeField]: Vector.identifier, x: 2, y: 3, z: 4 },
				destination: {
					type: "objectPlace",
					target: vectorId,
					place: "after",
				},
			};
			applyAgentEdit(insertEdit, idGenerator, simpleSchema.definitions);

			const insertEdit2: TreeEdit = {
				explanation: "Insert a vector",
				type: "insert",
				content: { [typeField]: Vector2.identifier, x2: 3, y2: 4, z2: 5 },
				destination: {
					type: "objectPlace",
					target: vectorId,
					place: "after",
				},
			};
			applyAgentEdit(insertEdit2, idGenerator, simpleSchema.definitions);

			const identifier1 = (view.root.vectors[0] as Vector).id;
			const identifier2 = (view.root.vectors[1] as Vector).id;
			const identifier3 = (view.root.vectors[2] as Vector).id;

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
			const config2 = new TreeViewConfiguration({ schema: RootObject });
			const view = tree.viewWith(config2);
			const simpleSchema = getSimpleSchema(view.schema);

			view.initialize({
				str: "testStr",
				vectors: [new Vector({ x: 1, y: 2, z: 3 })],
				bools: [true],
			});

			idGenerator.assignIds(view.root);
			const vectorId =
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				idGenerator.getId(view.root.vectors[0]!) ?? fail("ID expected.");

			const insertEdit: TreeEdit = {
				explanation: "Insert a vector",
				type: "insert",
				content: { [typeField]: Vector.identifier, x: 2, y: 3, z: 4 },
				destination: {
					type: "objectPlace",
					target: vectorId,
					place: "after",
				},
			};
			applyAgentEdit(insertEdit, idGenerator, simpleSchema.definitions);

			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const identifier1 = view.root.vectors[0]!.id;
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const identifier2 = view.root.vectors[1]!.id;

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
			const config2 = new TreeViewConfiguration({ schema: RootObject });
			const view = tree.viewWith(config2);
			const simpleSchema = getSimpleSchema(view.schema);

			view.initialize({
				str: "testStr",
				vectors: [],
				bools: [true],
			});

			idGenerator.assignIds(view.root);
			const vectorId = idGenerator.getId(view.root) ?? fail("ID expected.");

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
			applyAgentEdit(insertEdit, idGenerator, simpleSchema.definitions);

			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const identifier1 = view.root.vectors[0]!.id;

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
			const config2 = new TreeViewConfiguration({ schema: RootObject });
			const view = tree.viewWith(config2);
			const simpleSchema = getSimpleSchema(view.schema);

			view.initialize({
				str: "testStr",
				vectors: [new Vector({ x: 1, y: 2, z: 3 })],
				bools: [true],
			});

			idGenerator.assignIds(view.root);
			const vectorId =
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				idGenerator.getId(view.root.vectors[0]!) ?? fail("ID expected.");

			const insertEdit: TreeEdit = {
				explanation: "Insert a vector",
				type: "insert",
				content: { [typeField]: Vector.identifier, x: 2, nonVectorField: "invalid", z: 4 },
				destination: {
					type: "objectPlace",
					target: vectorId,
					place: "after",
				},
			};

			assert.throws(
				() => applyAgentEdit(insertEdit, idGenerator, simpleSchema.definitions),
				validateUsageError(/provided data is incompatible/),
			);
		});

		it("inserting node into an non array node fails", () => {
			const tree = factory.create(
				new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
				"tree",
			);
			const config2 = new TreeViewConfiguration({ schema: RootObjectWithNonArrayVectorField });
			const view = tree.viewWith(config2);
			const simpleSchema = getSimpleSchema(view.schema);

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
					target: vectorId,
					place: "before",
				},
			};
			assert.throws(
				() => applyAgentEdit(insertEdit, idGenerator, simpleSchema.definitions),
				validateUsageError(/Expected child to be in an array node/),
			);
		});
	});

	describe("modify edits", () => {
		let tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		let config = new TreeViewConfiguration({ schema: RootObjectPolymorphic });
		let view = tree.viewWith(config);
		let simpleSchema = getSimpleSchema(view.schema);

		// Reinitialize our test tree to the same initial state.
		beforeEach(() => {
			tree = factory.create(
				new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
				"tree",
			);
			config = new TreeViewConfiguration({ schema: RootObjectPolymorphic });
			view = tree.viewWith(config);
			simpleSchema = getSimpleSchema(view.schema);

			view.initialize({
				str: "testStr",
				vectors: [new Vector({ x: 1, y: 2, z: 3 })],
				bools: [true],
			});

			idGenerator.assignIds(view.root);
		});

		it("replace an array node of objects", () => {
			const vectorArrayId = idGenerator.getId(view.root as TreeNode) ?? fail("ID expected.");

			const modifyEdit: TreeEdit = {
				explanation: "Replace an array of vectors",
				type: "modify",
				target: { target: vectorArrayId },
				field: "vectors",
				modification: [
					{ [typeField]: Vector.identifier, x: 2, y: 3, z: 4 },
					{ [typeField]: Vector2.identifier, x2: 3, y2: 4, z2: 5 },
				],
			};
			applyAgentEdit(modifyEdit, idGenerator, simpleSchema.definitions);

			const expected = {
				"str": "testStr",
				"vectors": [
					{
						"id": (view.root.vectors[0] as Vector).id,
						"x": 2,
						"y": 3,
						"z": 4,
					},
					{
						"id": (view.root.vectors[1] as Vector2).id,
						"x2": 3,
						"y2": 4,
						"z2": 5,
					},
				],
				"bools": [true],
			};

			assert.deepEqual(
				JSON.stringify(view.root, undefined, 2),
				JSON.stringify(expected, undefined, 2),
			);
		});

		it("replace an array node of primitive leaf nodes", () => {
			const vectorArrayId = idGenerator.getId(view.root as TreeNode) ?? fail("ID expected.");

			const modifyEdit2: TreeEdit = {
				explanation: "replace a primitive array",
				type: "modify",
				target: { target: vectorArrayId },
				field: "bools",
				modification: [false],
			};
			applyAgentEdit(modifyEdit2, idGenerator, simpleSchema.definitions);

			const expected = {
				"str": "testStr",
				"vectors": [
					{
						"id": (view.root.vectors[0] as Vector).id,
						"x": 1,
						"y": 2,
						"z": 3,
					},
				],
				"bools": [false],
			};

			assert.deepEqual(
				JSON.stringify(view.root, undefined, 2),
				JSON.stringify(expected, undefined, 2),
			);
		});

		it("Modifies a primitive leaf node value within an object node", () => {
			const vectorId =
				idGenerator.getId(view.root.vectors[0] as Vector) ?? fail("ID expected.");

			const modifyEdit3: TreeEdit = {
				explanation: "Modify a vector",
				type: "modify",
				target: { target: vectorId },
				field: "x",
				modification: 111,
			};
			applyAgentEdit(modifyEdit3, idGenerator, simpleSchema.definitions);

			const expected = {
				"str": "testStr",
				"vectors": [
					{
						"id": (view.root.vectors[0] as Vector).id,
						"x": 111,
						"y": 2,
						"z": 3,
					},
				],
				"bools": [true],
			};

			assert.deepEqual(
				JSON.stringify(view.root, undefined, 2),
				JSON.stringify(expected, undefined, 2),
			);
		});

		it("Modifies a primitive leaf node value", () => {
			const rootNodeId = idGenerator.getId(view.root) ?? fail("ID expected");

			const modifyEdit3: TreeEdit = {
				explanation: "Modify a string",
				type: "modify",
				target: { target: rootNodeId },
				field: "str",
				modification: "modifiedString",
			};
			applyAgentEdit(modifyEdit3, idGenerator, simpleSchema.definitions);

			const expected = {
				"str": "modifiedString",
				"vectors": [
					{
						"id": (view.root.vectors[0] as Vector).id,
						"x": 1,
						"y": 2,
						"z": 3,
					},
				],
				"bools": [true],
			};

			assert.deepEqual(
				JSON.stringify(view.root, undefined, 2),
				JSON.stringify(expected, undefined, 2),
			);
		});

		it("modify edit with non existent field fails", () => {
			const vectorId =
				idGenerator.getId(view.root.vectors[0] as TreeNode) ?? fail("ID expected.");

			const modifyEdit3: TreeEdit = {
				explanation: "Modify a vector",
				type: "modify",
				target: { target: vectorId },
				field: "x2",
				modification: 111,
			};

			assert.throws(
				() => applyAgentEdit(modifyEdit3, idGenerator, simpleSchema.definitions),
				validateUsageError(
					`You attempted an invalid modify edit on the node with id 'Vector1' and schema 'agentSchema.Vector'. The node's field you selected for modification \`x2\` does not exist in this nodes schema. The set of available fields for this node are: \`['id', 'x', 'y', 'z']\`. If you are sure you are trying to modify this node, did you mean to use the field \`x\` which has the following set of allowed types: \`['com.fluidframework.leaf.number']\`?`,
				),
			);
		});

		it("modify edit with invalid primitive value type for field fails", () => {
			const vectorId =
				idGenerator.getId(view.root.vectors[0] as TreeNode) ?? fail("ID expected.");

			const modifyEdit3: TreeEdit = {
				explanation: "Modify a vector",
				type: "modify",
				target: { target: vectorId },
				field: "x",
				modification: false,
			};

			assert.throws(
				() => applyAgentEdit(modifyEdit3, idGenerator, simpleSchema.definitions),
				validateUsageError(
					`You attempted an invalid modify edit on the node with id 'Vector1' and schema 'agentSchema.Vector'. You cannot set the node's field \`x\` to the value \`false\` with type \`boolean\` because this type is incompatible with all of the types allowed by the node's schema. The set of allowed types are \`['com.fluidframework.leaf.number']\`.`,
				),
			);
		});
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
			const simpleSchema = getSimpleSchema(view.schema);

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
				source: { target: vectorId1 },
			};
			applyAgentEdit(removeEdit, idGenerator, simpleSchema.definitions);

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

		it("removes a single item in a subtree's array", () => {
			const tree = factory.create(
				new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
				"tree",
			);
			const configWithMultipleVectors = new TreeViewConfiguration({
				schema: [RootObjectWithSubtree],
			});
			const view = tree.viewWith(configWithMultipleVectors);
			const simpleSchema = getSimpleSchema(view.schema);

			view.initialize({
				innerObject: {
					str: "testStr",
					vectors: [new Vector({ x: 1, y: 2, z: 3 })],
					bools: [true],
				},
			});

			idGenerator.assignIds(view.root);

			const vectorId1 =
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				idGenerator.getId(view.root.innerObject.vectors[0]!) ?? fail("ID expected.");

			const removeEdit: TreeEdit = {
				explanation: "remove a vector",
				type: "remove",
				source: { target: vectorId1 },
			};
			applyAgentEdit(removeEdit, idGenerator, simpleSchema.definitions);

			const expected = {
				"innerObject": {
					"str": "testStr",
					"vectors": [],
					"bools": [true],
				},
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
			const simpleSchema = getSimpleSchema(view.schema);

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
				source: { target: singleVectorId },
			};
			applyAgentEdit(removeEdit, idGenerator, simpleSchema.definitions);

			const expected = {
				"vectors": [],
				"bools": [true],
			};
			assert.deepEqual(
				JSON.stringify(view.root, undefined, 2),
				JSON.stringify(expected, undefined, 2),
			);
		});

		it("removes an item in a subtree's non array field", () => {
			const tree = factory.create(
				new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
				"tree",
			);
			const configWithMultipleVectors = new TreeViewConfiguration({
				schema: [RootObjectWithSubtree],
			});
			const view = tree.viewWith(configWithMultipleVectors);
			const simpleSchema = getSimpleSchema(view.schema);

			view.initialize({
				innerObject: {
					str: "testStr",
					vectors: [],
					bools: [true],
					singleVector: new Vector({ x: 1, y: 2, z: 3 }),
				},
			});

			idGenerator.assignIds(view.root);
			assert(view.root.innerObject.singleVector !== undefined);

			const singleVectorId =
				idGenerator.getId(view.root.innerObject.singleVector) ?? fail("ID expected.");

			const removeEdit: TreeEdit = {
				explanation: "remove a vector",
				type: "remove",
				source: { target: singleVectorId },
			};
			applyAgentEdit(removeEdit, idGenerator, simpleSchema.definitions);

			const expected = {
				"innerObject": {
					"str": "testStr",
					"vectors": [],
					"bools": [true],
				},
			};
			assert.deepEqual(
				JSON.stringify(view.root, undefined, 2),
				JSON.stringify(expected, undefined, 2),
			);
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
			const simpleSchema = getSimpleSchema(view.schema);

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
				source: { target: rootId },
			};

			assert.throws(
				() => applyAgentEdit(removeEdit, idGenerator, simpleSchema.definitions),

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
			const simpleSchema = getSimpleSchema(view.schema);

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
						target: vectorId1,
						type: "objectPlace",
						place: "before",
					},
					to: {
						target: vectorId2,
						type: "objectPlace",
						place: "after",
					},
				},
			};
			applyAgentEdit(removeEdit, idGenerator, simpleSchema.definitions);

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

		it("removes a subtree's array range of items", () => {
			const tree = factory.create(
				new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
				"tree",
			);
			const configWithMultipleVectors = new TreeViewConfiguration({
				schema: [RootObjectWithSubtree],
			});
			const view = tree.viewWith(configWithMultipleVectors);
			const simpleSchema = getSimpleSchema(view.schema);

			view.initialize({
				innerObject: {
					str: "testStr",
					vectors: [new Vector({ x: 1, y: 2, z: 3 }), new Vector({ x: 2, y: 3, z: 4 })],
					bools: [true],
				},
			});

			idGenerator.assignIds(view.root);

			const vectorId1 =
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				idGenerator.getId(view.root.innerObject.vectors[0]!) ?? fail("ID expected.");

			const vectorId2 =
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				idGenerator.getId(view.root.innerObject.vectors[1]!) ?? fail("ID expected.");

			const removeEdit: TreeEdit = {
				explanation: "remove a vector",
				type: "remove",
				source: {
					from: {
						target: vectorId1,
						type: "objectPlace",
						place: "before",
					},
					to: {
						target: vectorId2,
						type: "objectPlace",
						place: "after",
					},
				},
			};
			applyAgentEdit(removeEdit, idGenerator, simpleSchema.definitions);

			const expected = {
				"innerObject": {
					"str": "testStr",
					"vectors": [],
					"bools": [true],
				},
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
			const simpleSchema = getSimpleSchema(view.schema);

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
						target: vectorId1,
						type: "objectPlace",
						place: "before",
					},
					to: {
						target: vectorId2,
						type: "objectPlace",
						place: "after",
					},
				},
			};

			assert.throws(
				() => applyAgentEdit(removeEdit, idGenerator, simpleSchema.definitions),
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
			const simpleSchema = getSimpleSchema(view.schema);

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
				source: { target: vectorId1 },
				destination: {
					type: "arrayPlace",
					parentId: vectorId2,
					field: "vectors2",
					location: "start",
				},
			};
			applyAgentEdit(moveEdit, idGenerator, simpleSchema.definitions);
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
			const simpleSchema = getSimpleSchema(view.schema);

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
						target: vectorId1,
						type: "objectPlace",
						place: "before",
					},
					to: {
						target: vectorId2,
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
			applyAgentEdit(moveEdit, idGenerator, simpleSchema.definitions);
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
			const simpleSchema = getSimpleSchema(view.schema);

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
						target: vectorId1,
						type: "objectPlace",
						place: "before",
					},
					to: {
						target: vectorId2,
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
				() => applyAgentEdit(moveEdit, idGenerator, simpleSchema.definitions),
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
			const simpleSchema = getSimpleSchema(view.schema);

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
						target: vectorId1,
						type: "objectPlace",
						place: "before",
					},
					to: {
						target: vectorId2,
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
				() => applyAgentEdit(moveEdit, idGenerator, simpleSchema.definitions),
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
			const simpleSchema = getSimpleSchema(view.schema);

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
					target: strId,
				},
				destination: {
					type: "arrayPlace",
					parentId: vectorId,
					field: "vectors",
					location: "start",
				},
			};

			assert.throws(
				() => applyAgentEdit(moveEdit, idGenerator, simpleSchema.definitions),
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
			const simpleSchema = getSimpleSchema(view.schema);

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
					target: strId,
				},
				destination: {
					type: "arrayPlace",
					parentId: vectorId,
					field: "nonExistantField",
					location: "start",
				},
			};

			assert.throws(
				() => applyAgentEdit(moveEdit, idGenerator, simpleSchema.definitions),
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
		const simpleSchema = getSimpleSchema(view.schema);

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
				target: "testObjectId",
				place: "after",
			},
		};

		assert.throws(
			() => applyAgentEdit(insertEdit, idGenerator, simpleSchema.definitions),
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
			() => applyAgentEdit(insertEdit2, idGenerator, simpleSchema.definitions),
			validateUsageError(/objectIdKey testObjectId does not exist/),
		);

		const moveEdit: TreeEdit = {
			type: "move",
			explanation: "Move a vector",
			source: {
				from: {
					target: "testObjectId1",
					type: "objectPlace",
					place: "before",
				},
				to: {
					target: "testObjectId2",
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
			() => applyAgentEdit(moveEdit, idGenerator, simpleSchema.definitions),
			validateUsageError(errorMessage),
		);

		const moveEdit2: TreeEdit = {
			type: "move",
			explanation: "Move a vector",
			source: {
				target: "testObjectId1",
			},
			destination: {
				type: "objectPlace",
				target: "testObjectId2",
				place: "before",
			},
		};

		const objectIdKeys2 = ["testObjectId1", "testObjectId2"];
		const errorMessage2 = `objectIdKeys [${objectIdKeys2.join(",")}] does not exist`;
		assert.throws(
			() => applyAgentEdit(moveEdit2, idGenerator, simpleSchema.definitions),
			validateUsageError(errorMessage2),
		);

		const modifyEdit: TreeEdit = {
			explanation: "Modify a vector",
			type: "modify",
			target: { target: "testObjectId" },
			field: "x",
			modification: 111,
		};

		assert.throws(
			() => applyAgentEdit(modifyEdit, idGenerator, simpleSchema.definitions),
			validateUsageError(/objectIdKey testObjectId does not exist/),
		);
	});
});
