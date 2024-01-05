/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { jsonArray, jsonObject, jsonSchema, leaf, SchemaBuilder } from "../../../domains/index.js";
import {
	isAssignableTo,
	requireAssignableTo,
	requireFalse,
	requireTrue,
} from "../../../util/index.js";
import {
	Any,
	FieldNodeSchema,
	TreeFieldSchema,
	ObjectNodeSchema,
	allowedTypesIsAny,
	schemaIsFieldNode,
	schemaIsLeaf,
	schemaIsMap,
	schemaIsObjectNode,
	LeafNodeSchema,
	MapNodeSchema,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/typed-schema/typedTreeSchema.js";
import { FieldKinds } from "../../../feature-libraries/index.js";

describe("typedTreeSchema", () => {
	const builder = new SchemaBuilder({ scope: "test", libraries: [jsonSchema] });
	const emptyObjectSchema = builder.object("empty", {});
	const basicObjectSchema = builder.object("basicObject", { foo: builder.optional(Any) });
	const basicFieldNode = builder.fieldNode("field", builder.optional(Any));
	// TODO: once schema kinds are separated, test object with EmptyKey.

	const recursiveObject = builder.objectRecursive("recursiveObject", {
		foo: TreeFieldSchema.createUnsafe(FieldKinds.optional, [() => recursiveObject]),
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
			const schema = TreeFieldSchema.create(FieldKinds.optional, [Any]);
			assert(allowedTypesIsAny(schema.allowedTypes));
			assert.equal(schema.allowedTypeSet, Any);
			assert.equal(schema.types, undefined);
		});

		it("types - single", () => {
			const schema = TreeFieldSchema.create(FieldKinds.optional, [leaf.number]);
			assert(!allowedTypesIsAny(schema.allowedTypes));
			assert.deepEqual(schema.allowedTypes, [leaf.number]);
			assert.deepEqual(schema.allowedTypeSet, new Set([leaf.number]));
			assert.deepEqual(schema.types, new Set([leaf.number.name]));
		});

		it("types - lazy", () => {
			const schema = TreeFieldSchema.create(FieldKinds.optional, [() => leaf.number]);
			assert(!allowedTypesIsAny(schema.allowedTypes));
			assert.deepEqual(schema.allowedTypeSet, new Set([leaf.number]));
			assert.deepEqual(schema.types, new Set([leaf.number.name]));
		});
	});

	{
		type _1 = requireAssignableTo<typeof leaf.boolean, LeafNodeSchema>;
		type _2a = requireAssignableTo<typeof basicFieldNode, FieldNodeSchema>;
		type _2 = requireAssignableTo<typeof jsonArray, FieldNodeSchema>;
		type _3 = requireAssignableTo<typeof jsonObject, MapNodeSchema>;
		type _4 = requireAssignableTo<typeof emptyObjectSchema, ObjectNodeSchema>;
		type _5 = requireAssignableTo<typeof basicObjectSchema, ObjectNodeSchema>;
	}

	{
		type _1 = requireTrue<isAssignableTo<typeof leaf.boolean, LeafNodeSchema>>;
		type _2 = requireFalse<isAssignableTo<typeof leaf.boolean, FieldNodeSchema>>;
		type _3 = requireFalse<isAssignableTo<typeof leaf.boolean, MapNodeSchema>>;
		type _4 = requireFalse<isAssignableTo<typeof leaf.boolean, ObjectNodeSchema>>;
	}

	{
		type _1 = requireFalse<isAssignableTo<typeof jsonArray, LeafNodeSchema>>;
		type _2 = requireTrue<isAssignableTo<typeof jsonArray, FieldNodeSchema>>;
		type _3 = requireFalse<isAssignableTo<typeof jsonArray, MapNodeSchema>>;
		// TODO: Fix
		// type _4 = requireFalse<isAssignableTo<typeof jsonArray, ObjectNodeSchema>>
	}

	{
		type _1 = requireFalse<isAssignableTo<typeof jsonObject, LeafNodeSchema>>;
		type _2 = requireFalse<isAssignableTo<typeof jsonObject, FieldNodeSchema>>;
		type _3 = requireTrue<isAssignableTo<typeof jsonObject, MapNodeSchema>>;
		type _4 = requireFalse<isAssignableTo<typeof jsonObject, ObjectNodeSchema>>;
	}

	{
		type _1 = requireFalse<isAssignableTo<typeof basicObjectSchema, LeafNodeSchema>>;
		type _2 = requireFalse<isAssignableTo<typeof basicObjectSchema, FieldNodeSchema>>;
		type _3 = requireFalse<isAssignableTo<typeof basicObjectSchema, MapNodeSchema>>;
		type _4 = requireTrue<isAssignableTo<typeof basicObjectSchema, ObjectNodeSchema>>;
	}
});
