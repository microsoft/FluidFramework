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
	type TreeFieldStoredSchema,
	type TreeNodeSchemaIdentifier,
	type TreeStoredSchema,
} from "../../../core/index.js";
import {
	defaultSchemaPolicy,
	FieldKinds,
	getAllowedContentDiscrepancies,
	allowsRepoSuperset,
	isRepoSuperset as isRepoSupersetOriginal,
	type FlexFieldKind,
} from "../../../feature-libraries/index.js";
import { brand } from "../../../util/index.js";
import { fieldSchema } from "./comparison.spec.js";

// Runs both superset-checking codepaths and verifies they produce consistent results.
// This function can go away once the older codepath is removed, see comment on the top of `discrepancies.ts` for more information.
function isRepoSuperset(superset: TreeStoredSchema, original: TreeStoredSchema): boolean {
	const allowsSupersetResult = allowsRepoSuperset(defaultSchemaPolicy, original, superset);
	const isRepoSupersetResult = isRepoSupersetOriginal(superset, original);
	assert.equal(
		allowsSupersetResult,
		isRepoSupersetResult,
		`Inconsistent results for allowsRepoSuperset (${allowsSupersetResult}) and isRepoSuperset (${isRepoSupersetResult})`,
	);
	return isRepoSupersetResult;
}

/**
 * Validates the consistency between `isRepoSuperset` and `allowsRepoSuperset` functions.
 *
 * @param view - The view schema to compare.
 * @param stored - The stored schema to compare.
 */
function validateSuperset(view: TreeStoredSchema, stored: TreeStoredSchema) {
	assert.equal(isRepoSuperset(view, stored), true);
}

function validateStrictSuperset(view: TreeStoredSchema, stored: TreeStoredSchema) {
	validateSuperset(view, stored);
	// assert the superset relationship does not keep in reversed direction
	assert.equal(isRepoSuperset(stored, view), false);
}

// Arbitrary schema names used in tests
const stringName = brand<TreeNodeSchemaIdentifier>("string");
const numberName = brand<TreeNodeSchemaIdentifier>("number");
const testTreeNodeIdentifier = brand<TreeNodeSchemaIdentifier>("tree");

describe("Schema Discrepancies", () => {
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

	const createMapNodeSchema = (
		field: TreeFieldStoredSchema,
		treeName: string,
		root: TreeFieldStoredSchema,
	): TreeStoredSchema => ({
		rootFieldSchema: root,
		nodeSchema: new Map([
			[brand<TreeNodeSchemaIdentifier>(treeName), new MapNodeStoredSchema(field)],
		]),
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

	it("Node kind difference for each possible combination", () => {
		const root = fieldSchema(FieldKinds.optional, [testTreeNodeIdentifier, numberName]);

		const objectNodeSchema = createObjectNodeSchema(
			[["x", fieldSchema(FieldKinds.required, [numberName])]],
			testTreeNodeIdentifier,
			root,
		);

		const mapNodeSchema = createMapNodeSchema(
			fieldSchema(FieldKinds.required, [numberName]),
			testTreeNodeIdentifier,
			root,
		);

		const leafNodeSchema = createLeafNodeSchema(
			ValueSchema.Number,
			testTreeNodeIdentifier,
			root,
		);

		assert.deepEqual(
			Array.from(getAllowedContentDiscrepancies(objectNodeSchema, mapNodeSchema)),
			[
				{
					identifier: testTreeNodeIdentifier,
					mismatch: "nodeKind",
					view: "object",
					stored: "map",
				},
			],
		);

		assert.deepEqual(
			Array.from(getAllowedContentDiscrepancies(mapNodeSchema, leafNodeSchema)),
			[
				{
					identifier: testTreeNodeIdentifier,
					mismatch: "nodeKind",
					view: "map",
					stored: "leaf",
				},
			],
		);

		assert.deepEqual(
			Array.from(getAllowedContentDiscrepancies(leafNodeSchema, objectNodeSchema)),
			[
				{
					identifier: testTreeNodeIdentifier,
					mismatch: "nodeKind",
					view: "leaf",
					stored: "object",
				},
			],
		);

		assert.deepEqual(
			Array.from(getAllowedContentDiscrepancies(mapNodeSchema, mapNodeSchema)),
			[],
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
		assert.equal(isRepoSupersetOriginal(objectNodeSchema, mapNodeSchema), false);
		assert.equal(
			allowsRepoSuperset(defaultSchemaPolicy, objectNodeSchema, mapNodeSchema),
			true,
		);
	});

	it("Field kind difference for each possible combination (including root)", () => {
		const root1 = fieldSchema(FieldKinds.optional, [
			testTreeNodeIdentifier,
			numberName,
			brand<TreeNodeSchemaIdentifier>("array"),
		]);
		const root2 = fieldSchema(FieldKinds.required, [
			testTreeNodeIdentifier,
			numberName,
			brand<TreeNodeSchemaIdentifier>("array"),
		]);

		const mapNodeSchema1 = createMapNodeSchema(
			fieldSchema(FieldKinds.required, [numberName]),
			testTreeNodeIdentifier,
			root1,
		);

		const mapNodeSchema2 = createMapNodeSchema(
			fieldSchema(FieldKinds.optional, [numberName, stringName]),
			testTreeNodeIdentifier,
			root2,
		);

		const mapNodeSchema3 = createMapNodeSchema(
			fieldSchema(FieldKinds.optional, [brand<TreeNodeSchemaIdentifier>("array"), stringName]),
			testTreeNodeIdentifier,
			root2,
		);

		const mapNodeSchema4 = createMapNodeSchema(
			fieldSchema(FieldKinds.optional, [numberName, stringName]),
			testTreeNodeIdentifier,
			root1,
		);

		assert.deepEqual(
			Array.from(getAllowedContentDiscrepancies(mapNodeSchema1, mapNodeSchema2)),
			[
				{
					identifier: undefined,
					mismatch: "fieldKind",
					view: "Optional",
					stored: "Value",
				},
				{
					identifier: testTreeNodeIdentifier,
					mismatch: "allowedTypes",
					view: [],
					stored: ["string"],
				},
				{
					identifier: testTreeNodeIdentifier,
					mismatch: "fieldKind",
					view: "Value",
					stored: "Optional",
				},
			],
		);

		assert.deepEqual(
			Array.from(getAllowedContentDiscrepancies(mapNodeSchema2, mapNodeSchema3)),
			[
				{
					identifier: testTreeNodeIdentifier,
					mismatch: "allowedTypes",
					view: ["number"],
					stored: ["array"],
				},
			],
		);

		validateStrictSuperset(mapNodeSchema4, mapNodeSchema1);
	});

	it("Differing schema identifiers", () => {
		/**
		 * If schema identifiers differ, treat it as missing in the other document.
		 * Exhaustive validation is not applied in this case.
		 */
		const root = fieldSchema(FieldKinds.optional, [
			numberName,
			stringName,
			testTreeNodeIdentifier,
		]);

		const mapNodeSchema = createMapNodeSchema(
			fieldSchema(FieldKinds.required, [numberName]),
			testTreeNodeIdentifier,
			root,
		);

		const objectNodeSchema1 = createObjectNodeSchema(
			[["x", fieldSchema(FieldKinds.required, [numberName])]],
			testTreeNodeIdentifier,
			root,
		);

		const objectNodeSchema2 = createObjectNodeSchema(
			[
				["x", fieldSchema(FieldKinds.optional, [stringName])],
				["y", fieldSchema(FieldKinds.optional, [stringName])],
			],
			"tree2",
			root,
		);

		assert.deepEqual(
			Array.from(getAllowedContentDiscrepancies(objectNodeSchema1, objectNodeSchema2)),
			[
				{
					identifier: testTreeNodeIdentifier,
					mismatch: "nodeKind",
					view: "object",
					stored: undefined,
				},
				{
					identifier: "tree2",
					mismatch: "nodeKind",
					view: undefined,
					stored: "object",
				},
			],
		);

		assert.deepEqual(
			Array.from(getAllowedContentDiscrepancies(mapNodeSchema, objectNodeSchema2)),
			[
				{
					identifier: testTreeNodeIdentifier,
					mismatch: "nodeKind",
					view: "map",
					stored: undefined,
				},
				{
					identifier: "tree2",
					mismatch: "nodeKind",
					view: undefined,
					stored: "object",
				},
			],
		);
	});

	it("Differing fields on object node schema", () => {
		const root = fieldSchema(FieldKinds.optional, [
			numberName,
			stringName,
			testTreeNodeIdentifier,
		]);
		// Both utilize ObjectNodeSchema but with differing fieldSchemas
		const objectNodeSchema1 = createObjectNodeSchema(
			[["x", fieldSchema(FieldKinds.required, [numberName])]],
			testTreeNodeIdentifier,
			root,
		);

		const objectNodeSchema2 = createObjectNodeSchema(
			[
				["x", fieldSchema(FieldKinds.optional, [stringName])],
				["y", fieldSchema(FieldKinds.optional, [stringName])],
			],
			testTreeNodeIdentifier,
			root,
		);

		assert.deepEqual(
			Array.from(getAllowedContentDiscrepancies(objectNodeSchema1, objectNodeSchema2)),
			[
				{
					identifier: testTreeNodeIdentifier,
					mismatch: "fields",
					differences: [
						{
							identifier: "x",
							mismatch: "allowedTypes",
							view: ["number"],
							stored: ["string"],
						},
						{
							identifier: "x",
							mismatch: "fieldKind",
							view: "Value",
							stored: "Optional",
						},
						{
							identifier: "y",
							mismatch: "fieldKind",
							view: "Forbidden",
							stored: "Optional",
						},
					],
				},
			],
		);
	});

	it("Differing value types on leaf node schema", () => {
		const root = fieldSchema(FieldKinds.optional, [testTreeNodeIdentifier]);

		const leafNodeSchema1 = createLeafNodeSchema(
			ValueSchema.Number,
			testTreeNodeIdentifier,
			root,
		);
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

	describe("Special types of tree schemas", () => {
		const root = storedEmptyFieldSchema;
		const objectNodeSchema = createObjectNodeSchema(
			[["x", fieldSchema(FieldKinds.required, [numberName])]],
			testTreeNodeIdentifier,
			root,
		);
		const mapNodeSchema = createMapNodeSchema(
			fieldSchema(FieldKinds.required, [numberName]),
			testTreeNodeIdentifier,
			root,
		);

		const neverField = fieldSchema(FieldKinds.required, []);
		const neverTree = createMapNodeSchema(neverField, testTreeNodeIdentifier, root);
		const neverTree2 = createObjectNodeSchema(
			[["x", neverField]],
			testTreeNodeIdentifier,
			root,
		);

		it("neverTree", () => {
			assert.deepEqual(Array.from(getAllowedContentDiscrepancies(neverTree, neverTree2)), [
				{
					identifier: testTreeNodeIdentifier,
					mismatch: "nodeKind",
					view: "map",
					stored: "object",
				},
			]);

			assert.deepEqual(Array.from(getAllowedContentDiscrepancies(neverTree, mapNodeSchema)), [
				{
					identifier: testTreeNodeIdentifier,
					mismatch: "allowedTypes",
					view: [],
					stored: ["number"],
				},
			]);

			assert.deepEqual(
				Array.from(getAllowedContentDiscrepancies(neverTree2, objectNodeSchema)),
				[
					{
						identifier: testTreeNodeIdentifier,
						mismatch: "fields",
						differences: [
							{
								identifier: "x",
								mismatch: "allowedTypes",
								view: [],
								stored: ["number"],
							},
						],
					},
				],
			);
		});

		it("emptyTree", () => {
			const emptyTree = createObjectNodeSchema([], testTreeNodeIdentifier, root);
			const emptyLocalFieldTree = createObjectNodeSchema(
				[["x", storedEmptyFieldSchema]],
				testTreeNodeIdentifier,
				root,
			);

			assert.equal(
				allowsRepoSuperset(defaultSchemaPolicy, emptyTree, emptyLocalFieldTree),
				true,
			);
			assert.equal(
				allowsRepoSuperset(defaultSchemaPolicy, emptyLocalFieldTree, emptyTree),
				true,
			);

			assert.deepEqual(
				Array.from(getAllowedContentDiscrepancies(emptyTree, emptyLocalFieldTree)),
				[],
			);

			assert.deepEqual(
				Array.from(getAllowedContentDiscrepancies(emptyTree, objectNodeSchema)),
				[
					{
						identifier: testTreeNodeIdentifier,
						mismatch: "fields",
						differences: [
							{
								identifier: "x",
								mismatch: "fieldKind",
								view: "Forbidden",
								stored: "Value",
							},
						],
					},
				],
			);

			assert.deepEqual(
				Array.from(getAllowedContentDiscrepancies(emptyLocalFieldTree, objectNodeSchema)),
				[
					{
						identifier: testTreeNodeIdentifier,
						mismatch: "fields",
						differences: [
							{
								identifier: "x",
								mismatch: "allowedTypes",
								view: [],
								stored: ["number"],
							},
							{
								identifier: "x",
								mismatch: "fieldKind",
								view: "Forbidden",
								stored: "Value",
							},
						],
					},
				],
			);
		});
	});

	describe("isRepoSuperset", () => {
		const root1 = fieldSchema(FieldKinds.required, [
			numberName,
			testTreeNodeIdentifier,
			stringName,
		]);
		const root2 = fieldSchema(FieldKinds.optional, [
			numberName,
			testTreeNodeIdentifier,
			stringName,
		]);

		const mapNodeSchema1 = createMapNodeSchema(
			fieldSchema(FieldKinds.required, [numberName]),
			testTreeNodeIdentifier,
			root1,
		);

		it("Relaxing a field kind to more general field kind", () => {
			const mapNodeSchema2 = createMapNodeSchema(
				fieldSchema(FieldKinds.required, [numberName]),
				testTreeNodeIdentifier,
				root2,
			);

			const mapNodeSchema3 = createMapNodeSchema(
				fieldSchema(FieldKinds.optional, [numberName]),
				testTreeNodeIdentifier,
				root2,
			);

			validateStrictSuperset(mapNodeSchema2, mapNodeSchema1);
			validateStrictSuperset(mapNodeSchema3, mapNodeSchema2);
		});

		it("Detects new node kinds as a superset", () => {
			const emptySchema: TreeStoredSchema = {
				rootFieldSchema: fieldSchema(FieldKinds.forbidden, []),
				nodeSchema: new Map(),
			};

			const numberSchema = new LeafNodeStoredSchema(ValueSchema.Number);
			const optionalNumberSchema: TreeStoredSchema = {
				rootFieldSchema: fieldSchema(FieldKinds.optional, [numberName]),
				nodeSchema: new Map([[numberName, numberSchema]]),
			};

			validateStrictSuperset(optionalNumberSchema, emptySchema);
		});

		it("Detects changed node kinds as not a superset", () => {
			// Name used for the node which has a changed type
			const schemaName = brand<TreeNodeSchemaIdentifier>("test");

			const numberSchema = new LeafNodeStoredSchema(ValueSchema.Number);
			const schemaA: TreeStoredSchema = {
				rootFieldSchema: fieldSchema(FieldKinds.optional, [schemaName]),
				nodeSchema: new Map([[schemaName, numberSchema]]),
			};

			const objectSchema = new ObjectNodeStoredSchema(new Map());
			const schemaB: TreeStoredSchema = {
				rootFieldSchema: fieldSchema(FieldKinds.optional, [schemaName]),
				nodeSchema: new Map([[schemaName, objectSchema]]),
			};

			assert.equal(isRepoSuperset(schemaA, schemaB), false);
			assert.equal(isRepoSuperset(schemaB, schemaA), false);
		});

		it("Adding to the set of allowed types for a field", () => {
			const mapNodeSchema2 = createMapNodeSchema(
				fieldSchema(FieldKinds.optional, []),
				testTreeNodeIdentifier,
				root1,
			);

			const mapNodeSchema3 = createMapNodeSchema(
				fieldSchema(FieldKinds.optional, [numberName, stringName]),
				testTreeNodeIdentifier,
				root1,
			);

			const mapNodeSchema4 = createMapNodeSchema(
				fieldSchema(FieldKinds.optional, [numberName]),
				testTreeNodeIdentifier,
				root1,
			);

			validateStrictSuperset(mapNodeSchema4, mapNodeSchema2);
			validateStrictSuperset(mapNodeSchema3, mapNodeSchema4);
		});

		it("Adding an optional field to an object node", () => {
			const objectNodeSchema1 = createObjectNodeSchema(
				[["x", fieldSchema(FieldKinds.optional, [numberName])]],
				testTreeNodeIdentifier,
				root1,
			);

			const objectNodeSchema2 = createObjectNodeSchema(
				[
					["x", fieldSchema(FieldKinds.optional, [numberName])],
					["y", fieldSchema(FieldKinds.optional, [stringName])],
				],
				testTreeNodeIdentifier,
				root1,
			);

			validateStrictSuperset(objectNodeSchema2, objectNodeSchema1);
		});

		it("No superset for node kind incompatibility", () => {
			const objectNodeSchema = createObjectNodeSchema(
				[["x", fieldSchema(FieldKinds.optional, [numberName])]],
				testTreeNodeIdentifier,
				root2,
			);

			const mapNodeSchema = createMapNodeSchema(
				fieldSchema(FieldKinds.optional, [numberName]),
				testTreeNodeIdentifier,
				root2,
			);

			assert.equal(isRepoSuperset(objectNodeSchema, mapNodeSchema), false);
		});

		it("Leaf schema incompatibilities", () => {
			const leafNodeSchema1 = createLeafNodeSchema(
				ValueSchema.Number,
				testTreeNodeIdentifier,
				root2,
			);
			const leafNodeSchema2 = createLeafNodeSchema(
				ValueSchema.Boolean,
				testTreeNodeIdentifier,
				root2,
			);

			assert.equal(isRepoSuperset(leafNodeSchema1, leafNodeSchema2), false);
		});

		describe("on field kinds for root fields of identical content", () => {
			const allFieldKinds = Object.values(FieldKinds);
			const testCases: {
				superset: FlexFieldKind;
				original: FlexFieldKind;
				expected: boolean;
			}[] = [
				{ superset: FieldKinds.forbidden, original: FieldKinds.identifier, expected: false },
				{ superset: FieldKinds.forbidden, original: FieldKinds.optional, expected: false },
				{ superset: FieldKinds.forbidden, original: FieldKinds.required, expected: false },
				{ superset: FieldKinds.forbidden, original: FieldKinds.sequence, expected: false },
				{ superset: FieldKinds.identifier, original: FieldKinds.forbidden, expected: false },
				{ superset: FieldKinds.identifier, original: FieldKinds.optional, expected: false },
				{ superset: FieldKinds.identifier, original: FieldKinds.required, expected: false },
				{ superset: FieldKinds.identifier, original: FieldKinds.sequence, expected: false },
				{ superset: FieldKinds.optional, original: FieldKinds.forbidden, expected: true },
				{ superset: FieldKinds.optional, original: FieldKinds.identifier, expected: true },
				{ superset: FieldKinds.optional, original: FieldKinds.required, expected: true },
				{ superset: FieldKinds.optional, original: FieldKinds.sequence, expected: false },
				{ superset: FieldKinds.required, original: FieldKinds.forbidden, expected: false },
				{ superset: FieldKinds.required, original: FieldKinds.identifier, expected: true },
				{ superset: FieldKinds.required, original: FieldKinds.optional, expected: false },
				{ superset: FieldKinds.required, original: FieldKinds.sequence, expected: false },
				// Note: despite the fact that all field types can be relaxed to a sequence field, note that
				// this is not possible using the public API for creating schemas, since the degrees of freedom in creating
				// sequence fields are restricted: `SchemaFactory`'s `array` builder adds a node which is transparent via
				// the simple-tree API, but nonetheless results in incompatibility.
				{ superset: FieldKinds.sequence, original: FieldKinds.forbidden, expected: true },
				{ superset: FieldKinds.sequence, original: FieldKinds.identifier, expected: true },
				{ superset: FieldKinds.sequence, original: FieldKinds.optional, expected: true },
				{ superset: FieldKinds.sequence, original: FieldKinds.required, expected: true },
				// All field kinds are a (non-proper) superset of themselves
				...Object.values(FieldKinds).map((kind) => ({
					superset: kind,
					original: kind,
					expected: true,
				})),
			];

			it("verify this test is exhaustive", () => {
				// Test case expectations below are generated manually. When new supported field kinds are added, this suite must be updated.
				// This likely also necessitates changes to the production code this describe block validates.
				assert.equal(allFieldKinds.length, 5);
				assert.equal(allFieldKinds.length ** 2, testCases.length);
			});

			for (const { superset, original, expected } of testCases) {
				it(`${superset.identifier} ${expected ? "⊇" : "⊉"} ${original.identifier}`, () => {
					const schemaA: TreeStoredSchema = {
						rootFieldSchema: fieldSchema(superset, [numberName]),
						nodeSchema: new Map([[numberName, new LeafNodeStoredSchema(ValueSchema.Number)]]),
					};

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
