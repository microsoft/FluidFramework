/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	jsonStringOfString,
	jsonStringOfObjectWithArrayOfNumbers,
	jsonStringOfStringRecordOfNumbers,
	jsonStringOfStringRecordOfNumberOrUndefined,
	jsonStringOfBigInt,
	jsonStringOfUnknown,
} from "./testValues.js";

import type { JsonString } from "@fluidframework/core-interfaces/internal";
import { JsonStringify } from "@fluidframework/core-interfaces/internal";

function parameterAcceptedAs<T>(_t: T): void {
	// Do nothing.  Used to verify type compatibility.
}

const jsonStringOfLiteral = JsonStringify("literal");

describe("JsonString", () => {
	it("`JsonString<string>` is assignable to `string`", () => {
		parameterAcceptedAs<string>(jsonStringOfString);
		parameterAcceptedAs<string>(jsonStringOfLiteral);
		parameterAcceptedAs<string>(jsonStringOfObjectWithArrayOfNumbers);
		parameterAcceptedAs<string>(jsonStringOfStringRecordOfNumbers);
		parameterAcceptedAs<string>(jsonStringOfStringRecordOfNumberOrUndefined);
		parameterAcceptedAs<string>(jsonStringOfBigInt);
		parameterAcceptedAs<string>(jsonStringOfUnknown);
	});

	it("`string` is not assignable to `JsonString<unknown>`", () => {
		parameterAcceptedAs<JsonString<unknown>>(
			// @ts-expect-error Type 'string' is not assignable to type 'JsonString<unknown>'
			"a string",
		);
	});

	it("object is not assignable to `JsonString<unknown>`", () => {
		parameterAcceptedAs<JsonString<unknown>>(
			// @ts-expect-error Type '{ property: string; }' is not assignable to type 'JsonString<unknown>'
			{ property: "value" },
		);
	});

	describe("is covariant over T", () => {
		it('`JsonString<"literal">` is assignable to `JsonString<string>`', () => {
			parameterAcceptedAs<JsonString<string>>(jsonStringOfLiteral);
		});

		it("`JsonString<Record<string, number>>` is assignable to `JsonString<Record<string, number | undefined>>`", () => {
			parameterAcceptedAs<JsonString<Record<string, number | undefined>>>(
				jsonStringOfStringRecordOfNumbers,
			);
		});

		it("`JsonString<Record<string, number | undefined>>` is assignable to `JsonString<Record<string, unknown>>`", () => {
			parameterAcceptedAs<JsonString<Record<string, unknown>>>(
				jsonStringOfStringRecordOfNumberOrUndefined,
			);
		});

		it("`JsonString<bigint>` is assignable to `JsonString<unknown>`", () => {
			parameterAcceptedAs<JsonString<unknown>>(jsonStringOfBigInt);
		});
	});

	describe("is not contravariant over T", () => {
		it('`JsonString<string>` is not assignable to `JsonString<"literal">`', () => {
			parameterAcceptedAs<JsonString<"literal">>(
				// @ts-expect-error Type 'string' is not assignable to type '"literal"'
				jsonStringOfString,
			);
		});

		it("`JsonString<Record<string, number | undefined>>` is not assignable to `JsonString<Record<string, number>>`", () => {
			parameterAcceptedAs<JsonString<Record<string, number>>>(
				// @ts-expect-error Type 'Record<string, number | undefined>' is not assignable to type 'Record<string, number>'
				jsonStringOfStringRecordOfNumberOrUndefined,
			);
		});

		it("`JsonString<unknown>` is not assignable to `JsonString<bigint>`", () => {
			parameterAcceptedAs<JsonString<bigint>>(
				// @ts-expect-error Type 'unknown' is not assignable to type 'bigint'
				jsonStringOfUnknown,
			);
		});
	});
});
