/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable unicorn/no-null */

import { strict as assert, fail } from "node:assert";

// eslint-disable-next-line import/no-internal-modules
import { createIdCompressor } from "@fluidframework/id-compressor/internal";
// eslint-disable-next-line import/no-internal-modules
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";
// eslint-disable-next-line import/no-internal-modules
import { SchemaFactoryAlpha } from "@fluidframework/tree/alpha";
import {
	getSimpleSchema,
	SchemaFactory,
	TreeViewConfiguration,
	SharedTree,
	type TreeNode,
	asTreeViewAlpha,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/tree/internal";

import {
	applyAgentEdit,
	// eslint-disable-next-line import/no-internal-modules
} from "../../explicit-strategy/agentEditReducer.js";
import {
	objectIdKey,
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
	optional: sf.optional(sf.string),
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
			const view = asTreeViewAlpha(
				tree.viewWith(new TreeViewConfiguration({ schema: RootObjectPolymorphic })),
			);
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
				type: "insertIntoArray",
				array: [null, "vectors"],
				position: { after: vectorId },
				value: { [typeField]: Vector.identifier, x: 2, y: 3, z: 4 },
			};
			applyAgentEdit(view, insertEdit, idGenerator, simpleSchema.definitions);

			const insertEdit2: TreeEdit = {
				type: "insertIntoArray",
				array: [null, "vectors"],
				position: { after: vectorId },
				value: { [typeField]: Vector2.identifier, x2: 3, y2: 4, z2: 5 },
			};
			applyAgentEdit(view, insertEdit2, idGenerator, simpleSchema.definitions);

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
			const view = asTreeViewAlpha(tree.viewWith(config2));
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
				type: "insertIntoArray",
				array: [null, "vectors"],
				position: { after: vectorId },
				value: { [typeField]: Vector.identifier, x: 2, y: 3, z: 4 },
			};
			applyAgentEdit(view, insertEdit, idGenerator, simpleSchema.definitions);

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

		it("provide defaults from field schema metadata", () => {
			const sfa = new SchemaFactoryAlpha(undefined);
			class HasDefault extends sfa.object("HasDefault", {
				str: sfa.optional(sf.string, { metadata: { llmDefault: () => "defaulted" } }),
			}) {}
			class Root extends sfa.object("Root", {
				children: sfa.array(HasDefault),
			}) {}

			const tree = factory.create(
				new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
				"tree",
			);
			const config = new TreeViewConfiguration({ schema: Root });
			const view = asTreeViewAlpha(tree.viewWith(config));
			const simpleSchema = getSimpleSchema(view.schema);
			view.initialize({ children: [new HasDefault({})] });
			idGenerator.assignIds(view.root);
			const child = view.root.children[0];
			assert(child !== undefined);
			const childId = idGenerator.getId(child) ?? fail("ID expected.");
			const insertEdit: TreeEdit = {
				type: "insertIntoArray",
				array: [null, "children"],
				position: { after: childId },
				value: { [typeField]: HasDefault.identifier },
			};
			applyAgentEdit(view, insertEdit, idGenerator, simpleSchema.definitions);

			const child2 = view.root.children[1];
			assert(child2 !== undefined);
			assert.equal(child2.str, "defaulted");

			const expected = {
				"children": [
					{},
					{
						"str": "defaulted",
					},
				],
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
			const view = asTreeViewAlpha(tree.viewWith(config2));
			const simpleSchema = getSimpleSchema(view.schema);

			view.initialize({
				str: "testStr",
				vectors: [],
				bools: [true],
			});

			idGenerator.assignIds(view.root);
			const vectorId = idGenerator.getId(view.root) ?? fail("ID expected.");

			const insertEdit: TreeEdit = {
				type: "insertIntoArray",
				array: [vectorId, "vectors"],
				position: "start",
				value: { [typeField]: Vector.identifier, x: 2, y: 3, z: 4 },
			};
			applyAgentEdit(view, insertEdit, idGenerator, simpleSchema.definitions);

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
			const view = asTreeViewAlpha(tree.viewWith(config2));
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
				type: "insertIntoArray",
				array: [null, "vectors"],
				position: { after: vectorId },
				value: { [typeField]: Vector.identifier, x: 2, nonVectorField: "invalid", z: 4 },
			};

			assert.throws(
				() => applyAgentEdit(view, insertEdit, idGenerator, simpleSchema.definitions),
				validateUsageError(/provided data is incompatible/),
			);
		});

		it("inserting node into a non array node fails", () => {
			const tree = factory.create(
				new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
				"tree",
			);
			const config2 = new TreeViewConfiguration({ schema: RootObjectWithNonArrayVectorField });
			const view = asTreeViewAlpha(tree.viewWith(config2));
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
				type: "insertIntoArray",
				array: [null, "singleVector"],
				position: { before: vectorId },
				value: { [typeField]: Vector.identifier, x: 3, y: 4, z: 5 },
			};
			assert.throws(
				() => applyAgentEdit(view, insertEdit, idGenerator, simpleSchema.definitions),
				validateUsageError(/The destination node must be an arrayNode/),
			);
		});
	});

	it("modify edits", () => {
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const config = new TreeViewConfiguration({ schema: RootObjectPolymorphic });
		const view = asTreeViewAlpha(tree.viewWith(config));
		const simpleSchema = getSimpleSchema(view.schema);

		view.initialize({
			str: "testStr",
			vectors: [new Vector({ x: 1, y: 2, z: 3 })],
			bools: [true],
			optional: "test",
		});

		idGenerator.assignIds(view.root);
		const vectorId = idGenerator.getId(view.root as TreeNode) ?? fail("ID expected.");

		const modifyEdit: TreeEdit = {
			type: "setField",
			object: vectorId,
			field: "vectors",
			value: [
				{ [typeField]: Vector.identifier, x: 2, y: 3, z: 4 },
				{ [typeField]: Vector2.identifier, x2: 3, y2: 4, z2: 5 },
			],
		};
		applyAgentEdit(view, modifyEdit, idGenerator, simpleSchema.definitions);

		const modifyEdit2: TreeEdit = {
			type: "setField",
			object: vectorId,
			field: "bools",
			value: [false],
		};
		applyAgentEdit(view, modifyEdit2, idGenerator, simpleSchema.definitions);

		idGenerator.assignIds(view.root);
		const vectorId2 =
			idGenerator.getId(view.root.vectors[0] as Vector) ?? fail("ID expected.");

		const modifyEdit3: TreeEdit = {
			type: "setField",
			object: vectorId2,
			field: "x",
			value: 111,
		};
		applyAgentEdit(view, modifyEdit3, idGenerator, simpleSchema.definitions);

		const modifyEdit4: TreeEdit = {
			type: "setField",
			object: vectorId,
			field: "optional",
			value: null,
		};

		applyAgentEdit(view, modifyEdit4, idGenerator, simpleSchema.definitions);

		const identifier = (view.root.vectors[0] as Vector).id;
		const identifier2 = (view.root.vectors[1] as Vector2).id;

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

	it("content with llm-generated IDs", () => {
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"tree",
		);
		const config = new TreeViewConfiguration({ schema: RootObjectPolymorphic });
		const view = asTreeViewAlpha(tree.viewWith(config));
		const simpleSchema = getSimpleSchema(view.schema);

		view.initialize({
			str: "testStr",
			vectors: [new Vector({ x: 1, y: 2, z: 3 })],
			bools: [true],
		});

		idGenerator.assignIds(view.root);
		const vectorId = idGenerator.getId(view.root as TreeNode) ?? fail("ID expected.");

		const modifyEdit: TreeEdit = {
			type: "setField",
			object: vectorId,
			field: "vectors",
			value: [
				{ [typeField]: Vector.identifier, x: 2, y: 3, z: 4, [objectIdKey]: "Vector2" },
				{ [typeField]: Vector.identifier, x: 3, y: 4, z: 5 },
			],
		};
		applyAgentEdit(view, modifyEdit, idGenerator, simpleSchema.definitions);

		const identifier = (view.root.vectors[0] as Vector).id;
		const identifier2 = (view.root.vectors[1] as Vector).id;

		const expected = {
			"str": "testStr",
			"vectors": [
				{
					"id": identifier,
					"x": 2,
					"y": 3,
					"z": 4,
				},
				{
					"id": identifier2,
					"x": 3,
					"y": 4,
					"z": 5,
				},
			],
			"bools": [true],
		};

		// TODO: Expose a better way to ensure that the ID generator is functioning in the way that this test relies on.
		assert(view.root.vectors[0] !== undefined);
		assert(view.root.vectors[1] !== undefined);
		assert.equal(idGenerator.getId(view.root.vectors[0]), "Vector2");
		assert.equal(idGenerator.getId(view.root.vectors[1]), "Vector3");
		assert.equal(idGenerator.getOrCreateId(new Vector({ x: 2, y: 3, z: 4 })), "Vector4");

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
			const view = asTreeViewAlpha(tree.viewWith(configWithMultipleVectors));
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
				type: "removeFromArray",
				element: vectorId1,
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

		it("removes a single item in a subtree's array", () => {
			const tree = factory.create(
				new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
				"tree",
			);
			const configWithMultipleVectors = new TreeViewConfiguration({
				schema: [RootObjectWithSubtree],
			});
			const view = asTreeViewAlpha(tree.viewWith(configWithMultipleVectors));
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
				type: "removeFromArray",
				element: vectorId1,
			};
			applyAgentEdit(view, removeEdit, idGenerator, simpleSchema.definitions);

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

		it("removing a required field fails", () => {
			const tree = factory.create(
				new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
				"tree",
			);
			const configWithMultipleVectors = new TreeViewConfiguration({
				schema: [RootObject],
			});
			const view = asTreeViewAlpha(tree.viewWith(configWithMultipleVectors));
			const simpleSchema = getSimpleSchema(view.schema);

			view.initialize({
				str: "testStr",
				vectors: [new Vector({ x: 1, y: 2, z: 3 })],
				bools: [true],
			});

			idGenerator.assignIds(view.root);
			const rootId = idGenerator.getId(view.root) ?? fail("ID expected.");

			const removeEdit: TreeEdit = {
				type: "setField",
				field: "str",
				object: rootId,
				value: null,
			};

			assert.throws(
				() => applyAgentEdit(view, removeEdit, idGenerator, simpleSchema.definitions),

				validateUsageError(/Got undefined for non-optional field/),
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
			const view = asTreeViewAlpha(tree.viewWith(configWithMultipleVectors));
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
				type: "removeFromArray",
				range: {
					array: [null, "vectors"],
					from: { before: vectorId1 },
					to: { after: vectorId2 },
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

		it("removes a subtree's array range of items", () => {
			const tree = factory.create(
				new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
				"tree",
			);
			const configWithMultipleVectors = new TreeViewConfiguration({
				schema: [RootObjectWithSubtree],
			});
			const view = asTreeViewAlpha(tree.viewWith(configWithMultipleVectors));
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
				type: "removeFromArray",
				range: {
					array: [null, "innerObject", "vectors"],
					from: { before: vectorId1 },
					to: { after: vectorId2 },
				},
			};
			applyAgentEdit(view, removeEdit, idGenerator, simpleSchema.definitions);

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
			const view = asTreeViewAlpha(tree.viewWith(configWithMultipleVectors));
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
				type: "removeFromArray",
				range: {
					array: [null, "vectors"],
					from: { before: vectorId1 },
					to: { after: vectorId2 },
				},
			};

			assert.throws(
				() => applyAgentEdit(view, removeEdit, idGenerator, simpleSchema.definitions),
				validateUsageError(
					/The "after" position must be within the same array as the target node/,
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
			const view = asTreeViewAlpha(tree.viewWith(configWithMultipleVectors));
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
				type: "moveArrayElement",
				source: vectorId1,
				destination: {
					target: [vectorId2, "vectors2"],
					position: "start",
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
			const view = asTreeViewAlpha(tree.viewWith(configWithMultipleVectors));
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
				type: "moveArrayElement",
				source: {
					array: [null, "vectors"],
					from: { before: vectorId1 },
					to: { after: vectorId2 },
				},
				destination: {
					target: [vectorId3, "vectors2"],
					position: "start",
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
			const view = asTreeViewAlpha(tree.viewWith(configWithMultipleVectors));
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
				type: "moveArrayElement",
				source: {
					array: [null, "vectors"],
					from: { before: vectorId1 },
					to: { after: vectorId2 },
				},
				destination: {
					target: [vectorId3, "vectors2"],
					position: "start",
				},
			};
			assert.throws(
				() => applyAgentEdit(view, moveEdit, idGenerator, simpleSchema.definitions),
				validateUsageError(
					/The source node type "agentSchema.Vector" is not allowed in the destination array/,
				),
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
			const view = asTreeViewAlpha(tree.viewWith(configWithMultipleVectors));
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
				type: "moveArrayElement",
				source: {
					array: [null, "vectors"],
					from: { before: vectorId1 },
					to: { after: vectorId2 },
				},
				destination: {
					target: [vectorId3, "vectors2"],
					position: "start",
				},
			};

			assert.throws(
				() => applyAgentEdit(view, moveEdit, idGenerator, simpleSchema.definitions),
				validateUsageError(
					/The "after" position must be within the same array as the target node/,
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
			const view = asTreeViewAlpha(tree.viewWith(configWithMultipleVectors));
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
				type: "moveArrayElement",
				source: strId,
				destination: {
					target: [vectorId, "vectors"],
					position: "start",
				},
			};

			assert.throws(
				() => applyAgentEdit(view, moveEdit, idGenerator, simpleSchema.definitions),
				validateUsageError(/The source node must be within an arrayNode/),
			);
		});

		it("providing arrayPlace with non-existent field fails", () => {
			const tree = factory.create(
				new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
				"tree",
			);
			const configWithMultipleVectors = new TreeViewConfiguration({
				schema: [RootObjectWithNonArrayVectorField],
			});
			const view = asTreeViewAlpha(tree.viewWith(configWithMultipleVectors));
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
				type: "moveArrayElement",
				source: strId,
				destination: {
					target: [vectorId, "nonExistentField"],
					position: "start",
				},
			};

			assert.throws(
				() => applyAgentEdit(view, moveEdit, idGenerator, simpleSchema.definitions),
				validateUsageError(/The source node must be within an arrayNode/),
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
		const view = asTreeViewAlpha(tree.viewWith(configWithMultipleVectors));
		const simpleSchema = getSimpleSchema(view.schema);

		view.initialize({
			str: "testStr",
			vectors: [new Vector({ x: 1, y: 2, z: 3 }), new Vector({ x: 2, y: 3, z: 4 })],
			vectors2: [new Vector({ x: 3, y: 4, z: 5 })],
			bools: [true],
		});

		const insertEdit: TreeEdit = {
			type: "insertIntoArray",
			array: [null, "vectors"],
			position: { after: "testObjectId" },
			value: { [typeField]: Vector.identifier, x: 2, nonVectorField: "invalid", z: 4 },
		};

		assert.throws(
			() => applyAgentEdit(view, insertEdit, idGenerator, simpleSchema.definitions),
			validateUsageError(/No object with id "testObjectId" found in the tree/),
		);

		const insertEdit2: TreeEdit = {
			type: "insertIntoArray",
			array: [null, "testObjectId", "vectors"],
			position: "start",
			value: { [typeField]: Vector.identifier, x: 2, nonVectorField: "invalid", z: 4 },
		};

		assert.throws(
			() => applyAgentEdit(view, insertEdit2, idGenerator, simpleSchema.definitions),
			validateUsageError(
				/Pointer could not be resolved to a node in the tree \(note that primitives and Fluid handles are not supported\)./,
			),
		);

		const moveEdit: TreeEdit = {
			type: "moveArrayElement",
			source: {
				array: [null, "vectors"],
				from: { before: "testObjectId1" },
				to: { after: "testObjectId2" },
			},
			destination: {
				target: ["testObjectId3", "vectors2"],
				position: "start",
			},
		};
		assert.throws(
			() => applyAgentEdit(view, moveEdit, idGenerator, simpleSchema.definitions),
			validateUsageError(/No object with id "testObjectId1" found in the tree/),
		);

		const moveEdit2: TreeEdit = {
			type: "moveArrayElement",
			source: "testObjectId1",
			destination: {
				target: [null, "vectors"],
				position: { before: "testObjectId2" },
			},
		};

		assert.throws(
			() => applyAgentEdit(view, moveEdit2, idGenerator, simpleSchema.definitions),
			validateUsageError(/No object with id "testObjectId1" found in the tree/),
		);

		const modifyEdit: TreeEdit = {
			type: "setField",
			object: "testObjectId",
			field: "x",
			value: 111,
		};

		assert.throws(
			() => applyAgentEdit(view, modifyEdit, idGenerator, simpleSchema.definitions),
			validateUsageError(/No object with id "testObjectId" found in the tree/),
		);
	});
});
