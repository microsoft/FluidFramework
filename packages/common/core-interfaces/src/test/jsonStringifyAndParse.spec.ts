/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable unicorn/no-null */

import { strict as assert } from "node:assert";

import type {
	JsonString,
	JsonStringifyOptions,
} from "@fluidframework/core-interfaces/internal";
import { JsonParse, JsonStringify } from "@fluidframework/core-interfaces/internal";
import type {
	JsonDeserialized,
	JsonSerializable,
	JsonTypeWith,
	NonNullJsonObjectWith,
	OpaqueJsonDeserialized,
} from "@fluidframework/core-interfaces/internal/exposedUtilityTypes";

import { assertIdenticalTypes, createInstanceOf } from "./testUtils.js";
import type {
	BrandedString,
	DeserializedOpaqueSerializableInRecursiveStructure,
	DeserializedOpaqueSerializableAndDeserializedInRecursiveStructure,
	ObjectWithOptionalRecursion,
	ObjectWithSymbolOrRecursion,
} from "./testValues.js";
// Note: some values are commented out as not interesting to add coverage for (but acknowledge they exist to test).
// This import list should be kept mostly in-sync with jsonDeserialized.spec.ts.
import {
	boolean,
	number,
	string,
	numericEnumValue,
	NumericEnum,
	stringEnumValue,
	StringEnum,
	constHeterogenousEnumValue,
	ConstHeterogenousEnum,
	computedEnumValue,
	ComputedEnum,
	objectWithLiterals,
	arrayOfLiterals,
	tupleWithLiterals,
	symbol,
	uniqueSymbol,
	bigint,
	aFunction,
	// unknownValueOfSimpleRecord,
	// unknownValueWithBigint,
	voidValue,
	stringOrSymbol,
	bigintOrString,
	bigintOrSymbol,
	numberOrBigintOrSymbol,
	functionWithProperties,
	objectAndFunction,
	arrayOfNumbers,
	arrayOfNumbersSparse,
	arrayOfNumbersOrUndefined,
	arrayOfBigints,
	arrayOfSymbols,
	arrayOfUnknown,
	arrayOfFunctions,
	arrayOfFunctionsWithProperties,
	arrayOfObjectAndFunctions,
	arrayOfBigintOrObjects,
	arrayOfSymbolOrObjects,
	arrayOfBigintOrSymbols,
	arrayOfNumberBigintOrSymbols,
	readonlyArrayOfNumbers,
	readonlyArrayOfObjects,
	object,
	emptyObject,
	objectWithBoolean,
	objectWithNumber,
	objectWithString,
	objectWithSymbol,
	objectWithBigint,
	objectWithFunction,
	objectWithFunctionWithProperties,
	objectWithObjectAndFunction,
	objectWithBigintOrString,
	objectWithBigintOrSymbol,
	objectWithNumberOrBigintOrSymbol,
	objectWithFunctionOrSymbol,
	objectWithStringOrSymbol,
	objectWithUndefined,
	objectWithUnknown,
	objectWithOptionalUnknown,
	// Skipped as type checking varies with exactOptionalPropertyTypes setting. See
	// jsonDeserialized.spec.ts, jsonSerializable.exactOptionalPropertyTypes.true.spec.ts,
	// and jsonSerializable.exactOptionalPropertyTypes.false.spec.ts.
	// objectWithOptionalUndefined,
	objectWithOptionalSymbol,
	objectWithOptionalBigint,
	objectWithNumberKey,
	objectWithSymbolKey,
	objectWithUniqueSymbolKey,
	objectWithArrayOfNumbers,
	objectWithArrayOfNumbersSparse,
	objectWithArrayOfNumbersOrUndefined,
	objectWithArrayOfBigints,
	objectWithArrayOfSymbols,
	objectWithArrayOfUnknown,
	objectWithArrayOfFunctions,
	objectWithArrayOfFunctionsWithProperties,
	objectWithArrayOfObjectAndFunctions,
	objectWithArrayOfBigintOrObjects,
	objectWithArrayOfSymbolOrObjects,
	objectWithReadonlyArrayOfNumbers,
	objectWithOptionalNumberNotPresent,
	objectWithOptionalNumberUndefined,
	objectWithOptionalNumberDefined,
	objectWithNumberOrUndefinedUndefined,
	objectWithNumberOrUndefinedNumbered,
	objectWithOptionalUndefinedEnclosingRequiredUndefined,
	objectWithReadonly,
	objectWithReadonlyViaGetter,
	objectWithGetter,
	objectWithGetterViaValue,
	objectWithSetter,
	objectWithSetterViaValue,
	objectWithMatchedGetterAndSetterProperty,
	objectWithMatchedGetterAndSetterPropertyViaValue,
	objectWithMismatchedGetterAndSetterProperty,
	objectWithMismatchedGetterAndSetterPropertyViaValue,
	objectWithNever,
	stringRecordOfNumbers,
	stringRecordOfUndefined,
	stringRecordOfNumberOrUndefined,
	stringRecordOfSymbolOrBoolean,
	stringRecordOfUnknown,
	stringOrNumberRecordOfStrings,
	stringOrNumberRecordOfObjects,
	partialStringRecordOfNumbers,
	partialStringRecordOfUnknown,
	templatedRecordOfNumbers,
	partialTemplatedRecordOfNumbers,
	// templatedRecordOfUnknown,
	// mixedRecordOfUnknown,
	stringRecordOfNumbersOrStringsWithKnownProperties,
	// stringRecordOfUnknownWithKnownProperties,
	// partialStringRecordOfUnknownWithKnownProperties,
	// stringRecordOfUnknownWithOptionalKnownProperties,
	// stringRecordOfUnknownWithKnownUnknown,
	// stringRecordOfUnknownWithOptionalKnownUnknown,
	stringOrNumberRecordOfStringWithKnownNumber,
	stringOrNumberRecordOfUndefinedWithKnownNumber,
	objectWithPossibleRecursion,
	objectWithOptionalRecursion,
	objectWithEmbeddedRecursion,
	objectWithAlternatingRecursion,
	objectWithSelfReference,
	objectWithSymbolOrRecursion,
	objectWithUnknownAdjacentToOptionalRecursion,
	// objectWithOptionalUnknownAdjacentToOptionalRecursion,
	objectWithUnknownInOptionalRecursion,
	// objectWithOptionalUnknownInOptionalRecursion,
	selfRecursiveFunctionWithProperties,
	selfRecursiveObjectAndFunction,
	objectInheritingOptionalRecursionAndWithNestedSymbol,
	simpleJson,
	simpleImmutableJson,
	jsonObject,
	immutableJsonObject,
	classInstanceWithPrivateData,
	classInstanceWithPrivateMethod,
	classInstanceWithPrivateGetter,
	classInstanceWithPrivateSetter,
	classInstanceWithPublicData,
	classInstanceWithPublicMethod,
	objectWithClassWithPrivateDataInOptionalRecursion,
	functionObjectWithPrivateData,
	functionObjectWithPublicData,
	classInstanceWithPrivateDataAndIsFunction,
	classInstanceWithPublicDataAndIsFunction,
	// These `ClassWith*` values are used to verify `instanceof` results of
	// parse and not expected to be test cases themselves.
	ClassWithPrivateData,
	ClassWithPrivateMethod,
	ClassWithPrivateGetter,
	ClassWithPrivateSetter,
	ClassWithPublicData,
	ClassWithPublicMethod,
	mapOfStringsToNumbers,
	readonlyMapOfStringsToNumbers,
	setOfNumbers,
	readonlySetOfNumbers,
	brandedNumber,
	brandedString,
	brandedObject,
	brandedObjectWithString,
	objectWithBrandedNumber,
	objectWithBrandedString,
	brandedStringIndexOfBooleans,
	brandedStringAliasIndexOfBooleans,
	brandedStringRecordOfBooleans,
	brandedStringAliasRecordOfBooleans,
	brandedStringIndexOfNumbers,
	brandedStringAliasIndexOfNumbers,
	brandedStringRecordOfNumbers,
	brandedStringAliasRecordOfNumbers,
	brandedStringAliasIndexOfTrueOrUndefined,
	datastore,
	fluidHandleToNumber,
	objectWithFluidHandle,
	// objectWithFluidHandleOrRecursion,
	opaqueSerializableObject,
	opaqueDeserializedObject,
	opaqueSerializableAndDeserializedObject,
	opaqueSerializableUnknown,
	opaqueDeserializedUnknown,
	opaqueSerializableAndDeserializedUnknown,
	objectWithOpaqueSerializableUnknown,
	objectWithOpaqueDeserializedUnknown,
	opaqueSerializableInRecursiveStructure,
	opaqueDeserializedInRecursiveStructure,
	opaqueSerializableAndDeserializedInRecursiveStructure,
	opaqueSerializableObjectRequiringBigintSupport,
	opaqueDeserializedObjectRequiringBigintSupport,
	opaqueSerializableAndDeserializedObjectRequiringBigintSupport,
	opaqueSerializableObjectExpectingBigintSupport,
	opaqueDeserializedObjectExpectingBigintSupport,
	opaqueSerializableAndDeserializedObjectExpectingBigintSupport,
	jsonStringOfString,
	jsonStringOfObjectWithArrayOfNumbers,
	jsonStringOfStringRecordOfNumbers,
	jsonStringOfStringRecordOfNumberOrUndefined,
	jsonStringOfBigInt,
	jsonStringOfUnknown,
} from "./testValues.js";

/**
 * Defined combining known API for `JsonStringify` and `JsonParse` - effectively
 * it should always be a proxy for their use.
 * Internally, value given is sent through `JsonStringify` (captured) and then
 * sent through `JsonParse` to ensure it is unchanged or converted to given
 * optional expected value.
 *
 * @param v - value to pass through JSON serialization
 * @param expectedDeserialization - alternate value to compare against after round-trip
 * @returns record of the serialized and deserialized
 * results as `stringified` and `out` respectively.
 */
export function stringifyThenParse<
	const T,
	TExpected,
	Options extends JsonStringifyOptions = Record<never, never>,
>(
	v: JsonSerializable<T, Pick<Options, Extract<keyof JsonStringifyOptions, keyof Options>>>,
	expectedDeserialization?: JsonDeserialized<TExpected>,
): {
	stringified: ReturnType<typeof JsonStringify<T, Options>>;
	out: ReturnType<typeof JsonParse<ReturnType<typeof JsonStringify<T, Options>>>>;
	// Replace above with below if `JsonParse` argument is `JsonString<T>`
	// out: ReturnType<typeof JsonParse<T>>;
} {
	const stringified = JsonStringify(v);
	if (stringified === undefined) {
		throw new Error("JSON.stringify returned undefined");
	}
	if (expectedDeserialization !== undefined) {
		// When there is a failure, checking the stringified value can be helpful.
		const expectedStringified = JSON.stringify(expectedDeserialization);
		assert.equal(stringified, expectedStringified);
	}
	const result = JsonParse(stringified);
	// Don't use nullish coalescing here to allow for `null` to be expected.
	const expected =
		// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
		expectedDeserialization === undefined ? v : expectedDeserialization;
	assert.deepStrictEqual(result, expected);
	return { stringified, out: result };
}

/**
 * Similar to {@link stringifyThenParse} but ignores hidden (private/protected) members.
 */
function stringifyIgnoringInaccessibleMembersThenParse<const T, TExpected>(
	v: JsonSerializable<T, { IgnoreInaccessibleMembers: "ignore-inaccessible-members" }>,
	expected?: JsonDeserialized<TExpected>,
): ReturnType<
	typeof stringifyThenParse<
		T,
		TExpected,
		{ IgnoreInaccessibleMembers: "ignore-inaccessible-members" }
	>
> {
	return stringifyThenParse<
		T,
		TExpected,
		{ IgnoreInaccessibleMembers: "ignore-inaccessible-members" }
	>(v, expected);
}

describe("JsonStringify and JsonParse", () => {
	describe("expected usage", () => {
		describe("supports primitive types", () => {
			it("`boolean`", () => {
				const { stringified, out } = stringifyThenParse(boolean);
				assertIdenticalTypes(stringified, createInstanceOf<JsonString<boolean>>());
				assertIdenticalTypes(out, boolean);
			});
			it("`number`", () => {
				const { stringified, out } = stringifyThenParse(number);
				assertIdenticalTypes(stringified, createInstanceOf<JsonString<number>>());
				assertIdenticalTypes(out, number);
			});
			it("`string`", () => {
				const { stringified, out } = stringifyThenParse(string);
				assertIdenticalTypes(stringified, createInstanceOf<JsonString<string>>());
				assertIdenticalTypes(out, string);
			});
			it("numeric enum", () => {
				const { stringified, out } = stringifyThenParse(numericEnumValue);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<JsonString<typeof numericEnumValue>>(),
				);
				assertIdenticalTypes(out, numericEnumValue);
			});
			it("string enum", () => {
				const { stringified, out } = stringifyThenParse(stringEnumValue);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<JsonString<typeof stringEnumValue>>(),
				);
				assertIdenticalTypes(out, stringEnumValue);
			});
			it("const heterogenous enum", () => {
				const { stringified, out } = stringifyThenParse(constHeterogenousEnumValue);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<JsonString<typeof constHeterogenousEnumValue>>(),
				);
				assertIdenticalTypes(out, constHeterogenousEnumValue);
			});
			it("computed enum", () => {
				const { stringified, out } = stringifyThenParse(computedEnumValue);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<JsonString<typeof computedEnumValue>>(),
				);
				assertIdenticalTypes(out, computedEnumValue);
			});
			it("branded `number`", () => {
				const { stringified, out } = stringifyThenParse(brandedNumber);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<JsonString<typeof brandedNumber>>(),
				);
				assertIdenticalTypes(out, brandedNumber);
			});
			it("branded `string`", () => {
				const { stringified, out } = stringifyThenParse(brandedString);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<JsonString<typeof brandedString>>(),
				);
				assertIdenticalTypes(out, brandedString);
			});
			it("`JsonString<string>`", () => {
				const { stringified, out } = stringifyThenParse(jsonStringOfString);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<JsonString<typeof jsonStringOfString>>(),
				);
				assertIdenticalTypes(out, jsonStringOfString);
			});
			it("`JsonString<{ arrayOfNumbers: number[] }>`", () => {
				const { stringified, out } = stringifyThenParse(jsonStringOfObjectWithArrayOfNumbers);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<JsonString<typeof jsonStringOfObjectWithArrayOfNumbers>>(),
				);
				assertIdenticalTypes(out, jsonStringOfObjectWithArrayOfNumbers);
			});
			it("`JsonString<Record<string, number>>`", () => {
				const { stringified, out } = stringifyThenParse(jsonStringOfStringRecordOfNumbers);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<JsonString<typeof jsonStringOfStringRecordOfNumbers>>(),
				);
				assertIdenticalTypes(out, jsonStringOfStringRecordOfNumbers);
			});
			it("`JsonString<Record<string, number | undefined>>`", () => {
				const { stringified, out } = stringifyThenParse(
					jsonStringOfStringRecordOfNumberOrUndefined,
				);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<JsonString<typeof jsonStringOfStringRecordOfNumberOrUndefined>>(),
				);
				assertIdenticalTypes(out, jsonStringOfStringRecordOfNumberOrUndefined);
			});
			it("`JsonString<bigint>`", () => {
				const { stringified, out } = stringifyThenParse(jsonStringOfBigInt);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<JsonString<typeof jsonStringOfBigInt>>(),
				);
				assertIdenticalTypes(out, jsonStringOfBigInt);
			});
			it("`JsonString<unknown>`", () => {
				const { stringified, out } = stringifyThenParse(jsonStringOfUnknown);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<JsonString<typeof jsonStringOfUnknown>>(),
				);
				assertIdenticalTypes(out, jsonStringOfUnknown);
			});
		});

		describe("supports literal types", () => {
			it("`true`", () => {
				const { stringified, out } = stringifyThenParse(true);
				assertIdenticalTypes(stringified, createInstanceOf<JsonString<true>>());
				assertIdenticalTypes(out, true);
			});
			it("`false`", () => {
				const { stringified, out } = stringifyThenParse(false);
				assertIdenticalTypes(stringified, createInstanceOf<JsonString<false>>());
				assertIdenticalTypes(out, false);
			});
			it("`0`", () => {
				const { stringified, out } = stringifyThenParse(0);
				assertIdenticalTypes(stringified, createInstanceOf<JsonString<0>>());
				assertIdenticalTypes(out, 0);
			});
			it('"string"', () => {
				const { stringified, out } = stringifyThenParse("string");
				assertIdenticalTypes(stringified, createInstanceOf<JsonString<"string">>());
				assertIdenticalTypes(out, "string");
			});
			it("`null`", () => {
				const { stringified, out } = stringifyThenParse(null);
				assertIdenticalTypes(stringified, createInstanceOf<JsonString<null>>());
				assertIdenticalTypes(out, null);
			});
			it("object with literals", () => {
				const { stringified, out } = stringifyThenParse(objectWithLiterals);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<JsonString<typeof objectWithLiterals>>(),
				);
				assertIdenticalTypes(out, objectWithLiterals);
			});
			it("array of literals", () => {
				const { stringified, out } = stringifyThenParse(arrayOfLiterals);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<JsonString<typeof arrayOfLiterals>>(),
				);
				assertIdenticalTypes(out, arrayOfLiterals);
			});
			it("tuple of literals", () => {
				const { stringified, out } = stringifyThenParse(tupleWithLiterals);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<JsonString<typeof tupleWithLiterals>>(),
				);
				assertIdenticalTypes(out, tupleWithLiterals);
			});
			it("specific numeric enum value", () => {
				const { stringified, out } = stringifyThenParse(NumericEnum.two);
				assertIdenticalTypes(stringified, createInstanceOf<JsonString<NumericEnum.two>>());
				assertIdenticalTypes(out, NumericEnum.two);
			});
			it("specific string enum value", () => {
				const { stringified, out } = stringifyThenParse(StringEnum.b);
				assertIdenticalTypes(stringified, createInstanceOf<JsonString<StringEnum.b>>());
				assertIdenticalTypes(out, StringEnum.b);
			});
			it("specific const heterogenous enum value", () => {
				const { stringified, out } = stringifyThenParse(ConstHeterogenousEnum.zero);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<JsonString<ConstHeterogenousEnum.zero>>(),
				);
				assertIdenticalTypes(out, ConstHeterogenousEnum.zero);
			});
			it("specific computed enum value", () => {
				const { stringified, out } = stringifyThenParse(ComputedEnum.computed);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<JsonString<ComputedEnum.computed>>(),
				);
				assertIdenticalTypes(out, ComputedEnum.computed);
			});
		});

		describe("supports array types", () => {
			it("array of `number`s", () => {
				const { stringified, out } = stringifyThenParse(arrayOfNumbers);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<JsonString<typeof arrayOfNumbers>>(),
				);
				assertIdenticalTypes(out, arrayOfNumbers);
			});
			it("readonly array of `number`s", () => {
				const { stringified, out } = stringifyThenParse(readonlyArrayOfNumbers);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<JsonString<typeof readonlyArrayOfNumbers>>(),
				);
				assertIdenticalTypes(out, readonlyArrayOfNumbers);
			});
			it("readonly array of simple objects", () => {
				const { stringified, out } = stringifyThenParse(readonlyArrayOfObjects);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<JsonString<typeof readonlyArrayOfObjects>>(),
				);
				assertIdenticalTypes(out, readonlyArrayOfObjects);
			});
		});

		describe("supports object types", () => {
			it("empty object", () => {
				const { stringified, out } = stringifyThenParse(emptyObject);
				assertIdenticalTypes(stringified, createInstanceOf<JsonString<typeof emptyObject>>());
				assertIdenticalTypes(out, emptyObject);
			});

			it("object with `never`", () => {
				const { stringified, out } = stringifyThenParse(objectWithNever);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<JsonString<typeof objectWithNever>>(),
				);
				// @ts-expect-error `out` removes `never` type and thus difference is expected.
				assertIdenticalTypes(out, objectWithNever);
				assertIdenticalTypes(out, {});
			});

			it("object with `boolean`", () => {
				const { stringified, out } = stringifyThenParse(objectWithBoolean);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<JsonString<typeof objectWithBoolean>>(),
				);
				assertIdenticalTypes(out, objectWithBoolean);
			});
			it("object with `number`", () => {
				const { stringified, out } = stringifyThenParse(objectWithNumber);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<JsonString<typeof objectWithNumber>>(),
				);
				assertIdenticalTypes(out, objectWithNumber);
			});
			it("object with `string`", () => {
				const { stringified, out } = stringifyThenParse(objectWithString);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<JsonString<typeof objectWithString>>(),
				);
				assertIdenticalTypes(out, objectWithString);
			});

			it("object with number key", () => {
				const { stringified, out } = stringifyThenParse(objectWithNumberKey);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<JsonString<typeof objectWithNumberKey>>(),
				);
				assertIdenticalTypes(out, objectWithNumberKey);
			});

			it("object with array of `number`s", () => {
				const { stringified, out } = stringifyThenParse(objectWithArrayOfNumbers);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<JsonString<typeof objectWithArrayOfNumbers>>(),
				);
				assertIdenticalTypes(out, objectWithArrayOfNumbers);
			});
			it("readonly array of `number`s", () => {
				const { stringified, out } = stringifyThenParse(objectWithReadonlyArrayOfNumbers);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<JsonString<typeof objectWithReadonlyArrayOfNumbers>>(),
				);
				assertIdenticalTypes(out, objectWithReadonlyArrayOfNumbers);
			});

			it("object with branded `number`", () => {
				const { stringified, out } = stringifyThenParse(objectWithBrandedNumber);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<JsonString<typeof objectWithBrandedNumber>>(),
				);
				assertIdenticalTypes(out, objectWithBrandedNumber);
			});
			it("object with branded `string`", () => {
				const { stringified, out } = stringifyThenParse(objectWithBrandedString);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<JsonString<typeof objectWithBrandedString>>(),
				);
				assertIdenticalTypes(out, objectWithBrandedString);
			});

			it("`string` indexed record of `number`s", () => {
				const { stringified, out } = stringifyThenParse(stringRecordOfNumbers);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<JsonString<typeof stringRecordOfNumbers>>(),
				);
				assertIdenticalTypes(out, stringRecordOfNumbers);
			});
			it("`string`|`number` indexed record of `string`s", () => {
				const { stringified, out } = stringifyThenParse(stringOrNumberRecordOfStrings);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<JsonString<typeof stringOrNumberRecordOfStrings>>(),
				);
				assertIdenticalTypes(out, stringOrNumberRecordOfStrings);
			});
			it("`string`|`number` indexed record of objects", () => {
				const { stringified, out } = stringifyThenParse(stringOrNumberRecordOfObjects);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<JsonString<typeof stringOrNumberRecordOfObjects>>(),
				);
				assertIdenticalTypes(out, stringOrNumberRecordOfObjects);
			});
			it("templated record of `numbers`", () => {
				const { stringified, out } = stringifyThenParse(templatedRecordOfNumbers);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<JsonString<typeof templatedRecordOfNumbers>>(),
				);
				assertIdenticalTypes(out, templatedRecordOfNumbers);
			});
			it("`string` indexed record of `number`|`string`s with known properties", () => {
				const { stringified, out } = stringifyThenParse(
					stringRecordOfNumbersOrStringsWithKnownProperties,
				);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<
						JsonString<typeof stringRecordOfNumbersOrStringsWithKnownProperties>
					>(),
				);
				assertIdenticalTypes(out, stringRecordOfNumbersOrStringsWithKnownProperties);
			});
			it("`string`|`number` indexed record of `strings` with known `number` property (unassignable)", () => {
				const { stringified, out } = stringifyThenParse(
					stringOrNumberRecordOfStringWithKnownNumber,
				);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<JsonString<typeof stringOrNumberRecordOfStringWithKnownNumber>>(),
				);
				assertIdenticalTypes(out, stringOrNumberRecordOfStringWithKnownNumber);
			});

			it("branded-`string` indexed of `boolean`s", () => {
				const { stringified, out } = stringifyThenParse(brandedStringIndexOfBooleans);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<JsonString<typeof brandedStringIndexOfBooleans>>(),
				);
				assertIdenticalTypes(out, brandedStringIndexOfBooleans);
			});
			it("branded-`string` alias indexed of `boolean`s", () => {
				const { stringified, out } = stringifyThenParse(brandedStringAliasIndexOfBooleans);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<JsonString<typeof brandedStringAliasIndexOfBooleans>>(),
				);
				assertIdenticalTypes(out, brandedStringAliasIndexOfBooleans);
			});
			it("branded-`string` record of `boolean`s", () => {
				const { stringified, out } = stringifyThenParse(brandedStringRecordOfBooleans);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<JsonString<typeof brandedStringRecordOfBooleans>>(),
				);
				assertIdenticalTypes(out, brandedStringRecordOfBooleans);
			});
			it("branded-`string` alias record of `boolean`s", () => {
				const { stringified, out } = stringifyThenParse(brandedStringAliasRecordOfBooleans);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<JsonString<typeof brandedStringAliasRecordOfBooleans>>(),
				);
				assertIdenticalTypes(out, brandedStringAliasRecordOfBooleans);
			});
			it("branded-`string` indexed of `number`s", () => {
				const { stringified, out } = stringifyThenParse(brandedStringIndexOfNumbers);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<JsonString<typeof brandedStringIndexOfNumbers>>(),
				);
				assertIdenticalTypes(out, brandedStringIndexOfNumbers);
			});
			it("branded-`string` alias indexed of `number`s", () => {
				const { stringified, out } = stringifyThenParse(brandedStringAliasIndexOfNumbers);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<JsonString<typeof brandedStringAliasIndexOfNumbers>>(),
				);
				assertIdenticalTypes(out, brandedStringAliasIndexOfNumbers);
			});
			it("branded-`string` record of `number`s", () => {
				const { stringified, out } = stringifyThenParse(brandedStringRecordOfNumbers);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<JsonString<typeof brandedStringRecordOfNumbers>>(),
				);
				assertIdenticalTypes(out, brandedStringRecordOfNumbers);
			});
			it("branded-`string` alias record of `number`s", () => {
				const { stringified, out } = stringifyThenParse(brandedStringAliasRecordOfNumbers);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<JsonString<typeof brandedStringAliasRecordOfNumbers>>(),
				);
				assertIdenticalTypes(out, brandedStringAliasRecordOfNumbers);
			});

			it("object with possible type recursion through union", () => {
				const { stringified, out } = stringifyThenParse(objectWithPossibleRecursion);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<JsonString<typeof objectWithPossibleRecursion>>(),
				);
				assertIdenticalTypes(out, objectWithPossibleRecursion);
			});
			it("object with optional type recursion", () => {
				const { stringified, out } = stringifyThenParse(objectWithOptionalRecursion);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<JsonString<typeof objectWithOptionalRecursion>>(),
				);
				assertIdenticalTypes(out, objectWithOptionalRecursion);
			});
			it("object with deep type recursion", () => {
				const { stringified, out } = stringifyThenParse(objectWithEmbeddedRecursion);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<JsonString<typeof objectWithEmbeddedRecursion>>(),
				);
				assertIdenticalTypes(out, objectWithEmbeddedRecursion);
			});
			it("object with alternating type recursion", () => {
				const { stringified, out } = stringifyThenParse(objectWithAlternatingRecursion);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<JsonString<typeof objectWithAlternatingRecursion>>(),
				);
				assertIdenticalTypes(out, objectWithAlternatingRecursion);
			});

			it("simple non-null object json (NonNullJsonObjectWith<never>)", () => {
				const { stringified, out } = stringifyThenParse(jsonObject);
				assertIdenticalTypes(stringified, createInstanceOf<JsonString<typeof jsonObject>>());
				assertIdenticalTypes(out, jsonObject);
			});
			it("simple read-only non-null object json (ReadonlyNonNullJsonObjectWith<never>)", () => {
				const { stringified, out } = stringifyThenParse(immutableJsonObject);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<JsonString<typeof immutableJsonObject>>(),
				);
				assertIdenticalTypes(out, immutableJsonObject);
			});

			it("non-const enums", () => {
				// Note: typescript doesn't do a great job checking that a filtered type satisfies an enum
				// type. The numeric indices are not checked. So far most robust inspection is manually
				// after any change.
				const { stringified: resultNumeric, out: outNumeric } =
					stringifyThenParse(NumericEnum);
				assertIdenticalTypes(
					resultNumeric,
					createInstanceOf<JsonString<typeof NumericEnum>>(),
				);
				assertIdenticalTypes(outNumeric, NumericEnum);
				const { stringified: resultString, out: outString } = stringifyThenParse(StringEnum);
				assertIdenticalTypes(resultString, createInstanceOf<JsonString<typeof StringEnum>>());
				assertIdenticalTypes(outString, StringEnum);
				const { stringified: resultComputed, out: outComputed } =
					stringifyThenParse(ComputedEnum);
				assertIdenticalTypes(
					resultComputed,
					createInstanceOf<JsonString<typeof ComputedEnum>>(),
				);
				assertIdenticalTypes(outComputed, ComputedEnum);
			});

			it("object with `readonly`", () => {
				const { stringified, out } = stringifyThenParse(objectWithReadonly);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<JsonString<typeof objectWithReadonly>>(),
				);
				assertIdenticalTypes(out, objectWithReadonly);
			});

			it("object with getter implemented via value", () => {
				const { stringified, out } = stringifyThenParse(objectWithGetterViaValue);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<JsonString<typeof objectWithGetterViaValue>>(),
				);
				assertIdenticalTypes(out, objectWithGetterViaValue);
			});
			it("object with setter implemented via value", () => {
				const { stringified, out } = stringifyThenParse(objectWithSetterViaValue);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<JsonString<typeof objectWithSetterViaValue>>(),
				);
				assertIdenticalTypes(out, objectWithSetterViaValue);
			});
			it("object with matched getter and setter implemented via value", () => {
				const { stringified, out } = stringifyThenParse(
					objectWithMatchedGetterAndSetterPropertyViaValue,
				);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<
						JsonString<typeof objectWithMatchedGetterAndSetterPropertyViaValue>
					>(),
				);
				assertIdenticalTypes(out, objectWithMatchedGetterAndSetterPropertyViaValue);
			});
			it("object with mismatched getter and setter implemented via value", () => {
				const { stringified, out } = stringifyThenParse(
					objectWithMismatchedGetterAndSetterPropertyViaValue,
				);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<
						JsonString<typeof objectWithMismatchedGetterAndSetterPropertyViaValue>
					>(),
				);
				assertIdenticalTypes(out, objectWithMismatchedGetterAndSetterPropertyViaValue);
			});

			describe("class instance (losing 'instanceof' nature)", () => {
				it("with public data (just cares about data)", () => {
					const { stringified, out } = stringifyThenParse(classInstanceWithPublicData, {
						public: "public",
					});
					assertIdenticalTypes(
						stringified,
						createInstanceOf<JsonString<typeof classInstanceWithPublicData>>(),
					);
					assertIdenticalTypes(out, classInstanceWithPublicData);
					assert.ok(
						classInstanceWithPublicData instanceof ClassWithPublicData,
						"classInstanceWithPublicData is an instance of ClassWithPublicData",
					);
					assert.ok(
						!(out instanceof ClassWithPublicData),
						"out is not an instance of ClassWithPublicData",
					);
				});
				describe("with `ignore-inaccessible-members`", () => {
					it("with private method ignores method", () => {
						const { stringified, out } = stringifyIgnoringInaccessibleMembersThenParse(
							classInstanceWithPrivateMethod,
							{
								public: "public",
							},
						);
						assertIdenticalTypes(
							stringified,
							createInstanceOf<JsonString<typeof classInstanceWithPrivateMethod>>(),
						);
						assertIdenticalTypes(
							out,
							createInstanceOf<{
								public: string;
							}>(),
						);
						// @ts-expect-error getSecret is missing, but required
						out satisfies typeof classInstanceWithPrivateMethod;
						// @ts-expect-error getSecret is missing, but required
						assertIdenticalTypes(out, classInstanceWithPrivateMethod);
						assert.ok(
							classInstanceWithPrivateMethod instanceof ClassWithPrivateMethod,
							"classInstanceWithPrivateMethod is an instance of ClassWithPrivateMethod",
						);
						assert.ok(
							!(out instanceof ClassWithPrivateMethod),
							"out is not an instance of ClassWithPrivateMethod",
						);
					});
					it("with private getter ignores getter", () => {
						const { stringified, out } = stringifyIgnoringInaccessibleMembersThenParse(
							classInstanceWithPrivateGetter,
							{
								public: "public",
							},
						);
						assertIdenticalTypes(
							stringified,
							createInstanceOf<JsonString<typeof classInstanceWithPrivateGetter>>(),
						);
						assertIdenticalTypes(
							out,
							createInstanceOf<{
								public: string;
							}>(),
						);
						// @ts-expect-error secret is missing, but required
						out satisfies typeof classInstanceWithPrivateGetter;
						// @ts-expect-error secret is missing, but required
						assertIdenticalTypes(out, classInstanceWithPrivateGetter);
						assert.ok(
							classInstanceWithPrivateGetter instanceof ClassWithPrivateGetter,
							"classInstanceWithPrivateGetter is an instance of ClassWithPrivateGetter",
						);
						assert.ok(
							!(out instanceof ClassWithPrivateGetter),
							"out is not an instance of ClassWithPrivateGetter",
						);
					});
					it("with private setter ignores setter", () => {
						const { stringified, out } = stringifyIgnoringInaccessibleMembersThenParse(
							classInstanceWithPrivateSetter,
							{
								public: "public",
							},
						);
						assertIdenticalTypes(
							stringified,
							createInstanceOf<JsonString<typeof classInstanceWithPrivateSetter>>(),
						);
						assertIdenticalTypes(
							out,
							createInstanceOf<{
								public: string;
							}>(),
						);
						// @ts-expect-error secret is missing, but required
						out satisfies typeof classInstanceWithPrivateSetter;
						// @ts-expect-error secret is missing, but required
						assertIdenticalTypes(out, classInstanceWithPrivateSetter);
						assert.ok(
							classInstanceWithPrivateSetter instanceof ClassWithPrivateSetter,
							"classInstanceWithPrivateSetter is an instance of ClassWithPrivateSetter",
						);
						assert.ok(
							!(out instanceof ClassWithPrivateSetter),
							"out is not an instance of ClassWithPrivateSetter",
						);
					});
				});
			});

			describe("object with optional property", () => {
				it("without property", () => {
					const { stringified, out } = stringifyThenParse(objectWithOptionalNumberNotPresent);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<JsonString<typeof objectWithOptionalNumberNotPresent>>(),
					);
					assertIdenticalTypes(out, objectWithOptionalNumberNotPresent);
				});
				it("with undefined value", () => {
					const { stringified, out } = stringifyThenParse(
						objectWithOptionalNumberUndefined,
						{},
					);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<JsonString<typeof objectWithOptionalNumberUndefined>>(),
					);
					assertIdenticalTypes(out, objectWithOptionalNumberUndefined);
				});
				it("with defined value", () => {
					const { stringified, out } = stringifyThenParse(objectWithOptionalNumberDefined);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<JsonString<typeof objectWithOptionalNumberDefined>>(),
					);
					assertIdenticalTypes(out, objectWithOptionalNumberDefined);
				});
			});

			describe("opaque Json types", () => {
				it("opaque serializable object", () => {
					const { stringified, out } = stringifyThenParse(opaqueSerializableObject);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<JsonString<typeof opaqueSerializableObject>>(),
					);
					// @ts-expect-error In this case, `out` has a unique `OpaqueJsonDeserialized` result.
					assertIdenticalTypes(out, opaqueSerializableObject);
					assertIdenticalTypes(
						out,
						createInstanceOf<OpaqueJsonDeserialized<{ number: number }>>(),
					);
				});
				it("opaque deserialized object", () => {
					const { stringified, out } = stringifyThenParse(opaqueDeserializedObject);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<JsonString<typeof opaqueDeserializedObject>>(),
					);
					assertIdenticalTypes(out, opaqueDeserializedObject);
				});
				it("opaque serializable and deserialized object", () => {
					const { stringified, out } = stringifyThenParse(
						opaqueSerializableAndDeserializedObject,
					);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<JsonString<typeof opaqueSerializableAndDeserializedObject>>(),
					);
					// @ts-expect-error In this case, `out` has a unique `OpaqueJsonDeserialized` result.
					assertIdenticalTypes(out, opaqueSerializableAndDeserializedObject);
					assertIdenticalTypes(
						out,
						createInstanceOf<OpaqueJsonDeserialized<{ number: number }>>(),
					);
				});
				it("opaque serializable unknown", () => {
					const { stringified, out } = stringifyThenParse(opaqueSerializableUnknown);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<JsonString<typeof opaqueSerializableUnknown>>(),
					);
					// @ts-expect-error In this case, `out` has a unique `OpaqueJsonDeserialized` result.
					assertIdenticalTypes(out, opaqueSerializableUnknown);
					assertIdenticalTypes(out, createInstanceOf<OpaqueJsonDeserialized<unknown>>());
				});
				it("opaque deserialized unknown", () => {
					const { stringified, out } = stringifyThenParse(opaqueDeserializedUnknown);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<JsonString<typeof opaqueDeserializedUnknown>>(),
					);
					assertIdenticalTypes(out, opaqueDeserializedUnknown);
				});
				it("opaque serializable and deserialized unknown", () => {
					const { stringified, out } = stringifyThenParse(
						opaqueSerializableAndDeserializedUnknown,
					);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<JsonString<typeof opaqueSerializableAndDeserializedUnknown>>(),
					);
					// @ts-expect-error In this case, `out` has a unique `OpaqueJsonDeserialized` result.
					assertIdenticalTypes(out, opaqueSerializableAndDeserializedUnknown);
					assertIdenticalTypes(out, createInstanceOf<OpaqueJsonDeserialized<unknown>>());
				});
				it("object with opaque serializable unknown", () => {
					const { stringified, out } = stringifyThenParse(objectWithOpaqueSerializableUnknown);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<JsonString<typeof objectWithOpaqueSerializableUnknown>>(),
					);
					// @ts-expect-error In this case, `out` has a unique `OpaqueJsonDeserialized` result.
					assertIdenticalTypes(out, objectWithOpaqueSerializableUnknown);
					assertIdenticalTypes(
						out,
						createInstanceOf<{ opaque: OpaqueJsonDeserialized<unknown> }>(),
					);
				});
				it("object with opaque deserialized unknown", () => {
					const { stringified, out } = stringifyThenParse(objectWithOpaqueDeserializedUnknown);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<JsonString<typeof objectWithOpaqueDeserializedUnknown>>(),
					);
					assertIdenticalTypes(out, objectWithOpaqueDeserializedUnknown);
				});
				it("recursive type with opaque serializable unknown", () => {
					const { stringified, out } = stringifyThenParse(
						opaqueSerializableInRecursiveStructure,
					);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<JsonString<typeof opaqueSerializableInRecursiveStructure>>(),
					);
					// @ts-expect-error In this case, `out` has a unique `OpaqueJsonDeserialized` result.
					assertIdenticalTypes(out, opaqueSerializableInRecursiveStructure);
					assertIdenticalTypes(
						out,
						createInstanceOf<DeserializedOpaqueSerializableInRecursiveStructure>(),
					);
				});
				it("recursive type with opaque deserialized unknown", () => {
					const { stringified, out } = stringifyThenParse(
						opaqueDeserializedInRecursiveStructure,
					);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<JsonString<typeof opaqueDeserializedInRecursiveStructure>>(),
					);
					assertIdenticalTypes(out, opaqueDeserializedInRecursiveStructure);
				});
				it("recursive type with opaque serializable and deserialized unknown", () => {
					const { stringified, out } = stringifyThenParse(
						opaqueSerializableAndDeserializedInRecursiveStructure,
					);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<
							JsonString<typeof opaqueSerializableAndDeserializedInRecursiveStructure>
						>(),
					);
					// @ts-expect-error In this case, `out` has a unique `OpaqueJsonDeserialized` result.
					assertIdenticalTypes(out, opaqueSerializableAndDeserializedInRecursiveStructure);
					assertIdenticalTypes(
						out,
						createInstanceOf<DeserializedOpaqueSerializableAndDeserializedInRecursiveStructure>(),
					);
				});
				it("recursive branded indexed object with OpaqueJsonDeserialized<unknown>", () => {
					const { stringified, out } = stringifyThenParse(datastore);
					assertIdenticalTypes(stringified, createInstanceOf<JsonString<typeof datastore>>());
					assertIdenticalTypes(out, datastore);
				});
			});
		});

		describe("supports union types", () => {
			it("simple json (JsonTypeWith<never>)", () => {
				const { stringified, out } = stringifyThenParse(simpleJson);
				assertIdenticalTypes(stringified, createInstanceOf<JsonString<typeof simpleJson>>());
				assertIdenticalTypes(out, simpleJson);
			});
			it("simple read-only json (ReadonlyJsonTypeWith<never>)", () => {
				const { stringified, out } = stringifyThenParse(simpleImmutableJson);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<JsonString<typeof simpleImmutableJson>>(),
				);
				assertIdenticalTypes(out, simpleImmutableJson);
			});
		});

		describe("with NOT fully supported object types", () => {
			// This is a reasonable limitation. The type system doesn't have a way to be
			// sure if there is a self reference or not.
			it("object with self reference throws on serialization", () => {
				assert.throws(
					() => JsonStringify(objectWithSelfReference),
					new TypeError(
						"Converting circular structure to JSON\n    --> starting at object with constructor 'Object'\n    --- property 'recursive' closes the circle",
					),
				);
			});

			// These cases are demonstrating defects within the current implementation.
			// They show "allowed" incorrect use and the unexpected results.
			describe("known defect expectations", () => {
				describe("getters and setters allowed but do not propagate", () => {
					it("object with `readonly` implemented via getter", () => {
						const { stringified, out } = stringifyThenParse(objectWithReadonlyViaGetter, {});
						assertIdenticalTypes(
							stringified,
							createInstanceOf<JsonString<typeof objectWithReadonlyViaGetter>>(),
						);
						assertIdenticalTypes(out, objectWithReadonlyViaGetter);
					});

					it("object with getter", () => {
						const { stringified, out } = stringifyThenParse(objectWithGetter, {});
						assertIdenticalTypes(
							stringified,
							createInstanceOf<JsonString<typeof objectWithGetter>>(),
						);
						assertIdenticalTypes(out, objectWithGetter);
					});

					it("object with setter", () => {
						const { stringified, out } = stringifyThenParse(objectWithSetter, {});
						assertIdenticalTypes(
							stringified,
							createInstanceOf<JsonString<typeof objectWithSetter>>(),
						);
						assertIdenticalTypes(out, objectWithSetter);
					});

					it("object with matched getter and setter", () => {
						const { stringified, out } = stringifyThenParse(
							objectWithMatchedGetterAndSetterProperty,
							{},
						);
						assertIdenticalTypes(
							stringified,
							createInstanceOf<JsonString<typeof objectWithMatchedGetterAndSetterProperty>>(),
						);
						assertIdenticalTypes(out, objectWithMatchedGetterAndSetterProperty);
					});

					it("object with mismatched getter and setter", () => {
						const { stringified, out } = stringifyThenParse(
							objectWithMismatchedGetterAndSetterProperty,
							{},
						);
						assertIdenticalTypes(
							stringified,
							createInstanceOf<
								JsonString<typeof objectWithMismatchedGetterAndSetterProperty>
							>(),
						);
						assertIdenticalTypes(out, objectWithMismatchedGetterAndSetterProperty);
					});
				});

				describe("class instance", () => {
					describe("with `ignore-inaccessible-members`", () => {
						it("with private data ignores private data (that propagates)", () => {
							const { stringified, out } = stringifyIgnoringInaccessibleMembersThenParse(
								classInstanceWithPrivateData,
								{
									public: "public",
									secret: 0,
								},
							);
							assertIdenticalTypes(
								stringified,
								createInstanceOf<JsonString<typeof classInstanceWithPrivateData>>(),
							);
							// @ts-expect-error secret is missing, but required
							out satisfies typeof classInstanceWithPrivateData;
							assertIdenticalTypes(out, createInstanceOf<{ public: string }>());
							// @ts-expect-error secret is missing, but required
							assertIdenticalTypes(out, classInstanceWithPrivateData);
							assert.ok(
								classInstanceWithPrivateData instanceof ClassWithPrivateData,
								"classInstanceWithPrivateData is an instance of ClassWithPrivateData",
							);
							assert.ok(
								!(out instanceof ClassWithPrivateData),
								"out is not an instance of ClassWithPrivateData",
							);
						});
					});
				});

				it("sparse array of supported types", () => {
					const { stringified, out } = stringifyThenParse(arrayOfNumbersSparse, [
						0,
						null,
						null,
						3,
					]);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<JsonString<typeof arrayOfNumbersSparse>>(),
					);
					assertIdenticalTypes(out, arrayOfNumbersSparse);
				});

				it("object with sparse array of supported types", () => {
					const { stringified, out } = stringifyThenParse(objectWithArrayOfNumbersSparse, {
						arrayOfNumbersSparse: [0, null, null, 3],
					});
					assertIdenticalTypes(
						stringified,
						createInstanceOf<JsonString<typeof objectWithArrayOfNumbersSparse>>(),
					);
					assertIdenticalTypes(out, objectWithArrayOfNumbersSparse);
				});
			});
		});
	});

	describe("invalid input usage", () => {
		describe("assumptions", () => {
			it("const enums are never readable", () => {
				// ... and thus don't need accounted for by JsonDeserialized.

				const enum LocalConstHeterogenousEnum {
					zero,
					a = "a",
				}

				assert.throws(() => {
					// @ts-expect-error `const enums` are not accessible for reading
					stringifyThenParse(LocalConstHeterogenousEnum);
				}, new ReferenceError("LocalConstHeterogenousEnum is not defined"));

				/**
				 * In CommonJs, an imported const enum becomes undefined. Only
				 * local const enums are inaccessible. To avoid building special
				 * support for both ESM and CommonJS, this helper allows calling
				 * with undefined (for CommonJS) and simulates the error that
				 * is expected on ESM.
				 * Importantly `undefined` is not expected to be serializable and
				 * thus is always a problem.
				 */
				function doNothingPassThru<T>(v: T): never {
					if (v === undefined) {
						throw new ReferenceError(`ConstHeterogenousEnum is not defined`);
					}
					throw new Error("Internal test error - should not reach here");
				}

				assert.throws(() => {
					// @ts-expect-error `const enums` are not accessible for reading
					doNothingPassThru(ConstHeterogenousEnum);
				}, new ReferenceError("ConstHeterogenousEnum is not defined"));
			});
		});

		describe("unsupported types cause compiler error", () => {
			it("`undefined`", () => {
				const stringified = JsonStringify(
					// @ts-expect-error `undefined` is not supported
					undefined,
				);
				assert.equal(stringified, undefined, "undefined is not serializable");
			});
			it("`unknown`", () => {
				const { stringified, out } = stringifyThenParse(
					// @ts-expect-error `unknown` is not supported (expects `JsonTypeWith<never> | OpaqueJsonSerializable<unknown>`)
					{} as unknown,
				); // {} value is actually supported; so, no runtime error.
				assertIdenticalTypes(stringified, createInstanceOf<JsonString<unknown>>());
				assertIdenticalTypes(out, createInstanceOf<JsonTypeWith<never>>());
			});
			it("`symbol`", () => {
				const stringified = JsonStringify(
					// @ts-expect-error `symbol` is not supported
					symbol,
				);
				assert.equal(stringified, undefined, "symbol is not serializable");
			});
			it("`unique symbol`", () => {
				const stringified = JsonStringify(
					// @ts-expect-error [unique] `symbol` is not supported
					uniqueSymbol,
				);
				assert.equal(stringified, undefined, "uniqueSymbol is not serializable");
			});
			it("`bigint`", () => {
				assert.throws(
					() =>
						JsonStringify(
							// @ts-expect-error `bigint` is not supported
							bigint,
						),
					new TypeError("Do not know how to serialize a BigInt"),
				);
			});
			it("function", () => {
				const stringified = JsonStringify(
					// @ts-expect-error `Function` is not supported
					aFunction,
				);
				assert.equal(stringified, undefined, "aFunction is not serializable");
				// Keep this assert at end of scope to avoid assertion altering type
				const varTypeof = typeof aFunction;
				assert(varTypeof === "function", "plain function is a function at runtime");
			});
			it("function with supported properties", () => {
				const stringified = JsonStringify(
					// @ts-expect-error `Function & {...}` is not supported
					functionWithProperties,
				);
				assert.equal(stringified, undefined, "functionWithProperties is not serializable");
				// Keep this assert at end of scope to avoid assertion altering type
				const varTypeof = typeof functionWithProperties;
				assert(varTypeof === "function", "function with properties is a function at runtime");
			});
			it("object and function", () => {
				const { stringified, out } = stringifyThenParse(
					// @ts-expect-error `{...} & Function` is not supported
					objectAndFunction,
					{ property: 6 },
				);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<JsonString<typeof objectAndFunction>>(),
				);
				assertIdenticalTypes(out, createInstanceOf<{ property: number }>());
				// Keep this assert at end of scope to avoid assertion altering type
				const varTypeof = typeof objectAndFunction;
				assert(varTypeof === "object", "object assigned a function is an object at runtime");
			});
			it("object with function with supported properties", () => {
				const { stringified, out } = stringifyThenParse(
					// @ts-expect-error `{ function: Function & {...}}` is not supported (becomes `{ function: never }`)
					objectWithFunctionWithProperties,
					{},
				);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<JsonString<typeof objectWithFunctionWithProperties>>(),
				);
				assertIdenticalTypes(
					out,
					createInstanceOf<{
						function?: {
							property: number;
						};
					}>(),
				);
			});
			it("object with object and function", () => {
				const { stringified, out } = stringifyThenParse(
					// @ts-expect-error `{ object: {...} & Function }` is not supported (becomes `{ object: never }`)
					objectWithObjectAndFunction,
					{ object: { property: 6 } },
				);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<JsonString<typeof objectWithObjectAndFunction>>(),
				);
				assertIdenticalTypes(
					out,
					createInstanceOf<{
						object?: {
							property: number;
						};
					}>(),
				);
			});
			it("function with class instance with private data", () => {
				const stringified = JsonStringify(
					// @ts-expect-error SerializationErrorPerNonPublicProperties
					functionObjectWithPrivateData,
				);
				assert.equal(
					stringified,
					undefined,
					"functionObjectWithPrivateData is not serializable",
				);
				// Keep this assert at end of scope to avoid assertion altering type
				const varTypeof = typeof functionObjectWithPrivateData;
				assert(
					varTypeof === "function",
					"function that is also a class instance is a function at runtime",
				);
			});
			it("function with class instance with public data", () => {
				const stringified = JsonStringify(
					// @ts-expect-error `Function & {...}` is not supported
					functionObjectWithPublicData,
				);
				assert.equal(
					stringified,
					undefined,
					"functionObjectWithPublicData is not serializable",
				);
			});
			it("class instance with private data and is function", () => {
				const { stringified, out } = stringifyThenParse(
					// @ts-expect-error SerializationErrorPerNonPublicProperties
					classInstanceWithPrivateDataAndIsFunction,
					{
						public: "public",
						// secret is also not allowed but is present
						secret: 0,
					},
				);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<JsonString<typeof classInstanceWithPrivateDataAndIsFunction>>(),
				);
				assertIdenticalTypes(out, createInstanceOf<{ public: string }>());
				// Keep this assert at end of scope to avoid assertion altering type
				const varTypeof = typeof classInstanceWithPrivateDataAndIsFunction;
				assert(
					varTypeof === "object",
					"class instance that is also a function is an object at runtime",
				);
			});
			it("class instance with public data and is function", () => {
				const { stringified, out } = stringifyThenParse(
					// @ts-expect-error `Function & {...}` is not supported
					classInstanceWithPublicDataAndIsFunction,
					{ public: "public" },
				);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<JsonString<typeof classInstanceWithPublicDataAndIsFunction>>(),
				);
				assertIdenticalTypes(out, createInstanceOf<{ public: string }>());
			});
			it("`object` (plain object)", () => {
				const { stringified, out } = stringifyThenParse(
					// @ts-expect-error `object` is not supported (expects `NonNullJsonObjectWith<never>`)
					object,
					// object's value is actually supported; so, no runtime error.
				);
				assertIdenticalTypes(stringified, createInstanceOf<JsonString<typeof object>>());
				assertIdenticalTypes(out, createInstanceOf<NonNullJsonObjectWith<never>>());
			});
			it("`void`", () => {
				const { stringified, out } = stringifyThenParse(
					// @ts-expect-error `void` is not supported
					voidValue,
					// voidValue is actually `null`; so, no runtime error.
				);
				assertIdenticalTypes(stringified, createInstanceOf<JsonString<void>>());
				assertIdenticalTypes(out, createInstanceOf<never>());
			});
			it("branded `object`", () => {
				const { stringified, out } = stringifyThenParse(
					// @ts-expect-error SerializationErrorPerNonPublicProperties
					brandedObject,
				);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<JsonString<typeof brandedObject>>(),
				);
				// Ideally there could be a transformation to JsonTypeWith<never> but
				// `object` intersected with branding (which is an object) is just the branding.
				assertIdenticalTypes(out, emptyObject);
			});
			it("branded object with `string`", () => {
				const { stringified, out } = stringifyThenParse(
					// @ts-expect-error SerializationErrorPerNonPublicProperties
					brandedObjectWithString,
				);
				assertIdenticalTypes(
					stringified,
					createInstanceOf<JsonString<typeof brandedObjectWithString>>(),
				);
				assertIdenticalTypes(out, createInstanceOf<{ string: string }>());
			});

			describe("unions with unsupported primitive types", () => {
				it("`string | symbol`", () => {
					const stringified = JsonStringify(
						// @ts-expect-error `string | symbol` is not assignable to `string`
						stringOrSymbol,
					);
					assert.equal(stringified, undefined, "stringOrSymbol is not serializable");
				});
				it("`bigint | string`", () => {
					const { stringified, out } = stringifyThenParse(
						// @ts-expect-error `string | bigint` is not assignable to `string`
						bigintOrString,
					);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<JsonString<typeof bigintOrString>>(),
					);
					assertIdenticalTypes(out, createInstanceOf<string>());
				});
				it("`bigint | symbol`", () => {
					const stringified = JsonStringify(
						// @ts-expect-error `bigint | symbol` is not assignable to `never`
						bigintOrSymbol,
					);
					assert.equal(stringified, undefined, "bigintOrSymbol is not serializable");
				});
				it("`number | bigint | symbol`", () => {
					const { stringified, out } = stringifyThenParse(
						// @ts-expect-error `number | bigint | symbol` is not assignable to `number`
						numberOrBigintOrSymbol,
						7,
					);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<JsonString<typeof numberOrBigintOrSymbol>>(),
					);
					assertIdenticalTypes(out, createInstanceOf<number>());
				});
			});

			describe("array", () => {
				it("array of `bigint`s", () => {
					assert.throws(
						() =>
							JsonStringify(
								// @ts-expect-error 'bigint' is not supported (becomes 'never')
								arrayOfBigints,
							),
						new TypeError("Do not know how to serialize a BigInt"),
					);
				});
				it("array of `symbol`s", () => {
					const { stringified, out } = stringifyThenParse(
						// @ts-expect-error 'symbol' is not supported (becomes 'never')
						arrayOfSymbols,
						[null],
					);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<JsonString<typeof arrayOfSymbols>>(),
					);
					assertIdenticalTypes(out, createInstanceOf<null[]>());
				});
				it("array of `unknown`", () => {
					const { stringified, out } = stringifyThenParse(
						// @ts-expect-error 'unknown[]' is not assignable to parameter of type '(JsonTypeWith<never> | OpaqueJsonSerializable<unknown>)[]'
						arrayOfUnknown,
					);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<JsonString<typeof arrayOfUnknown>>(),
					);
					assertIdenticalTypes(out, createInstanceOf<JsonTypeWith<never>[]>());
				});
				it("array of functions", () => {
					const { stringified, out } = stringifyThenParse(
						// @ts-expect-error `Function` is not supported (becomes 'never')
						arrayOfFunctions,
						[null],
					);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<JsonString<typeof arrayOfFunctions>>(),
					);
					assertIdenticalTypes(out, createInstanceOf<null[]>());
				});
				it("array of functions with properties", () => {
					const { stringified, out } = stringifyThenParse(
						// @ts-expect-error 'Function & {...}' is not supported (becomes 'never')
						arrayOfFunctionsWithProperties,
						[null],
					);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<JsonString<typeof arrayOfFunctionsWithProperties>>(),
					);
					assertIdenticalTypes(out, createInstanceOf<({ property: number } | null)[]>());
				});
				it("array of objects and functions", () => {
					const { stringified, out } = stringifyThenParse(
						// @ts-expect-error '{...} & Function' is not supported (becomes 'never')
						arrayOfObjectAndFunctions,
						[{ property: 6 }],
					);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<JsonString<typeof arrayOfObjectAndFunctions>>(),
					);
					assertIdenticalTypes(out, createInstanceOf<({ property: number } | null)[]>());
				});
				it("array of `number | undefined`s", () => {
					const { stringified, out } = stringifyThenParse(
						// @ts-expect-error 'undefined' is not supported (becomes 'SerializationErrorPerUndefinedArrayElement')
						arrayOfNumbersOrUndefined,
						[0, null, 2],
					);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<JsonString<typeof arrayOfNumbersOrUndefined>>(),
					);
					assertIdenticalTypes(out, createInstanceOf<(number | null)[]>());
				});
				it("array of `bigint` or basic object", () => {
					assert.throws(
						() =>
							JsonStringify(
								// @ts-expect-error 'bigint' is not supported (becomes 'never')
								arrayOfBigintOrObjects,
							),
						new TypeError("Do not know how to serialize a BigInt"),
					);
				});
				it("array of `symbol` or basic object", () => {
					const { stringified, out } = stringifyThenParse(
						// @ts-expect-error 'symbol' is not supported (becomes 'never')
						arrayOfSymbolOrObjects,
						[null],
					);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<JsonString<typeof arrayOfSymbolOrObjects>>(),
					);
					assertIdenticalTypes(out, createInstanceOf<({ property: string } | null)[]>());
				});
				it("array of `bigint | symbol`s", () => {
					const { stringified, out } = stringifyThenParse(
						// @ts-expect-error 'bigint | symbol' is not assignable to 'never'
						arrayOfBigintOrSymbols,
						[null],
					);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<JsonString<typeof arrayOfBigintOrSymbols>>(),
					);
					assertIdenticalTypes(out, createInstanceOf<null[]>());
				});
				it("array of `number | bigint | symbol`s", () => {
					const { stringified, out } = stringifyThenParse(
						// @ts-expect-error 'number | bigint | symbol' is not assignable to 'number'
						arrayOfNumberBigintOrSymbols,
						[7],
					);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<JsonString<typeof arrayOfNumberBigintOrSymbols>>(),
					);
					assertIdenticalTypes(out, createInstanceOf<(number | null)[]>());
				});
			});

			describe("object", () => {
				it("object with exactly `bigint`", () => {
					assert.throws(
						() =>
							JsonStringify(
								// @ts-expect-error `bigint` is not supported
								objectWithBigint,
							),
						new TypeError("Do not know how to serialize a BigInt"),
					);
				});
				it("object with optional `bigint`", () => {
					assert.throws(
						() =>
							JsonStringify(
								// @ts-expect-error `bigint` is not supported
								objectWithOptionalBigint,
							),
						new TypeError("Do not know how to serialize a BigInt"),
					);
				});
				it("object with exactly `symbol`", () => {
					const { stringified, out } = stringifyThenParse(
						// @ts-expect-error `symbol` is not supported
						objectWithSymbol,
						{},
					);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<JsonString<typeof objectWithSymbol>>(),
					);
					assertIdenticalTypes(out, emptyObject);
				});
				it("object with optional `symbol`", () => {
					const { stringified, out } = stringifyThenParse(
						// @ts-expect-error `symbol` is not supported
						objectWithOptionalSymbol,
						{},
					);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<JsonString<typeof objectWithOptionalSymbol>>(),
					);
					assertIdenticalTypes(out, emptyObject);
				});
				it("object with exactly `function`", () => {
					const { stringified, out } = stringifyThenParse(
						// @ts-expect-error `Function` is not supported
						objectWithFunction,
						{},
					);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<JsonString<typeof objectWithFunction>>(),
					);
					assertIdenticalTypes(out, emptyObject);
				});
				it("object with exactly `Function | symbol`", () => {
					const { stringified, out } = stringifyThenParse(
						// @ts-expect-error `symbol | (() => void)` is not supported
						objectWithFunctionOrSymbol,
						{},
					);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<JsonString<typeof objectWithFunctionOrSymbol>>(),
					);
					assertIdenticalTypes(out, emptyObject);
				});
				it("object with exactly `string | symbol`", () => {
					const { stringified, out } = stringifyThenParse(
						// @ts-expect-error `string | symbol` is not assignable to `string`
						objectWithStringOrSymbol,
						{},
					);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<JsonString<typeof objectWithStringOrSymbol>>(),
					);
					assertIdenticalTypes(
						out,
						createInstanceOf<{
							stringOrSymbol?: string;
						}>(),
					);
				});
				it("object with exactly `bigint | string`", () => {
					const { stringified, out } = stringifyThenParse(
						// @ts-expect-error `bigint | string` is not assignable to `string`
						objectWithBigintOrString,
						// value is a string; so no runtime error.
					);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<JsonString<typeof objectWithBigintOrString>>(),
					);
					assertIdenticalTypes(
						out,
						createInstanceOf<{
							bigintOrString: string;
						}>(),
					);
				});
				it("object with exactly `bigint | symbol`", () => {
					const { stringified, out } = stringifyThenParse(
						// @ts-expect-error `bigint | symbol` is not assignable to `never`
						objectWithBigintOrSymbol,
						{},
					);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<JsonString<typeof objectWithBigintOrSymbol>>(),
					);
					assertIdenticalTypes(out, emptyObject);
				});
				it("object with exactly `number | bigint | symbol`", () => {
					const { stringified, out } = stringifyThenParse(
						// @ts-expect-error `number | bigint | symbol` is not assignable to `number`
						objectWithNumberOrBigintOrSymbol,
						{ numberOrBigintOrSymbol: 7 },
					);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<JsonString<typeof objectWithNumberOrBigintOrSymbol>>(),
					);
					assertIdenticalTypes(
						out,
						createInstanceOf<{
							numberOrBigintOrSymbol?: number;
						}>(),
					);
				});
				it("object with optional `unknown`", () => {
					const { stringified, out } = stringifyThenParse(
						// @ts-expect-error Type `unknown` is not assignable to type `JsonTypeWith<never> | OpaqueJsonSerializable<unknown>`
						objectWithOptionalUnknown,
						{ optUnknown: "value" },
					);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<JsonString<typeof objectWithOptionalUnknown>>(),
					);
					assertIdenticalTypes(
						out,
						createInstanceOf<{
							optUnknown?: JsonTypeWith<never>;
						}>(),
					);
				});
				it("`string` indexed record of `symbol | boolean`", () => {
					const { stringified, out } = stringifyThenParse(
						// @ts-expect-error Type 'symbol | boolean' is not assignable to type 'boolean'
						stringRecordOfSymbolOrBoolean,
						{ boolean },
					);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<JsonString<typeof stringRecordOfSymbolOrBoolean>>(),
					);
					assertIdenticalTypes(out, createInstanceOf<Record<string, boolean>>());
				});

				it("object with array of `bigint`s", () => {
					assert.throws(
						() =>
							JsonStringify(
								// @ts-expect-error 'bigint' is not supported (becomes 'never')
								objectWithArrayOfBigints,
							),
						new TypeError("Do not know how to serialize a BigInt"),
					);
				});
				it("object with array of `symbol`s", () => {
					const { stringified, out } = stringifyThenParse(
						// @ts-expect-error 'symbol' is not supported (becomes 'never')
						objectWithArrayOfSymbols,
						{ arrayOfSymbols: [null] },
					);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<JsonString<typeof objectWithArrayOfSymbols>>(),
					);
					assertIdenticalTypes(out, createInstanceOf<{ arrayOfSymbols: null[] }>());
				});
				it("object with array of `unknown`", () => {
					const { stringified, out } = stringifyThenParse(
						// @ts-expect-error 'unknown[]' is not assignable to parameter of type '(JsonTypeWith<never> | OpaqueJsonSerializable<unknown>)[]'
						objectWithArrayOfUnknown,
					);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<JsonString<typeof objectWithArrayOfUnknown>>(),
					);
					assertIdenticalTypes(
						out,
						createInstanceOf<{ arrayOfUnknown: JsonTypeWith<never>[] }>(),
					);
				});
				it("object with array of functions", () => {
					const { stringified, out } = stringifyThenParse(
						// @ts-expect-error `Function` is not supported (becomes 'never')
						objectWithArrayOfFunctions,
						{ arrayOfFunctions: [null] },
					);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<JsonString<typeof objectWithArrayOfFunctions>>(),
					);
					assertIdenticalTypes(out, createInstanceOf<{ arrayOfFunctions: null[] }>());
				});
				it("object with array of functions with properties", () => {
					const { stringified, out } = stringifyThenParse(
						// @ts-expect-error 'Function & {...}' is not supported (becomes 'never')
						objectWithArrayOfFunctionsWithProperties,
						{ arrayOfFunctionsWithProperties: [null] },
					);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<JsonString<typeof objectWithArrayOfFunctionsWithProperties>>(),
					);
					assertIdenticalTypes(
						out,
						createInstanceOf<{
							arrayOfFunctionsWithProperties: ({
								property: number;
							} | null)[];
						}>(),
					);
				});
				it("object with array of objects and functions", () => {
					const { stringified, out } = stringifyThenParse(
						// @ts-expect-error '{...} & Function' is not supported (becomes 'never')
						objectWithArrayOfObjectAndFunctions,
						{ arrayOfObjectAndFunctions: [{ property: 6 }] },
					);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<JsonString<typeof objectWithArrayOfObjectAndFunctions>>(),
					);
					assertIdenticalTypes(
						out,
						createInstanceOf<{
							arrayOfObjectAndFunctions: ({
								property: number;
							} | null)[];
						}>(),
					);
				});
				it("object with array of `number | undefined`s", () => {
					const { stringified, out } = stringifyThenParse(
						// @ts-expect-error 'undefined' is not supported (becomes 'SerializationErrorPerUndefinedArrayElement')
						objectWithArrayOfNumbersOrUndefined,
						{ arrayOfNumbersOrUndefined: [0, null, 2] },
					);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<JsonString<typeof objectWithArrayOfNumbersOrUndefined>>(),
					);
					assertIdenticalTypes(
						out,
						createInstanceOf<{ arrayOfNumbersOrUndefined: (number | null)[] }>(),
					);
				});
				it("object with array of `bigint` or basic object", () => {
					assert.throws(
						() =>
							JsonStringify(
								// @ts-expect-error 'bigint' is not supported (becomes 'never')
								objectWithArrayOfBigintOrObjects,
							),
						new TypeError("Do not know how to serialize a BigInt"),
					);
				});
				it("object with array of `symbol` or basic object", () => {
					const { stringified, out } = stringifyThenParse(
						// @ts-expect-error 'symbol' is not supported (becomes 'never')
						objectWithArrayOfSymbolOrObjects,
						{ arrayOfSymbolOrObjects: [null] },
					);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<JsonString<typeof objectWithArrayOfSymbolOrObjects>>(),
					);
					assertIdenticalTypes(
						out,
						createInstanceOf<{
							arrayOfSymbolOrObjects: ({
								property: string;
							} | null)[];
						}>(),
					);
				});
				it("object with array of `bigint | symbol`s", () => {
					const objectWithArrayOfBigintOrSymbols = {
						arrayOfBigintOrSymbols: [bigintOrSymbol],
					};
					const { stringified, out } = stringifyThenParse(
						// @ts-expect-error 'bigint | symbol' is not assignable to 'never'
						objectWithArrayOfBigintOrSymbols,
						{ arrayOfBigintOrSymbols: [null] },
					);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<JsonString<typeof objectWithArrayOfBigintOrSymbols>>(),
					);
					assertIdenticalTypes(out, createInstanceOf<{ arrayOfBigintOrSymbols: null[] }>());
				});

				it("object with `symbol` key", () => {
					const { stringified, out } = stringifyThenParse(
						// @ts-expect-error `symbol` key is not supported (property type becomes `never`)
						objectWithSymbolKey,
						{},
					);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<JsonString<typeof objectWithSymbolKey>>(),
					);
					assertIdenticalTypes(out, emptyObject);
				});
				it("object with [unique] symbol key", () => {
					const { stringified, out } = stringifyThenParse(
						// @ts-expect-error symbol key is not supported (property type becomes `never`)
						objectWithUniqueSymbolKey,
						{},
					);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<JsonString<typeof objectWithUniqueSymbolKey>>(),
					);
					assertIdenticalTypes(out, emptyObject);
				});

				it("`string` indexed record of `unknown`", () => {
					const { stringified, out } = stringifyThenParse(
						// @ts-expect-error not assignable to parameter of type '{ [x: string]: JsonTypeWith<never> | OpaqueJsonSerializable<unknown>; }'.
						stringRecordOfUnknown,
					);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<JsonString<typeof stringRecordOfUnknown>>(),
					);
					assertIdenticalTypes(out, createInstanceOf<Record<string, JsonTypeWith<never>>>());
				});
				it("`Partial<>` `string` indexed record of `unknown`", () => {
					const { stringified, out } = stringifyThenParse(
						// @ts-expect-error not assignable to parameter of type '{ [x: string]: JsonTypeWith<never> | OpaqueJsonSerializable<unknown>; }'.
						partialStringRecordOfUnknown,
					);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<JsonString<typeof partialStringRecordOfUnknown>>(),
					);
					assertIdenticalTypes(out, createInstanceOf<Record<string, JsonTypeWith<never>>>());
				});

				it("`Partial<>` `string` indexed record of `numbers`", () => {
					// Warning: as of TypeScript 5.8.2, a Partial<> of an indexed type
					// gains `| undefined` even under exactOptionalPropertyTypes=true.
					// Preferred result is that there is no change applying Partial<>.
					// Allowing `undefined` is possible if all indexed properties are
					// identifiable. But rather than that, an implementation of `Partial<>`
					// that doesn't add `| undefined` for index signatures would be preferred.
					const { stringified, out } = stringifyThenParse(
						// @ts-expect-error not assignable to type '{ "error required property may not allow `undefined` value": never; }'
						partialStringRecordOfNumbers,
						{ key1: 0 },
					);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<JsonString<typeof partialStringRecordOfNumbers>>(),
					);
					assertIdenticalTypes(out, createInstanceOf<Record<string, number>>());
				});
				it("`Partial<>` templated record of `numbers`", () => {
					// Warning: as of TypeScript 5.8.2, a Partial<> of an indexed type
					// gains `| undefined` even under exactOptionalPropertyTypes=true.
					// Preferred result is that there is no change applying Partial<>.
					// Allowing `undefined` is possible if all indexed properties are
					// identifiable. But rather than that, an implementation of `Partial<>`
					// that doesn't add `| undefined` for index signatures would be preferred.
					const { stringified, out } = stringifyThenParse(
						// @ts-expect-error not assignable to type '{ "error required property may not allow `undefined` value": never; }'
						partialTemplatedRecordOfNumbers,
						{ key1: 0 },
					);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<JsonString<typeof partialTemplatedRecordOfNumbers>>(),
					);
					assertIdenticalTypes(out, createInstanceOf<Record<`key${number}`, number>>());
				});

				it("object with recursion and `symbol`", () => {
					const { stringified, out } = stringifyThenParse(
						// @ts-expect-error 'ObjectWithSymbolOrRecursion' is not assignable to parameter of type '{ recurse: ObjectWithSymbolOrRecursion; }' (`symbol` becomes `never`)
						objectWithSymbolOrRecursion,
						{ recurse: {} },
					);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<JsonString<typeof objectWithSymbolOrRecursion>>(),
					);
					assertIdenticalTypes(
						out,
						createInstanceOf<{
							recurse?: OpaqueJsonDeserialized<ObjectWithSymbolOrRecursion>;
						}>(),
					);
				});

				it("function object with recursion", () => {
					const stringified = JsonStringify(
						// @ts-expect-error 'SelfRecursiveFunctionWithProperties' is not assignable to parameter of type 'never' (function even with properties becomes `never`)
						selfRecursiveFunctionWithProperties,
					);
					assert.equal(
						stringified,
						undefined,
						"selfRecursiveFunctionWithProperties is not serializable",
					);
					// Keep this assert at end of scope to avoid assertion altering
					const varTypeof = typeof selfRecursiveFunctionWithProperties;
					assert(
						varTypeof === "function",
						"self recursive function with properties is a function at runtime",
					);
				});
				it("object and function with recursion", () => {
					const { stringified, out } = stringifyThenParse(
						// @ts-expect-error 'SelfRecursiveObjectAndFunction' is not assignable to parameter of type 'never' (function even with properties becomes `never`)
						selfRecursiveObjectAndFunction,
						{ recurse: {} },
					);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<JsonString<typeof selfRecursiveObjectAndFunction>>(),
					);
					assertIdenticalTypes(
						out,
						createInstanceOf<{
							recurse?: OpaqueJsonDeserialized<typeof selfRecursiveObjectAndFunction>;
						}>(),
					);
					// Keep this assert at end of scope to avoid assertion altering
					const varTypeof = typeof selfRecursiveObjectAndFunction;
					assert(
						varTypeof === "object",
						"self recursive object and function is an object at runtime",
					);
				});

				it("nested function object with recursion", () => {
					const objectWithNestedFunctionWithPropertiesAndRecursion = {
						outerFnOjb: selfRecursiveFunctionWithProperties,
					};
					const { stringified, out } = stringifyThenParse(
						// @ts-expect-error 'SelfRecursiveFunctionWithProperties' is not assignable to parameter of type 'never' (function even with properties becomes `never`)
						objectWithNestedFunctionWithPropertiesAndRecursion,
						{},
					);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<
							JsonString<typeof objectWithNestedFunctionWithPropertiesAndRecursion>
						>(),
					);
					assertIdenticalTypes(
						out,
						createInstanceOf<{
							outerFnOjb?: {
								recurse?: OpaqueJsonDeserialized<typeof selfRecursiveFunctionWithProperties>;
							};
						}>(),
					);
				});
				it("nested object and function with recursion", () => {
					const objectWithNestedObjectAndFunctionWithRecursion = {
						outerFnOjb: selfRecursiveObjectAndFunction,
					};
					const { stringified, out } = stringifyThenParse(
						// @ts-expect-error 'SelfRecursiveObjectAndFunction' is not assignable to parameter of type 'never' (function even with properties becomes `never`)
						objectWithNestedObjectAndFunctionWithRecursion,
						{ outerFnOjb: { recurse: {} } },
					);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<
							JsonString<typeof objectWithNestedObjectAndFunctionWithRecursion>
						>(),
					);
					assertIdenticalTypes(
						out,
						createInstanceOf<{
							outerFnOjb?: {
								recurse?: OpaqueJsonDeserialized<typeof selfRecursiveObjectAndFunction>;
							};
						}>(),
					);
				});

				it("object with inherited recursion extended with unsupported properties", () => {
					const { stringified, out } = stringifyThenParse(
						// @ts-expect-error 'ObjectInheritingOptionalRecursionAndWithNestedSymbol' is not assignable to parameter of type '...' (symbol at complex.symbol becomes `never`)
						objectInheritingOptionalRecursionAndWithNestedSymbol,
						{ recursive: { recursive: { recursive: {} } }, complex: { number: 0 } },
					);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<
							JsonString<typeof objectInheritingOptionalRecursionAndWithNestedSymbol>
						>(),
					);
					assertIdenticalTypes(
						out,
						createInstanceOf<{
							complex: {
								number: number;
							};
							recursive?: {
								recursive?: ObjectWithOptionalRecursion;
							};
						}>(),
					);
				});

				describe("object with `undefined`", () => {
					it("as exact property type", () => {
						const { stringified, out } = stringifyThenParse(
							// @ts-expect-error not assignable to type '{ "error required property may not allow `undefined` value": never; }'
							objectWithUndefined,
							{},
						);
						assertIdenticalTypes(
							stringified,
							createInstanceOf<JsonString<typeof objectWithUndefined>>(),
						);
						assertIdenticalTypes(out, emptyObject);
					});
					it("in union property", () => {
						const { stringified: resultUndefined, out: outUndefined } = stringifyThenParse(
							// @ts-expect-error not assignable to type '{ "error required property may not allow `undefined` value": never; }'
							objectWithNumberOrUndefinedUndefined,
							{},
						);
						assertIdenticalTypes(
							resultUndefined,
							createInstanceOf<JsonString<typeof objectWithNumberOrUndefinedUndefined>>(),
						);
						assertIdenticalTypes(outUndefined, createInstanceOf<{ numOrUndef?: number }>());
						const { stringified: resultNumbered, out: outNumbered } = stringifyThenParse(
							// @ts-expect-error not assignable to `{ "error required property may not allow `undefined` value": never; }`
							objectWithNumberOrUndefinedNumbered,
						);
						assertIdenticalTypes(resultNumbered, resultUndefined);
						assertIdenticalTypes(outNumbered, outUndefined);
					});
					it("as exact property type of `string` indexed record", () => {
						const { stringified, out } = stringifyThenParse(
							// @ts-expect-error not assignable to type '{ "error required property may not allow `undefined` value": never; }'
							stringRecordOfUndefined,
							{},
						);
						assertIdenticalTypes(
							stringified,
							createInstanceOf<JsonString<typeof stringRecordOfUndefined>>(),
						);
						assertIdenticalTypes(out, emptyObject);
					});
					it("as exact property type of `string` indexed record intersected with known `number` property (unassignable)", () => {
						const { stringified, out } = stringifyThenParse(
							// @ts-expect-error Type 'undefined' is not assignable to type '{ "error required property may not allow `undefined` value": never; }'
							stringOrNumberRecordOfUndefinedWithKnownNumber,
							{ knownNumber: 4 },
						);
						assertIdenticalTypes(
							stringified,
							createInstanceOf<
								JsonString<typeof stringOrNumberRecordOfUndefinedWithKnownNumber>
							>(),
						);
						assertIdenticalTypes(out, createInstanceOf<{ knownNumber: number }>());
					});

					it("`| number` in string indexed record", () => {
						const { stringified, out } = stringifyThenParse(
							// @ts-expect-error Type 'undefined' is not assignable to type '{ "error required property may not allow `undefined` value": never; }'
							stringRecordOfNumberOrUndefined,
							{ number },
						);
						assertIdenticalTypes(
							stringified,
							createInstanceOf<JsonString<typeof stringRecordOfNumberOrUndefined>>(),
						);
						assertIdenticalTypes(out, createInstanceOf<Record<string, number>>());
					});

					it("`| true` in branded-`string` alias index", () => {
						const { stringified, out } = stringifyThenParse(
							// @ts-expect-error Type 'undefined' is not assignable to type '{ "error required property may not allow `undefined` value": never; }'
							brandedStringAliasIndexOfTrueOrUndefined,
							{},
						);
						assertIdenticalTypes(
							stringified,
							createInstanceOf<JsonString<typeof brandedStringAliasIndexOfTrueOrUndefined>>(),
						);
						assertIdenticalTypes(
							out,
							createInstanceOf<{
								[x: BrandedString]: true;
							}>(),
						);
					});

					it("as optional exact property type > varies by exactOptionalPropertyTypes setting", () => {
						// See sibling test files
					});

					it("under an optional property", () => {
						const { stringified, out } = stringifyThenParse(
							// @ts-expect-error not assignable to `{ "error required property may not allow `undefined` value": never; }`
							objectWithOptionalUndefinedEnclosingRequiredUndefined,
							{ opt: {} },
						);
						assertIdenticalTypes(
							stringified,
							createInstanceOf<
								JsonString<typeof objectWithOptionalUndefinedEnclosingRequiredUndefined>
							>(),
						);
						assertIdenticalTypes(
							out,
							createInstanceOf<{
								opt?: {
									requiredUndefined?: number;
								};
							}>(),
						);
					});
				});

				// Since `unknown` allows `undefined`, any uses of `unknown` must be optional.
				describe("object with required `unknown`", () => {
					it("as exact property type", () => {
						const { stringified, out } = stringifyThenParse(
							// @ts-expect-error not assignable to type '{ "error required property may not allow `unknown` value": never; }'
							objectWithUnknown,
						);
						assertIdenticalTypes(
							stringified,
							createInstanceOf<JsonString<typeof objectWithUnknown>>(),
						);
						assertIdenticalTypes(out, createInstanceOf<{ unknown?: JsonTypeWith<never> }>());
					});
					it("as exact property type adjacent to recursion", () => {
						const { stringified, out } = stringifyThenParse(
							// @ts-expect-error not assignable to type '{ "error required property may not allow `unknown` value": never; }'
							objectWithUnknownAdjacentToOptionalRecursion,
						);
						assertIdenticalTypes(
							stringified,
							createInstanceOf<
								JsonString<typeof objectWithUnknownAdjacentToOptionalRecursion>
							>(),
						);
						assertIdenticalTypes(
							out,
							createInstanceOf<{
								outer: {
									recursive?: ObjectWithOptionalRecursion;
								};
								unknown?: JsonTypeWith<never>;
							}>(),
						);
					});
					it("as exact property type in recursion", () => {
						const { stringified, out } = stringifyThenParse(
							// @ts-expect-error not assignable to type '{ "error required property may not allow `unknown` value": never; }'
							objectWithUnknownInOptionalRecursion,
						);
						assertIdenticalTypes(
							stringified,
							createInstanceOf<JsonString<typeof objectWithUnknownInOptionalRecursion>>(),
						);
						assertIdenticalTypes(
							out,
							createInstanceOf<{
								unknown?: JsonTypeWith<never>;
								recurse?: OpaqueJsonDeserialized<typeof objectWithUnknownInOptionalRecursion>;
							}>(),
						);
					});
				});

				describe("of class instance", () => {
					it("with private data", () => {
						const { stringified, out } = stringifyThenParse(
							// @ts-expect-error SerializationErrorPerNonPublicProperties
							classInstanceWithPrivateData,
							{
								public: "public",
								// secret is also not allowed but is present
								secret: 0,
							},
						);
						assertIdenticalTypes(
							stringified,
							createInstanceOf<JsonString<typeof classInstanceWithPrivateData>>(),
						);
						assertIdenticalTypes(out, createInstanceOf<{ public: string }>());
					});
					it("with private method", () => {
						const { stringified, out } = stringifyThenParse(
							// @ts-expect-error SerializationErrorPerNonPublicProperties
							classInstanceWithPrivateMethod,
							{
								public: "public",
							},
						);
						assertIdenticalTypes(
							stringified,
							createInstanceOf<JsonString<typeof classInstanceWithPrivateMethod>>(),
						);
						assertIdenticalTypes(out, createInstanceOf<{ public: string }>());
					});
					it("with private getter", () => {
						const { stringified, out } = stringifyThenParse(
							// @ts-expect-error SerializationErrorPerNonPublicProperties
							classInstanceWithPrivateGetter,
							{
								public: "public",
							},
						);
						assertIdenticalTypes(
							stringified,
							createInstanceOf<JsonString<typeof classInstanceWithPrivateGetter>>(),
						);
						assertIdenticalTypes(out, createInstanceOf<{ public: string }>());
					});
					it("with private setter", () => {
						const { stringified, out } = stringifyThenParse(
							// @ts-expect-error SerializationErrorPerNonPublicProperties
							classInstanceWithPrivateSetter,
							{
								public: "public",
							},
						);
						assertIdenticalTypes(
							stringified,
							createInstanceOf<JsonString<typeof classInstanceWithPrivateSetter>>(),
						);
						assertIdenticalTypes(out, createInstanceOf<{ public: string }>());
					});
					it("with public method", () => {
						const { stringified, out } = stringifyThenParse(
							// @ts-expect-error function not assignable to never
							classInstanceWithPublicMethod,
							{ public: "public" },
						);
						assertIdenticalTypes(
							stringified,
							createInstanceOf<JsonString<typeof classInstanceWithPublicMethod>>(),
						);
						assertIdenticalTypes(out, createInstanceOf<{ public: string }>());
						// @ts-expect-error getSecret is missing, but required
						assertIdenticalTypes(out, classInstanceWithPublicMethod);
						assert.ok(
							classInstanceWithPublicMethod instanceof ClassWithPublicMethod,
							"classInstanceWithPublicMethod is an instance of ClassWithPublicMethod",
						);
						assert.ok(
							!(out instanceof ClassWithPublicMethod),
							"out is not an instance of ClassWithPublicMethod",
						);
					});
					it("with private data in optional recursion", () => {
						const { stringified, out } = stringifyThenParse(
							// @ts-expect-error SerializationErrorPerNonPublicProperties
							objectWithClassWithPrivateDataInOptionalRecursion,
							{
								class: {
									public: "public",
									// secret is also not allowed but is present
									secret: 0,
								},
								recurse: {
									class: {
										public: "public",
										// secret is also not allowed but is present
										secret: 0,
									},
								},
							},
						);
						assertIdenticalTypes(
							stringified,
							createInstanceOf<
								JsonString<typeof objectWithClassWithPrivateDataInOptionalRecursion>
							>(),
						);
						assertIdenticalTypes(
							out,
							createInstanceOf<{
								class: {
									public: string;
								};
								recurse?: OpaqueJsonDeserialized<
									typeof objectWithClassWithPrivateDataInOptionalRecursion
								>;
							}>(),
						);
					});
				});
			});

			describe("opaque Json types requiring extra allowed types", () => {
				it("opaque serializable object with `bigint`", () => {
					assert.throws(
						() =>
							JsonStringify(
								// @ts-expect-error `bigint` is not supported and `AllowExactly` parameters are incompatible
								opaqueSerializableObjectRequiringBigintSupport,
							),
						new TypeError("Do not know how to serialize a BigInt"),
					);
				});
				it("opaque deserialized object with `bigint`", () => {
					assert.throws(
						() =>
							JsonStringify(
								// @ts-expect-error `bigint` is not supported and `AllowExactly` parameters are incompatible
								opaqueDeserializedObjectRequiringBigintSupport,
							),
						new TypeError("Do not know how to serialize a BigInt"),
					);
				});
				it("opaque serializable and deserialized object with `bigint`", () => {
					assert.throws(
						() =>
							JsonStringify(
								// @ts-expect-error `bigint` is not supported and `AllowExactly` parameters are incompatible
								opaqueSerializableAndDeserializedObjectRequiringBigintSupport,
							),
						new TypeError("Do not know how to serialize a BigInt"),
					);
				});

				it("opaque serializable object with number array expecting `bigint` support", () => {
					const { stringified, out } = stringifyThenParse(
						// @ts-expect-error The types of 'JsonSerializable.Options.AllowExtensionOf' are incompatible between these types. Type 'bigint' is not assignable to type 'never'.
						opaqueSerializableObjectExpectingBigintSupport,
					);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<
							JsonString<typeof opaqueSerializableObjectExpectingBigintSupport>
						>(),
					);
					assertIdenticalTypes(
						out,
						createInstanceOf<
							OpaqueJsonDeserialized<{
								readonlyArrayOfNumbers: readonly number[];
							}>
						>(),
					);
				});
				it("opaque deserialized object with number array expecting `bigint` support", () => {
					const { stringified, out } = stringifyThenParse(
						// @ts-expect-error The types of 'JsonSerializable.Options.AllowExtensionOf' are incompatible between these types. Type 'bigint' is not assignable to type 'never'.
						opaqueDeserializedObjectExpectingBigintSupport,
					);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<
							JsonString<typeof opaqueDeserializedObjectExpectingBigintSupport>
						>(),
					);
					assertIdenticalTypes(
						out,
						createInstanceOf<
							OpaqueJsonDeserialized<{
								readonlyArrayOfNumbers: readonly number[];
							}>
						>(),
					);
				});
				it("opaque serializable and deserialized object with number array expecting `bigint` support", () => {
					const { stringified, out } = stringifyThenParse(
						// @ts-expect-error The types of 'JsonSerializable.Options.AllowExtensionOf' are incompatible between these types. Type 'bigint' is not assignable to type 'never'.
						opaqueSerializableAndDeserializedObjectExpectingBigintSupport,
					);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<
							JsonString<typeof opaqueSerializableAndDeserializedObjectExpectingBigintSupport>
						>(),
					);
					assertIdenticalTypes(
						out,
						createInstanceOf<
							OpaqueJsonDeserialized<{ readonlyArrayOfNumbers: readonly number[] }>
						>(),
					);
				});
			});

			describe("common class instances", () => {
				it("Map", () => {
					const { stringified, out } = stringifyThenParse(
						// @ts-expect-error methods not assignable to never
						mapOfStringsToNumbers,
						{},
					);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<JsonString<typeof mapOfStringsToNumbers>>(),
					);
					assertIdenticalTypes(out, createInstanceOf<{ readonly size: number }>());
					// @ts-expect-error methods are missing, but required
					out satisfies typeof readonlyMapOfStringsToNumbers;
					// @ts-expect-error methods are missing, but required
					assertIdenticalTypes(out, readonlyMapOfStringsToNumbers);
					assert.ok(
						mapOfStringsToNumbers instanceof Map,
						"mapOfStringsToNumbers is an instance of Map",
					);
					assert.ok(!(out instanceof Map), "out is not an instance of Map");
				});
				it("ReadonlyMap", () => {
					const { stringified, out } = stringifyThenParse(
						// @ts-expect-error methods not assignable to never
						readonlyMapOfStringsToNumbers,
						{},
					);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<JsonString<typeof readonlyMapOfStringsToNumbers>>(),
					);
					assertIdenticalTypes(out, createInstanceOf<{ readonly size: number }>());
					// @ts-expect-error methods are missing, but required
					out satisfies typeof readonlyMapOfStringsToNumbers;
					// @ts-expect-error methods are missing, but required
					assertIdenticalTypes(out, readonlyMapOfStringsToNumbers);
					assert.ok(
						mapOfStringsToNumbers instanceof Map,
						"mapOfStringsToNumbers is an instance of Map",
					);
					assert.ok(!(out instanceof Map), "out is not an instance of Map");
				});
				it("Set", () => {
					const { stringified, out } = stringifyThenParse(
						// @ts-expect-error methods not assignable to never
						setOfNumbers,
						{},
					);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<JsonString<typeof setOfNumbers>>(),
					);
					assertIdenticalTypes(out, createInstanceOf<{ readonly size: number }>());
					// @ts-expect-error methods are missing, but required
					out satisfies typeof setOfNumbers;
					// @ts-expect-error methods are missing, but required
					assertIdenticalTypes(out, setOfNumbers);
					assert.ok(
						setOfNumbers instanceof Set,
						"mapOfStringsToNumbers is an instance of Set",
					);
					assert.ok(!(out instanceof Set), "out is not an instance of Set");
				});
				it("ReadonlySet", () => {
					const { stringified, out } = stringifyThenParse(
						// @ts-expect-error methods not assignable to never
						readonlySetOfNumbers,
						{},
					);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<JsonString<typeof readonlySetOfNumbers>>(),
					);
					assertIdenticalTypes(out, createInstanceOf<{ readonly size: number }>());
					// @ts-expect-error methods are missing, but required
					out satisfies typeof setOfNumbers;
					// @ts-expect-error methods are missing, but required
					assertIdenticalTypes(out, setOfNumbers);
					assert.ok(
						setOfNumbers instanceof Set,
						"mapOfStringsToNumbers is an instance of Set",
					);
					assert.ok(!(out instanceof Set), "out is not an instance of Set");
				});
			});

			describe("Fluid types", () => {
				it("`IFluidHandle`", () => {
					const { stringified, out } = stringifyThenParse(
						// @ts-expect-error SerializationErrorPerNonPublicProperties
						fluidHandleToNumber,
						{ isAttached: false },
					);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<JsonString<typeof fluidHandleToNumber>>(),
					);
					assertIdenticalTypes(out, createInstanceOf<{ readonly isAttached: boolean }>());
				});
				it("object with `IFluidHandle`", () => {
					const { stringified, out } = stringifyThenParse(
						// @ts-expect-error SerializationErrorPerNonPublicProperties
						objectWithFluidHandle,
						{ handle: { isAttached: false } },
					);
					assertIdenticalTypes(
						stringified,
						createInstanceOf<JsonString<typeof objectWithFluidHandle>>(),
					);
					assertIdenticalTypes(
						out,
						createInstanceOf<{ handle: { readonly isAttached: boolean } }>(),
					);
				});
			});
		});
	});

	describe("special cases", () => {
		it("explicit `any` generic still limits allowed types", () => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const stringified = JsonStringify<any>(
				// @ts-expect-error `any` is not an open door (expects `JsonTypeWith<never> | OpaqueJsonSerializable<unknown>`)
				undefined,
			);
			assert.strictEqual(stringified, undefined);
		});

		describe("`number` edge cases", () => {
			describe("supported", () => {
				it("MIN_SAFE_INTEGER", () => {
					const { stringified, out } = stringifyThenParse(Number.MIN_SAFE_INTEGER);
					assertIdenticalTypes(stringified, createInstanceOf<JsonString<number>>());
					assertIdenticalTypes(out, createInstanceOf<number>());
				});
				it("MAX_SAFE_INTEGER", () => {
					const { stringified, out } = stringifyThenParse(Number.MAX_SAFE_INTEGER);
					assertIdenticalTypes(stringified, createInstanceOf<JsonString<number>>());
					assertIdenticalTypes(out, createInstanceOf<number>());
				});
				it("MIN_VALUE", () => {
					const { stringified, out } = stringifyThenParse(Number.MIN_VALUE);
					assertIdenticalTypes(stringified, createInstanceOf<JsonString<number>>());
					assertIdenticalTypes(out, createInstanceOf<number>());
				});
				it("MAX_VALUE", () => {
					const { stringified, out } = stringifyThenParse(Number.MAX_VALUE);
					assertIdenticalTypes(stringified, createInstanceOf<JsonString<number>>());
					assertIdenticalTypes(out, createInstanceOf<number>());
				});
			});
			describe("resulting in `null`", () => {
				it("NaN", () => {
					const { stringified, out } = stringifyThenParse(Number.NaN, null);
					assertIdenticalTypes(stringified, createInstanceOf<JsonString<number>>());
					// However, real result is `null`
					assertIdenticalTypes(out, createInstanceOf<number>());
				});

				it("+Infinity", () => {
					const { stringified, out } = stringifyThenParse(Number.POSITIVE_INFINITY, null);
					assertIdenticalTypes(stringified, createInstanceOf<JsonString<number>>());
					// However, real result is `null`
					assertIdenticalTypes(out, createInstanceOf<number>());
				});
				it("-Infinity", () => {
					const { stringified, out } = stringifyThenParse(Number.NEGATIVE_INFINITY, null);
					assertIdenticalTypes(stringified, createInstanceOf<JsonString<number>>());
					// However, real result is `null`
					assertIdenticalTypes(out, createInstanceOf<number>());
				});
			});
		});
	});
});

describe("JsonParse", () => {
	it("parses `JsonString<A> | JsonString<B>` to `JsonDeserialized<A | B>`", () => {
		// Setup
		const jsonString = JsonStringify({ "a": 6 }) as
			| JsonString<{ a: number }>
			| JsonString<{ b: string } | { c: boolean }>;

		// Act
		const parsed = JsonParse(jsonString);

		// Verify
		assertIdenticalTypes(
			parsed,
			createInstanceOf<{ a: number } | { b: string } | { c: boolean }>(),
		);
		assert.deepStrictEqual(parsed, { a: 6 });
	});
});
