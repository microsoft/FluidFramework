/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
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
	getAllowedContentIncompatibilities,
	allowsRepoSuperset,
	isRepoSuperset,
} from "../../../feature-libraries/index.js";
import { brand } from "../../../util/index.js";
import { fieldSchema } from "./comparison.spec.js";

/**
 * Validates the consistency between `isRepoSuperset` and `allowsRepoSuperset` functions.
 *
 * @param view - The view schema to compare.
 * @param stored - The stored schema to compare.
 */
function validateSuperset(view: TreeStoredSchema, stored: TreeStoredSchema) {
	assert.equal(isRepoSuperset(view, stored), true);
	assert.equal(allowsRepoSuperset(defaultSchemaPolicy, stored, view), true);
}

function validateStrictSuperset(view: TreeStoredSchema, stored: TreeStoredSchema) {
	validateSuperset(view, stored);
	// assert the superset relationship does not keep in reversed direction
	assert.equal(isRepoSuperset(stored, view), false);
	assert.equal(allowsRepoSuperset(defaultSchemaPolicy, view, stored), false);
}

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
		const root = fieldSchema(FieldKinds.optional);

		const objectNodeSchema = createObjectNodeSchema(
			[["x", fieldSchema(FieldKinds.required, [brand<TreeNodeSchemaIdentifier>("number")])]],
			"tree",
			root,
		);

		const mapNodeSchema = createMapNodeSchema(
			fieldSchema(FieldKinds.required, [brand<TreeNodeSchemaIdentifier>("number")]),
			"tree",
			root,
		);

		const leafNodeSchema = createLeafNodeSchema(ValueSchema.Number, "tree", root);

		assert.deepEqual(getAllowedContentIncompatibilities(objectNodeSchema, mapNodeSchema), [
			{
				identifier: "tree",
				mismatch: "nodeKind",
				view: "object",
				stored: "map",
			},
		]);

		assert.deepEqual(getAllowedContentIncompatibilities(mapNodeSchema, leafNodeSchema), [
			{
				identifier: "tree",
				mismatch: "nodeKind",
				view: "map",
				stored: "leaf",
			},
		]);

		assert.deepEqual(getAllowedContentIncompatibilities(leafNodeSchema, objectNodeSchema), [
			{
				identifier: "tree",
				mismatch: "nodeKind",
				view: "leaf",
				stored: "object",
			},
		]);

		assert.deepEqual(getAllowedContentIncompatibilities(mapNodeSchema, mapNodeSchema), []);

		/**
		 * Below is an inconsistency between 'isRepoSuperset' and 'allowsRepoSuperset'. The 'isRepoSuperset' will
		 * halt further validation if an inconsistency in `nodeKind` is found. However, the current logic of
		 * 'allowsRepoSuperset' permits relaxing an object node to a map node, which allows for a union of all types
		 * permitted on the object node's fields. It is unclear if this behavior is desired, as
		 * 'getAllowedContentIncompatibilities' currently does not support it.
		 *
		 * TODO: If we decide to support this behavior, we will need better e2e tests for this scenario. Additionally,
		 * we may need to adjust the encoding of map nodes and object nodes to ensure consistent encoding.
		 */
		assert.equal(isRepoSuperset(objectNodeSchema, mapNodeSchema), false);
		assert.equal(
			allowsRepoSuperset(defaultSchemaPolicy, objectNodeSchema, mapNodeSchema),
			true,
		);
	});

	it("Field kind difference for each possible combination (including root)", () => {
		const root1 = fieldSchema(FieldKinds.optional);
		const root2 = fieldSchema(FieldKinds.required);

		const mapNodeSchema1 = createMapNodeSchema(
			fieldSchema(FieldKinds.required, [brand<TreeNodeSchemaIdentifier>("number")]),
			"tree",
			root1,
		);

		const mapNodeSchema2 = createMapNodeSchema(
			fieldSchema(FieldKinds.optional, [
				brand<TreeNodeSchemaIdentifier>("number"),
				brand<TreeNodeSchemaIdentifier>("string"),
			]),
			"tree",
			root2,
		);

		const mapNodeSchema3 = createMapNodeSchema(
			fieldSchema(FieldKinds.optional, [
				brand<TreeNodeSchemaIdentifier>("array"),
				brand<TreeNodeSchemaIdentifier>("string"),
			]),
			"tree",
			root2,
		);

		const mapNodeSchema4 = createMapNodeSchema(
			fieldSchema(FieldKinds.optional, [
				brand<TreeNodeSchemaIdentifier>("number"),
				brand<TreeNodeSchemaIdentifier>("string"),
			]),
			"tree",
			root1,
		);

		assert.deepEqual(getAllowedContentIncompatibilities(mapNodeSchema1, mapNodeSchema2), [
			{
				identifier: undefined,
				mismatch: "fieldKind",
				view: "Optional",
				stored: "Value",
			},
			{
				identifier: "tree",
				mismatch: "allowedTypes",
				view: [],
				stored: ["string"],
			},
			{
				identifier: "tree",
				mismatch: "fieldKind",
				view: "Value",
				stored: "Optional",
			},
		]);

		assert.deepEqual(getAllowedContentIncompatibilities(mapNodeSchema2, mapNodeSchema3), [
			{
				identifier: "tree",
				mismatch: "allowedTypes",
				view: ["number"],
				stored: ["array"],
			},
		]);

		validateStrictSuperset(mapNodeSchema4, mapNodeSchema1);
	});

	it("Differing schema identifiers", () => {
		/**
		 * If schema identifiers differ, treat it as missing in the other document.
		 * Exhaustive validation is not applied in this case.
		 */
		const root = fieldSchema(FieldKinds.optional);

		const mapNodeSchema = createMapNodeSchema(
			fieldSchema(FieldKinds.required, [brand<TreeNodeSchemaIdentifier>("number")]),
			"tree",
			root,
		);

		const objectNodeSchema1 = createObjectNodeSchema(
			[["x", fieldSchema(FieldKinds.required, [brand<TreeNodeSchemaIdentifier>("number")])]],
			"tree",
			root,
		);

		const objectNodeSchema2 = createObjectNodeSchema(
			[
				["x", fieldSchema(FieldKinds.optional, [brand<TreeNodeSchemaIdentifier>("string")])],
				["y", fieldSchema(FieldKinds.optional, [brand<TreeNodeSchemaIdentifier>("string")])],
			],
			"tree2",
			root,
		);

		assert.deepEqual(
			getAllowedContentIncompatibilities(objectNodeSchema1, objectNodeSchema2),
			[
				{
					identifier: "tree",
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

		assert.deepEqual(getAllowedContentIncompatibilities(mapNodeSchema, objectNodeSchema2), [
			{
				identifier: "tree",
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
		]);
	});

	it("Differing fields on object node schema", () => {
		const root = fieldSchema(FieldKinds.optional);
		// Both utilize ObjectNodeSchema but with differing fieldSchemas
		const objectNodeSchema1 = createObjectNodeSchema(
			[["x", fieldSchema(FieldKinds.required, [brand<TreeNodeSchemaIdentifier>("number")])]],
			"tree",
			root,
		);

		const objectNodeSchema2 = createObjectNodeSchema(
			[
				["x", fieldSchema(FieldKinds.optional, [brand<TreeNodeSchemaIdentifier>("string")])],
				["y", fieldSchema(FieldKinds.optional, [brand<TreeNodeSchemaIdentifier>("string")])],
			],
			"tree",
			root,
		);

		assert.deepEqual(
			getAllowedContentIncompatibilities(objectNodeSchema1, objectNodeSchema2),
			[
				{
					identifier: "tree",
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
							view: undefined,
							stored: "Optional",
						},
					],
				},
			],
		);
	});

	it("Differing value types on leaf node schema", () => {
		const root = fieldSchema(FieldKinds.optional);

		const leafNodeSchema1 = createLeafNodeSchema(ValueSchema.Number, "tree", root);
		const leafNodeSchema2 = createLeafNodeSchema(ValueSchema.Boolean, "tree", root);
		const leafNodeSchema3 = createLeafNodeSchema(ValueSchema.Number, "tree", root);

		assert.deepEqual(getAllowedContentIncompatibilities(leafNodeSchema1, leafNodeSchema2), [
			{
				identifier: "tree",
				mismatch: "valueSchema",
				view: ValueSchema.Number,
				stored: ValueSchema.Boolean,
			},
		]);

		assert.deepEqual(getAllowedContentIncompatibilities(leafNodeSchema1, leafNodeSchema3), []);
	});

	describe("Special types of tree schemas", () => {
		const root = storedEmptyFieldSchema;
		const objectNodeSchema = createObjectNodeSchema(
			[["x", fieldSchema(FieldKinds.required, [brand<TreeNodeSchemaIdentifier>("number")])]],
			"tree",
			root,
		);
		const mapNodeSchema = createMapNodeSchema(
			fieldSchema(FieldKinds.required, [brand<TreeNodeSchemaIdentifier>("number")]),
			"tree",
			root,
		);

		const neverField = fieldSchema(FieldKinds.required, []);
		const neverTree = createMapNodeSchema(neverField, "tree", root);
		const neverTree2 = createObjectNodeSchema([["x", neverField]], "tree", root);

		it("neverTree", () => {
			assert.deepEqual(getAllowedContentIncompatibilities(neverTree, neverTree2), [
				{
					identifier: "tree",
					mismatch: "nodeKind",
					view: "map",
					stored: "object",
				},
			]);

			assert.deepEqual(getAllowedContentIncompatibilities(neverTree, mapNodeSchema), [
				{
					identifier: "tree",
					mismatch: "allowedTypes",
					view: [],
					stored: ["number"],
				},
			]);

			assert.deepEqual(getAllowedContentIncompatibilities(neverTree2, objectNodeSchema), [
				{
					identifier: "tree",
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
			]);
		});

		it("emptyTree", () => {
			const emptyTree = createObjectNodeSchema([], "tree", root);
			const emptyLocalFieldTree = createObjectNodeSchema(
				[["x", storedEmptyFieldSchema]],
				"tree",
				root,
			);

			assert.deepEqual(getAllowedContentIncompatibilities(emptyTree, emptyLocalFieldTree), [
				{
					identifier: "tree",
					mismatch: "fields",
					differences: [
						{
							identifier: "x",
							mismatch: "fieldKind",
							view: undefined,
							stored: "Forbidden",
						},
					],
				},
			]);

			assert.deepEqual(getAllowedContentIncompatibilities(emptyTree, objectNodeSchema), [
				{
					identifier: "tree",
					mismatch: "fields",
					differences: [
						{
							identifier: "x",
							mismatch: "fieldKind",
							view: undefined,
							stored: "Value",
						},
					],
				},
			]);

			assert.deepEqual(
				getAllowedContentIncompatibilities(emptyLocalFieldTree, objectNodeSchema),
				[
					{
						identifier: "tree",
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
		const root1 = fieldSchema(FieldKinds.required);
		const root2 = fieldSchema(FieldKinds.optional);

		const mapNodeSchema1 = createMapNodeSchema(
			fieldSchema(FieldKinds.required, [brand<TreeNodeSchemaIdentifier>("number")]),
			"tree",
			root1,
		);

		it("Relaxing a field kind to more general field kind", () => {
			const mapNodeSchema2 = createMapNodeSchema(
				fieldSchema(FieldKinds.required, [brand<TreeNodeSchemaIdentifier>("number")]),
				"tree",
				root2,
			);

			const mapNodeSchema3 = createMapNodeSchema(
				fieldSchema(FieldKinds.optional, [brand<TreeNodeSchemaIdentifier>("number")]),
				"tree",
				root2,
			);

			validateStrictSuperset(mapNodeSchema2, mapNodeSchema1);
			validateStrictSuperset(mapNodeSchema3, mapNodeSchema2);
		});

		it("Adding to the set of allowed types for a field", () => {
			const mapNodeSchema2 = createMapNodeSchema(
				fieldSchema(FieldKinds.optional, []),
				"tree",
				root1,
			);

			const mapNodeSchema3 = createMapNodeSchema(
				fieldSchema(FieldKinds.optional, [
					brand<TreeNodeSchemaIdentifier>("number"),
					brand<TreeNodeSchemaIdentifier>("string"),
				]),
				"tree",
				root1,
			);

			const mapNodeSchema4 = createMapNodeSchema(
				fieldSchema(FieldKinds.optional, [brand<TreeNodeSchemaIdentifier>("number")]),
				"tree",
				root1,
			);

			validateStrictSuperset(mapNodeSchema4, mapNodeSchema2);
			validateStrictSuperset(mapNodeSchema3, mapNodeSchema4);
		});

		it("Adding an optional field to an object node", () => {
			const objectNodeSchema1 = createObjectNodeSchema(
				[["x", fieldSchema(FieldKinds.optional, [brand<TreeNodeSchemaIdentifier>("number")])]],
				"tree",
				root1,
			);

			const objectNodeSchema2 = createObjectNodeSchema(
				[
					["x", fieldSchema(FieldKinds.optional, [brand<TreeNodeSchemaIdentifier>("number")])],
					["y", fieldSchema(FieldKinds.optional, [brand<TreeNodeSchemaIdentifier>("string")])],
				],
				"tree",
				root1,
			);

			validateStrictSuperset(objectNodeSchema2, objectNodeSchema1);
		});

		it("No superset for node kind incompatibility", () => {
			const objectNodeSchema = createObjectNodeSchema(
				[["x", fieldSchema(FieldKinds.optional, [brand<TreeNodeSchemaIdentifier>("number")])]],
				"tree",
				root2,
			);

			const mapNodeSchema = createMapNodeSchema(
				fieldSchema(FieldKinds.optional, [brand<TreeNodeSchemaIdentifier>("number")]),
				"tree",
				root2,
			);

			assert.equal(isRepoSuperset(objectNodeSchema, mapNodeSchema), false);
		});

		it("Leaf schema incompatibilities", () => {
			const leafNodeSchema1 = createLeafNodeSchema(ValueSchema.Number, "tree", root2);
			const leafNodeSchema2 = createLeafNodeSchema(ValueSchema.Boolean, "tree", root2);

			assert.equal(isRepoSuperset(leafNodeSchema1, leafNodeSchema2), false);
		});
	});
});
