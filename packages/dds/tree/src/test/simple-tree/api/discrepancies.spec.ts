/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import {
	forbiddenFieldKindIdentifier,
	LeafNodeStoredSchema,
	MapNodeStoredSchema,
	ObjectNodeStoredSchema,
	storedEmptyFieldSchema,
	ValueSchema,
	type TreeNodeSchemaIdentifier,
} from "../../../core/index.js";
import {
	defaultSchemaPolicy,
	allowsRepoSuperset,
	FieldKinds,
} from "../../../feature-libraries/index.js";
import { brand } from "../../../util/index.js";
import {
	SchemaFactoryAlpha,
	toStoredSchema,
	type AnnotatedAllowedType,
	type TreeNodeSchema,
	SchemaFactory,
	TreeViewConfigurationAlpha,
	NodeKind,
} from "../../../simple-tree/index.js";
// eslint-disable-next-line import/no-internal-modules
import { LeafNodeSchema } from "../../../simple-tree/leafNodeSchema.js";
import {
	findExtraAllowedTypes,
	getDiscrepanciesInAllowedContent,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../simple-tree/api/discrepancies.js";
import { fieldSchema } from "../../utils.js";

// Arbitrary schema name used in tests
const testTreeNodeName = "tree";
const testTreeNodeIdentifier = brand<TreeNodeSchemaIdentifier>("schema discrepancies.tree");

const schemaFactory = new SchemaFactoryAlpha("schema discrepancies");
const numberName = brand<TreeNodeSchemaIdentifier>(SchemaFactory.number.identifier);

// TODO:#43720: Add tests for RecordNodeObjects
describe("Schema Discrepancies", () => {
	it("Node kind difference for each possible combination", () => {
		class ObjectNode extends schemaFactory.objectAlpha(testTreeNodeName, {}) {}
		const objectNodeStoredSchema = toStoredSchema(ObjectNode);

		class MapNode extends schemaFactory.mapAlpha(testTreeNodeName, []) {}
		const mapNodeStoredSchema = toStoredSchema(MapNode);

		const leafNodeSchema = new LeafNodeSchema(testTreeNodeIdentifier, ValueSchema.Number);
		const leafNodeStoredSchema = toStoredSchema(leafNodeSchema);

		assert.deepEqual(
			[
				...getDiscrepanciesInAllowedContent(
					new TreeViewConfigurationAlpha({ schema: ObjectNode }),
					objectNodeStoredSchema,
				),
			],
			[],
		);

		assert.deepEqual(
			[
				...getDiscrepanciesInAllowedContent(
					new TreeViewConfigurationAlpha({ schema: ObjectNode }),
					mapNodeStoredSchema,
				),
			],
			[
				{
					identifier: testTreeNodeIdentifier,
					mismatch: "nodeKind",
					view: NodeKind.Object,
					stored: MapNodeStoredSchema,
				},
			],
		);

		assert.deepEqual(
			[
				...getDiscrepanciesInAllowedContent(
					new TreeViewConfigurationAlpha({ schema: ObjectNode }),
					leafNodeStoredSchema,
				),
			],
			[
				{
					identifier: testTreeNodeIdentifier,
					mismatch: "nodeKind",
					view: NodeKind.Object,
					stored: LeafNodeStoredSchema,
				},
			],
		);

		assert.deepEqual(
			[
				...getDiscrepanciesInAllowedContent(
					new TreeViewConfigurationAlpha({ schema: MapNode }),
					mapNodeStoredSchema,
				),
			],
			[],
		);

		assert.deepEqual(
			[
				...getDiscrepanciesInAllowedContent(
					new TreeViewConfigurationAlpha({ schema: MapNode }),
					objectNodeStoredSchema,
				),
			],
			[
				{
					identifier: testTreeNodeIdentifier,
					mismatch: "nodeKind",
					view: NodeKind.Map,
					stored: ObjectNodeStoredSchema,
				},
			],
		);

		assert.equal(
			allowsRepoSuperset(defaultSchemaPolicy, objectNodeStoredSchema, mapNodeStoredSchema),
			true,
		);
	});

	it("Field kind difference for each possible combination (including root)", () => {
		class MapNode1 extends schemaFactory.mapAlpha(testTreeNodeName, SchemaFactory.number) {}
		const mapNodeSchema1 = SchemaFactory.optional(MapNode1);

		class MapNode2 extends schemaFactory.mapAlpha(testTreeNodeName, [
			SchemaFactory.number,
			SchemaFactory.string,
		]) {}
		const mapNodeSchema2 = SchemaFactory.required(MapNode2);

		class ArrayNode extends schemaFactory.arrayAlpha("array", SchemaFactory.string) {}
		class MapNode3 extends schemaFactory.mapAlpha(testTreeNodeName, ArrayNode) {}
		const mapNodeSchema3 = SchemaFactory.required(MapNode3);

		class MapNode4 extends schemaFactory.mapAlpha(testTreeNodeName, [
			SchemaFactory.number,
			SchemaFactory.string,
		]) {}
		const mapNodeSchema4 = SchemaFactory.optional(MapNode4);

		assert.deepEqual(
			[
				...getDiscrepanciesInAllowedContent(
					new TreeViewConfigurationAlpha({ schema: mapNodeSchema1 }),
					toStoredSchema(mapNodeSchema2),
				),
			],
			[
				{
					identifier: undefined,
					fieldKey: undefined,
					mismatch: "fieldKind",
					view: "Optional",
					stored: "Value",
				},
				{
					identifier: testTreeNodeIdentifier,
					fieldKey: undefined,
					mismatch: "allowedTypes",
					view: [],
					stored: [SchemaFactory.string.identifier],
				},
			],
		);

		assert.deepEqual(
			[
				...getDiscrepanciesInAllowedContent(
					new TreeViewConfigurationAlpha({ schema: mapNodeSchema2 }),
					toStoredSchema(mapNodeSchema3),
				),
			],
			[
				{
					identifier: testTreeNodeIdentifier,
					fieldKey: undefined,
					mismatch: "allowedTypes",
					view: [
						{ metadata: {}, type: SchemaFactory.number },
						{ metadata: {}, type: SchemaFactory.string },
					],
					stored: ["schema discrepancies.array"],
				},
			],
		);
	});

	it("Differing schema identifiers", () => {
		/**
		 * If schema identifiers differ, treat it as missing in the other document.
		 * Exhaustive validation is not applied in this case.
		 */

		class MapNode extends schemaFactory.mapAlpha(testTreeNodeName, SchemaFactory.number) {}

		class ObjectNode1 extends schemaFactory.objectAlpha(testTreeNodeName, {
			x: SchemaFactory.number,
		}) {}

		class ObjectNode2 extends schemaFactory.objectAlpha("tree2", {
			x: SchemaFactory.optional(SchemaFactory.string),
			y: SchemaFactory.optional(SchemaFactory.string),
		}) {}
		const objectNodeSchema2 = SchemaFactory.optional(ObjectNode2);
		const objectNodeStoredSchema2 = toStoredSchema(objectNodeSchema2);

		assert.deepEqual(
			[
				...getDiscrepanciesInAllowedContent(
					new TreeViewConfigurationAlpha({ schema: schemaFactory.optional(ObjectNode1) }),
					objectNodeStoredSchema2,
				),
			],
			[
				{
					fieldKey: undefined,
					identifier: undefined,
					mismatch: "allowedTypes",
					stored: ["schema discrepancies.tree2"],
					view: [
						{
							metadata: {},
							type: ObjectNode1,
						},
					],
				},
			],
		);

		assert.deepEqual(
			[
				...getDiscrepanciesInAllowedContent(
					new TreeViewConfigurationAlpha({ schema: schemaFactory.optional(MapNode) }),
					objectNodeStoredSchema2,
				),
			],
			[
				{
					fieldKey: undefined,
					identifier: undefined,
					mismatch: "allowedTypes",
					stored: ["schema discrepancies.tree2"],
					view: [
						{
							metadata: {},
							type: MapNode,
						},
					],
				},
			],
		);
	});

	it("Differing fields on object node schema", () => {
		// Both utilize ObjectNode but with differing fieldSchemas
		class ObjectNode1 extends schemaFactory.objectAlpha(testTreeNodeName, {
			x: SchemaFactory.number,
		}) {}
		const objectNodeRoot1 = SchemaFactory.optional(ObjectNode1);

		class ObjectNode2 extends schemaFactory.objectAlpha(testTreeNodeName, {
			x: SchemaFactory.optional(SchemaFactory.string),
			y: SchemaFactory.optional(SchemaFactory.string),
		}) {}
		const objectNodeRoot2 = SchemaFactory.optional(ObjectNode2);
		const objectNodeStoredSchema2 = toStoredSchema(objectNodeRoot2);

		assert.deepEqual(
			[
				...getDiscrepanciesInAllowedContent(
					new TreeViewConfigurationAlpha({ schema: objectNodeRoot1 }),
					objectNodeStoredSchema2,
				),
			],
			[
				{
					fieldKey: "x",
					identifier: testTreeNodeIdentifier,
					mismatch: "allowedTypes",
					view: [{ metadata: {}, type: SchemaFactory.number }],
					stored: [SchemaFactory.string.identifier],
				},
				{
					fieldKey: "x",
					identifier: testTreeNodeIdentifier,
					mismatch: "fieldKind",
					view: "Value",
					stored: "Optional",
				},
				{
					fieldKey: "y",
					identifier: testTreeNodeIdentifier,
					mismatch: "fieldKind",
					view: "Forbidden",
					stored: "Optional",
				},
			],
		);
	});

	it("Differing value types on leaf node schema", () => {
		const viewNumber = schemaFactory.optional(SchemaFactory.number);

		const rootFieldSchema = fieldSchema(FieldKinds.optional, [numberName]);

		const storedBooleanRoot = {
			rootFieldSchema,
			nodeSchema: new Map([[numberName, new LeafNodeStoredSchema(ValueSchema.Boolean)]]),
		};
		const storedNumberRoot = {
			rootFieldSchema,
			nodeSchema: new Map([[numberName, new LeafNodeStoredSchema(ValueSchema.Number)]]),
		};

		assert.deepEqual(
			[
				...getDiscrepanciesInAllowedContent(
					new TreeViewConfigurationAlpha({ schema: viewNumber }),
					storedBooleanRoot,
				),
			],
			[
				{
					identifier: numberName,
					mismatch: "valueSchema",
					view: ValueSchema.Number,
					stored: ValueSchema.Boolean,
				},
			],
		);

		assert.deepEqual(
			[
				...getDiscrepanciesInAllowedContent(
					new TreeViewConfigurationAlpha({ schema: viewNumber }),
					storedNumberRoot,
				),
			],
			[],
		);
	});

	describe("Special types of tree schemas", () => {
		class ObjectNode extends schemaFactory.objectAlpha(testTreeNodeName, {
			x: SchemaFactory.optional(SchemaFactory.number),
		}) {}

		it("emptyTree", () => {
			const emptyTree = schemaFactory.objectAlpha(testTreeNodeName, {});

			const emptyTreeStored = {
				rootFieldSchema: storedEmptyFieldSchema,
				nodeSchema: new Map([[testTreeNodeIdentifier, new ObjectNodeStoredSchema(new Map())]]),
			};
			const emptyLocalFieldTreeStored = {
				rootFieldSchema: storedEmptyFieldSchema,
				nodeSchema: new Map([
					[
						testTreeNodeIdentifier,
						new ObjectNodeStoredSchema(new Map([[brand("x"), storedEmptyFieldSchema]])),
					],
				]),
			};

			assert.equal(
				allowsRepoSuperset(defaultSchemaPolicy, emptyTreeStored, emptyLocalFieldTreeStored),
				true,
			);
			assert.equal(
				allowsRepoSuperset(defaultSchemaPolicy, emptyLocalFieldTreeStored, emptyTreeStored),
				true,
			);

			assert.deepEqual(
				[
					...getDiscrepanciesInAllowedContent(
						new TreeViewConfigurationAlpha({ schema: emptyTree }),
						emptyLocalFieldTreeStored,
					),
				],
				[
					{
						fieldKey: undefined,
						identifier: undefined,
						mismatch: "allowedTypes",
						stored: [],
						view: [
							{
								metadata: {},
								type: emptyTree,
							},
						],
					},
					{
						fieldKey: undefined,
						identifier: undefined,
						mismatch: "fieldKind",
						view: "Value",
						stored: "Forbidden",
					},
				],
			);

			assert.deepEqual(
				[
					...getDiscrepanciesInAllowedContent(
						new TreeViewConfigurationAlpha({ schema: ObjectNode }),
						emptyTreeStored,
					),
				],
				[
					{
						fieldKey: undefined,
						identifier: undefined,
						mismatch: "allowedTypes",
						stored: [],
						view: [
							{
								metadata: {},
								type: ObjectNode,
							},
						],
					},
					{
						fieldKey: undefined,
						identifier: undefined,
						mismatch: "fieldKind",
						view: "Value",
						stored: forbiddenFieldKindIdentifier,
					},
					{
						identifier: "schema discrepancies.tree",
						fieldKey: "x",
						mismatch: "fieldKind",
						view: "Optional",
						stored: forbiddenFieldKindIdentifier,
					},
				],
			);

			assert.deepEqual(
				[
					...getDiscrepanciesInAllowedContent(
						new TreeViewConfigurationAlpha({ schema: ObjectNode }),
						emptyLocalFieldTreeStored,
					),
				],
				[
					{
						fieldKey: undefined,
						identifier: undefined,
						mismatch: "allowedTypes",
						stored: [],
						view: [
							{
								metadata: {},
								type: ObjectNode,
							},
						],
					},
					{
						fieldKey: undefined,
						identifier: undefined,
						mismatch: "fieldKind",
						view: "Value",
						stored: forbiddenFieldKindIdentifier,
					},
					{
						identifier: "schema discrepancies.tree",
						fieldKey: "x",
						mismatch: "allowedTypes",
						view: [{ metadata: {}, type: SchemaFactory.number }],
						stored: [],
					},
					{
						identifier: "schema discrepancies.tree",
						fieldKey: "x",
						mismatch: "fieldKind",
						view: "Optional",
						stored: "Forbidden",
					},
				],
			);
		});
	});

	describe("findExtraAllowedTypes", () => {
		const typeA = { metadata: {}, type: SchemaFactory.number };
		const typeB = { metadata: {}, type: SchemaFactory.string };
		const typeC = { metadata: {}, type: SchemaFactory.boolean };

		const getIdentifiers = (types: readonly AnnotatedAllowedType<TreeNodeSchema>[]) =>
			new Set<TreeNodeSchemaIdentifier>(
				types.map((type) => {
					const identifier: TreeNodeSchemaIdentifier = brand(type.type.identifier);
					return identifier;
				}),
			);

		it("returns empty arrays when view and stored types match", () => {
			const view = [typeA, typeB];
			const stored = getIdentifiers(view);

			const { viewExtra, storedExtra } = findExtraAllowedTypes(view, stored);

			assert.deepEqual(viewExtra, []); // extras in view
			assert.deepEqual(storedExtra, []); // extras in stored
		});

		it("detects extra types in view only", () => {
			const view = [typeA, typeB, typeC];
			const stored = getIdentifiers([typeA, typeB]);

			const { viewExtra, storedExtra } = findExtraAllowedTypes(view, stored);

			assert.deepEqual(viewExtra, [typeC]);
			assert.deepEqual(storedExtra, []);
		});

		it("detects extra types in stored only", () => {
			const view = [typeA];
			const stored = getIdentifiers([typeA, typeB]);

			const { viewExtra, storedExtra } = findExtraAllowedTypes(view, stored);

			assert.deepEqual(viewExtra, []);
			assert.deepEqual(storedExtra, [typeB.type.identifier]);
		});

		it("detects extra types on both sides", () => {
			const view = [typeA, typeB];
			const stored = getIdentifiers([typeB, typeC]);

			const { viewExtra, storedExtra } = findExtraAllowedTypes(view, stored);

			assert.deepEqual(viewExtra, [typeA]);
			assert.deepEqual(storedExtra, [typeC.type.identifier]);
		});

		it("handles empty inputs", () => {
			const { viewExtra, storedExtra } = findExtraAllowedTypes([], new Set());
			assert.deepEqual(viewExtra, []);
			assert.deepEqual(storedExtra, []);
		});
	});
});
