/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	generateSchemaFromSimpleSchema,
	getSimpleSchema,
	SchemaFactory,
	toInitialSchema,
	type ImplicitFieldSchema,
	type ValidateRecursiveSchema,
	type SimpleObjectNodeSchema,
	isObjectNodeSchema,
	SchemaFactoryAlpha,
	SchemaUpgrade,
} from "../../../simple-tree/index.js";
import { exportSimpleSchema } from "../../../shared-tree/index.js";
import { testTreeSchema } from "../../cursorTestSuite.js";
import { HasUnknownOptionalFields, testSimpleTrees } from "../../testTrees.js";

describe("schemaFromSimple", () => {
	function roundtrip(root: ImplicitFieldSchema): void {
		const stored = toInitialSchema(root);
		const simpleFromStored = exportSimpleSchema(stored);
		// This can be lossy compared to root as metadata like property keys is lost.
		const roundTripped = generateSchemaFromSimpleSchema(simpleFromStored);
		// This should exactly match stored as it should have lost the exact same information.
		const stored2 = toInitialSchema(roundTripped.root);
		assert.deepEqual(stored2, stored);

		// This should not lose metadata like property keys as it doesn't go through the stored schema.
		const simpleFromView = getSimpleSchema(root);
		const roundTripped2 = generateSchemaFromSimpleSchema(simpleFromView);

		// Lossy extraction of stored schema should still be the same
		const stored3 = toInitialSchema(roundTripped2.root);
		assert.deepEqual(stored3, stored);

		// Simple schema should be the same after round trip from TreeSchema -> Simple -> TreeSchema -> Simple
		const simpleFromView2 = getSimpleSchema(roundTripped2.root);
		assert.deepEqual(simpleFromView, simpleFromView2);
	}

	describe("round trips", () => {
		it("empty", () => {
			roundtrip([]);
		});

		it("recursive", () => {
			const schema = new SchemaFactory("com.example");
			class A extends schema.objectRecursive("A", {
				field: schema.optionalRecursive([() => A]),
			}) {}
			{
				type _check = ValidateRecursiveSchema<typeof A>;
			}
			roundtrip(A);
		});

		it("leaf", () => {
			roundtrip(SchemaFactory.number);
		});

		for (const testSchema of testSimpleTrees) {
			it(testSchema.name, () => {
				roundtrip(testSchema.schema);
			});
		}
		it("test schema union", () => {
			roundtrip(testTreeSchema);
		});
	});

	describe("compatibility fields", () => {
		it("handles allowUnknownOptionalFields = true", () => {
			const root = HasUnknownOptionalFields;
			const simpleSchema = getSimpleSchema(root);
			const simpleObjectSchema = simpleSchema.definitions.get(
				"test.hasUnknownOptionalFields",
			) as SimpleObjectNodeSchema;
			assert.equal(simpleObjectSchema.allowUnknownOptionalFields, true);

			const viewSchema = generateSchemaFromSimpleSchema(simpleSchema);
			const objectViewSchema = viewSchema.definitions.get("test.hasUnknownOptionalFields");
			assert(
				objectViewSchema !== undefined && isObjectNodeSchema(objectViewSchema),
				"expected object node schema",
			);
			assert.equal(objectViewSchema.allowUnknownOptionalFields, true);
		});

		it("handles allowUnknownOptionalFields = false", () => {
			const factory = new SchemaFactoryAlpha("test");
			class HasNoUnknownOptionalFields extends factory.objectAlpha(
				"hasNoUnknownOptionalFields",
				{},
				{
					allowUnknownOptionalFields: false,
				},
			) {}
			const root = HasNoUnknownOptionalFields;
			const simpleSchema = getSimpleSchema(root);
			const simpleObjectSchema = simpleSchema.definitions.get(
				"test.hasNoUnknownOptionalFields",
			) as SimpleObjectNodeSchema;
			assert.equal(simpleObjectSchema.allowUnknownOptionalFields, false);

			const viewSchema = generateSchemaFromSimpleSchema(simpleSchema);
			const objectViewSchema = viewSchema.definitions.get("test.hasNoUnknownOptionalFields");
			assert(
				objectViewSchema !== undefined && isObjectNodeSchema(objectViewSchema),
				"expected object node schema",
			);
			assert.equal(objectViewSchema.allowUnknownOptionalFields, false);
		});

		it("handles staged allowed types", () => {
			const root = SchemaFactoryAlpha.types([
				SchemaFactoryAlpha.number,
				SchemaFactoryAlpha.staged(SchemaFactoryAlpha.string),
			]);
			const simpleSchema = getSimpleSchema(root);
			const rootField = simpleSchema.root;

			assert(
				rootField.simpleAllowedTypes.get("com.fluidframework.leaf.string")?.isStaged instanceof
					SchemaUpgrade,
			);

			assert.equal(
				rootField.simpleAllowedTypes.get("com.fluidframework.leaf.number")?.isStaged,
				false,
			);

			const viewSchema = generateSchemaFromSimpleSchema(simpleSchema);
			const rootFieldView = viewSchema.root;

			assert(
				rootFieldView.simpleAllowedTypes.get("com.fluidframework.leaf.string")
					?.isStaged instanceof SchemaUpgrade,
			);

			assert.equal(
				rootFieldView.simpleAllowedTypes.get("com.fluidframework.leaf.number")?.isStaged,
				false,
			);
		});
	});
});
