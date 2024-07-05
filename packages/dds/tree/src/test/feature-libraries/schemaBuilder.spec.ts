/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { type TreeNodeSchemaIdentifier, ValueSchema } from "../../core/index.js";
import {
	Any,
	FieldKinds,
	FlexFieldSchema,
	LeafNodeSchema,
} from "../../feature-libraries/index.js";
import {
	SchemaBuilderBase,
	normalizeAllowedTypes,
	normalizeField,
	// eslint-disable-next-line import/no-internal-modules
} from "../../feature-libraries/schemaBuilderBase.js";
import { type areSafelyAssignable, brand, type requireTrue } from "../../util/index.js";

describe("SchemaBuilderBase", () => {
	describe("typedTreeSchema", () => {
		it("recursive", () => {
			const builder = new SchemaBuilderBase(FieldKinds.required, { scope: "test" });

			const recursiveStruct = builder.objectRecursive("recursiveStruct", {
				foo: FlexFieldSchema.createUnsafe(FieldKinds.optional, [() => recursiveStruct]),
			});

			type _1 = requireTrue<
				areSafelyAssignable<
					typeof recursiveStruct,
					ReturnType<(typeof recursiveStruct.objectNodeFieldsObject.foo.allowedTypes)[0]>
				>
			>;
		});
	});

	describe("intoSchema", () => {
		it("Simple", () => {
			const schemaBuilder = new SchemaBuilderBase(FieldKinds.required, { scope: "test" });
			const empty = schemaBuilder.object("empty", {});
			const schema = schemaBuilder.intoSchema(
				FlexFieldSchema.create(FieldKinds.optional, [empty]),
			);

			assert.equal(schema.nodeSchema.size, 1); // "empty"
			assert.equal(schema.nodeSchema.get(brand("test.empty")), empty);
		});
	});

	describe("intoLibrary", () => {
		it("Simple", () => {
			const schemaBuilder = new SchemaBuilderBase(FieldKinds.required, { scope: "test" });
			const empty = schemaBuilder.object("empty", {});
			const schema = schemaBuilder.intoLibrary();

			assert.equal(schema.nodeSchema.size, 1); // "empty"
			assert.equal(schema.nodeSchema.get(brand("test.empty")), empty);
		});
	});

	it("normalizeAllowedTypes", () => {
		assert.deepEqual(normalizeAllowedTypes(Any), [Any]);
		assert.deepEqual(normalizeAllowedTypes([]), []);
		assert.deepEqual(normalizeAllowedTypes([Any]), [Any]);
		const treeSchema = LeafNodeSchema.create(
			{ name: "test" },
			brand<TreeNodeSchemaIdentifier>("foo"),
			ValueSchema.String,
		);
		assert.deepEqual(normalizeAllowedTypes(treeSchema), [treeSchema]);

		// eslint-disable-next-line no-constant-condition
		if (false) {
			// Lazy form cannot be used as short hand.
			// This form is only needed in recursive cases which currently don't support the short hand.
			// If support for it is added, this check can be replaced with an check of the implementation.
			// @ts-expect-error Checking lazy form is not allowed by compiler:
			normalizeAllowedTypes(() => treeSchema);
		}
	});

	it("normalizeField", () => {
		// Check types are normalized correctly
		const directAny = FlexFieldSchema.create(FieldKinds.optional, [Any]);
		assert(directAny.equals(normalizeField(Any, FieldKinds.optional)));
		assert(directAny.equals(normalizeField([Any], FieldKinds.optional)));
		assert(
			directAny.equals(
				normalizeField(
					FlexFieldSchema.create(FieldKinds.optional, [Any]),
					FieldKinds.optional,
				),
			),
		);

		assert(
			FlexFieldSchema.create(FieldKinds.optional, []).equals(
				normalizeField([], FieldKinds.optional),
			),
		);

		const treeSchema = LeafNodeSchema.create(
			{ name: "test" },
			brand<TreeNodeSchemaIdentifier>("foo"),
			ValueSchema.String,
		);

		assert(
			FlexFieldSchema.create(FieldKinds.optional, [treeSchema]).equals(
				normalizeField([treeSchema], FieldKinds.optional),
			),
		);

		// Check provided field kind is used
		assert(
			FlexFieldSchema.create(FieldKinds.required, [treeSchema]).equals(
				normalizeField([treeSchema], FieldKinds.required),
			),
		);
	});
});
