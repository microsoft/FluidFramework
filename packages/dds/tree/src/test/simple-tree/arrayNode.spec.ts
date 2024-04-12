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
// eslint-disable-next-line import/no-internal-modules
import { asIndex } from "../../simple-tree/arrayNode.js";

type ArrayNodeSchema<T extends ImplicitAllowedTypes> = TreeNodeSchema<
	string,
	NodeKind.Array,
	TreeArrayNode<T>,
	Iterable<InsertableTreeNodeFromImplicitAllowedTypes<T>>,
	true
>;

const schemaFactory = new SchemaFactory("Test");

function hydrateArray<TContent extends TreeNodeSchema | readonly TreeNodeSchema[]>(
	schemaType: "structural" | "class-based",
	contentType: TContent,
	content?: () => InsertableTreeFieldFromImplicitField<ArrayNodeSchema<TContent>>,
): TreeFieldFromImplicitField<ArrayNodeSchema<TContent>> {
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

	it("asIndex helper returns expected values", () => {
		// Expected indices with no max
		assert.equal(asIndex("0", Number.POSITIVE_INFINITY), 0);
		assert.equal(asIndex("1", Number.POSITIVE_INFINITY), 1);
		assert.equal(asIndex("999", Number.POSITIVE_INFINITY), 999);
		// Expected indices with max
		assert.equal(asIndex("0", 2), 0);
		assert.equal(asIndex("1", 2), 1);
		assert.equal(asIndex("2", 2), undefined);
		assert.equal(asIndex("999", 2), undefined);
		// Non-index values
		assert.equal(asIndex("-0", Number.POSITIVE_INFINITY), undefined);
		assert.equal(asIndex("Infinity", Number.POSITIVE_INFINITY), undefined);
		assert.equal(asIndex("NaN", Number.POSITIVE_INFINITY), undefined);
		assert.equal(asIndex("-1", Number.POSITIVE_INFINITY), undefined);
		assert.equal(asIndex("1.5", Number.POSITIVE_INFINITY), undefined);
		assert.equal(asIndex("", Number.POSITIVE_INFINITY), undefined);
		assert.equal(asIndex(" ", Number.POSITIVE_INFINITY), undefined);
		assert.equal(asIndex("0x1", Number.POSITIVE_INFINITY), undefined);
		assert.equal(asIndex(" 1", Number.POSITIVE_INFINITY), undefined);
		assert.equal(asIndex("1.0", Number.POSITIVE_INFINITY), undefined);
	});
});
