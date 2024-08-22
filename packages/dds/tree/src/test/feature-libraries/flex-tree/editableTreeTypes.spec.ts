/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	SchemaBuilder,
	type jsonArray,
	type jsonObject,
	jsonSchema,
	type leaf,
} from "../../../domains/index.js";
import {
	Any,
	type FlexMapNodeSchema,
	type FlexObjectNodeSchema,
	type LeafNodeSchema,
} from "../../../feature-libraries/index.js";
import type {
	isAssignableTo,
	requireAssignableTo,
	requireFalse,
	requireTrue,
} from "../../../util/index.js";

describe("flexTreeTypes", () => {
	const builder = new SchemaBuilder({ scope: "test", libraries: [jsonSchema] });
	const emptyStruct = builder.object("empty", {});
	const basicStruct = builder.object("basicObject", { foo: builder.optional(Any) });
	// TODO: once schema kinds are separated, test struct with EmptyKey.

	{
		type _1 = requireAssignableTo<typeof leaf.boolean, LeafNodeSchema>;
		type _3 = requireAssignableTo<typeof jsonObject, FlexMapNodeSchema>;
		type _4 = requireAssignableTo<typeof emptyStruct, FlexObjectNodeSchema>;
		type _5 = requireAssignableTo<typeof basicStruct, FlexObjectNodeSchema>;
	}

	{
		type _1 = requireTrue<isAssignableTo<typeof leaf.boolean, LeafNodeSchema>>;
		type _3 = requireFalse<isAssignableTo<typeof leaf.boolean, FlexMapNodeSchema>>;
		type _4 = requireFalse<isAssignableTo<typeof leaf.boolean, FlexObjectNodeSchema>>;
	}

	{
		type _1 = requireFalse<isAssignableTo<typeof jsonArray, LeafNodeSchema>>;
		type _3 = requireFalse<isAssignableTo<typeof jsonArray, FlexMapNodeSchema>>;
		// TODO: Fix
		// type _4 = requireFalse<isAssignableTo<typeof jsonArray, ObjectNodeSchema>>
	}

	{
		type _1 = requireFalse<isAssignableTo<typeof jsonObject, LeafNodeSchema>>;
		type _3 = requireTrue<isAssignableTo<typeof jsonObject, FlexMapNodeSchema>>;
		type _4 = requireFalse<isAssignableTo<typeof jsonObject, FlexObjectNodeSchema>>;
	}

	{
		type _1 = requireFalse<isAssignableTo<typeof basicStruct, LeafNodeSchema>>;
		type _3 = requireFalse<isAssignableTo<typeof basicStruct, FlexMapNodeSchema>>;
		type _4 = requireTrue<isAssignableTo<typeof basicStruct, FlexObjectNodeSchema>>;
	}

	function nominalTyping(): void {
		const builder2 = new SchemaBuilder({ scope: "test" });
		const emptyStruct1 = builder2.object("empty1", {});
		const emptyStruct2 = builder2.object("empty2", {});

		// Schema for types which only different in name are distinguished
		{
			type _1 = requireFalse<isAssignableTo<typeof emptyStruct1, typeof emptyStruct2>>;
			type _2 = requireFalse<isAssignableTo<typeof emptyStruct2, typeof emptyStruct1>>;
		}
	}
});
