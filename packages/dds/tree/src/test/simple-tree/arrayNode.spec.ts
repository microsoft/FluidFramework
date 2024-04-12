/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	ImplicitAllowedTypes,
	InsertableTreeFieldFromImplicitField,
	InsertableTreeNodeFromImplicitAllowedTypes,
	NodeKind,
	SchemaFactory,
	TreeArrayNode,
	TreeFieldFromImplicitField,
	TreeNodeSchema,
} from "../../simple-tree/index.js";

import { hydrate } from "./utils.js";
import { Mutable } from "../../util/index.js";

type ArrayNodeSchema<T extends ImplicitAllowedTypes> = TreeNodeSchema<
	string,
	NodeKind.Array,
	TreeArrayNode<T>,
	Iterable<InsertableTreeNodeFromImplicitAllowedTypes<T>>,
	true
>;

const schemaFactory = new SchemaFactory("Test");

function hydrateArray<T extends TreeNodeSchema | readonly TreeNodeSchema[]>(
	schemaType: "structural" | "class-based",
	contentType: T,
	content?: () => InsertableTreeFieldFromImplicitField<ArrayNodeSchema<T>>,
): TreeFieldFromImplicitField<ArrayNodeSchema<T>> {
	const schema =
		schemaType === "structural"
			? schemaFactory.array(contentType)
			: schemaFactory.array("Array", contentType);

	return hydrate(schema, content?.() ?? []);
}

describe("ArrayNode", () => {
	function describeArrayNodeTests(
		fn: (arraySchemaType: "structural" | "class-based") => void,
	): void {
		describe("created via structural schema", () => fn("structural"));
		describe("created via class-based schema", () => fn("class-based"));
	}

	describeArrayNodeTests((arraySchemaType) => {
		it("fail at runtime if attempting to set content via index assignment", () => {
			const array = hydrateArray(arraySchemaType, schemaFactory.number, () => [0]);
			const mutableArray = array as Mutable<typeof array>;
			assert.throws(() => (mutableArray[0] = 3)); // An index within the array that already has an element
			assert.throws(() => (mutableArray[1] = 3)); // An index just past the end of the array, where a new element would be pushed
			assert.throws(() => (mutableArray[2] = 3)); // An index that would leave a "gap" past the current end of the array if a set occurred
		});
	});
});
