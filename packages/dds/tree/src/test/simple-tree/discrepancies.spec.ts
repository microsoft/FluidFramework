/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert";
import {
	LeafNodeStoredSchema,
	ObjectNodeStoredSchema,
	storedEmptyFieldSchema,
	ValueSchema,
	type TreeFieldStoredSchema,
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
	isRepoSuperset,
	getAllowedContentDiscrepancies,
} from "../../simple-tree/index.js";
// eslint-disable-next-line import/no-internal-modules
import { createFieldSchema } from "../../simple-tree/fieldSchema.js";
// eslint-disable-next-line import/no-internal-modules
import { fieldSchema } from "../feature-libraries/modular-schema/comparison.spec.js";
// eslint-disable-next-line import/no-internal-modules
import { LeafNodeSchema } from "../../simple-tree/leafNodeSchema.js";

// Arbitrary schema name used in tests
const testTreeNodeIdentifier = brand<TreeNodeSchemaIdentifier>("tree");
const testTreeNodeIdentifierNormalized = brand<TreeNodeSchemaIdentifier>(
	"schema discrepancies.tree",
);

const schemaFactory = new SchemaFactoryAlpha("schema discrepancies");
const numberName = brand<TreeNodeSchemaIdentifier>(schemaFactory.number.identifier);

describe("Schema Discrepancies", () => {
	it("Node kind difference for each possible combination", () => {
		const objectNodeSchema = schemaFactory.objectAlpha(testTreeNodeIdentifier, {
			x: schemaFactory.required([schemaFactory.number]),
		});
		const objectNodeStoredSchema = toStoredSchema(objectNodeSchema);

		const mapNodeSchema = schemaFactory.mapAlpha(testTreeNodeIdentifier, [
			schemaFactory.number,
		]);
		const mapNodeStoredSchema = toStoredSchema(mapNodeSchema);

		// TODO: set the key for the leaf node schema so that it results in a proper node kind discrepancy
		// is this even possible in the api? if not, no need to test it here
		const leafNodeSchema = schemaFactory.number;
		const leafNodeStoredSchema = toStoredSchema(leafNodeSchema);

		assert.deepEqual(
			Array.from(
				getAllowedContentDiscrepancies(
					normalizeFieldSchema(objectNodeSchema),
					objectNodeStoredSchema,
				),
			),
			[],
		);

		assert.deepEqual(
			Array.from(
				getAllowedContentDiscrepancies(
					normalizeFieldSchema(objectNodeSchema),
					mapNodeStoredSchema,
				),
			),
			[
				{
					identifier: testTreeNodeIdentifierNormalized,
					mismatch: "nodeKind",
					view: "object",
					stored: "map",
				},
			],
		);

		assert.deepEqual(
			Array.from(
				getAllowedContentDiscrepancies(
					normalizeFieldSchema(objectNodeSchema),
					leafNodeStoredSchema,
				),
			),
			[
				{
					fieldKey: undefined,
					identifier: undefined,
					mismatch: "allowedTypes",
					stored: [leafNodeSchema.identifier],
					view: [
						{
							metadata: {},
							type: objectNodeSchema,
						},
					],
				},
				{
					identifier: testTreeNodeIdentifierNormalized,
					mismatch: "nodeKind",
					view: "object",
					stored: undefined,
				},
			],
		);

		assert.deepEqual(
			Array.from(
				getAllowedContentDiscrepancies(
					normalizeFieldSchema(mapNodeSchema),
					mapNodeStoredSchema,
				),
			),
			[],
		);

		assert.deepEqual(
			Array.from(
				getAllowedContentDiscrepancies(
					normalizeFieldSchema(mapNodeSchema),
					objectNodeStoredSchema,
				),
			),
			[
				{
					identifier: testTreeNodeIdentifierNormalized,
					mismatch: "nodeKind",
					view: "map",
					stored: "object",
				},
			],
		);

		/**
		 * Below is an inconsistency between 'isRepoSuperset' and 'allowsRepoSuperset'. The 'isRepoSuperset' will
		 * halt further validation if an inconsistency in `nodeKind` is found. However, the current logic of
		 * 'allowsRepoSuperset' permits relaxing an object node to a map node, which allows for a union of all types
		 * permitted on the object node's fields. It is unclear if this behavior is desired, as
		 * 'getAllowedContentDiscrepancies' currently does not support it.
		 *
		 * TODO: If we decide to support this behavior, we will need better e2e tests for this scenario. Additionally,
		 * we may need to adjust the encoding of map nodes and object nodes to ensure consistent encoding.
		 */
		assert.equal(
			isRepoSuperset(normalizeFieldSchema(objectNodeSchema), mapNodeStoredSchema),
			false,
		);
		assert.equal(
			allowsRepoSuperset(defaultSchemaPolicy, objectNodeStoredSchema, mapNodeStoredSchema),
			true,
		);
	});

	it("Field kind difference for each possible combination (including root)", () => {
		const mapNodeSchema1 = schemaFactory.optional(
			schemaFactory.mapAlpha(testTreeNodeIdentifier, schemaFactory.number),
		);

		const mapNodeSchema2 = schemaFactory.required(
			schemaFactory.mapAlpha(testTreeNodeIdentifier, [
				schemaFactory.number,
				schemaFactory.string,
			]),
		);

		const mapNodeSchema3 = schemaFactory.required(
			schemaFactory.mapAlpha(
				testTreeNodeIdentifier,
				schemaFactory.arrayAlpha("array", schemaFactory.string),
			),
		);

		const mapNodeSchema4 = schemaFactory.optional(
			schemaFactory.mapAlpha(testTreeNodeIdentifier, [
				schemaFactory.number,
				schemaFactory.string,
			]),
		);

		assert.deepEqual(
			Array.from(
				getAllowedContentDiscrepancies(
					normalizeFieldSchema(mapNodeSchema1),
					toStoredSchema(mapNodeSchema2),
				),
			),
			[
				{
					identifier: undefined,
					fieldKey: undefined,
					mismatch: "fieldKind",
					view: "Optional",
					stored: "Value",
				},
				{
					identifier: testTreeNodeIdentifierNormalized,
					fieldKey: undefined,
					mismatch: "allowedTypes",
					view: [],
					stored: [schemaFactory.string.identifier],
				},
				{
					identifier: schemaFactory.string.identifier,
					mismatch: "nodeKind",
					view: undefined,
					stored: "leaf",
				},
			],
		);

		assert.deepEqual(
			Array.from(
				getAllowedContentDiscrepancies(
					normalizeFieldSchema(mapNodeSchema2),
					toStoredSchema(mapNodeSchema3),
				),
			),
			[
				{
					identifier: schemaFactory.number.identifier,
					mismatch: "nodeKind",
					view: "leaf",
					stored: undefined,
				},
				{
					identifier: testTreeNodeIdentifierNormalized,
					fieldKey: undefined,
					mismatch: "allowedTypes",
					view: [
						{ metadata: {}, type: schemaFactory.number },
						{ metadata: {}, type: schemaFactory.string },
					],
					stored: ["schema discrepancies.array"],
				},
				{
					identifier: "schema discrepancies.array",
					mismatch: "nodeKind",
					view: undefined,
					stored: "object",
				},
			],
		);

		assert.equal(
			isRepoSuperset(normalizeFieldSchema(mapNodeSchema4), toStoredSchema(mapNodeSchema1)),
			true,
		);
	});

	it("Differing schema identifiers", () => {
		/**
		 * If schema identifiers differ, treat it as missing in the other document.
		 * Exhaustive validation is not applied in this case.
		 */

		const mapNodeSchema = schemaFactory.mapAlpha(testTreeNodeIdentifier, [
			schemaFactory.number,
		]);

		const objectNodeSchema1 = schemaFactory.objectAlpha(testTreeNodeIdentifier, {
			x: schemaFactory.required(schemaFactory.number),
		});

		const objectNodeSchema2 = schemaFactory.optional(
			schemaFactory.objectAlpha("tree2", {
				x: schemaFactory.optional(schemaFactory.string),
				y: schemaFactory.optional(schemaFactory.string),
			}),
		);
		const objectNodeStoredSchema2 = toStoredSchema(objectNodeSchema2);

		assert.deepEqual(
			Array.from(
				getAllowedContentDiscrepancies(
					schemaFactory.optional(objectNodeSchema1),
					objectNodeStoredSchema2,
				),
			),
			[
				{
					fieldKey: undefined,
					identifier: undefined,
					mismatch: "allowedTypes",
					stored: ["schema discrepancies.tree2"],
					view: [
						{
							metadata: {},
							type: objectNodeSchema1,
						},
					],
				},
				{
					identifier: schemaFactory.number.identifier,
					mismatch: "nodeKind",
					view: "leaf",
					stored: undefined,
				},
				{
					identifier: testTreeNodeIdentifierNormalized,
					mismatch: "nodeKind",
					view: "object",
					stored: undefined,
				},
				{
					identifier: schemaFactory.string.identifier,
					mismatch: "nodeKind",
					view: undefined,
					stored: "leaf",
				},
				{
					identifier: "schema discrepancies.tree2",
					mismatch: "nodeKind",
					view: undefined,
					stored: "object",
				},
			],
		);

		assert.deepEqual(
			Array.from(
				getAllowedContentDiscrepancies(
					schemaFactory.optional(mapNodeSchema),
					objectNodeStoredSchema2,
				),
			),
			[
				{
					fieldKey: undefined,
					identifier: undefined,
					mismatch: "allowedTypes",
					stored: ["schema discrepancies.tree2"],
					view: [
						{
							metadata: {},
							type: mapNodeSchema,
						},
					],
				},
				{
					identifier: schemaFactory.number.identifier,
					mismatch: "nodeKind",
					view: "leaf",
					stored: undefined,
				},
				{
					identifier: testTreeNodeIdentifierNormalized,
					mismatch: "nodeKind",
					view: "map",
					stored: undefined,
				},
				{
					identifier: schemaFactory.string.identifier,
					mismatch: "nodeKind",
					view: undefined,
					stored: "leaf",
				},
				{
					identifier: "schema discrepancies.tree2",
					mismatch: "nodeKind",
					view: undefined,
					stored: "object",
				},
			],
		);
	});

	it("Differing fields on object node schema", () => {
		// Both utilize ObjectNodeSchema but with differing fieldSchemas
		const objectNodeSchema1 = schemaFactory.objectAlpha(testTreeNodeIdentifier, {
			x: schemaFactory.required(schemaFactory.number),
		});
		const objectNodeRoot1 = schemaFactory.optional(objectNodeSchema1);

		const objectNodeSchema2 = schemaFactory.objectAlpha(testTreeNodeIdentifier, {
			x: schemaFactory.optional(schemaFactory.string),
			y: schemaFactory.optional(schemaFactory.string),
		});
		const objectNodeRoot2 = schemaFactory.optional(objectNodeSchema2);
		const objectNodeStoredSchema2 = toStoredSchema(objectNodeRoot2);

		assert.deepEqual(
			Array.from(getAllowedContentDiscrepancies(objectNodeRoot1, objectNodeStoredSchema2)),
			[
				{
					identifier: schemaFactory.number.identifier,
					mismatch: "nodeKind",
					view: "leaf",
					stored: undefined,
				},
				{
					identifier: testTreeNodeIdentifierNormalized,
					mismatch: "fields",
					differences: [
						{
							fieldKey: "x",
							identifier: testTreeNodeIdentifierNormalized,
							mismatch: "allowedTypes",
							view: [{ metadata: {}, type: schemaFactory.number }],
							stored: [schemaFactory.string.identifier],
						},
						{
							fieldKey: "x",
							identifier: testTreeNodeIdentifierNormalized,
							mismatch: "fieldKind",
							view: "Value",
							stored: "Optional",
						},
						{
							fieldKey: "y",
							identifier: testTreeNodeIdentifierNormalized,
							mismatch: "fieldKind",
							view: "Forbidden",
							stored: "Optional",
						},
					],
				},
				{
					identifier: schemaFactory.string.identifier,
					mismatch: "nodeKind",
					view: undefined,
					stored: "leaf",
				},
			],
		);
	});

	const createLeafNodeSchema = (
		leafValue: ValueSchema,
		treeName: string,
		root: TreeFieldStoredSchema,
	): TreeStoredSchema => ({
		rootFieldSchema: root,
		nodeSchema: new Map([
			[brand<TreeNodeSchemaIdentifier>(treeName), new LeafNodeStoredSchema(leafValue)],
		]),
	});

	it("Differing value types on leaf node schema", () => {
		const leafNodeSchema1 = schemaFactory.optional(
			new LeafNodeSchema(testTreeNodeIdentifier, ValueSchema.Number),
		);

		const root = fieldSchema(FieldKinds.optional, [testTreeNodeIdentifier]);

		const leafNodeSchema2 = createLeafNodeSchema(
			ValueSchema.Boolean,
			testTreeNodeIdentifier,
			root,
		);
		const leafNodeSchema3 = createLeafNodeSchema(
			ValueSchema.Number,
			testTreeNodeIdentifier,
			root,
		);

		assert.deepEqual(
			Array.from(getAllowedContentDiscrepancies(leafNodeSchema1, leafNodeSchema2)),
			[
				{
					identifier: testTreeNodeIdentifier,
					mismatch: "valueSchema",
					view: ValueSchema.Number,
					stored: ValueSchema.Boolean,
				},
			],
		);

		assert.deepEqual(
			Array.from(getAllowedContentDiscrepancies(leafNodeSchema1, leafNodeSchema3)),
			[],
		);
	});

	const createObjectNodeSchema = (
		fields: [string, TreeFieldStoredSchema][],
		treeName: string,
		root: TreeFieldStoredSchema,
	): TreeStoredSchema => {
		const objectNodeSchema = new ObjectNodeStoredSchema(
			new Map(fields.map(([key, schema]) => [brand(key), schema])),
		);
		return {
			rootFieldSchema: root,
			nodeSchema: new Map([[brand<TreeNodeSchemaIdentifier>(treeName), objectNodeSchema]]),
		};
	};

	describe("Special types of tree schemas", () => {
		const objectNodeSchema = schemaFactory.objectAlpha(testTreeNodeIdentifier, {
			x: schemaFactory.optional(schemaFactory.number),
		});

		it("emptyTree", () => {
			const emptyTree = schemaFactory.objectAlpha(testTreeNodeIdentifier, {});

			const emptyTreeStored = createObjectNodeSchema(
				[],
				testTreeNodeIdentifierNormalized,
				storedEmptyFieldSchema,
			);
			const emptyLocalFieldTreeStored = createObjectNodeSchema(
				[["x", storedEmptyFieldSchema]],
				testTreeNodeIdentifierNormalized,
				storedEmptyFieldSchema,
			);

			assert.equal(
				allowsRepoSuperset(defaultSchemaPolicy, emptyTreeStored, emptyLocalFieldTreeStored),
				true,
			);
			assert.equal(
				allowsRepoSuperset(defaultSchemaPolicy, emptyLocalFieldTreeStored, emptyTreeStored),
				true,
			);

			assert.deepEqual(
				Array.from(
					getAllowedContentDiscrepancies(
						normalizeFieldSchema(emptyTree),
						emptyLocalFieldTreeStored,
					),
				),
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
				Array.from(
					getAllowedContentDiscrepancies(
						normalizeFieldSchema(objectNodeSchema),
						emptyTreeStored,
					),
				),
				[
					{
						fieldKey: undefined,
						identifier: undefined,
						mismatch: "allowedTypes",
						stored: [],
						view: [
							{
								metadata: {},
								type: objectNodeSchema,
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
						identifier: schemaFactory.number.identifier,
						mismatch: "nodeKind",
						view: "leaf",
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
				Array.from(
					getAllowedContentDiscrepancies(
						normalizeFieldSchema(objectNodeSchema),
						emptyLocalFieldTreeStored,
					),
				),
				[
					{
						fieldKey: undefined,
						identifier: undefined,
						mismatch: "allowedTypes",
						stored: [],
						view: [
							{
								metadata: {},
								type: objectNodeSchema,
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
						identifier: schemaFactory.number.identifier,
						mismatch: "nodeKind",
						view: "leaf",
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
								view: [{ metadata: {}, type: schemaFactory.number }],
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

	describe("isRepoSuperset", () => {
		const mapNodeSchema1 = schemaFactory.required(
			schemaFactory.mapAlpha(testTreeNodeIdentifier, schemaFactory.number),
		);

		it("Relaxing a field kind to more general field kind", () => {
			const mapNodeSchema2 = schemaFactory.optional(
				schemaFactory.mapAlpha(testTreeNodeIdentifier, schemaFactory.number),
			);

			const mapNodeSchema3 = schemaFactory.optional(
				schemaFactory.mapAlpha(testTreeNodeIdentifier, schemaFactory.number),
			);

			assert.equal(isRepoSuperset(mapNodeSchema2, toStoredSchema(mapNodeSchema1)), true);
			assert.equal(isRepoSuperset(mapNodeSchema3, toStoredSchema(mapNodeSchema2)), true);
		});

		it("Detects new node kinds as a superset", () => {
			const emptySchema = schemaFactory.optional([]);

			const optionalNumberSchema = schemaFactory.optional(
				schemaFactory.mapAlpha(testTreeNodeIdentifier, schemaFactory.number),
			);

			assert.equal(isRepoSuperset(optionalNumberSchema, toStoredSchema(emptySchema)), true);
		});

		it("Detects changed node kinds as not a superset", () => {
			// Name used for the node which has a changed type
			const schemaName = brand<TreeNodeSchemaIdentifier>("test");

			const schemaA = schemaFactory.optional(
				schemaFactory.mapAlpha(schemaName, schemaFactory.number),
			);

			const schemaB = schemaFactory.optional(schemaFactory.objectAlpha(schemaName, {}));

			assert.equal(isRepoSuperset(schemaA, toStoredSchema(schemaB)), false);
			assert.equal(isRepoSuperset(schemaB, toStoredSchema(schemaA)), false);
		});

		it("Adding to the set of allowed types for a field", () => {
			const mapNodeSchema2 = schemaFactory.mapAlpha(testTreeNodeIdentifier, []);

			const mapNodeSchema3 = schemaFactory.mapAlpha(testTreeNodeIdentifier, [
				schemaFactory.number,
				schemaFactory.string,
			]);

			const mapNodeSchema4 = schemaFactory.mapAlpha(testTreeNodeIdentifier, [
				schemaFactory.number,
			]);

			assert.equal(
				isRepoSuperset(normalizeFieldSchema(mapNodeSchema4), toStoredSchema(mapNodeSchema2)),
				true,
			);
			assert.equal(
				isRepoSuperset(normalizeFieldSchema(mapNodeSchema3), toStoredSchema(mapNodeSchema4)),
				true,
			);
		});

		it("Adding an optional field to an object node", () => {
			const objectNodeSchema1 = schemaFactory.objectAlpha(testTreeNodeIdentifier, {
				x: schemaFactory.optional(schemaFactory.number),
			});

			const objectNodeSchema2 = schemaFactory.objectAlpha(testTreeNodeIdentifier, {
				x: schemaFactory.optional(schemaFactory.number),
				y: schemaFactory.optional(schemaFactory.string),
			});

			assert.equal(
				isRepoSuperset(
					normalizeFieldSchema(objectNodeSchema2),
					toStoredSchema(objectNodeSchema1),
				),
				true,
			);
		});

		it("No superset for node kind incompatibility", () => {
			const objectNodeSchema = schemaFactory.objectAlpha(testTreeNodeIdentifier, {
				x: schemaFactory.optional(schemaFactory.number),
			});

			const mapNodeSchema = schemaFactory.mapAlpha(
				testTreeNodeIdentifier,
				schemaFactory.number,
			);

			assert.equal(
				isRepoSuperset(normalizeFieldSchema(objectNodeSchema), toStoredSchema(mapNodeSchema)),
				false,
			);
		});

		// TODO: This test is skipped because it is not clear how to define leaf node schema with custom identifiers using the current API.
		// The test is left here for reference, but it should be revisited.
		it.skip("Leaf schema incompatibilities", () => {
			const leafNodeSchema1 = schemaFactory.optional(schemaFactory.number);
			const leafNodeSchema2 = schemaFactory.optional(schemaFactory.boolean);

			assert.equal(isRepoSuperset(leafNodeSchema1, toStoredSchema(leafNodeSchema2)), false);
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
				it(`${getFieldKindName(superset)} ${expected ? "⊇" : "⊉"} ${original.identifier}`, () => {
					const schemaA = createFieldSchema(superset, schemaFactory.number);

					const schemaB: TreeStoredSchema = {
						rootFieldSchema: fieldSchema(original, [numberName]),
						nodeSchema: new Map([[numberName, new LeafNodeStoredSchema(ValueSchema.Number)]]),
					};

					assert.equal(isRepoSuperset(schemaA, schemaB), expected);
				});
			}
		});
	});
});

function getFieldKindName(fieldKind: FieldKind): string {
	switch (fieldKind) {
		case FieldKind.Identifier:
			return "Identifier";
		case FieldKind.Optional:
			return "Optional";
		case FieldKind.Required:
			return "Required";
		default:
			return "Unknown";
	}
}
