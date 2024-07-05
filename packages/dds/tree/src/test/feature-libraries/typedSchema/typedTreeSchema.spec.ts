/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { jsonArray, jsonObject, jsonSchema, leaf } from "../../../domains/index.js";
import { FieldKinds, SchemaBuilderBase } from "../../../feature-libraries/index.js";
import {
	Any,
	type FlexFieldNodeSchema,
	FlexFieldSchema,
	type FlexMapNodeSchema,
	type FlexObjectNodeSchema,
	type LeafNodeSchema,
	allowedTypesIsAny,
	schemaIsFieldNode,
	schemaIsLeaf,
	schemaIsMap,
	schemaIsObjectNode,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/typed-schema/typedTreeSchema.js";
import type {
	isAssignableTo,
	requireAssignableTo,
	requireFalse,
	requireTrue,
} from "../../../util/index.js";

describe("typedTreeSchema", () => {
	const builder = new SchemaBuilderBase(FieldKinds.optional, {
		scope: "test",
		libraries: [jsonSchema],
	});
	const emptyObjectSchema = builder.object("empty", {});
	const basicObjectSchema = builder.object("basicObject", { foo: Any });
	const basicFieldNode = builder.fieldNode("field", Any);
	// TODO: once schema kinds are separated, test object with EmptyKey.

	const recursiveObject = builder.objectRecursive("recursiveObject", {
		foo: FlexFieldSchema.createUnsafe(FieldKinds.optional, [() => recursiveObject]),
	});

	it("schema is", () => {
		assert(schemaIsLeaf(leaf.boolean));
		assert(!schemaIsFieldNode(leaf.boolean));
		assert(!schemaIsObjectNode(leaf.boolean));
		assert(!schemaIsMap(leaf.boolean));

		assert(!schemaIsLeaf(jsonArray));
		assert(schemaIsFieldNode(jsonArray));
		assert(!schemaIsObjectNode(jsonArray));
		assert(!schemaIsMap(jsonArray));

		assert(!schemaIsLeaf(jsonObject));
		assert(!schemaIsFieldNode(jsonObject));
		assert(!schemaIsObjectNode(jsonObject));
		assert(schemaIsMap(jsonObject));

		assert(!schemaIsLeaf(emptyObjectSchema));
		assert(!schemaIsFieldNode(emptyObjectSchema));
		assert(schemaIsObjectNode(emptyObjectSchema));
		assert(!schemaIsMap(emptyObjectSchema));

		assert(!schemaIsLeaf(basicObjectSchema));
		assert(!schemaIsFieldNode(basicObjectSchema));
		assert(schemaIsObjectNode(basicObjectSchema));
		assert(!schemaIsMap(basicObjectSchema));

		assert(!schemaIsLeaf(recursiveObject));
		assert(!schemaIsFieldNode(recursiveObject));
		assert(schemaIsObjectNode(recursiveObject));
		assert(!schemaIsMap(recursiveObject));
	});

	describe("TreeFieldSchema", () => {
		it("types - any", () => {
			const schema = FlexFieldSchema.create(FieldKinds.optional, [Any]);
			assert(allowedTypesIsAny(schema.allowedTypes));
			assert.equal(schema.allowedTypeSet, Any);
			assert.equal(schema.types, undefined);
		});

		it("types - single", () => {
			const schema = FlexFieldSchema.create(FieldKinds.optional, [leaf.number]);
			assert(!allowedTypesIsAny(schema.allowedTypes));
			assert.deepEqual(schema.allowedTypes, [leaf.number]);
			assert.deepEqual(schema.allowedTypeSet, new Set([leaf.number]));
			assert.deepEqual(schema.types, new Set([leaf.number.name]));
		});

		it("types - lazy", () => {
			const schema = FlexFieldSchema.create(FieldKinds.optional, [() => leaf.number]);
			assert(!allowedTypesIsAny(schema.allowedTypes));
			assert.deepEqual(schema.allowedTypeSet, new Set([leaf.number]));
			assert.deepEqual(schema.types, new Set([leaf.number.name]));
		});
	});

	{
		type _1 = requireAssignableTo<typeof leaf.boolean, LeafNodeSchema>;
		type _2a = requireAssignableTo<typeof basicFieldNode, FlexFieldNodeSchema>;
		type _2 = requireAssignableTo<typeof jsonArray, FlexFieldNodeSchema>;
		type _3 = requireAssignableTo<typeof jsonObject, FlexMapNodeSchema>;
		type _4 = requireAssignableTo<typeof emptyObjectSchema, FlexObjectNodeSchema>;
		type _5 = requireAssignableTo<typeof basicObjectSchema, FlexObjectNodeSchema>;
	}

	{
		type _1 = requireTrue<isAssignableTo<typeof leaf.boolean, LeafNodeSchema>>;
		type _2 = requireFalse<isAssignableTo<typeof leaf.boolean, FlexFieldNodeSchema>>;
		type _3 = requireFalse<isAssignableTo<typeof leaf.boolean, FlexMapNodeSchema>>;
		type _4 = requireFalse<isAssignableTo<typeof leaf.boolean, FlexObjectNodeSchema>>;
	}

	{
		type _1 = requireFalse<isAssignableTo<typeof jsonArray, LeafNodeSchema>>;
		type _2 = requireTrue<isAssignableTo<typeof jsonArray, FlexFieldNodeSchema>>;
		type _3 = requireFalse<isAssignableTo<typeof jsonArray, FlexMapNodeSchema>>;
		// TODO: Fix
		// type _4 = requireFalse<isAssignableTo<typeof jsonArray, ObjectNodeSchema>>
	}

	{
		type _1 = requireFalse<isAssignableTo<typeof jsonObject, LeafNodeSchema>>;
		type _2 = requireFalse<isAssignableTo<typeof jsonObject, FlexFieldNodeSchema>>;
		type _3 = requireTrue<isAssignableTo<typeof jsonObject, FlexMapNodeSchema>>;
		type _4 = requireFalse<isAssignableTo<typeof jsonObject, FlexObjectNodeSchema>>;
	}

	{
		type _1 = requireFalse<isAssignableTo<typeof basicObjectSchema, LeafNodeSchema>>;
		type _2 = requireFalse<isAssignableTo<typeof basicObjectSchema, FlexFieldNodeSchema>>;
		type _3 = requireFalse<isAssignableTo<typeof basicObjectSchema, FlexMapNodeSchema>>;
		type _4 = requireTrue<isAssignableTo<typeof basicObjectSchema, FlexObjectNodeSchema>>;
	}
});
