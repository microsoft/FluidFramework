/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { JsonString } from "@fluidframework/core-interfaces/internal";
import { JsonStringify } from "@fluidframework/core-interfaces/internal";

import { assertIdenticalTypes, createInstanceOf, parameterAcceptedAs } from "./testUtils.js";
import type { ConstHeterogenousEnum, NumericEnum } from "./testValues.js";
import {
	jsonStringOfString,
	jsonStringOfObjectWithArrayOfNumbers,
	jsonStringOfStringRecordOfNumbers,
	jsonStringOfStringRecordOfNumberOrUndefined,
	jsonStringOfBigInt,
	jsonStringOfUnknown,
} from "./testValues.js";

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

		it("`JsonString<A> | JsonString<B>` is assignable to `JsonString<A | B>`", () => {
			const jsonStringUnion =
				Math.random() < 0.5 ? jsonStringOfString : jsonStringOfObjectWithArrayOfNumbers;

			parameterAcceptedAs<JsonString<string | { arrayOfNumbers: number[] }>>(jsonStringUnion);
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

		it("`JsonString<A | B>` is not assignable to `JsonString<A>`", () => {
			parameterAcceptedAs<JsonString<string>>(
				// @ts-expect-error Type 'JsonString<string | { arrayOfNumbers: number[]; }>' is not assignable to type 'JsonString<string>'
				jsonStringOfString as JsonString<string | { arrayOfNumbers: number[] }>,
			);
		});
	});

	type ExtractJsonStringBrand<T extends JsonString<unknown>> = T extends string & infer B
		? B
		: never;

	// Practically `JsonString<A | B>` is the same as `JsonString<A> | JsonString<B>`
	// since all encodings are the same and parsing from either produces the same
	// `A|B` result.
	it("`JsonString<A | B>` is assignable to `JsonString<A> | JsonString<B>` without enums involved", () => {
		// Setup
		const explicitBrandUnion = createInstanceOf<
			string &
				(
					| ExtractJsonStringBrand<JsonString<string>>
					| ExtractJsonStringBrand<JsonString<{ arrayOfNumbers: number[] }>>
				)
		>();
		const explicitPostBrandUnion = createInstanceOf<
			| (string & ExtractJsonStringBrand<JsonString<string>>)
			| (string & ExtractJsonStringBrand<JsonString<{ arrayOfNumbers: number[] }>>)
		>();
		assertIdenticalTypes(explicitBrandUnion, explicitPostBrandUnion);
		assertIdenticalTypes(
			explicitBrandUnion,
			createInstanceOf<JsonString<string | { arrayOfNumbers: number[] }>>(),
		);
		assertIdenticalTypes(
			explicitPostBrandUnion,
			createInstanceOf<JsonString<string> | JsonString<{ arrayOfNumbers: number[] }>>(),
		);
		assertIdenticalTypes(
			createInstanceOf<JsonString<string | { arrayOfNumbers: number[] }>>(),
			createInstanceOf<JsonString<string> | JsonString<{ arrayOfNumbers: number[] }>>(),
		);
		// Act and Verify
		parameterAcceptedAs<JsonString<string> | JsonString<{ arrayOfNumbers: number[] }>>(
			jsonStringOfString as JsonString<string | { arrayOfNumbers: number[] }>,
		);
	});

	it("`JsonString<A | B>` is assignable to `JsonString<A> | JsonString<B>` with enums involved", () => {
		parameterAcceptedAs<JsonString<NumericEnum> | JsonString<{ arrayOfNumbers: number[] }>>(
			createInstanceOf<JsonString<NumericEnum | { arrayOfNumbers: number[] }>>(),
		);

		parameterAcceptedAs<
			JsonString<NumericEnum | "other"> | JsonString<{ arrayOfNumbers: number[] }>
		>(createInstanceOf<JsonString<NumericEnum | "other" | { arrayOfNumbers: number[] }>>());

		parameterAcceptedAs<JsonString<NumericEnum> | JsonString<ConstHeterogenousEnum>>(
			createInstanceOf<JsonString<NumericEnum | ConstHeterogenousEnum>>(),
		);
	});
});
