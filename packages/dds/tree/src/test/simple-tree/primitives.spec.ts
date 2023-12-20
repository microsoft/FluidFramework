/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ImplicitFieldSchema } from "../../class-tree";
// eslint-disable-next-line import/no-internal-modules
import { InsertableTreeFieldFromImplicitField } from "../../class-tree/internal";
import { getRoot, makeSchema, pretty } from "./utils";

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
	function checkExact<TSchema extends ImplicitFieldSchema>(
		schema: TSchema,
		value: InsertableTreeFieldFromImplicitField<TSchema>,
	) {
		// Paranoid check that the given value is in fact preserved.
		assert.deepEqual(
			value,
			JSON.parse(JSON.stringify(value)),
			`Expected ${pretty(value)} to be preserved by JSON.`,
		);

		it(`initialTree(${pretty(value)}) preserves ${typeof value} ${pretty(value)}`, () => {
			const actual = getRoot(schema, () => value);
			assert.deepEqual(actual, value, "Readback of initialTree must match expected value.");
		});

		// TODO: Consider improving coverage with more variations:
		// - reading/writting an object field
		// - reading/writting a list element
		// - reading/writting a map entry
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
	function getCoercedValue(value: any): unknown {
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
	function checkCoerced<TSchema extends ImplicitFieldSchema>(
		schema: TSchema,
		value: InsertableTreeFieldFromImplicitField<TSchema>,
	) {
		const coercedValue = getCoercedValue(value);

		it(`initialTree(${pretty(
			value,
		)}) is coerced to ${typeof coercedValue} ${coercedValue}`, () => {
			const actual = getRoot(schema, () => value);
			assert.deepEqual(
				actual,
				coercedValue,
				"Readback of initialTree must match expected value.",
			);
		});

		// TODO: Consider improving coverage with more variations:
		// - reading/writting an object field
		// - reading/writting a list element
		// - reading/writting a map entry
		// - optional
	}

	/**
	 * Verifies that attempting to write 'value' throws due to the coerced value violating the
	 * given schema.
	 *
	 * @param schema - Schema to use for the test (must include the coerced type of 'value'.)
	 * @param value - The value to be written/read/verified.
	 */
	function checkThrows<TSchema extends ImplicitFieldSchema>(
		schema: TSchema,
		value: InsertableTreeFieldFromImplicitField<TSchema>,
	) {
		const coercedValue = getCoercedValue(value);

		it(`initialTree(${pretty(
			value,
		)}) throws when coercion to ${typeof value}' ${coercedValue}' violates schema.`, () => {
			assert.throws(
				() => getRoot(schema, () => value),
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
		const schema = makeSchema((_) => _.null);
		checkExact(schema, null);
	});

	describe("boolean", () => {
		const schema = makeSchema((_) => _.boolean);
		[true, false].forEach((value) => checkExact(schema, value));
	});

	describe("number", () => {
		describe("with schema [_.number]", () => {
			const schema = makeSchema((_) => _.number);

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
			[-Infinity, NaN, Infinity].forEach((value) => {
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
			const schema = makeSchema((_) => [_.number, _.null]);
			[-Infinity, NaN, Infinity].forEach((value) => checkCoerced(schema, value));
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
