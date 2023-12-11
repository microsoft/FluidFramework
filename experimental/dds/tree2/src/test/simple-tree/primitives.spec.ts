/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ImplicitFieldSchema } from "../../class-tree";
import { InsertableTreeFieldFromImplicitField } from "../../class-tree/internal";
import { getRoot, makeSchema, pretty } from "./utils";

// Construct a SharedTree with each of the above primitives as the root and then
// 'deepEquals' compares the proxy with the original primitive value.
//
// Also covers the corner case of an empty tree (via optional root) by constructing
// a tree with an 'undefined' root.
describe("Primitives", () => {
	function checkExact<TSchema extends ImplicitFieldSchema>(
		schema: TSchema,
		value: InsertableTreeFieldFromImplicitField<TSchema>,
	) {
		it(`initialTree(${pretty(value)}) -> ${pretty(value)}`, () => {
			const proxy = getRoot(schema, () => value);
			assert.deepEqual(proxy, value, "Readback of initialTree must match expected value.");
		});
	}

	function checkCoerced<TSchema extends ImplicitFieldSchema>(
		schema: TSchema,
		value: InsertableTreeFieldFromImplicitField<TSchema>,
	) {
		const coercedValue = JSON.parse(JSON.stringify(value));
		it(`initialTree(${pretty(value)}) -> ${coercedValue}`, () => {
			const proxy = getRoot(schema, () => value);
			assert.deepEqual(
				proxy,
				coercedValue,
				"Readback of initialTree must match expected value.",
			);
		});
	}

	function checkThrows<TSchema extends ImplicitFieldSchema>(
		schema: TSchema,
		value: InsertableTreeFieldFromImplicitField<TSchema>,
	) {
		const coercedValue = JSON.parse(JSON.stringify(value));
		it(`initialTree(${pretty(value)}) -> throws`, () => {
			assert.throws(() => getRoot(schema, () => value),
				`initialTree(${pretty(value)}) must throw if coercion to '${coercedValue}' disallowed by schema.`,
			);
		});
	}

	describe("null", () => {
		const schema = makeSchema(_ => _.null);
		checkExact(schema, null);
	});

	describe("boolean", () => {
		const schema = makeSchema((_) => _.boolean);
		[true, false].forEach((value) => checkExact(schema, value));
	});

	describe("number", () => {
		describe("jsonable", () => {
			const schema = makeSchema((_) => _.number);
			[
				-Number.MAX_VALUE,
				Number.MIN_SAFE_INTEGER,
				-Number.MIN_VALUE,
				0,
				Number.MIN_VALUE,
				Number.MAX_SAFE_INTEGER,
				Number.MAX_VALUE,
			].forEach((value) => checkExact(schema, value));
		});

		describe("disallowed without null", () => {
			const schema = makeSchema((_) => _.number);
			[-Infinity, NaN, Infinity].forEach((value) => {
				checkThrows(schema, value)
			});
		});

		describe("courceable without null", () => {
			const schema = makeSchema((_) => _.number);
			[-0].forEach((value) => {
				checkCoerced(schema, value);
			});
		});

		describe("coerceable with null", () => {
			const schema = makeSchema((_) => [_.number, _.null]);
			[
				-Infinity,
				NaN,
				Infinity,
			].forEach((value) => checkCoerced(schema, value));
		});
	});

	describe("string", () => {
		const schema = makeSchema((_) => _.string);
		[
			"", // empty string
			"!~", // printable ascii range
			"比特币", // non-ascii range
			"😂💁🏼‍♂️💁🏼‍💁‍♂", // surrogate pairs with glyph modifiers
		].forEach((value) => checkExact(schema, value));
	});
});
