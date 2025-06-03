/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable unicorn/no-null */

import { strict as assert } from "node:assert";

import {
	assertIdenticalTypes,
	createInstanceOf,
	replaceBigInt,
	reviveBigInt,
} from "./testUtils.js";
import type {
	ObjectWithOptionalRecursion,
	ObjectWithSymbolOrRecursion,
} from "./testValues.js";
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
	unknownValueOfSimpleRecord,
	unknownValueWithBigint,
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
	stringRecordOfUnknown,
	stringOrNumberRecordOfStrings,
	stringOrNumberRecordOfObjects,
	partialStringRecordOfNumbers,
	partialStringRecordOfUnknown,
	templatedRecordOfNumbers,
	partialTemplatedRecordOfNumbers,
	templatedRecordOfUnknown,
	mixedRecordOfUnknown,
	stringRecordOfNumbersOrStringsWithKnownProperties,
	stringRecordOfUnknownWithKnownProperties,
	partialStringRecordOfUnknownWithKnownProperties,
	stringRecordOfUnknownWithOptionalKnownProperties,
	stringRecordOfUnknownWithKnownUnknown,
	stringRecordOfUnknownWithOptionalKnownUnknown,
	stringOrNumberRecordOfStringWithKnownNumber,
	stringOrNumberRecordOfUndefinedWithKnownNumber,
	objectWithPossibleRecursion,
	objectWithOptionalRecursion,
	objectWithEmbeddedRecursion,
	objectWithAlternatingRecursion,
	objectWithSelfReference,
	objectWithSymbolOrRecursion,
	objectWithUnknownAdjacentToOptionalRecursion,
	objectWithOptionalUnknownAdjacentToOptionalRecursion,
	objectWithUnknownInOptionalRecursion,
	objectWithOptionalUnknownInOptionalRecursion,
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
	functionObjectWithPrivateData,
	functionObjectWithPublicData,
	classInstanceWithPrivateDataAndIsFunction,
	classInstanceWithPublicDataAndIsFunction,
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
	fluidHandleToNumber,
	objectWithFluidHandle,
	objectWithFluidHandleOrRecursion,
	opaqueSerializableObject,
	opaqueDeserializedObject,
	opaqueSerializableAndDeserializedObject,
	opaqueSerializableObjectRequiringBigintSupport,
	opaqueDeserializedObjectRequiringBigintSupport,
	opaqueSerializableAndDeserializedObjectRequiringBigintSupport,
	opaqueSerializableObjectExpectingBigintSupport,
	opaqueDeserializedObjectExpectingBigintSupport,
	opaqueSerializableAndDeserializedObjectExpectingBigintSupport,
} from "./testValues.js";

import type { IFluidHandle } from "@fluidframework/core-interfaces";
import type {
	InternalUtilityTypes,
	JsonDeserialized,
	JsonSerializable,
	JsonSerializableOptions,
	JsonTypeWith,
	NonNullJsonObjectWith,
	OpaqueJsonDeserialized,
	OpaqueJsonSerializable,
	SerializationErrorPerNonPublicProperties,
	SerializationErrorPerUndefinedArrayElement,
} from "@fluidframework/core-interfaces/internal/exposedUtilityTypes";

/**
 * Defined using `JsonSerializable` type filter tests `JsonSerializable` at call site.
 * Internally, value given is round-tripped through JSON serialization to ensure it is
 * unchanged or converted to given optional expected value.
 *
 * @param filteredIn - value to pass through JSON serialization
 * @param expectedDeserialization - alternate value to compare against after round-trip
 * @returns record of the round-tripped value cast to the serializable and deserialized
 * filter result types as `filteredIn` and `out` respectively.
 *
 * @remarks
 * When testing results the `filteredIn` and `out` values are expected to be the same
 * type when there is no deviation from `T`, except for (1) special `never` cases where
 * the deserialized case omits type or property and (2) OpaqueJsonSerializable that is
 * always transformed to OpaqueJsonDeserialized for `out`.
 */
export function passThru<
	const T,
	TExpected,
	// eslint-disable-next-line @typescript-eslint/ban-types
	Options extends JsonSerializableOptions = {},
>(
	filteredIn: JsonSerializable<T, Options>,
	expectedDeserialization?: JsonDeserialized<TExpected>,
): {
	filteredIn: JsonSerializable<T, Options>;
	out: JsonDeserialized<T, Options>;
} {
	const stringified = JSON.stringify(filteredIn);
	if (stringified === undefined) {
		throw new Error("JSON.stringify returned undefined");
	}
	if (expectedDeserialization !== undefined) {
		// When there is a failure, checking the stringified value can be helpful.
		const expectedStringified = JSON.stringify(expectedDeserialization);
		assert.equal(stringified, expectedStringified);
	}
	const result = JSON.parse(stringified) as JsonDeserialized<TExpected>;
	// Don't use nullish coalescing here to allow for `null` to be expected.
	const expected =
		// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
		expectedDeserialization === undefined ? filteredIn : expectedDeserialization;
	assert.deepStrictEqual(result, expected);
	return { filteredIn, out: result as JsonDeserialized<T, Options> };
}

/**
 * Defined using `JsonSerializable` type filter tests `JsonSerializable` at call site.
 *
 * @remarks All uses are expect to trigger a compile-time error that must be ts-ignore'd.
 *
 * @param filteredIn - value to pass through JSON serialization
 * @param error - error expected during serialization round-trip
 * @returns dummy result to allow further type checking
 */
function passThruThrows<const T>(
	filteredIn: JsonSerializable<T>,
	expectedThrow: Error,
): { filteredIn: JsonSerializable<T> } {
	assert.throws(() => passThru(filteredIn), expectedThrow);
	return { filteredIn };
}

/**
 * Similar to {@link passThru} but ignores hidden (private/protected) members.
 */
function passThruIgnoreInaccessibleMembers<const T, TExpected>(
	filteredIn: JsonSerializable<
		T,
		{ IgnoreInaccessibleMembers: "ignore-inaccessible-members" }
	>,
	expected?: JsonDeserialized<TExpected>,
): {
	filteredIn: JsonSerializable<
		T,
		{ IgnoreInaccessibleMembers: "ignore-inaccessible-members" }
	>;
	out: JsonDeserialized<T>;
} {
	return passThru<T, TExpected, { IgnoreInaccessibleMembers: "ignore-inaccessible-members" }>(
		filteredIn,
		expected,
	);
}

/**
 * Similar to {@link passThru} but specifically handles `bigint` values.
 */
function passThruHandlingBigint<const T, TExpected>(
	filteredIn: JsonSerializable<T, { AllowExactly: [bigint] }>,
	expectedDeserialization?: JsonDeserialized<TExpected, { AllowExactly: [bigint] }>,
): {
	filteredIn: JsonSerializable<T, { AllowExactly: [bigint] }>;
	out: JsonDeserialized<T, { AllowExactly: [bigint] }>;
} {
	const stringified = JSON.stringify(filteredIn, replaceBigInt);
	if (stringified === undefined) {
		throw new Error("JSON.stringify returned undefined");
	}
	if (expectedDeserialization !== undefined) {
		// When there is a failure, checking the stringified value can be helpful.
		const expectedStringified = JSON.stringify(expectedDeserialization, replaceBigInt);
		assert.equal(stringified, expectedStringified);
	}
	const out = JSON.parse(stringified, reviveBigInt) as JsonDeserialized<
		T,
		{ AllowExactly: [bigint] }
	>;
	const expected =
		// Don't use nullish coalescing here to allow for `null` to be expected.
		// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
		expectedDeserialization === undefined ? filteredIn : expectedDeserialization;
	assert.deepStrictEqual(out, expected);
	return { filteredIn, out };
}

/**
 * Similar to {@link passThruThrows} but specifically handles `bigint` values.
 */
function passThruHandlingBigintThrows<const T>(
	filteredIn: JsonSerializable<T, { AllowExactly: [bigint] }>,
	expectedThrow: Error,
): { filteredIn: JsonSerializable<T, { AllowExactly: [bigint] }> } {
	assert.throws(() => passThruHandlingBigint(filteredIn), expectedThrow);
	return { filteredIn };
}

/**
 * Similar to {@link passThru} but specifically handles certain function signatures.
 */
function passThruHandlingSpecificFunction<const T>(
	filteredIn: JsonSerializable<T, { AllowExactly: [(_: string) => number] }>,
): {
	filteredIn: JsonSerializable<T, { AllowExactly: [(_: string) => number] }>;
	out: JsonDeserialized<T, { AllowExactly: [(_: string) => number] }>;
} {
	return {
		filteredIn,
		out: undefined as unknown as JsonDeserialized<
			T,
			{ AllowExactly: [(_: string) => number] }
		>,
	};
}

/**
 * Similar to {@link passThru} but specifically handles any Fluid handle.
 */
function passThruHandlingFluidHandle<const T>(
	filteredIn: JsonSerializable<T, { AllowExtensionOf: IFluidHandle }>,
): {
	filteredIn: JsonSerializable<T, { AllowExtensionOf: IFluidHandle }>;
	out: JsonDeserialized<T, { AllowExtensionOf: IFluidHandle }>;
} {
	return {
		filteredIn,
		out: undefined as unknown as JsonDeserialized<T, { AllowExtensionOf: IFluidHandle }>,
	};
}

/**
 * Similar to {@link passThru} but allows `unknown` rather than requiring `JsonTypeWith`.
 */
function passThruAllowingUnknown<const T>(
	filteredIn: JsonSerializable<T, { AllowExactly: [unknown] }>,
): {
	filteredIn: JsonSerializable<T, { AllowExactly: [unknown] }>;
	out: JsonDeserialized<T, { AllowExactly: [unknown] }>;
} {
	return {
		filteredIn,
		out: undefined as unknown as JsonDeserialized<T, { AllowExactly: [unknown] }>,
	};
}

describe("JsonSerializable", () => {
	describe("positive compilation tests", () => {
		describe("supported primitive types", () => {
			it("`boolean`", () => {
				const { filteredIn, out } = passThru(boolean);
				assertIdenticalTypes(filteredIn, boolean);
				assertIdenticalTypes(filteredIn, out);
			});
			it("`number`", () => {
				const { filteredIn, out } = passThru(number);
				assertIdenticalTypes(filteredIn, number);
				assertIdenticalTypes(filteredIn, out);
			});
			it("`string`", () => {
				const { filteredIn, out } = passThru(string);
				assertIdenticalTypes(filteredIn, string);
				assertIdenticalTypes(filteredIn, out);
			});
			it("numeric enum", () => {
				const { filteredIn, out } = passThru(numericEnumValue);
				assertIdenticalTypes(filteredIn, numericEnumValue);
				assertIdenticalTypes(filteredIn, out);
			});
			it("string enum", () => {
				const { filteredIn, out } = passThru(stringEnumValue);
				assertIdenticalTypes(filteredIn, stringEnumValue);
				assertIdenticalTypes(filteredIn, out);
			});
			it("const heterogenous enum", () => {
				const { filteredIn, out } = passThru(constHeterogenousEnumValue);
				assertIdenticalTypes(filteredIn, constHeterogenousEnumValue);
				assertIdenticalTypes(filteredIn, out);
			});
			it("computed enum", () => {
				const { filteredIn, out } = passThru(computedEnumValue);
				assertIdenticalTypes(filteredIn, computedEnumValue);
				assertIdenticalTypes(filteredIn, out);
			});
			it("branded `number`", () => {
				const { filteredIn, out } = passThru(brandedNumber);
				assertIdenticalTypes(filteredIn, brandedNumber);
				assertIdenticalTypes(filteredIn, out);
			});
			it("branded `string`", () => {
				const { filteredIn, out } = passThru(brandedString);
				assertIdenticalTypes(filteredIn, brandedString);
				assertIdenticalTypes(filteredIn, out);
			});
		});

		describe("supported literal types", () => {
			it("`true`", () => {
				const { filteredIn, out } = passThru(true);
				assertIdenticalTypes(filteredIn, true);
				assertIdenticalTypes(filteredIn, out);
			});
			it("`false`", () => {
				const { filteredIn, out } = passThru(false);
				assertIdenticalTypes(filteredIn, false);
				assertIdenticalTypes(filteredIn, out);
			});
			it("`0`", () => {
				const { filteredIn, out } = passThru(0);
				assertIdenticalTypes(filteredIn, 0);
				assertIdenticalTypes(filteredIn, out);
			});
			it('"string"', () => {
				const { filteredIn, out } = passThru("string");
				assertIdenticalTypes(filteredIn, "string");
				assertIdenticalTypes(filteredIn, out);
			});
			it("`null`", () => {
				const { filteredIn, out } = passThru(null);
				assertIdenticalTypes(filteredIn, null);
				assertIdenticalTypes(filteredIn, out);
			});
			it("object with literals", () => {
				const { filteredIn, out } = passThru(objectWithLiterals);
				assertIdenticalTypes(filteredIn, objectWithLiterals);
				assertIdenticalTypes(filteredIn, out);
			});
			it("array of literals", () => {
				const { filteredIn, out } = passThru(arrayOfLiterals);
				assertIdenticalTypes(filteredIn, arrayOfLiterals);
				assertIdenticalTypes(filteredIn, out);
			});
			it("tuple of literals", () => {
				const { filteredIn, out } = passThru(tupleWithLiterals);
				assertIdenticalTypes(filteredIn, tupleWithLiterals);
				assertIdenticalTypes(filteredIn, out);
			});
			it("specific numeric enum value", () => {
				const { filteredIn, out } = passThru(NumericEnum.two);
				assertIdenticalTypes(filteredIn, NumericEnum.two);
				assertIdenticalTypes(filteredIn, out);
			});
			it("specific string enum value", () => {
				const { filteredIn, out } = passThru(StringEnum.b);
				assertIdenticalTypes(filteredIn, StringEnum.b);
				assertIdenticalTypes(filteredIn, out);
			});
			it("specific const heterogenous enum value", () => {
				const { filteredIn, out } = passThru(ConstHeterogenousEnum.zero);
				assertIdenticalTypes(filteredIn, ConstHeterogenousEnum.zero);
				assertIdenticalTypes(filteredIn, out);
			});
			it("specific computed enum value", () => {
				const { filteredIn, out } = passThru(ComputedEnum.computed);
				assertIdenticalTypes(filteredIn, ComputedEnum.computed);
				assertIdenticalTypes(filteredIn, out);
			});
		});

		describe("supported array types", () => {
			it("array of `number`s", () => {
				const { filteredIn, out } = passThru(arrayOfNumbers);
				assertIdenticalTypes(filteredIn, arrayOfNumbers);
				assertIdenticalTypes(filteredIn, out);
			});
			it("readonly array of `number`s", () => {
				const { filteredIn, out } = passThru(readonlyArrayOfNumbers);
				assertIdenticalTypes(filteredIn, readonlyArrayOfNumbers);
				assertIdenticalTypes(filteredIn, out);
			});
			it("readonly array of simple objects", () => {
				const { filteredIn, out } = passThru(readonlyArrayOfObjects);
				assertIdenticalTypes(filteredIn, readonlyArrayOfObjects);
				assertIdenticalTypes(filteredIn, out);
			});
		});

		describe("supported object types", () => {
			it("empty object", () => {
				const { filteredIn, out } = passThru(emptyObject);
				assertIdenticalTypes(filteredIn, emptyObject);
				assertIdenticalTypes(filteredIn, out);
			});

			it("object with `never`", () => {
				const { filteredIn, out } = passThru(objectWithNever);
				assertIdenticalTypes(filteredIn, objectWithNever);
				// @ts-expect-error `out` removes `never` type and thus difference is expected.
				assertIdenticalTypes(filteredIn, out);
				assertIdenticalTypes(out, {});
			});

			it("object with `boolean`", () => {
				const { filteredIn, out } = passThru(objectWithBoolean);
				assertIdenticalTypes(filteredIn, objectWithBoolean);
				assertIdenticalTypes(filteredIn, out);
			});
			it("object with `number`", () => {
				const { filteredIn, out } = passThru(objectWithNumber);
				assertIdenticalTypes(filteredIn, objectWithNumber);
				assertIdenticalTypes(filteredIn, out);
			});
			it("object with `string`", () => {
				const { filteredIn, out } = passThru(objectWithString);
				assertIdenticalTypes(filteredIn, objectWithString);
				assertIdenticalTypes(filteredIn, out);
			});

			it("object with number key", () => {
				const { filteredIn, out } = passThru(objectWithNumberKey);
				assertIdenticalTypes(filteredIn, objectWithNumberKey);
				assertIdenticalTypes(filteredIn, out);
			});

			it("object with array of `number`s", () => {
				const { filteredIn, out } = passThru(objectWithArrayOfNumbers);
				assertIdenticalTypes(filteredIn, objectWithArrayOfNumbers);
				assertIdenticalTypes(filteredIn, out);
			});
			it("readonly array of `number`s", () => {
				const { filteredIn, out } = passThru(objectWithReadonlyArrayOfNumbers);
				assertIdenticalTypes(filteredIn, objectWithReadonlyArrayOfNumbers);
				assertIdenticalTypes(filteredIn, out);
			});

			it("object with branded `number`", () => {
				const { filteredIn, out } = passThru(objectWithBrandedNumber);
				assertIdenticalTypes(filteredIn, objectWithBrandedNumber);
				assertIdenticalTypes(filteredIn, out);
			});
			it("object with branded `string`", () => {
				const { filteredIn, out } = passThru(objectWithBrandedString);
				assertIdenticalTypes(filteredIn, objectWithBrandedString);
				assertIdenticalTypes(filteredIn, out);
			});

			it("`string` indexed record of `number`s", () => {
				const { filteredIn, out } = passThru(stringRecordOfNumbers);
				assertIdenticalTypes(filteredIn, stringRecordOfNumbers);
				assertIdenticalTypes(filteredIn, out);
			});
			it("`string`|`number` indexed record of `string`s", () => {
				const { filteredIn, out } = passThru(stringOrNumberRecordOfStrings);
				assertIdenticalTypes(filteredIn, stringOrNumberRecordOfStrings);
				assertIdenticalTypes(filteredIn, out);
			});
			it("`string`|`number` indexed record of objects", () => {
				const { filteredIn, out } = passThru(stringOrNumberRecordOfObjects);
				assertIdenticalTypes(filteredIn, stringOrNumberRecordOfObjects);
				assertIdenticalTypes(filteredIn, out);
			});
			it("templated record of `numbers`", () => {
				const { filteredIn, out } = passThru(templatedRecordOfNumbers);
				assertIdenticalTypes(templatedRecordOfNumbers, filteredIn);
				assertIdenticalTypes(filteredIn, templatedRecordOfNumbers);
				assertIdenticalTypes(filteredIn, out);
			});
			it("`string` indexed record of `number`|`string`s with known properties", () => {
				const { filteredIn, out } = passThru(
					stringRecordOfNumbersOrStringsWithKnownProperties,
				);
				assertIdenticalTypes(filteredIn, stringRecordOfNumbersOrStringsWithKnownProperties);
				assertIdenticalTypes(filteredIn, out);
			});
			it("`string`|`number` indexed record of `strings` with known `number` property (unassignable)", () => {
				const { filteredIn, out } = passThru(stringOrNumberRecordOfStringWithKnownNumber);
				assertIdenticalTypes(filteredIn, stringOrNumberRecordOfStringWithKnownNumber);
				assertIdenticalTypes(filteredIn, out);
			});

			it("object with possible type recursion through union", () => {
				const { filteredIn, out } = passThru(objectWithPossibleRecursion);
				assertIdenticalTypes(filteredIn, objectWithPossibleRecursion);
				assertIdenticalTypes(filteredIn, out);
			});
			it("object with optional type recursion", () => {
				const { filteredIn, out } = passThru(objectWithOptionalRecursion);
				assertIdenticalTypes(filteredIn, objectWithOptionalRecursion);
				assertIdenticalTypes(filteredIn, out);
			});
			it("object with deep type recursion", () => {
				const { filteredIn, out } = passThru(objectWithEmbeddedRecursion);
				assertIdenticalTypes(filteredIn, objectWithEmbeddedRecursion);
				assertIdenticalTypes(filteredIn, out);
			});
			it("object with alternating type recursion", () => {
				const { filteredIn, out } = passThru(objectWithAlternatingRecursion);
				assertIdenticalTypes(filteredIn, objectWithAlternatingRecursion);
				assertIdenticalTypes(filteredIn, out);
			});

			it("simple non-null object json (NonNullJsonObjectWith<never>)", () => {
				const { filteredIn, out } = passThru(jsonObject);
				assertIdenticalTypes(filteredIn, jsonObject);
				assertIdenticalTypes(filteredIn, out);
			});
			it("simple read-only non-null object json (ReadonlyNonNullJsonObjectWith<never>)", () => {
				const { filteredIn, out } = passThru(immutableJsonObject);
				assertIdenticalTypes(filteredIn, immutableJsonObject);
				assertIdenticalTypes(filteredIn, out);
			});

			it("non-const enums", () => {
				// Note: typescript doesn't do a great job checking that a filtered type satisfies an enum
				// type. The numeric indices are not checked. So far most robust inspection is manually
				// after any change.
				const { filteredIn: resultNumeric } = passThru(NumericEnum);
				assertIdenticalTypes(resultNumeric, NumericEnum);
				const { filteredIn: resultString } = passThru(StringEnum);
				assertIdenticalTypes(resultString, StringEnum);
				const { filteredIn: resultComputed } = passThru(ComputedEnum);
				assertIdenticalTypes(resultComputed, ComputedEnum);
			});

			it("object with `readonly`", () => {
				const { filteredIn, out } = passThru(objectWithReadonly);
				assertIdenticalTypes(filteredIn, objectWithReadonly);
				assertIdenticalTypes(filteredIn, out);
			});

			it("object with getter implemented via value", () => {
				const { filteredIn, out } = passThru(objectWithGetterViaValue);
				assertIdenticalTypes(filteredIn, objectWithGetterViaValue);
				assertIdenticalTypes(filteredIn, out);
			});
			it("object with setter implemented via value", () => {
				const { filteredIn, out } = passThru(objectWithSetterViaValue);
				assertIdenticalTypes(filteredIn, objectWithSetterViaValue);
				assertIdenticalTypes(filteredIn, out);
			});
			it("object with matched getter and setter implemented via value", () => {
				const { filteredIn, out } = passThru(objectWithMatchedGetterAndSetterPropertyViaValue);
				assertIdenticalTypes(filteredIn, objectWithMatchedGetterAndSetterPropertyViaValue);
				assertIdenticalTypes(filteredIn, out);
			});
			it("object with mismatched getter and setter implemented via value", () => {
				const { filteredIn, out } = passThru(
					objectWithMismatchedGetterAndSetterPropertyViaValue,
				);
				assertIdenticalTypes(filteredIn, objectWithMismatchedGetterAndSetterPropertyViaValue);
				assertIdenticalTypes(filteredIn, out);
			});

			describe("class instance", () => {
				it("with public data (just cares about data)", () => {
					const { filteredIn, out } = passThru(classInstanceWithPublicData, {
						public: "public",
					});
					assertIdenticalTypes(filteredIn, classInstanceWithPublicData);
					assertIdenticalTypes(filteredIn, out);
				});
				describe("with `ignore-inaccessible-members`", () => {
					it("with private method ignores method", () => {
						const { filteredIn, out } = passThruIgnoreInaccessibleMembers(
							classInstanceWithPrivateMethod,
							{
								public: "public",
							},
						);
						assertIdenticalTypes(
							filteredIn,
							createInstanceOf<{
								public: string;
							}>(),
						);
						assertIdenticalTypes(filteredIn, out);
						// @ts-expect-error getSecret is missing, but required
						filteredIn satisfies typeof classInstanceWithPrivateMethod;
					});
					it("with private getter ignores getter", () => {
						const { filteredIn, out } = passThruIgnoreInaccessibleMembers(
							classInstanceWithPrivateGetter,
							{
								public: "public",
							},
						);
						assertIdenticalTypes(
							filteredIn,
							createInstanceOf<{
								public: string;
							}>(),
						);
						assertIdenticalTypes(filteredIn, out);
						// @ts-expect-error secret is missing, but required
						filteredIn satisfies typeof classInstanceWithPrivateGetter;
					});
					it("with private setter ignores setter", () => {
						const { filteredIn, out } = passThruIgnoreInaccessibleMembers(
							classInstanceWithPrivateSetter,
							{
								public: "public",
							},
						);
						assertIdenticalTypes(
							filteredIn,
							createInstanceOf<{
								public: string;
							}>(),
						);
						assertIdenticalTypes(filteredIn, out);
						// @ts-expect-error secret is missing, but required
						filteredIn satisfies typeof classInstanceWithPrivateSetter;
					});
				});
			});

			describe("object with optional property", () => {
				it("without property", () => {
					const { filteredIn, out } = passThru(objectWithOptionalNumberNotPresent);
					assertIdenticalTypes(filteredIn, objectWithOptionalNumberNotPresent);
					assertIdenticalTypes(filteredIn, out);
				});
				it("with undefined value", () => {
					const { filteredIn, out } = passThru(objectWithOptionalNumberUndefined, {});
					assertIdenticalTypes(filteredIn, objectWithOptionalNumberUndefined);
					assertIdenticalTypes(filteredIn, out);
				});
				it("with defined value", () => {
					const { filteredIn, out } = passThru(objectWithOptionalNumberDefined);
					assertIdenticalTypes(filteredIn, objectWithOptionalNumberDefined);
					assertIdenticalTypes(filteredIn, out);
				});
			});

			describe("opaque Json types", () => {
				it("opaque serializable object", () => {
					const { filteredIn, out } = passThru(opaqueSerializableObject);
					assertIdenticalTypes(filteredIn, opaqueSerializableObject);
					// @ts-expect-error In this case, `out` has a unique `OpaqueJsonDeserialized` result.
					assertIdenticalTypes(filteredIn, out);
				});
				it("opaque deserialized object", () => {
					const { filteredIn, out } = passThru(opaqueDeserializedObject);
					assertIdenticalTypes(filteredIn, opaqueDeserializedObject);
					assertIdenticalTypes(filteredIn, out);
				});
				it("opaque serializable and deserialized object", () => {
					const { filteredIn, out } = passThru(opaqueSerializableAndDeserializedObject);
					assertIdenticalTypes(filteredIn, opaqueSerializableAndDeserializedObject);
					// @ts-expect-error In this case, `out` has a unique `OpaqueJsonDeserialized` result.
					assertIdenticalTypes(filteredIn, out);
				});
			});
		});

		describe("supported union types", () => {
			it("simple json (JsonTypeWith<never>)", () => {
				const { filteredIn, out } = passThru(simpleJson);
				assertIdenticalTypes(filteredIn, simpleJson);
				assertIdenticalTypes(filteredIn, out);
			});
			it("simple read-only json (ReadonlyJsonTypeWith<never>)", () => {
				const { filteredIn, out } = passThru(simpleImmutableJson);
				assertIdenticalTypes(filteredIn, simpleImmutableJson);
				assertIdenticalTypes(filteredIn, out);
			});
		});

		describe("unsupported object types", () => {
			// This is a reasonable limitation. The type system doesn't have a way to be
			// sure if there is a self reference or not.
			it("object with self reference throws on serialization", () => {
				passThruThrows(
					objectWithSelfReference,
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
						const { filteredIn, out } = passThru(objectWithReadonlyViaGetter, {});
						assertIdenticalTypes(filteredIn, objectWithReadonlyViaGetter);
						assertIdenticalTypes(filteredIn, out);
					});

					it("object with getter", () => {
						const { filteredIn, out } = passThru(objectWithGetter, {});
						assertIdenticalTypes(filteredIn, objectWithGetter);
						assertIdenticalTypes(filteredIn, out);
					});

					it("object with setter", () => {
						const { filteredIn, out } = passThru(objectWithSetter, {});
						assertIdenticalTypes(filteredIn, objectWithSetter);
						assertIdenticalTypes(filteredIn, out);
					});

					it("object with matched getter and setter", () => {
						const { filteredIn, out } = passThru(objectWithMatchedGetterAndSetterProperty, {});
						assertIdenticalTypes(filteredIn, objectWithMatchedGetterAndSetterProperty);
						assertIdenticalTypes(filteredIn, out);
					});

					it("object with mismatched getter and setter", () => {
						const { filteredIn, out } = passThru(
							objectWithMismatchedGetterAndSetterProperty,
							{},
						);
						assertIdenticalTypes(filteredIn, objectWithMismatchedGetterAndSetterProperty);
						assertIdenticalTypes(filteredIn, out);
					});
				});

				describe("class instance", () => {
					describe("with `ignore-inaccessible-members`", () => {
						it("with private data ignores private data (that propagates)", () => {
							const { filteredIn, out } = passThruIgnoreInaccessibleMembers(
								classInstanceWithPrivateData,
								{
									public: "public",
									secret: 0,
								},
							);
							assertIdenticalTypes(
								filteredIn,
								createInstanceOf<{
									public: string;
								}>(),
							);
							// @ts-expect-error secret is missing, but required
							filteredIn satisfies typeof classInstanceWithPrivateData;
							assertIdenticalTypes(filteredIn, out);
						});
					});
				});

				it("sparse array of supported types", () => {
					const { filteredIn, out } = passThru(arrayOfNumbersSparse, [0, null, null, 3]);
					assertIdenticalTypes(filteredIn, arrayOfNumbersSparse);
					assertIdenticalTypes(filteredIn, out);
				});

				it("object with sparse array of supported types", () => {
					const { filteredIn, out } = passThru(objectWithArrayOfNumbersSparse, {
						arrayOfNumbersSparse: [0, null, null, 3],
					});
					assertIdenticalTypes(filteredIn, objectWithArrayOfNumbersSparse);
					assertIdenticalTypes(filteredIn, out);
				});
			});
		});
	});

	describe("negative compilation tests", () => {
		describe("assumptions", () => {
			it("const enums are never readable", () => {
				// ... and thus don't need accounted for by JsonDeserialized.

				const enum LocalConstHeterogenousEnum {
					zero,
					a = "a",
				}

				assert.throws(() => {
					// @ts-expect-error `const enums` are not accessible for reading
					passThru(LocalConstHeterogenousEnum);
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
				const { filteredIn } = passThruThrows(
					// @ts-expect-error `undefined` is not supported (becomes `never`)
					undefined,
					new Error("JSON.stringify returned undefined"),
				);
				filteredIn satisfies never;
			});
			it("`unknown`", () => {
				const { filteredIn } = passThru(
					// @ts-expect-error `unknown` is not supported (expects `JsonTypeWith<never>`)
					{} as unknown,
				); // {} value is actually supported; so, no runtime error.
				assertIdenticalTypes(filteredIn, createInstanceOf<JsonTypeWith<never>>());
			});
			it("`symbol`", () => {
				const { filteredIn } = passThruThrows(
					// @ts-expect-error `symbol` is not supported (becomes `never`)
					symbol,
					new Error("JSON.stringify returned undefined"),
				);
				filteredIn satisfies never;
			});
			it("`unique symbol`", () => {
				const { filteredIn } = passThruThrows(
					// @ts-expect-error [unique] `symbol` is not supported (becomes `never`)
					uniqueSymbol,
					new Error("JSON.stringify returned undefined"),
				);
				filteredIn satisfies never;
			});
			it("`bigint`", () => {
				const { filteredIn } = passThruThrows(
					// @ts-expect-error `bigint` is not supported (becomes `never`)
					bigint,
					new TypeError("Do not know how to serialize a BigInt"),
				);
				filteredIn satisfies never;
			});
			it("function", () => {
				const { filteredIn } = passThruThrows(
					// @ts-expect-error `Function` is not supported (becomes `never`)
					aFunction,
					new Error("JSON.stringify returned undefined"),
				);
				filteredIn satisfies never;
				// Keep this assert at end of scope to avoid assertion altering type
				const varTypeof = typeof aFunction;
				assert(varTypeof === "function", "plain function is a function at runtime");
			});
			it("function with supported properties", () => {
				const { filteredIn } = passThruThrows(
					// @ts-expect-error `Function & {...}` is not supported (becomes `never`)
					functionWithProperties,
					new Error("JSON.stringify returned undefined"),
				);
				filteredIn satisfies never;
				// Keep this assert at end of scope to avoid assertion altering type
				const varTypeof = typeof functionWithProperties;
				assert(varTypeof === "function", "function with properties is a function at runtime");
			});
			it("object and function", () => {
				const { filteredIn } = passThru(
					// @ts-expect-error `{...} & Function` is not supported (becomes `never`)
					objectAndFunction,
					{ property: 6 },
				);
				filteredIn satisfies never;
				// Keep this assert at end of scope to avoid assertion altering type
				const varTypeof = typeof objectAndFunction;
				assert(varTypeof === "object", "object assigned a function is an object at runtime");
			});
			it("object with function with supported properties", () => {
				const { filteredIn } = passThru(
					// @ts-expect-error `{ function: Function & {...}}` is not supported (becomes `{ function: never }`)
					objectWithFunctionWithProperties,
					{},
				);
				assertIdenticalTypes(filteredIn, createInstanceOf<{ function: never }>());
			});
			it("object with object and function", () => {
				const { filteredIn } = passThru(
					// @ts-expect-error `{ object: {...} & Function }` is not supported (becomes `{ object: never }`)
					objectWithObjectAndFunction,
					{ object: { property: 6 } },
				);
				assertIdenticalTypes(filteredIn, createInstanceOf<{ object: never }>());
			});
			it("function with class instance with private data", () => {
				const { filteredIn } = passThruThrows(
					// @ts-expect-error SerializationErrorPerNonPublicProperties
					functionObjectWithPrivateData,
					new Error("JSON.stringify returned undefined"),
				);
				assertIdenticalTypes(
					filteredIn,
					createInstanceOf<SerializationErrorPerNonPublicProperties>(),
				);
				// Keep this assert at end of scope to avoid assertion altering type
				const varTypeof = typeof functionObjectWithPrivateData;
				assert(
					varTypeof === "function",
					"function that is also a class instance is a function at runtime",
				);
			});
			it("function with class instance with public data", () => {
				const { filteredIn } = passThruThrows(
					// @ts-expect-error `Function & {...}` is not supported (becomes `never`)
					functionObjectWithPublicData,
					new Error("JSON.stringify returned undefined"),
				);
				filteredIn satisfies never;
			});
			it("class instance with private data and is function", () => {
				const { filteredIn } = passThru(
					// @ts-expect-error SerializationErrorPerNonPublicProperties
					classInstanceWithPrivateDataAndIsFunction,
					{
						public: "public",
						// secret is also not allowed but is present
						secret: 0,
					},
				);
				assertIdenticalTypes(
					filteredIn,
					createInstanceOf<SerializationErrorPerNonPublicProperties>(),
				);
				// Keep this assert at end of scope to avoid assertion altering type
				const varTypeof = typeof classInstanceWithPrivateDataAndIsFunction;
				assert(
					varTypeof === "object",
					"class instance that is also a function is an object at runtime",
				);
			});
			it("class instance with public data and is function", () => {
				const { filteredIn } = passThru(
					// @ts-expect-error `Function & {...}` is not supported (becomes `never`)
					classInstanceWithPublicDataAndIsFunction,
					{ public: "public" },
				);
				filteredIn satisfies never;
			});
			it("`object` (plain object)", () => {
				const { filteredIn } = passThru(
					// @ts-expect-error `object` is not supported (expects `NonNullJsonObjectWith<never>`)
					object,
					// object's value is actually supported; so, no runtime error.
				);
				assertIdenticalTypes(filteredIn, createInstanceOf<NonNullJsonObjectWith<never>>());
			});
			it("`void`", () => {
				const { filteredIn } = passThru(
					// @ts-expect-error `void` is not supported (becomes `never`)
					voidValue,
					// voidValue is actually `null`; so, no runtime error.
				);
				filteredIn satisfies never;
			});
			it("branded `object`", () => {
				const { filteredIn } = passThru(
					// @ts-expect-error SerializationErrorPerNonPublicProperties
					brandedObject,
				);
				assertIdenticalTypes(
					filteredIn,
					createInstanceOf<SerializationErrorPerNonPublicProperties>(),
				);
			});
			it("branded object with `string`", () => {
				const { filteredIn } = passThru(
					// @ts-expect-error SerializationErrorPerNonPublicProperties
					brandedObjectWithString,
				);
				assertIdenticalTypes(
					filteredIn,
					createInstanceOf<SerializationErrorPerNonPublicProperties>(),
				);
			});

			describe("unions with unsupported primitive types", () => {
				it("`string | symbol`", () => {
					const { filteredIn } = passThruThrows(
						// @ts-expect-error `string | symbol` is not assignable to `string`
						stringOrSymbol,
						new Error("JSON.stringify returned undefined"),
					);
					assertIdenticalTypes(filteredIn, string);
				});
				it("`bigint | string`", () => {
					const { filteredIn } = passThru(
						// @ts-expect-error `string | bigint` is not assignable to `string`
						bigintOrString,
					);
					assertIdenticalTypes(filteredIn, string);
				});
				it("`bigint | symbol`", () => {
					const { filteredIn } = passThruThrows(
						// @ts-expect-error `bigint | symbol` is not assignable to `never`
						bigintOrSymbol,
						new Error("JSON.stringify returned undefined"),
					);
					assertIdenticalTypes(filteredIn, createInstanceOf<never>());
				});
				it("`number | bigint | symbol`", () => {
					const { filteredIn } = passThru(
						// @ts-expect-error `number | bigint | symbol` is not assignable to `number`
						numberOrBigintOrSymbol,
						7,
					);
					assertIdenticalTypes(filteredIn, createInstanceOf<number>());
				});
			});

			describe("array", () => {
				it("array of `bigint`s", () => {
					const { filteredIn } = passThruThrows(
						// @ts-expect-error 'bigint' is not supported (becomes 'never')
						arrayOfBigints,
						new TypeError("Do not know how to serialize a BigInt"),
					);
					assertIdenticalTypes(filteredIn, createInstanceOf<never[]>());
				});
				it("array of `symbol`s", () => {
					const { filteredIn } = passThru(
						// @ts-expect-error 'symbol' is not supported (becomes 'never')
						arrayOfSymbols,
						[null],
					);
					assertIdenticalTypes(filteredIn, createInstanceOf<never[]>());
				});
				it("array of `unknown`", () => {
					const { filteredIn } = passThru(
						// @ts-expect-error 'unknown[]' is not assignable to parameter of type 'JsonTypeWith<never>[]'
						arrayOfUnknown,
					);
					assertIdenticalTypes(filteredIn, createInstanceOf<JsonTypeWith<never>[]>());
				});
				it("array of functions", () => {
					const { filteredIn } = passThru(
						// @ts-expect-error `Function` is not supported (becomes 'never')
						arrayOfFunctions,
						[null],
					);
					assertIdenticalTypes(filteredIn, createInstanceOf<never[]>());
				});
				it("array of functions with properties", () => {
					const { filteredIn } = passThru(
						// @ts-expect-error 'Function & {...}' is not supported (becomes 'never')
						arrayOfFunctionsWithProperties,
						[null],
					);
					assertIdenticalTypes(filteredIn, createInstanceOf<never[]>());
				});
				it("array of objects and functions", () => {
					const { filteredIn } = passThru(
						// @ts-expect-error '{...} & Function' is not supported (becomes 'never')
						arrayOfObjectAndFunctions,
						[{ property: 6 }],
					);
					assertIdenticalTypes(filteredIn, createInstanceOf<never[]>());
				});
				it("array of `number | undefined`s", () => {
					const { filteredIn } = passThru(
						// @ts-expect-error 'undefined' is not supported (becomes 'SerializationErrorPerUndefinedArrayElement')
						arrayOfNumbersOrUndefined,
						[0, null, 2],
					);
					assertIdenticalTypes(
						filteredIn,
						createInstanceOf<(number | SerializationErrorPerUndefinedArrayElement)[]>(),
					);
				});
				it("array of `bigint` or basic object", () => {
					const { filteredIn } = passThruThrows(
						// @ts-expect-error 'bigint' is not supported (becomes 'never')
						arrayOfBigintOrObjects,
						new TypeError("Do not know how to serialize a BigInt"),
					);
					assertIdenticalTypes(filteredIn, createInstanceOf<{ property: string }[]>());
				});
				it("array of `symbol` or basic object", () => {
					const { filteredIn } = passThru(
						// @ts-expect-error 'symbol' is not supported (becomes 'never')
						arrayOfSymbolOrObjects,
						[null],
					);
					assertIdenticalTypes(filteredIn, createInstanceOf<{ property: string }[]>());
				});
				it("array of `bigint | symbol`s", () => {
					const { filteredIn } = passThru(
						// @ts-expect-error 'bigint | symbol' is not assignable to 'never'
						arrayOfBigintOrSymbols,
						[null],
					);
					assertIdenticalTypes(filteredIn, createInstanceOf<never[]>());
				});
				it("array of `number | bigint | symbol`s", () => {
					const { filteredIn } = passThru(
						// @ts-expect-error 'number | bigint | symbol' is not assignable to 'number'
						arrayOfNumberBigintOrSymbols,
						[7],
					);
					assertIdenticalTypes(filteredIn, createInstanceOf<number[]>());
				});
			});

			describe("object", () => {
				it("object with exactly `bigint`", () => {
					const { filteredIn } = passThruThrows(
						// @ts-expect-error `bigint` is not supported (becomes `never`)
						objectWithBigint,
						new TypeError("Do not know how to serialize a BigInt"),
					);
					assertIdenticalTypes(filteredIn, createInstanceOf<{ bigint: never }>());
				});
				it("object with optional `bigint`", () => {
					const { filteredIn } = passThruThrows(
						// @ts-expect-error `bigint` is not supported (becomes `never`)
						objectWithOptionalBigint,
						new TypeError("Do not know how to serialize a BigInt"),
					);
					assertIdenticalTypes(filteredIn, createInstanceOf<{ bigint?: never }>());
				});
				it("object with exactly `symbol`", () => {
					const { filteredIn } = passThru(
						// @ts-expect-error `symbol` is not supported (becomes `never`)
						objectWithSymbol,
						{},
					);
					assertIdenticalTypes(filteredIn, createInstanceOf<{ symbol: never }>());
				});
				it("object with optional `symbol`", () => {
					const { filteredIn } = passThru(
						// @ts-expect-error `symbol` is not supported (becomes `never`)
						objectWithOptionalSymbol,
						{},
					);
					assertIdenticalTypes(filteredIn, createInstanceOf<{ symbol?: never }>());
				});
				it("object with exactly `function`", () => {
					const { filteredIn } = passThru(
						// @ts-expect-error `Function` is not supported (becomes `never`)
						objectWithFunction,
						{},
					);
					assertIdenticalTypes(filteredIn, createInstanceOf<{ function: never }>());
				});
				it("object with exactly `Function | symbol`", () => {
					const { filteredIn } = passThru(
						// @ts-expect-error `symbol | (() => void)` is not supported (becomes `never`)
						objectWithFunctionOrSymbol,
						{},
					);
					assertIdenticalTypes(filteredIn, createInstanceOf<{ functionOrSymbol: never }>());
				});
				it("object with exactly `string | symbol`", () => {
					const { filteredIn } = passThru(
						// @ts-expect-error `string | symbol` is not assignable to `string`
						objectWithStringOrSymbol,
						{},
					);
					assertIdenticalTypes(filteredIn, createInstanceOf<{ stringOrSymbol: string }>());
				});
				it("object with exactly `bigint | string`", () => {
					const { filteredIn } = passThru(
						// @ts-expect-error `bigint | string` is not assignable to `string`
						objectWithBigintOrString,
						// value is a string; so no runtime error.
					);
					assertIdenticalTypes(filteredIn, createInstanceOf<{ bigintOrString: string }>());
				});
				it("object with exactly `bigint | symbol`", () => {
					const { filteredIn } = passThru(
						// @ts-expect-error `bigint | symbol` is not assignable to `never`
						objectWithBigintOrSymbol,
						{},
					);
					assertIdenticalTypes(filteredIn, createInstanceOf<{ bigintOrSymbol: never }>());
				});
				it("object with exactly `number | bigint | symbol`", () => {
					const { filteredIn } = passThru(
						// @ts-expect-error `number | bigint | symbol` is not assignable to `number`
						objectWithNumberOrBigintOrSymbol,
						{ numberOrBigintOrSymbol: 7 },
					);
					assertIdenticalTypes(
						filteredIn,
						createInstanceOf<{ numberOrBigintOrSymbol: number }>(),
					);
				});

				it("object with array of `bigint`s", () => {
					const { filteredIn } = passThruThrows(
						// @ts-expect-error 'bigint' is not supported (becomes 'never')
						objectWithArrayOfBigints,
						new TypeError("Do not know how to serialize a BigInt"),
					);
					assertIdenticalTypes(filteredIn, createInstanceOf<{ arrayOfBigints: never[] }>());
				});
				it("object with array of `symbol`s", () => {
					const { filteredIn } = passThru(
						// @ts-expect-error 'symbol' is not supported (becomes 'never')
						objectWithArrayOfSymbols,
						{ arrayOfSymbols: [null] },
					);
					assertIdenticalTypes(filteredIn, createInstanceOf<{ arrayOfSymbols: never[] }>());
				});
				it("object with array of `unknown`", () => {
					const { filteredIn } = passThru(
						// @ts-expect-error 'unknown[]' is not assignable to parameter of type 'JsonTypeWith<never>[]'
						objectWithArrayOfUnknown,
					);
					assertIdenticalTypes(
						filteredIn,
						createInstanceOf<{ arrayOfUnknown: JsonTypeWith<never>[] }>(),
					);
				});
				it("object with array of functions", () => {
					const { filteredIn } = passThru(
						// @ts-expect-error `Function` is not supported (becomes 'never')
						objectWithArrayOfFunctions,
						{ arrayOfFunctions: [null] },
					);
					assertIdenticalTypes(filteredIn, createInstanceOf<{ arrayOfFunctions: never[] }>());
				});
				it("object with array of functions with properties", () => {
					const { filteredIn } = passThru(
						// @ts-expect-error 'Function & {...}' is not supported (becomes 'never')
						objectWithArrayOfFunctionsWithProperties,
						{ arrayOfFunctionsWithProperties: [null] },
					);
					assertIdenticalTypes(
						filteredIn,
						createInstanceOf<{ arrayOfFunctionsWithProperties: never[] }>(),
					);
				});
				it("object with array of objects and functions", () => {
					const { filteredIn } = passThru(
						// @ts-expect-error '{...} & Function' is not supported (becomes 'never')
						objectWithArrayOfObjectAndFunctions,
						{ arrayOfObjectAndFunctions: [{ property: 6 }] },
					);
					assertIdenticalTypes(
						filteredIn,
						createInstanceOf<{ arrayOfObjectAndFunctions: never[] }>(),
					);
				});
				it("object with array of `number | undefined`s", () => {
					const { filteredIn } = passThru(
						// @ts-expect-error 'undefined' is not supported (becomes 'SerializationErrorPerUndefinedArrayElement')
						objectWithArrayOfNumbersOrUndefined,
						{ arrayOfNumbersOrUndefined: [0, null, 2] },
					);
					assertIdenticalTypes(
						filteredIn,
						createInstanceOf<{
							arrayOfNumbersOrUndefined: (
								| number
								| SerializationErrorPerUndefinedArrayElement
							)[];
						}>(),
					);
				});
				it("object with array of `bigint` or basic object", () => {
					const { filteredIn } = passThruThrows(
						// @ts-expect-error 'bigint' is not supported (becomes 'never')
						objectWithArrayOfBigintOrObjects,
						new TypeError("Do not know how to serialize a BigInt"),
					);
					assertIdenticalTypes(
						filteredIn,
						createInstanceOf<{ arrayOfBigintOrObjects: { property: string }[] }>(),
					);
				});
				it("object with array of `symbol` or basic object", () => {
					const { filteredIn } = passThru(
						// @ts-expect-error 'symbol' is not supported (becomes 'never')
						objectWithArrayOfSymbolOrObjects,
						{ arrayOfSymbolOrObjects: [null] },
					);
					assertIdenticalTypes(
						filteredIn,
						createInstanceOf<{ arrayOfSymbolOrObjects: { property: string }[] }>(),
					);
				});
				it("object with array of `bigint | symbol`s", () => {
					const objectWithArrayOfBigintOrSymbols = {
						arrayOfBigintOrSymbols: [bigintOrSymbol],
					};
					const { filteredIn } = passThru(
						// @ts-expect-error 'bigint | symbol' is not assignable to 'never'
						objectWithArrayOfBigintOrSymbols,
						{ arrayOfBigintOrSymbols: [null] },
					);
					assertIdenticalTypes(
						filteredIn,
						createInstanceOf<{ arrayOfBigintOrSymbols: never[] }>(),
					);
				});

				it("object with `symbol` key", () => {
					const { filteredIn } = passThru(
						// @ts-expect-error `symbol` key is not supported (property type becomes `never`)
						objectWithSymbolKey,
						{},
					);
					const expected = { [symbol]: undefined as never };
					assertIdenticalTypes(filteredIn, expected);
				});
				it("object with [unique] symbol key", () => {
					const { filteredIn } = passThru(
						// @ts-expect-error symbol key is not supported (property type becomes `never`)
						objectWithUniqueSymbolKey,
						{},
					);
					const expected = { [uniqueSymbol]: undefined as never };
					assertIdenticalTypes(filteredIn, expected);
				});

				it("`string` indexed record of `unknown`", () => {
					// @ts-expect-error not assignable to parameter of type '{ [x: string]: JsonTypeWith<never>; }'.
					const { filteredIn } = passThru(stringRecordOfUnknown);
					assertIdenticalTypes(
						filteredIn,
						createInstanceOf<{ [x: string]: JsonTypeWith<never> }>(),
					);
				});
				it("`Partial<>` `string` indexed record of `unknown`", () => {
					// @ts-expect-error not assignable to parameter of type '{ [x: string]: JsonTypeWith<never>; }'.
					const { filteredIn } = passThru(partialStringRecordOfUnknown);
					assertIdenticalTypes(
						filteredIn,
						createInstanceOf<{ [x: string]: JsonTypeWith<never> }>(),
					);
				});

				it("`Partial<>` `string` indexed record of `numbers`", () => {
					// Warning: as of TypeScript 5.8.2, a Partial<> of an indexed type
					// gains `| undefined` even under exactOptionalPropertyTypes=true.
					// Preferred result is that there is no change applying Partial<>.
					// Allowing `undefined` is possible if all indexed properties are
					// identifiable. But rather than that, an implementation of `Partial<>`
					// that doesn't add `| undefined` for index signatures would be preferred.
					// @ts-expect-error not assignable to type '{ "error required property may not allow `undefined` value": never; }'
					const { filteredIn } = passThru(partialStringRecordOfNumbers, { key1: 0 });
					assertIdenticalTypes(
						filteredIn,
						createInstanceOf<{
							[x: string]: {
								"error required property may not allow `undefined` value": never;
							};
						}>(),
					);
				});
				it("`Partial<>` templated record of `numbers`", () => {
					// Warning: as of TypeScript 5.8.2, a Partial<> of an indexed type
					// gains `| undefined` even under exactOptionalPropertyTypes=true.
					// Preferred result is that there is no change applying Partial<>.
					// Allowing `undefined` is possible if all indexed properties are
					// identifiable. But rather than that, an implementation of `Partial<>`
					// that doesn't add `| undefined` for index signatures would be preferred.
					// @ts-expect-error not assignable to type '{ "error required property may not allow `undefined` value": never; }'
					const { filteredIn } = passThru(partialTemplatedRecordOfNumbers, { key1: 0 });
					assertIdenticalTypes(
						filteredIn,
						createInstanceOf<{
							[x: `key${number}`]: {
								"error required property may not allow `undefined` value": never;
							};
						}>(),
					);
				});

				it("object with recursion and `symbol`", () => {
					const { filteredIn } = passThru(
						// @ts-expect-error 'ObjectWithSymbolOrRecursion' is not assignable to parameter of type '{ recurse: ObjectWithSymbolOrRecursion; }' (`symbol` becomes `never`)
						objectWithSymbolOrRecursion,
						{ recurse: {} },
					);
					assertIdenticalTypes(
						filteredIn,
						createInstanceOf<{
							recurse: ObjectWithSymbolOrRecursion;
						}>(),
					);
				});

				it("function object with recursion", () => {
					const { filteredIn } = passThruThrows(
						// @ts-expect-error 'SelfRecursiveFunctionWithProperties' is not assignable to parameter of type 'never' (function even with properties becomes `never`)
						selfRecursiveFunctionWithProperties,
						new Error("JSON.stringify returned undefined"),
					);
					filteredIn satisfies never;
					// Keep this assert at end of scope to avoid assertion altering
					const varTypeof = typeof selfRecursiveFunctionWithProperties;
					assert(
						varTypeof === "function",
						"self recursive function with properties is a function at runtime",
					);
				});
				it("object and function with recursion", () => {
					const { filteredIn } = passThru(
						// @ts-expect-error 'SelfRecursiveObjectAndFunction' is not assignable to parameter of type 'never' (function even with properties becomes `never`)
						selfRecursiveObjectAndFunction,
						{ recurse: {} },
					);
					filteredIn satisfies never;
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
					const { filteredIn } = passThru(
						// @ts-expect-error 'SelfRecursiveFunctionWithProperties' is not assignable to parameter of type 'never' (function even with properties becomes `never`)
						objectWithNestedFunctionWithPropertiesAndRecursion,
						{},
					);
					assertIdenticalTypes(filteredIn, createInstanceOf<{ outerFnOjb: never }>());
				});
				it("nested object and function with recursion", () => {
					const objectWithNestedObjectAndFunctionWithRecursion = {
						outerFnOjb: selfRecursiveObjectAndFunction,
					};
					const { filteredIn } = passThru(
						// @ts-expect-error 'SelfRecursiveObjectAndFunction' is not assignable to parameter of type 'never' (function even with properties becomes `never`)
						objectWithNestedObjectAndFunctionWithRecursion,
						{ outerFnOjb: { recurse: {} } },
					);
					assertIdenticalTypes(filteredIn, createInstanceOf<{ outerFnOjb: never }>());
				});

				it("object with inherited recursion extended with unsupported properties", () => {
					const { filteredIn } = passThru(
						// @ts-expect-error 'ObjectInheritingOptionalRecursionAndWithNestedSymbol' is not assignable to parameter of type '...' (symbol at complex.symbol becomes `never`)
						objectInheritingOptionalRecursionAndWithNestedSymbol,
						{
							recursive: { recursive: { recursive: {} } },
							complex: { number: 0 },
						},
					);
					assertIdenticalTypes(
						filteredIn,
						createInstanceOf<{
							recursive?: ObjectWithOptionalRecursion;
							complex: { number: number; symbol: never };
						}>(),
					);
				});

				describe("object with `undefined`", () => {
					it("as exact property type", () => {
						const { filteredIn } = passThru(
							// @ts-expect-error not assignable to type '{ "error required property may not allow `undefined` value": never; }'
							objectWithUndefined,
							{},
						);
						assertIdenticalTypes(
							filteredIn,
							createInstanceOf<{
								undef: { "error required property may not allow `undefined` value": never };
							}>(),
						);
					});
					it("in union property", () => {
						const { filteredIn: resultUndefined } = passThru(
							// @ts-expect-error not assignable to type '{ "error required property may not allow `undefined` value": never; }'
							objectWithNumberOrUndefinedUndefined,
							{},
						);
						assertIdenticalTypes(
							resultUndefined,
							createInstanceOf<{
								numOrUndef: {
									"error required property may not allow `undefined` value": never;
								};
							}>(),
						);
						const { filteredIn: resultNumbered } = passThru(
							// @ts-expect-error not assignable to `{ "error required property may not allow `undefined` value": never; }`
							objectWithNumberOrUndefinedNumbered,
						);
						assertIdenticalTypes(
							resultNumbered,
							createInstanceOf<{
								numOrUndef: {
									"error required property may not allow `undefined` value": never;
								};
							}>(),
						);
					});
					it("as exact property type of `string` indexed record", () => {
						const { filteredIn } = passThru(
							// @ts-expect-error not assignable to type '{ "error required property may not allow `undefined` value": never; }'
							stringRecordOfUndefined,
							{},
						);
						assertIdenticalTypes(
							filteredIn,
							createInstanceOf<{
								[x: string]: {
									"error required property may not allow `undefined` value": never;
								};
							}>(),
						);
					});
					it("as exact property type of `string` indexed record intersected with known `number` property (unassignable)", () => {
						const { filteredIn } = passThru(
							// @ts-expect-error Type 'undefined' is not assignable to type '{ "error required property may not allow `undefined` value": never; }'
							stringOrNumberRecordOfUndefinedWithKnownNumber,
							{ knownNumber: 4 },
						);
						assertIdenticalTypes(
							filteredIn,
							createInstanceOf<
								InternalUtilityTypes.FlattenIntersection<
									{
										[x: string | number]: {
											"error required property may not allow `undefined` value": never;
										};
									} & {
										knownNumber: number;
									}
								>
							>(),
						);
					});

					it("as optional exact property type > varies by exactOptionalPropertyTypes setting", () => {
						// See sibling test files
					});

					it("under an optional property", () => {
						const { filteredIn } = passThru(
							// @ts-expect-error not assignable to `{ "error required property may not allow `undefined` value": never; }`
							objectWithOptionalUndefinedEnclosingRequiredUndefined,
							{ opt: {} },
						);
						assertIdenticalTypes(
							filteredIn,
							createInstanceOf<{
								opt?: {
									requiredUndefined: {
										"error required property may not allow `undefined` value": never;
									};
								};
							}>(),
						);
					});
				});

				// While `unknown` may be "exactly allowed", since `unknown` allows `undefined`,
				// any uses of `unknown` must be optional.
				describe("object with required `unknown` even though exactly allowed", () => {
					it("as exact property type", () => {
						const { filteredIn } = passThruAllowingUnknown(
							// @ts-expect-error not assignable to type '{ "error required property may not allow `unknown` value": never; }'
							objectWithUnknown,
						);
						assertIdenticalTypes(
							filteredIn,
							createInstanceOf<{
								unknown: { "error required property may not allow `unknown` value": never };
							}>(),
						);
					});
					it("as exact property type adjacent to recursion", () => {
						const { filteredIn } = passThruAllowingUnknown(
							// @ts-expect-error not assignable to type '{ "error required property may not allow `unknown` value": never; }'
							objectWithUnknownAdjacentToOptionalRecursion,
						);
						assertIdenticalTypes(
							filteredIn,
							createInstanceOf<{
								unknown: {
									"error required property may not allow `unknown` value": never;
								};
								outer: {
									recursive?: {
										recursive?: typeof objectWithOptionalRecursion;
									};
								};
							}>(),
						);
					});
					it("as exact property type in recursion", () => {
						const { filteredIn } = passThruAllowingUnknown(
							// @ts-expect-error not assignable to type '{ "error required property may not allow `unknown` value": never; }'
							objectWithUnknownInOptionalRecursion,
						);
						assertIdenticalTypes(
							filteredIn,
							createInstanceOf<{
								unknown: {
									"error required property may not allow `unknown` value": never;
								};
								recurse?: {
									unknown: {
										"error required property may not allow `unknown` value": never;
									};
									recurse?: typeof objectWithUnknownInOptionalRecursion;
								};
							}>(),
						);
					});
				});

				describe("of class instance", () => {
					it("with private data", () => {
						const { filteredIn } = passThru(
							// @ts-expect-error SerializationErrorPerNonPublicProperties
							classInstanceWithPrivateData,
							{
								public: "public",
								// secret is also not allowed but is present
								secret: 0,
							},
						);
						assertIdenticalTypes(
							filteredIn,
							createInstanceOf<SerializationErrorPerNonPublicProperties>(),
						);
					});
					it("with private method", () => {
						const { filteredIn } = passThru(
							// @ts-expect-error SerializationErrorPerNonPublicProperties
							classInstanceWithPrivateMethod,
							{
								public: "public",
							},
						);
						assertIdenticalTypes(
							filteredIn,
							createInstanceOf<SerializationErrorPerNonPublicProperties>(),
						);
					});
					it("with private getter", () => {
						const { filteredIn } = passThru(
							// @ts-expect-error SerializationErrorPerNonPublicProperties
							classInstanceWithPrivateGetter,
							{
								public: "public",
							},
						);
						assertIdenticalTypes(
							filteredIn,
							createInstanceOf<SerializationErrorPerNonPublicProperties>(),
						);
					});
					it("with private setter", () => {
						const { filteredIn } = passThru(
							// @ts-expect-error SerializationErrorPerNonPublicProperties
							classInstanceWithPrivateSetter,
							{
								public: "public",
							},
						);
						assertIdenticalTypes(
							filteredIn,
							createInstanceOf<SerializationErrorPerNonPublicProperties>(),
						);
					});
					it("with public method", () => {
						const { filteredIn } = passThru(
							// @ts-expect-error function not assignable to never
							classInstanceWithPublicMethod,
							{ public: "public" },
						);
						assertIdenticalTypes(
							filteredIn,
							createInstanceOf<{
								public: string;
								getSecret: never;
							}>(),
						);
					});
				});
			});

			describe("opaque Json types requiring extra allowed types", () => {
				it("opaque serializable object with `bigint`", () => {
					const { filteredIn } = passThruThrows(
						// @ts-expect-error `bigint` is not supported (becomes `never`)
						opaqueSerializableObjectRequiringBigintSupport,
						new TypeError("Do not know how to serialize a BigInt"),
					);
					assertIdenticalTypes(
						filteredIn,
						createInstanceOf<OpaqueJsonSerializable<{ bigint: never }>>(),
					);
				});
				it("opaque deserialized object with `bigint`", () => {
					const { filteredIn } = passThruThrows(
						// @ts-expect-error `bigint` is not supported (becomes `never`)
						opaqueDeserializedObjectRequiringBigintSupport,
						new TypeError("Do not know how to serialize a BigInt"),
					);
					assertIdenticalTypes(
						filteredIn,
						createInstanceOf<OpaqueJsonDeserialized<{ bigint: never }>>(),
					);
				});
				it("opaque serializable and deserialized object with `bigint`", () => {
					const { filteredIn } = passThruThrows(
						// @ts-expect-error `bigint` is not supported (becomes `never`)
						opaqueSerializableAndDeserializedObjectRequiringBigintSupport,
						new TypeError("Do not know how to serialize a BigInt"),
					);
					assertIdenticalTypes(
						filteredIn,
						createInstanceOf<
							OpaqueJsonSerializable<{ bigint: never }> &
								OpaqueJsonDeserialized<{ bigint: never }>
						>(),
					);
				});

				it("opaque serializable object with number array expecting `bigint` support", () => {
					const { filteredIn } = passThru(
						// @ts-expect-error The types of 'JsonSerializable.Options.AllowExtensionOf' are incompatible between these types. Type 'bigint' is not assignable to type 'never'.
						opaqueSerializableObjectExpectingBigintSupport,
					);
					assertIdenticalTypes(
						filteredIn,
						createInstanceOf<
							OpaqueJsonSerializable<{ readonlyArrayOfNumbers: readonly number[] }>
						>(),
					);
				});
				it("opaque deserialized object with number array expecting `bigint` support", () => {
					const { filteredIn } = passThru(
						// @ts-expect-error The types of 'JsonSerializable.Options.AllowExtensionOf' are incompatible between these types. Type 'bigint' is not assignable to type 'never'.
						opaqueDeserializedObjectExpectingBigintSupport,
					);
					assertIdenticalTypes(
						filteredIn,
						createInstanceOf<
							OpaqueJsonDeserialized<{ readonlyArrayOfNumbers: readonly number[] }>
						>(),
					);
				});
				it("opaque serializable and deserialized object with number array expecting `bigint` support", () => {
					const { filteredIn } = passThru(
						// @ts-expect-error The types of 'JsonSerializable.Options.AllowExtensionOf' are incompatible between these types. Type 'bigint' is not assignable to type 'never'.
						opaqueSerializableAndDeserializedObjectExpectingBigintSupport,
					);
					assertIdenticalTypes(
						filteredIn,
						createInstanceOf<
							OpaqueJsonSerializable<{ readonlyArrayOfNumbers: readonly number[] }> &
								OpaqueJsonDeserialized<{ readonlyArrayOfNumbers: readonly number[] }>
						>(),
					);
				});
			});

			describe("common class instances", () => {
				it("Map", () => {
					const { filteredIn } = passThru(
						// @ts-expect-error methods not assignable to never
						mapOfStringsToNumbers,
						{},
					);
					assertIdenticalTypes(
						filteredIn,
						createInstanceOf<{
							clear: never;
							delete: never;
							forEach: never;
							get: never;
							has: never;
							set: never;
							readonly size: number;
							entries: never;
							keys: never;
							values: never;
							[Symbol.iterator]: never;
							[Symbol.toStringTag]: never;
						}>(),
					);
				});
				it("ReadonlyMap", () => {
					const { filteredIn } = passThru(
						// @ts-expect-error methods not assignable to never
						readonlyMapOfStringsToNumbers,
						{},
					);
					assertIdenticalTypes(
						filteredIn,
						createInstanceOf<{
							forEach: never;
							get: never;
							has: never;
							readonly size: number;
							entries: never;
							keys: never;
							values: never;
							[Symbol.iterator]: never;
						}>(),
					);
				});
				it("Set", () => {
					const { filteredIn } = passThru(
						// @ts-expect-error methods not assignable to never
						setOfNumbers,
						{},
					);
					assertIdenticalTypes(
						filteredIn,
						createInstanceOf<{
							add: never;
							clear: never;
							delete: never;
							forEach: never;
							has: never;
							readonly size: number;
							entries: never;
							keys: never;
							values: never;
							[Symbol.iterator]: never;
							[Symbol.toStringTag]: never;
						}>(),
					);
				});
				it("ReadonlySet", () => {
					const { filteredIn } = passThru(
						// @ts-expect-error methods not assignable to never
						readonlySetOfNumbers,
						{},
					);
					assertIdenticalTypes(
						filteredIn,
						createInstanceOf<{
							forEach: never;
							has: never;
							readonly size: number;
							entries: never;
							keys: never;
							values: never;
							[Symbol.iterator]: never;
						}>(),
					);
				});
			});
		});
	});

	describe("special cases", () => {
		it("explicit `any` generic still limits allowed types", () => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const { filteredIn } = passThruThrows<any>(
				// @ts-expect-error `any` is not an open door (expects `JsonTypeWith<never>`)
				undefined,
				new Error("JSON.stringify returned undefined"),
			);
			assertIdenticalTypes(filteredIn, createInstanceOf<JsonTypeWith<never>>());
		});

		describe("`number` edge cases", () => {
			describe("supported", () => {
				it("MIN_SAFE_INTEGER", () => {
					const { filteredIn, out } = passThru(Number.MIN_SAFE_INTEGER);
					assertIdenticalTypes(filteredIn, createInstanceOf<number>());
					assertIdenticalTypes(filteredIn, out);
				});
				it("MAX_SAFE_INTEGER", () => {
					const { filteredIn, out } = passThru(Number.MAX_SAFE_INTEGER);
					assertIdenticalTypes(filteredIn, createInstanceOf<number>());
					assertIdenticalTypes(filteredIn, out);
				});
				it("MIN_VALUE", () => {
					const { filteredIn, out } = passThru(Number.MIN_VALUE);
					assertIdenticalTypes(filteredIn, createInstanceOf<number>());
					assertIdenticalTypes(filteredIn, out);
				});
				it("MAX_VALUE", () => {
					const { filteredIn, out } = passThru(Number.MAX_VALUE);
					assertIdenticalTypes(filteredIn, createInstanceOf<number>());
					assertIdenticalTypes(filteredIn, out);
				});
			});
			describe("resulting in `null`", () => {
				it("NaN", () => {
					const { filteredIn, out } = passThru(Number.NaN, null);
					assertIdenticalTypes(filteredIn, createInstanceOf<number>());
					assertIdenticalTypes(filteredIn, out);
				});

				it("+Infinity", () => {
					const { filteredIn, out } = passThru(Number.POSITIVE_INFINITY, null);
					assertIdenticalTypes(filteredIn, createInstanceOf<number>());
					assertIdenticalTypes(filteredIn, out);
				});
				it("-Infinity", () => {
					const { filteredIn, out } = passThru(Number.NEGATIVE_INFINITY, null);
					assertIdenticalTypes(filteredIn, createInstanceOf<number>());
					assertIdenticalTypes(filteredIn, out);
				});
			});
		});

		describe("using alternately allowed types", () => {
			describe("are supported", () => {
				it("`bigint`", () => {
					const { filteredIn, out } = passThruHandlingBigint(bigint);
					assertIdenticalTypes(filteredIn, createInstanceOf<bigint>());
					assertIdenticalTypes(filteredIn, out);
				});
				it("object with `bigint`", () => {
					const { filteredIn, out } = passThruHandlingBigint(objectWithBigint);
					assertIdenticalTypes(filteredIn, objectWithBigint);
					assertIdenticalTypes(filteredIn, out);
				});
				it("object with optional `bigint`", () => {
					const { filteredIn, out } = passThruHandlingBigint(objectWithOptionalBigint);
					assertIdenticalTypes(filteredIn, objectWithOptionalBigint);
					assertIdenticalTypes(filteredIn, out);
				});
				it("array of `bigint`s", () => {
					const { filteredIn, out } = passThruHandlingBigint(arrayOfBigints);
					assertIdenticalTypes(filteredIn, arrayOfBigints);
					assertIdenticalTypes(filteredIn, out);
				});
				it("array of `bigint` or basic object", () => {
					const { filteredIn, out } = passThruHandlingBigint(arrayOfBigintOrObjects);
					assertIdenticalTypes(filteredIn, arrayOfBigintOrObjects);
					assertIdenticalTypes(filteredIn, out);
				});
				it("object with specific alternately allowed function", () => {
					const objectWithSpecificFn = {
						specificFn: (v: string) => v.length,
					};
					const { filteredIn, out } = passThruHandlingSpecificFunction(objectWithSpecificFn);
					assertIdenticalTypes(filteredIn, objectWithSpecificFn);
					assertIdenticalTypes(filteredIn, out);
				});
				it("`IFluidHandle`", () => {
					const { filteredIn, out } = passThruHandlingFluidHandle(fluidHandleToNumber);
					assertIdenticalTypes(filteredIn, createInstanceOf<IFluidHandle<number>>());
					assertIdenticalTypes(filteredIn, out);
				});
				it("object with `IFluidHandle`", () => {
					const { filteredIn, out } = passThruHandlingFluidHandle(objectWithFluidHandle);
					assertIdenticalTypes(filteredIn, objectWithFluidHandle);
					assertIdenticalTypes(filteredIn, out);
				});
				it("object with `IFluidHandle` and recursion", () => {
					const { filteredIn, out } = passThruHandlingFluidHandle(
						objectWithFluidHandleOrRecursion,
					);
					assertIdenticalTypes(filteredIn, objectWithFluidHandleOrRecursion);
					assertIdenticalTypes(filteredIn, out);
				});
				it("`unknown`", () => {
					const { filteredIn, out } = passThruAllowingUnknown(
						unknownValueOfSimpleRecord,
						// value is actually supported; so, no runtime error.
					);
					assertIdenticalTypes(filteredIn, unknownValueOfSimpleRecord);
					assertIdenticalTypes(filteredIn, out);
				});
				it("array of `unknown`", () => {
					const { filteredIn, out } = passThruAllowingUnknown(arrayOfUnknown);
					assertIdenticalTypes(filteredIn, arrayOfUnknown);
					assertIdenticalTypes(filteredIn, out);
				});
				it("object with array of `unknown`", () => {
					const { filteredIn, out } = passThruAllowingUnknown(objectWithArrayOfUnknown);
					assertIdenticalTypes(filteredIn, objectWithArrayOfUnknown);
					assertIdenticalTypes(filteredIn, out);
				});
				it("object with optional `unknown`", () => {
					const { filteredIn, out } = passThruAllowingUnknown(objectWithOptionalUnknown);
					assertIdenticalTypes(filteredIn, objectWithOptionalUnknown);
					assertIdenticalTypes(filteredIn, out);
				});
				it("`string` indexed record of `unknown`", () => {
					const { filteredIn, out } = passThruAllowingUnknown(stringRecordOfUnknown);
					assertIdenticalTypes(filteredIn, stringRecordOfUnknown);
					assertIdenticalTypes(filteredIn, out);
				});
				it("templated record of `unknown`", () => {
					const { filteredIn, out } = passThruAllowingUnknown(templatedRecordOfUnknown);
					assertIdenticalTypes(templatedRecordOfUnknown, filteredIn);
					assertIdenticalTypes(filteredIn, templatedRecordOfUnknown);
					assertIdenticalTypes(filteredIn, out);
				});
				it("`string` indexed record of `unknown` and known properties", () => {
					const { filteredIn, out } = passThruAllowingUnknown(
						stringRecordOfUnknownWithKnownProperties,
					);
					assertIdenticalTypes(filteredIn, stringRecordOfUnknownWithKnownProperties);
					assertIdenticalTypes(filteredIn, out);
				});
				it("`string` indexed record of `unknown` and optional known properties", () => {
					const { filteredIn, out } = passThruAllowingUnknown(
						stringRecordOfUnknownWithOptionalKnownProperties,
					);
					assertIdenticalTypes(filteredIn, stringRecordOfUnknownWithOptionalKnownProperties);
					assertIdenticalTypes(filteredIn, out);
				});
				it("`string` indexed record of `unknown` and optional known `unknown`", () => {
					const { filteredIn, out } = passThruAllowingUnknown(
						stringRecordOfUnknownWithOptionalKnownUnknown,
					);
					assertIdenticalTypes(filteredIn, stringRecordOfUnknownWithOptionalKnownUnknown);
					assertIdenticalTypes(filteredIn, out);
				});
				it("`Partial<>` `string` indexed record of `unknown`", () => {
					const { filteredIn, out } = passThruAllowingUnknown(partialStringRecordOfUnknown);
					assertIdenticalTypes(partialStringRecordOfUnknown, filteredIn);
					assertIdenticalTypes(filteredIn, partialStringRecordOfUnknown);
					assertIdenticalTypes(filteredIn, out);
				});
				it("`Partial<>` `string` indexed record of `unknown` and known properties", () => {
					const { filteredIn, out } = passThruAllowingUnknown(
						partialStringRecordOfUnknownWithKnownProperties,
					);
					assertIdenticalTypes(filteredIn, partialStringRecordOfUnknownWithKnownProperties);
					assertIdenticalTypes(filteredIn, out);
				});
				it("object with optional `unknown` adjacent to recursion", () => {
					const { filteredIn, out } = passThruAllowingUnknown(
						objectWithOptionalUnknownAdjacentToOptionalRecursion,
					);
					assertIdenticalTypes(
						filteredIn,
						objectWithOptionalUnknownAdjacentToOptionalRecursion,
					);
					assertIdenticalTypes(filteredIn, out);
				});
				it("object with optional `unknown` in recursion", () => {
					const { filteredIn, out } = passThruAllowingUnknown(
						objectWithOptionalUnknownInOptionalRecursion,
					);
					assertIdenticalTypes(filteredIn, objectWithOptionalUnknownInOptionalRecursion);
					assertIdenticalTypes(filteredIn, out);
				});
			});

			describe("continue rejecting unsupported that are not alternately allowed", () => {
				it("`unknown` (simple object) expects `JsonTypeWith<bigint>`", () => {
					const { filteredIn } = passThruHandlingBigint(
						// @ts-expect-error `unknown` is not supported (expects `JsonTypeWith<bigint>`)
						unknownValueOfSimpleRecord,
						// value is actually supported; so, no runtime error.
					);
					assertIdenticalTypes(filteredIn, createInstanceOf<JsonTypeWith<bigint>>());
				});
				it("`unknown` (with bigint) expects `JsonTypeWith<bigint>`", () => {
					const { filteredIn } = passThruHandlingBigint(
						// @ts-expect-error `unknown` is not supported (expects `JsonTypeWith<bigint>`)
						unknownValueWithBigint,
						// value is actually supported; so, no runtime error.
					);
					assertIdenticalTypes(filteredIn, createInstanceOf<JsonTypeWith<bigint>>());
				});
				it("`symbol` still becomes `never`", () => {
					passThruHandlingBigintThrows(
						// @ts-expect-error `symbol` is not supported (becomes `never`)
						symbol,
						new Error("JSON.stringify returned undefined"),
					) satisfies { filteredIn: never };
				});
				it("`object` (plain object) still becomes non-null Json object", () => {
					const { filteredIn } = passThruHandlingBigint(
						// @ts-expect-error `object` is not supported (expects `NonNullJsonObjectWith<bigint>`)
						object,
						// object's value is actually supported; so, no runtime error.
					);
					assertIdenticalTypes(filteredIn, createInstanceOf<NonNullJsonObjectWith<bigint>>());
				});
				it("object with non-alternately allowed too generic function", () => {
					const objectWithGenericFn = {
						genericFn: () => undefined as unknown,
					};
					const { filteredIn } = passThruHandlingSpecificFunction(
						// @ts-expect-error '() => unknown' is not assignable to type 'never'
						objectWithGenericFn,
					);
					assertIdenticalTypes(
						filteredIn,
						createInstanceOf<{
							genericFn: never;
						}>(),
					);
				});
				it("object with non-alternately allowed too input permissive function", () => {
					const objectWithLessRequirementsFn = {
						lessRequirementsFn: () => 0,
					};
					const { filteredIn } = passThruHandlingSpecificFunction(
						// @ts-expect-error '() => number' is not assignable to type 'never'
						objectWithLessRequirementsFn,
					);
					assertIdenticalTypes(
						filteredIn,
						createInstanceOf<{
							lessRequirementsFn: never;
						}>(),
					);
				});
				it("object with non-alternately allowed more restrictive output function", () => {
					const objectWithStricterOutputFn = {
						stricterOutputFn: (_v: string) => 0 as const,
					};
					const { filteredIn } = passThruHandlingSpecificFunction(
						// @ts-expect-error '(_v: string) => 0' is not assignable to type 'never'
						objectWithStricterOutputFn,
					);
					assertIdenticalTypes(
						filteredIn,
						createInstanceOf<{
							stricterOutputFn: never;
						}>(),
					);
				});
				it("object with supported or non-supported function union", () => {
					const objectWithSpecificFnOrAnother = {
						specificFnOrAnother: ((v: string) => v.length) as
							| ((v: string) => number)
							| ((n: number) => string),
					};
					const { filteredIn } = passThruHandlingSpecificFunction(
						// @ts-expect-error '((v: string) => number) | ((n: number) => string)' is not assignable to type '(v: string) => number'
						objectWithSpecificFnOrAnother,
					);
					assertIdenticalTypes(
						filteredIn,
						createInstanceOf<{
							specificFnOrAnother: (_: string) => number;
						}>(),
					);
				});
				it("`string` indexed record of `unknown` and required known `unknown` that must be optional", () => {
					const { filteredIn } = passThruAllowingUnknown(
						// @ts-expect-error Type 'unknown' is not assignable to type '{ "error required property may not allow `unknown` value": never; }'
						stringRecordOfUnknownWithKnownUnknown,
					);
					assertIdenticalTypes(
						filteredIn,
						createInstanceOf<
							InternalUtilityTypes.FlattenIntersection<
								{
									[x: string]: unknown;
								} & {
									knownUnknown: {
										"error required property may not allow `unknown` value": never;
									};
								}
							>
						>(),
					);
				});
				it("mixed record of `unknown`", () => {
					const { filteredIn } = passThruAllowingUnknown(
						// @ts-expect-error Type 'unknown' is not assignable to type '{ "error required property may not allow `unknown` value": never; }'
						mixedRecordOfUnknown,
					);
					assertIdenticalTypes(
						filteredIn,
						createInstanceOf<{
							[x: number]: unknown;
							[x: `bKey_${string}`]: unknown;
							[x: `bKey_${number}`]: unknown;
							aKey: {
								"error required property may not allow `unknown` value": never;
							};
						}>(),
					);
				});
			});
		});
	});
});

/* eslint-enable unicorn/no-null */
