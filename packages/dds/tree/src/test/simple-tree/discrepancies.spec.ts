/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert";
import {
	LeafNodeStoredSchema,
	MapNodeStoredSchema,
	ObjectNodeStoredSchema,
	storedEmptyFieldSchema,
	ValueSchema,
	type TreeNodeSchemaIdentifier,
	type TreeStoredSchema,
} from "../../core/index.js";
import {
	defaultSchemaPolicy,
	allowsRepoSuperset,
	FieldKinds,
	type FlexFieldKind,
} from "../../feature-libraries/index.js";
import { brand } from "../../util/index.js";
import {
	FieldKind,
	normalizeFieldSchema,
	SchemaFactoryAlpha,
	toStoredSchema,
	getAllowedContentDiscrepancies,
	type AnnotatedAllowedType,
	type TreeNodeSchema,
	SchemaFactory,
} from "../../simple-tree/index.js";
// TODO avoid this reaching import, non-string identifiers are intentionally not supported, and likely to break things
// eslint-disable-next-line import/no-internal-modules
import { createFieldSchema } from "../../simple-tree/fieldSchema.js";
// eslint-disable-next-line import/no-internal-modules
import { LeafNodeSchema } from "../../simple-tree/leafNodeSchema.js";
// eslint-disable-next-line import/no-internal-modules
import { findExtraAllowedTypes } from "../../simple-tree/discrepancies.js";
import { fieldSchema, isViewSupersetOfStored } from "../utils.js";

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
				...getAllowedContentDiscrepancies(
					normalizeFieldSchema(ObjectNode),
					objectNodeStoredSchema,
				),
			],
			[],
		);

		assert.deepEqual(
			[
				...getAllowedContentDiscrepancies(
					normalizeFieldSchema(ObjectNode),
					mapNodeStoredSchema,
				),
			],
			[
				{
					identifier: testTreeNodeIdentifier,
					mismatch: "nodeKind",
					view: ObjectNodeStoredSchema,
					stored: MapNodeStoredSchema,
				},
			],
		);

		assert.deepEqual(
			[
				...getAllowedContentDiscrepancies(
					normalizeFieldSchema(ObjectNode),
					leafNodeStoredSchema,
				),
			],
			[
				{
					identifier: testTreeNodeIdentifier,
					mismatch: "nodeKind",
					view: ObjectNodeStoredSchema,
					stored: LeafNodeStoredSchema,
				},
			],
		);

		assert.deepEqual(
			[...getAllowedContentDiscrepancies(normalizeFieldSchema(MapNode), mapNodeStoredSchema)],
			[],
		);

		assert.deepEqual(
			[
				...getAllowedContentDiscrepancies(
					normalizeFieldSchema(MapNode),
					objectNodeStoredSchema,
				),
			],
			[
				{
					identifier: testTreeNodeIdentifier,
					mismatch: "nodeKind",
					view: MapNodeStoredSchema,
					stored: ObjectNodeStoredSchema,
				},
			],
		);

		/**
		 * Below is an inconsistency between 'isViewSupersetOfStored' and 'allowsRepoSuperset'. The 'isViewSupersetOfStored' will
		 * halt further validation if an inconsistency in `nodeKind` is found. However, the current logic of
		 * 'allowsRepoSuperset' permits relaxing an object node to a map node, which allows for a union of all types
		 * permitted on the object node's fields. It is unclear if this behavior is desired, as
		 * 'getAllowedContentDiscrepancies' currently does not support it.
		 *
		 * TODO: If we decide to support this behavior, we will need better e2e tests for this scenario. Additionally,
		 * we may need to adjust the encoding of map nodes and object nodes to ensure consistent encoding.
		 */
		assert.equal(
			isViewSupersetOfStored(normalizeFieldSchema(ObjectNode), mapNodeStoredSchema),
			false,
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
				...getAllowedContentDiscrepancies(
					normalizeFieldSchema(mapNodeSchema1),
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
				{
					identifier: SchemaFactory.string.identifier,
					mismatch: "nodeKind",
					view: undefined,
					stored: LeafNodeStoredSchema,
				},
			],
		);

		assert.deepEqual(
			[
				...getAllowedContentDiscrepancies(
					normalizeFieldSchema(mapNodeSchema2),
					toStoredSchema(mapNodeSchema3),
				),
			],
			[
				{
					identifier: SchemaFactory.number.identifier,
					mismatch: "nodeKind",
					view: LeafNodeStoredSchema,
					stored: undefined,
				},
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
				{
					identifier: "schema discrepancies.array",
					mismatch: "nodeKind",
					view: undefined,
					stored: ObjectNodeStoredSchema,
				},
			],
		);

		assert.equal(
			isViewSupersetOfStored(
				normalizeFieldSchema(mapNodeSchema4),
				toStoredSchema(mapNodeSchema1),
			),
			true,
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
				...getAllowedContentDiscrepancies(
					schemaFactory.optional(ObjectNode1),
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
				{
					identifier: SchemaFactory.number.identifier,
					mismatch: "nodeKind",
					view: LeafNodeStoredSchema,
					stored: undefined,
				},
				{
					identifier: testTreeNodeIdentifier,
					mismatch: "nodeKind",
					view: ObjectNodeStoredSchema,
					stored: undefined,
				},
				{
					identifier: SchemaFactory.string.identifier,
					mismatch: "nodeKind",
					view: undefined,
					stored: LeafNodeStoredSchema,
				},
				{
					identifier: "schema discrepancies.tree2",
					mismatch: "nodeKind",
					view: undefined,
					stored: ObjectNodeStoredSchema,
				},
			],
		);

		assert.deepEqual(
			[
				...getAllowedContentDiscrepancies(
					schemaFactory.optional(MapNode),
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
				{
					identifier: SchemaFactory.number.identifier,
					mismatch: "nodeKind",
					view: LeafNodeStoredSchema,
					stored: undefined,
				},
				{
					identifier: testTreeNodeIdentifier,
					mismatch: "nodeKind",
					view: MapNodeStoredSchema,
					stored: undefined,
				},
				{
					identifier: SchemaFactory.string.identifier,
					mismatch: "nodeKind",
					view: undefined,
					stored: LeafNodeStoredSchema,
				},
				{
					identifier: "schema discrepancies.tree2",
					mismatch: "nodeKind",
					view: undefined,
					stored: ObjectNodeStoredSchema,
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
			[...getAllowedContentDiscrepancies(objectNodeRoot1, objectNodeStoredSchema2)],
			[
				{
					identifier: SchemaFactory.number.identifier,
					mismatch: "nodeKind",
					view: LeafNodeStoredSchema,
					stored: undefined,
				},
				{
					identifier: testTreeNodeIdentifier,
					mismatch: "fields",
					differences: [
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
				},
				{
					identifier: SchemaFactory.string.identifier,
					mismatch: "nodeKind",
					view: undefined,
					stored: LeafNodeStoredSchema,
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
			[...getAllowedContentDiscrepancies(viewNumber, storedBooleanRoot)],
			[
				{
					identifier: numberName,
					mismatch: "valueSchema",
					view: ValueSchema.Number,
					stored: ValueSchema.Boolean,
				},
			],
		);

		assert.deepEqual([...getAllowedContentDiscrepancies(viewNumber, storedNumberRoot)], []);
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
					...getAllowedContentDiscrepancies(
						normalizeFieldSchema(emptyTree),
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
				[...getAllowedContentDiscrepancies(normalizeFieldSchema(ObjectNode), emptyTreeStored)],
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
						stored: "Forbidden",
					},
					{
						identifier: SchemaFactory.number.identifier,
						mismatch: "nodeKind",
						view: LeafNodeStoredSchema,
						stored: undefined,
					},
					{
						identifier: "schema discrepancies.tree",
						mismatch: "fields",
						differences: [
							{
								identifier: "schema discrepancies.tree",
								fieldKey: "x",
								mismatch: "fieldKind",
								view: "Optional",
								stored: "Forbidden",
							},
						],
					},
				],
			);

			assert.deepEqual(
				[
					...getAllowedContentDiscrepancies(
						normalizeFieldSchema(ObjectNode),
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
						stored: "Forbidden",
					},
					{
						identifier: SchemaFactory.number.identifier,
						mismatch: "nodeKind",
						view: LeafNodeStoredSchema,
						stored: undefined,
					},
					{
						identifier: "schema discrepancies.tree",
						mismatch: "fields",
						differences: [
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
					},
				],
			);
		});
	});

	describe("isViewSupersetOfStored", () => {
		class MapNode1 extends schemaFactory.mapAlpha(testTreeNodeName, SchemaFactory.number) {}
		const mapNodeSchema1 = SchemaFactory.required(MapNode1);

		it("Relaxing a field kind to more general field kind", () => {
			class MapNode2 extends schemaFactory.mapAlpha(testTreeNodeName, SchemaFactory.number) {}
			const mapNodeSchema2 = SchemaFactory.optional(MapNode2);

			class MapNode3 extends schemaFactory.mapAlpha(testTreeNodeName, SchemaFactory.number) {}
			const mapNodeSchema3 = SchemaFactory.optional(MapNode3);

			assert.equal(
				isViewSupersetOfStored(mapNodeSchema2, toStoredSchema(mapNodeSchema1)),
				true,
			);
			assert.equal(
				isViewSupersetOfStored(mapNodeSchema3, toStoredSchema(mapNodeSchema2)),
				true,
			);
		});

		it("Detects new node kinds as a superset", () => {
			const emptySchema = SchemaFactory.optional([]);

			const optionalNumberSchema = SchemaFactory.optional(
				schemaFactory.mapAlpha(testTreeNodeName, SchemaFactory.number),
			);

			assert.equal(
				isViewSupersetOfStored(optionalNumberSchema, toStoredSchema(emptySchema)),
				true,
			);
		});

		it("Detects changed node kinds as not a superset", () => {
			// Name used for the node which has a changed type
			const schemaName = brand<TreeNodeSchemaIdentifier>("test");

			const schemaA = SchemaFactory.optional(
				schemaFactory.mapAlpha(schemaName, SchemaFactory.number),
			);

			const schemaB = SchemaFactory.optional(schemaFactory.objectAlpha(schemaName, {}));

			assert.equal(isViewSupersetOfStored(schemaA, toStoredSchema(schemaB)), false);
			assert.equal(isViewSupersetOfStored(schemaB, toStoredSchema(schemaA)), false);
		});

		it("Adding to the set of allowed types for a field", () => {
			class MapNode2 extends schemaFactory.mapAlpha(testTreeNodeName, []) {}

			class MapNode3 extends schemaFactory.mapAlpha(testTreeNodeName, [
				schemaFactory.number,
				schemaFactory.string,
			]) {}

			class MapNode4 extends schemaFactory.mapAlpha(testTreeNodeName, schemaFactory.number) {}

			assert.equal(
				isViewSupersetOfStored(normalizeFieldSchema(MapNode4), toStoredSchema(MapNode2)),
				true,
			);
			assert.equal(
				isViewSupersetOfStored(normalizeFieldSchema(MapNode3), toStoredSchema(MapNode4)),
				true,
			);
		});

		it("Adding an optional field to an object node", () => {
			class ObjectNode1 extends schemaFactory.objectAlpha(testTreeNodeName, {
				x: SchemaFactory.optional(SchemaFactory.number),
			}) {}

			class ObjectNode2 extends schemaFactory.objectAlpha(testTreeNodeName, {
				x: SchemaFactory.optional(SchemaFactory.number),
				y: SchemaFactory.optional(SchemaFactory.string),
			}) {}

			assert.equal(
				isViewSupersetOfStored(normalizeFieldSchema(ObjectNode2), toStoredSchema(ObjectNode1)),
				true,
			);
		});

		it("No superset for node kind incompatibility", () => {
			class ObjectNode extends schemaFactory.objectAlpha(testTreeNodeName, {
				x: SchemaFactory.optional(SchemaFactory.number),
			}) {}

			class MapNode extends schemaFactory.mapAlpha(testTreeNodeName, SchemaFactory.number) {}

			assert.equal(
				isViewSupersetOfStored(normalizeFieldSchema(ObjectNode), toStoredSchema(MapNode)),
				false,
			);
		});

		describe("on field kinds for root fields of identical content", () => {
			const allFieldKinds = Object.values(FieldKinds);
			const testCases: {
				superset: FieldKind;
				original: FlexFieldKind;
				expected: boolean;
			}[] = [
				{ superset: FieldKind.Identifier, original: FieldKinds.forbidden, expected: false },
				{ superset: FieldKind.Identifier, original: FieldKinds.optional, expected: false },
				{ superset: FieldKind.Identifier, original: FieldKinds.required, expected: false },
				{ superset: FieldKind.Identifier, original: FieldKinds.sequence, expected: false },
				{ superset: FieldKind.Optional, original: FieldKinds.forbidden, expected: true },
				{ superset: FieldKind.Optional, original: FieldKinds.identifier, expected: true },
				{ superset: FieldKind.Optional, original: FieldKinds.required, expected: true },
				{ superset: FieldKind.Optional, original: FieldKinds.sequence, expected: false },
				{ superset: FieldKind.Required, original: FieldKinds.forbidden, expected: false },
				{ superset: FieldKind.Required, original: FieldKinds.identifier, expected: true },
				{ superset: FieldKind.Required, original: FieldKinds.optional, expected: false },
				{ superset: FieldKind.Required, original: FieldKinds.sequence, expected: false },
				// Note: despite the fact that all field types can be relaxed to a sequence field, note that
				// this is not possible using the public API for creating schemas, since the degrees of freedom in creating
				// sequence fields are restricted: `SchemaFactory`'s `array` builder adds a node which is transparent via
				// the simple-tree API, but nonetheless results in incompatibility.
				// TODO: Commented out since this is not supported in the API.
				// This will be revisited in the future when a more comprehensive refactor of the schema compatibility logic is done.
				// { superset: FieldKinds.sequence, original: FieldKinds.forbidden, expected: true },
				// { superset: FieldKinds.sequence, original: FieldKinds.identifier, expected: true },
				// { superset: FieldKinds.sequence, original: FieldKinds.optional, expected: true },
				// { superset: FieldKinds.sequence, original: FieldKinds.required, expected: true },
				// All field kinds are a (non-proper) superset of themselves
				{ superset: FieldKind.Identifier, original: FieldKinds.identifier, expected: true },
				{ superset: FieldKind.Optional, original: FieldKinds.optional, expected: true },
				{ superset: FieldKind.Required, original: FieldKinds.required, expected: true },
			];

			it("verify this test is exhaustive", () => {
				// Test case expectations below are generated manually. When new supported field kinds are added, this suite must be updated.
				// This likely also necessitates changes to the production code this describe block validates.
				assert.equal(allFieldKinds.length, 5);
				assert.equal(allFieldKinds.length * 3, testCases.length);
			});

			for (const { superset, original, expected } of testCases) {
				it(`${superset.identiifer} ${expected ? "⊇" : "⊉"} ${original.identifier}`, () => {
					const schemaA = createFieldSchema(superset, SchemaFactory.number);

					const schemaB: TreeStoredSchema = {
						rootFieldSchema: fieldSchema(original, [numberName]),
						nodeSchema: new Map([[numberName, new LeafNodeStoredSchema(ValueSchema.Number)]]),
					};

					assert.equal(isViewSupersetOfStored(schemaA, schemaB), expected);
				});
			}
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

			const [viewExtra, storedExtra] = findExtraAllowedTypes(view, stored);

			assert.deepEqual(viewExtra, []); // extras in view
			assert.deepEqual(storedExtra, []); // extras in stored
		});

		it("detects extra types in view only", () => {
			const view = [typeA, typeB, typeC];
			const stored = getIdentifiers([typeA, typeB]);

			const [viewExtra, storedExtra] = findExtraAllowedTypes(view, stored);

			assert.deepEqual(viewExtra, [typeC]);
			assert.deepEqual(storedExtra, []);
		});

		it("detects extra types in stored only", () => {
			const view = [typeA];
			const stored = getIdentifiers([typeA, typeB]);

			const [viewExtra, storedExtra] = findExtraAllowedTypes(view, stored);

			assert.deepEqual(viewExtra, []);
			assert.deepEqual(storedExtra, [typeB.type.identifier]);
		});

		it("detects extra types on both sides", () => {
			const view = [typeA, typeB];
			const stored = getIdentifiers([typeB, typeC]);

			const [viewExtra, storedExtra] = findExtraAllowedTypes(view, stored);

			assert.deepEqual(viewExtra, [typeA]);
			assert.deepEqual(storedExtra, [typeC.type.identifier]);
		});

		it("handles empty inputs", () => {
			const [viewExtra, storedExtra] = findExtraAllowedTypes([], new Set());
			assert.deepEqual(viewExtra, []);
			assert.deepEqual(storedExtra, []);
		});
	});
});
