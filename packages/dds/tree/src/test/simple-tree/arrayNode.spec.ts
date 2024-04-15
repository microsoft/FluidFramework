/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SchemaFactory } from "../../simple-tree/index.js";
import { hydrate } from "./utils.js";
import { Mutable } from "../../util/index.js";
// eslint-disable-next-line import/no-internal-modules
import { asIndex } from "../../simple-tree/arrayNode.js";

const schemaFactory = new SchemaFactory("ArrayNodeTest");
const structuralArray = schemaFactory.array(schemaFactory.number);
const classBasedArray = schemaFactory.array("Array", schemaFactory.number);

describe("ArrayNode", () => {
	describe("created via structural schema", () => {
		testArrayFromSchemaType(structuralArray);
	});

	describe("created via class-based schema", () => {
		testArrayFromSchemaType(classBasedArray);
	});

	// Tests which should behave the same for both "structural" and "class-based" arrays can be added in this function to avoid duplication.
	function testArrayFromSchemaType(
		schemaType: typeof structuralArray | typeof classBasedArray,
	): void {
		it("fails at runtime if attempting to set content via index assignment", () => {
			const array = hydrate(schemaType, [0]);
			const mutableArray = array as Mutable<typeof array>;
			assert.equal(mutableArray.length, 1);
			assert.throws(() => (mutableArray[0] = 3)); // An index within the array that already has an element
			assert.throws(() => (mutableArray[1] = 3)); // An index just past the end of the array, where a new element would be pushed
			assert.throws(() => (mutableArray[2] = 3)); // An index that would leave a "gap" past the current end of the array if a set occurred
		});

		it("stringifies in the same way as a JS array", () => {
			const jsArray = [0, 1, 2];
			const array = hydrate(schemaType, jsArray);
			assert.equal(JSON.stringify(array), JSON.stringify(jsArray));
		});
	}

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
