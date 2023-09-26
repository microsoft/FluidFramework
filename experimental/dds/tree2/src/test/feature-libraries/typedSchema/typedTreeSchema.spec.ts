/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { jsonArray, jsonBoolean, jsonObject, jsonSchema } from "../../../domains";
import { isAssignableTo, requireAssignableTo, requireFalse, requireTrue } from "../../../util";
import {
	Any,
	FieldNodeSchema,
	LeafSchema,
	MapSchema,
	StructSchema,
	schemaIsFieldNode,
	schemaIsLeaf,
	schemaIsMap,
	schemaIsStruct,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/typed-schema/typedTreeSchema";
import { FieldKinds, SchemaBuilder } from "../../../feature-libraries";

describe("typedTreeSchema", () => {
	const builder = new SchemaBuilder("test", {}, jsonSchema);
	const emptyStruct = builder.struct("empty", {});
	const basicStruct = builder.struct("basicStruct", { foo: SchemaBuilder.fieldOptional(Any) });
	const basicFieldNode = builder.fieldNode("field", SchemaBuilder.fieldOptional(Any));
	// TODO: once schema kinds are separated, test struct with EmptyKey.

	const recursiveStruct = builder.structRecursive("recursiveStruct", {
		foo: SchemaBuilder.fieldRecursive(FieldKinds.optional, () => recursiveStruct),
	});

	it("schema is", () => {
		assert(schemaIsLeaf(jsonBoolean));
		assert(!schemaIsFieldNode(jsonBoolean));
		assert(!schemaIsStruct(jsonBoolean));
		assert(!schemaIsMap(jsonBoolean));

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

	{
		type _1 = requireAssignableTo<typeof jsonBoolean, LeafSchema>;
		type _2a = requireAssignableTo<typeof basicFieldNode, FieldNodeSchema>;
		type _2 = requireAssignableTo<typeof jsonArray, FieldNodeSchema>;
		type _3 = requireAssignableTo<typeof jsonObject, MapSchema>;
		type _4 = requireAssignableTo<typeof emptyStruct, StructSchema>;
		type _5 = requireAssignableTo<typeof basicStruct, StructSchema>;
	}

	{
		type _1 = requireTrue<isAssignableTo<typeof jsonBoolean, LeafSchema>>;
		type _2 = requireFalse<isAssignableTo<typeof jsonBoolean, FieldNodeSchema>>;
		type _3 = requireFalse<isAssignableTo<typeof jsonBoolean, MapSchema>>;
		type _4 = requireFalse<isAssignableTo<typeof jsonBoolean, StructSchema>>;
	}

	{
		type _1 = requireFalse<isAssignableTo<typeof jsonArray, LeafSchema>>;
		type _2 = requireTrue<isAssignableTo<typeof jsonArray, FieldNodeSchema>>;
		type _3 = requireFalse<isAssignableTo<typeof jsonArray, MapSchema>>;
		// TODO: Fix
		// type _4 = requireFalse<isAssignableTo<typeof jsonArray, StructSchema>>
	}

	{
		type _1 = requireFalse<isAssignableTo<typeof jsonObject, LeafSchema>>;
		type _2 = requireFalse<isAssignableTo<typeof jsonObject, FieldNodeSchema>>;
		type _3 = requireTrue<isAssignableTo<typeof jsonObject, MapSchema>>;
		type _4 = requireFalse<isAssignableTo<typeof jsonObject, StructSchema>>;
	}

	{
		type _1 = requireFalse<isAssignableTo<typeof basicStruct, LeafSchema>>;
		type _2 = requireFalse<isAssignableTo<typeof basicStruct, FieldNodeSchema>>;
		type _3 = requireFalse<isAssignableTo<typeof basicStruct, MapSchema>>;
		type _4 = requireTrue<isAssignableTo<typeof basicStruct, StructSchema>>;
	}
});
