/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	type ImplicitFieldSchema,
	type InsertableTreeFieldFromImplicitField,
	SchemaFactory,
} from "../../simple-tree/index.js";

import { hydrate, pretty } from "./utils.js";

const schemaFactory = new SchemaFactory("Test");

// Construct a SharedTree with each of the above primitives as the root and then
// 'deepEquals' compares the proxy with the original primitive value.
//
// Also covers the corner case of an empty tree (via optional root) by constructing
// a tree with an 'undefined' root.
describe("Primitives", () => {
	/**
	 * Verifies that that 'value' is preserved when written and read back from a SharedTree
	 * with the given schema.
	 *
	 * @param schema - Schema to use for the test (must include the type of 'value'.)
	 * @param value - The value to be written/read/verified.
	 */
	function checkExact<const TSchema extends ImplicitFieldSchema>(
		schema: TSchema,
		value: InsertableTreeFieldFromImplicitField<TSchema>,
	) {
		it(`initialTree(${pretty(value)}) preserves ${typeof value} ${pretty(value)}`, () => {
			// Paranoid check that the given value is in fact preserved.
			assert.deepEqual(
				value,
				JSON.parse(JSON.stringify(value)),
				`Expected ${pretty(value)} to be preserved by JSON.`,
			);

			const actual = hydrate(schema, value);
			assert.deepEqual(actual, value, "Readback of initialTree must match expected value.");
		});

		// TODO: Consider improving coverage with more variations:
		// - reading/writing an object field
		// - reading/writing a list element
		// - reading/writing a map entry
		// - optional
	}

	/**
	 * Returns the value that JSON.stringify/parse would coerce the given value to.
	 *
	 * Sanity checks that the given value is in fact coerced.
	 *
	 * @param value - The value to be coerced.
	 * @returns The coerced value.
	 */
	function getCoercedValue(value: unknown): unknown {
		const coercedValue = JSON.parse(JSON.stringify(value));

		// Paranoid check that the given value is in fact coerced.
		assert.notDeepEqual(value, coercedValue, "Expected JSON stringify/parse to coerce value.");

		return coercedValue;
	}

	/**
	 * Verifies that that 'value' is coerced when written and read back from a SharedTree
	 * with the given schema.
	 *
	 * @param schema - Schema to use for the test (must include the coerced type of 'value'.)
	 * @param value - The value to be written/read/verified.
	 */
	function checkCoerced<const TSchema extends ImplicitFieldSchema>(
		schema: TSchema,
		value: InsertableTreeFieldFromImplicitField<TSchema>,
	) {
		const coercedValue = getCoercedValue(value);

		it(`initialTree(${pretty(
			value,
		)}) is coerced to ${typeof coercedValue} ${coercedValue}`, () => {
			const actual = hydrate(schema, value);
			assert.deepEqual(
				actual,
				coercedValue,
				"Readback of initialTree must match expected value.",
			);
		});

		// TODO: Consider improving coverage with more variations:
		// - reading/writing an object field
		// - reading/writing a list element
		// - reading/writing a map entry
		// - optional
	}

	/**
	 * Verifies that attempting to write 'value' throws due to the coerced value violating the
	 * given schema.
	 *
	 * @param schema - Schema to use for the test (must include the coerced type of 'value'.)
	 * @param value - The value to be written/read/verified.
	 */
	function checkThrows<const TSchema extends ImplicitFieldSchema>(
		schema: TSchema,
		value: InsertableTreeFieldFromImplicitField<TSchema>,
	) {
		const coercedValue = getCoercedValue(value);

		it(`initialTree(${pretty(
			value,
		)}) throws when coercion to ${typeof value}' ${coercedValue}' violates schema.`, () => {
			assert.throws(
				() => hydrate(schema, value),
				`initialTree(${pretty(
					value,
				)}) must throw when coercion to '${coercedValue}' violates schema.`,
			);
		});

		// TODO: Consider improving coverage with more variations:
		// - reading/writting an object field
		// - reading/writting a list element
		// - reading/writting a map entry
		// - optional
	}

	describe("null", () => {
		const schema = schemaFactory.null;
		checkExact(schema, null);
	});

	describe("boolean", () => {
		const schema = schemaFactory.boolean;
		[true, false].forEach((value) => checkExact(schema, value));
	});

	describe("number", () => {
		describe("with schema [_.number]", () => {
			const schema = schemaFactory.number;

			// Test a handful of extreme values to sanity check that they round-trip as expected.
			[
				-Number.MAX_VALUE,
				Number.MIN_SAFE_INTEGER,
				-Number.MIN_VALUE,
				0,
				Number.MIN_VALUE,
				Number.MAX_SAFE_INTEGER,
				Number.MAX_VALUE,
			].forEach((value) => checkExact(schema, value));

			// JSON coerces non-finite numbers to 'null'.  If 'null' violates schema,
			// this must throw a TypeError.
			[Number.NEGATIVE_INFINITY, Number.NaN, Number.POSITIVE_INFINITY].forEach((value) => {
				checkThrows(schema, value);
			});

			// JSON coerces -0 to 0.  This succeeds because it does not change the type.
			[-0].forEach((value) => {
				checkCoerced(schema, value);
			});
		});

		describe("with schema [_.number, _.null]", () => {
			// JSON coerces non-finite numbers to 'null'.  This succeeds when 'null' is
			// permitted by schema.
			const schema = [schemaFactory.number, schemaFactory.null] as const;
			[Number.NEGATIVE_INFINITY, Number.NaN, Number.POSITIVE_INFINITY].forEach((value) =>
				checkCoerced(schema, value),
			);
		});
	});

	describe("string", () => {
		const schema = schemaFactory.string;
		[
			"", // empty string
			"!~", // printable ascii range
			"比特币", // non-ascii range
			"😂💁🏼‍♂️💁🏼‍💁‍♂", // surrogate pairs with glyph modifiers
		].forEach((value) => checkExact(schema, value));
	});
});
