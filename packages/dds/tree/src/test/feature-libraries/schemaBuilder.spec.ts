/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	areSafelyAssignable,
	brand,
	isAny,
	requireAssignableTo,
	requireFalse,
	requireTrue,
} from "../../util/index.js";
import {
	FlexAllowedTypes,
	Any,
	FieldKinds,
	LeafNodeSchema,
	FlexFieldSchema,
	FlexTreeNodeSchema,
} from "../../feature-libraries/index.js";

import {
	normalizeAllowedTypes,
	normalizeField,
	SchemaBuilderBase,
	// eslint-disable-next-line import/no-internal-modules
} from "../../feature-libraries/schemaBuilderBase.js";
import { TreeNodeSchemaIdentifier, ValueSchema } from "../../core/index.js";

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

		it("recursive without special functions", () => {
			// Recursive helper function are needed but can be avoided due to issues covered in https://github.com/microsoft/TypeScript/issues/55758.
			// This workaround seems to only work for compile time, not for intellisense, which makes it not very useful in practice and hard to verify that it works.
			const builder = new SchemaBuilderBase(FieldKinds.required, { scope: "test" });

			const recursiveReference = () => recursiveStruct;
			type _trickCompilerIntoWorking = requireAssignableTo<
				typeof recursiveReference,
				() => FlexTreeNodeSchema
			>;
			const recursiveStruct = builder.object("recursiveStruct2", {
				foo: FlexFieldSchema.create(FieldKinds.optional, [recursiveReference]),
			});

			type _0 = requireFalse<isAny<typeof recursiveStruct>>;
			type _1 = requireTrue<
				areSafelyAssignable<
					typeof recursiveStruct,
					ReturnType<(typeof recursiveStruct.objectNodeFieldsObject.foo.allowedTypes)[0]>
				>
			>;
		});

		// Slightly different variant of the above test
		it("recursive without special functions2", () => {
			// This function helps the TypeScript compiler imagine a world where it solves for types in a different order, and thus handles the cases we need.
			// Some related information in https://github.com/microsoft/TypeScript/issues/55758.
			function fixRecursiveReference<T extends FlexAllowedTypes>(...types: T): void {}

			const builder = new SchemaBuilderBase(FieldKinds.required, { scope: "test" });

			const recursiveReference = () => recursiveStruct;
			fixRecursiveReference(recursiveReference);
			const recursiveStruct = builder.object("recursiveStruct2", {
				foo: FlexFieldSchema.create(FieldKinds.optional, [recursiveReference]),
			});

			type _0 = requireFalse<isAny<typeof recursiveStruct>>;
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
