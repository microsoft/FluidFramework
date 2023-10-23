/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { jsonArray, jsonObject, jsonSchema, leaf, SchemaBuilder } from "../../../domains";
import { isAssignableTo, requireAssignableTo, requireFalse, requireTrue } from "../../../util";
import {
	Any,
	FieldNodeSchema,
	TreeFieldSchema,
	LeafSchema,
	MapSchema,
	ObjectNodeSchema,
	allowedTypesIsAny,
	schemaIsFieldNode,
	schemaIsLeaf,
	schemaIsMap,
	schemaIsStruct,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/typed-schema/typedTreeSchema";
import { FieldKinds } from "../../../feature-libraries";

describe("typedTreeSchema", () => {
	const builder = new SchemaBuilder({ scope: "test", libraries: [jsonSchema] });
	const emptyStruct = builder.object("empty", {});
	const basicStruct = builder.object("basicStruct", { foo: builder.optional(Any) });
	const basicFieldNode = builder.fieldNode("field", builder.optional(Any));
	// TODO: once schema kinds are separated, test struct with EmptyKey.

	const recursiveStruct = builder.objectRecursive("recursiveStruct", {
		foo: TreeFieldSchema.createUnsafe(FieldKinds.optional, [() => recursiveStruct]),
	});

	it("schema is", () => {
		assert(schemaIsLeaf(leaf.boolean));
		assert(!schemaIsFieldNode(leaf.boolean));
		assert(!schemaIsStruct(leaf.boolean));
		assert(!schemaIsMap(leaf.boolean));

		assert(!schemaIsLeaf(jsonArray));
		assert(schemaIsFieldNode(jsonArray));
		assert(!schemaIsStruct(jsonArray));
		assert(!schemaIsMap(jsonArray));

		assert(!schemaIsLeaf(jsonObject));
		assert(!schemaIsFieldNode(jsonObject));
		assert(!schemaIsStruct(jsonObject));
		assert(schemaIsMap(jsonObject));

		assert(!schemaIsLeaf(emptyStruct));
		assert(!schemaIsFieldNode(emptyStruct));
		assert(schemaIsStruct(emptyStruct));
		assert(!schemaIsMap(emptyStruct));

		assert(!schemaIsLeaf(basicStruct));
		assert(!schemaIsFieldNode(basicStruct));
		assert(schemaIsStruct(basicStruct));
		assert(!schemaIsMap(basicStruct));

		assert(!schemaIsLeaf(recursiveStruct));
		assert(!schemaIsFieldNode(recursiveStruct));
		assert(schemaIsStruct(recursiveStruct));
		assert(!schemaIsMap(recursiveStruct));
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
		type _1 = requireAssignableTo<typeof leaf.boolean, LeafSchema>;
		type _2a = requireAssignableTo<typeof basicFieldNode, FieldNodeSchema>;
		type _2 = requireAssignableTo<typeof jsonArray, FieldNodeSchema>;
		type _3 = requireAssignableTo<typeof jsonObject, MapSchema>;
		type _4 = requireAssignableTo<typeof emptyStruct, ObjectNodeSchema>;
		type _5 = requireAssignableTo<typeof basicStruct, ObjectNodeSchema>;
	}

	{
		type _1 = requireTrue<isAssignableTo<typeof leaf.boolean, LeafSchema>>;
		type _2 = requireFalse<isAssignableTo<typeof leaf.boolean, FieldNodeSchema>>;
		type _3 = requireFalse<isAssignableTo<typeof leaf.boolean, MapSchema>>;
		type _4 = requireFalse<isAssignableTo<typeof leaf.boolean, ObjectNodeSchema>>;
	}

	{
		type _1 = requireFalse<isAssignableTo<typeof jsonArray, LeafSchema>>;
		type _2 = requireTrue<isAssignableTo<typeof jsonArray, FieldNodeSchema>>;
		type _3 = requireFalse<isAssignableTo<typeof jsonArray, MapSchema>>;
		// TODO: Fix
		// type _4 = requireFalse<isAssignableTo<typeof jsonArray, ObjectNodeSchema>>
	}

	{
		type _1 = requireFalse<isAssignableTo<typeof jsonObject, LeafSchema>>;
		type _2 = requireFalse<isAssignableTo<typeof jsonObject, FieldNodeSchema>>;
		type _3 = requireTrue<isAssignableTo<typeof jsonObject, MapSchema>>;
		type _4 = requireFalse<isAssignableTo<typeof jsonObject, ObjectNodeSchema>>;
	}

	{
		type _1 = requireFalse<isAssignableTo<typeof basicStruct, LeafSchema>>;
		type _2 = requireFalse<isAssignableTo<typeof basicStruct, FieldNodeSchema>>;
		type _3 = requireFalse<isAssignableTo<typeof basicStruct, MapSchema>>;
		type _4 = requireTrue<isAssignableTo<typeof basicStruct, ObjectNodeSchema>>;
	}
});
