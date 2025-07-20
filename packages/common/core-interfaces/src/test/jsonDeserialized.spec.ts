/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable unicorn/no-null */

import { strict as assert } from "node:assert";

import type { AnyLocations } from "./testUtils.js";
import {
	assertIdenticalTypes,
	assertNever,
	createInstanceOf,
	exposeFromOpaqueJson,
	replaceBigInt,
	revealOpaqueJson,
	reviveBigInt,
} from "./testUtils.js";
import type { DirectoryOfValues, ObjectWithOptionalRecursion } from "./testValues.js";
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
	objectWithUnknown,
	objectWithOptionalUnknown,
	objectWithUndefined,
	objectWithOptionalUndefined,
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
	objectWithSymbolOrRecursion,
	objectWithFluidHandleOrRecursion,
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
	objectWithClassWithPrivateDataInOptionalRecursion,
	functionObjectWithPrivateData,
	functionObjectWithPublicData,
	classInstanceWithPrivateDataAndIsFunction,
	classInstanceWithPublicDataAndIsFunction,
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
	fluidHandleToNumber,
	objectWithFluidHandle,
	opaqueSerializableObject,
	opaqueDeserializedObject,
	opaqueSerializableAndDeserializedObject,
	opaqueSerializableUnknown,
	opaqueDeserializedUnknown,
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
} from "./testValues.js";

import type { IFluidHandle } from "@fluidframework/core-interfaces";
import type {
	InternalUtilityTypes,
	JsonDeserialized,
	JsonTypeWith,
	NonNullJsonObjectWith,
	OpaqueJsonDeserialized,
	OpaqueJsonSerializable,
} from "@fluidframework/core-interfaces/internal/exposedUtilityTypes";

/**
 * Defined using `JsonDeserialized` type filter tests `JsonDeserialized` at call site.
 * Internally, value given is round-tripped through JSON serialization to ensure it is
 * unchanged or converted to given optional value.
 *
 * @param v - value to pass through JSON serialization
 * @param expected - alternate value to compare against after round-trip
 * @returns the round-tripped value
 *
 * @remarks
 * `expected` parameter type would ideally be `JsonDeserialized<T>` but that
 * may influence the type inference of the test. So, instead, use `unknown`.
 */
function passThru<const T>(v: T, expected?: unknown): JsonDeserialized<T> {
	const stringified = JSON.stringify(v);
	if (stringified === undefined) {
		throw new Error("JSON.stringify returned undefined");
	}
	const result = JSON.parse(stringified) as JsonDeserialized<T>;
	assert.deepStrictEqual(result, expected ?? v);
	return result;
}

/**
 * Defined using `JsonDeserialized` type filter tests `JsonDeserialized` at call site.
 *
 * @remarks All uses are expect to trigger a compile-time error.
 *
 * @param v - value to pass through JSON serialization
 * @param error - error expected during serialization round-trip
 * @returns dummy result to allow further type checking
 */
function passThruThrows<const T>(v: T, expectedThrow: Error): JsonDeserialized<T> {
	assert.throws(() => passThru(v), expectedThrow);
	return undefined as unknown as JsonDeserialized<T>;
}

/**
 * Similar to {@link passThru} but specifically handles `bigint` values.
 */
function passThruHandlingBigint<const T>(
	v: T,
	expected?: unknown,
): JsonDeserialized<T, { AllowExactly: [bigint] }> {
	const stringified = JSON.stringify(v, replaceBigInt);
	if (stringified === undefined) {
		throw new Error("JSON.stringify returned undefined");
	}
	const result = JSON.parse(stringified, reviveBigInt) as JsonDeserialized<
		T,
		{ AllowExactly: [bigint] }
	>;
	assert.deepStrictEqual(result, expected ?? v);
	return result;
}

/**
 * Similar to {@link passThruThrows} but specifically handles `bigint` values.
 */
function passThruHandlingBigintThrows<const T>(
	v: T,
	expectedThrow: Error,
): JsonDeserialized<T, { AllowExactly: [bigint] }> {
	assert.throws(() => passThruHandlingBigint(v), expectedThrow);
	return undefined as unknown as JsonDeserialized<T, { AllowExactly: [bigint] }>;
}

/**
 * Similar to {@link passThru} but specifically handles certain function signatures.
 */
function passThruHandlingSpecificFunction<const T>(
	_v: T,
): JsonDeserialized<T, { AllowExactly: [(_: string) => number] }> {
	return undefined as unknown as JsonDeserialized<
		T,
		{ AllowExactly: [(_: string) => number] }
	>;
}

/**
 * Similar to {@link passThru} but specifically handles any Fluid handle.
 */
function passThruHandlingFluidHandle<const T>(
	_v: T,
): JsonDeserialized<T, { AllowExtensionOf: IFluidHandle }> {
	return undefined as unknown as JsonDeserialized<T, { AllowExtensionOf: IFluidHandle }>;
}

/**
 * Similar to {@link passThru} but preserves `unknown` instead of substituting `JsonTypeWith`.
 */
function passThruPreservingUnknown<const T>(
	_v: T,
): JsonDeserialized<T, { AllowExactly: [unknown] }> {
	return undefined as unknown as JsonDeserialized<T, { AllowExactly: [unknown] }>;
}

describe("JsonDeserialized", () => {
	describe("positive compilation tests", () => {
		describe("supported primitive types are preserved", () => {
			it("`boolean`", () => {
				const resultRead = passThru(boolean);
				assertIdenticalTypes(resultRead, boolean);
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("`number`", () => {
				const resultRead = passThru(number);
				assertIdenticalTypes(resultRead, number);
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("`string`", () => {
				const resultRead = passThru(string);
				assertIdenticalTypes(resultRead, string);
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("numeric enum", () => {
				const resultRead = passThru(numericEnumValue);
				assertIdenticalTypes(resultRead, numericEnumValue);
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("string enum", () => {
				const resultRead = passThru(stringEnumValue);
				assertIdenticalTypes(resultRead, stringEnumValue);
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("const heterogenous enum", () => {
				const resultRead = passThru(constHeterogenousEnumValue);
				assertIdenticalTypes(resultRead, constHeterogenousEnumValue);
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("computed enum", () => {
				const resultRead = passThru(computedEnumValue);
				assertIdenticalTypes(resultRead, computedEnumValue);
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("branded `number`", () => {
				const resultRead = passThru(brandedNumber);
				assertIdenticalTypes(resultRead, brandedNumber);
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("branded `string`", () => {
				const resultRead = passThru(brandedString);
				assertIdenticalTypes(resultRead, brandedString);
				assertNever<AnyLocations<typeof resultRead>>();
			});
		});

		describe("unions with unsupported primitive types preserve supported types", () => {
			it("`string | symbol`", () => {
				const resultRead = passThruThrows(
					stringOrSymbol,
					new Error("JSON.stringify returned undefined"),
				);
				assertIdenticalTypes(resultRead, string);
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("`bigint | string`", () => {
				const resultRead = passThru(bigintOrString);
				assertIdenticalTypes(resultRead, string);
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("`bigint | symbol`", () => {
				const resultRead = passThruThrows(
					bigintOrSymbol,
					new Error("JSON.stringify returned undefined"),
				);
				assertIdenticalTypes(resultRead, createInstanceOf<never>());
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("`number | bigint | symbol`", () => {
				const resultRead = passThru(numberOrBigintOrSymbol, 7);
				assertIdenticalTypes(resultRead, createInstanceOf<number>());
				assertNever<AnyLocations<typeof resultRead>>();
			});
		});

		describe("supported literal types are preserved", () => {
			it("`true`", () => {
				const resultRead = passThru(true as const);
				assertIdenticalTypes(resultRead, true);
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("`false`", () => {
				const resultRead = passThru(false as const);
				assertIdenticalTypes(resultRead, false);
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("`0`", () => {
				const resultRead = passThru(0 as const);
				assertIdenticalTypes(resultRead, 0);
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it('"string"', () => {
				const resultRead = passThru("string" as const);
				assertIdenticalTypes(resultRead, "string");
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("`null`", () => {
				const resultRead = passThru(null);
				assertIdenticalTypes(resultRead, null);
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("object with literals", () => {
				const resultRead = passThru(objectWithLiterals);
				assertIdenticalTypes(resultRead, objectWithLiterals);
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("array of literals", () => {
				const resultRead = passThru(arrayOfLiterals);
				assertIdenticalTypes(resultRead, arrayOfLiterals);
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("tuple of literals", () => {
				const resultRead = passThru(tupleWithLiterals);
				assertIdenticalTypes(resultRead, tupleWithLiterals);
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("specific numeric enum value", () => {
				const resultRead = passThru(NumericEnum.two as const);
				assertIdenticalTypes(resultRead, NumericEnum.two);
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("specific string enum value", () => {
				const resultRead = passThru(StringEnum.b as const);
				assertIdenticalTypes(resultRead, StringEnum.b);
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("specific const heterogenous enum value", () => {
				const resultRead = passThru(ConstHeterogenousEnum.zero as const);
				assertIdenticalTypes(resultRead, ConstHeterogenousEnum.zero);
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("specific computed enum value", () => {
				const resultRead = passThru(ComputedEnum.computed as const);
				assertIdenticalTypes(resultRead, ComputedEnum.computed);
				assertNever<AnyLocations<typeof resultRead>>();
			});
		});

		describe("arrays", () => {
			it("array of supported types (numbers) are preserved", () => {
				const resultRead = passThru(arrayOfNumbers);
				assertIdenticalTypes(resultRead, arrayOfNumbers);
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("sparse array is filled in with null", () => {
				const resultRead = passThru(arrayOfNumbersSparse, [0, null, null, 3]);
				assertIdenticalTypes(resultRead, arrayOfNumbersSparse);
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("array of partially supported (numbers or undefined) is modified with null", () => {
				const resultRead = passThru(arrayOfNumbersOrUndefined, [0, null, 2]);
				assertIdenticalTypes(resultRead, createInstanceOf<(number | null)[]>());
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("array of `unknown` becomes array of `JsonTypeWith<never>`", () => {
				const resultRead = passThru(arrayOfUnknown);
				assertIdenticalTypes(resultRead, createInstanceOf<JsonTypeWith<never>[]>());
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("array of partially supported (bigint or basic object) becomes basic object only", () => {
				const resultRead = passThruThrows(
					arrayOfBigintOrObjects,
					new TypeError("Do not know how to serialize a BigInt"),
				);
				assertIdenticalTypes(resultRead, createInstanceOf<{ property: string }[]>());
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("array of partially supported (symbols or basic object) is modified with null", () => {
				const resultRead = passThru(arrayOfSymbolOrObjects, [null]);
				assertIdenticalTypes(resultRead, createInstanceOf<({ property: string } | null)[]>());
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("array of unsupported (bigint) becomes never[]", () => {
				const resultRead = passThruThrows(
					arrayOfBigints,
					new TypeError("Do not know how to serialize a BigInt"),
				);
				assertIdenticalTypes(resultRead, createInstanceOf<never[]>());
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("array of unsupported (symbols) becomes null[]", () => {
				const resultRead = passThru(arrayOfSymbols, [null]);
				assertIdenticalTypes(resultRead, createInstanceOf<null[]>());
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("array of unsupported (functions) becomes null[]", () => {
				const resultRead = passThru(arrayOfFunctions, [null]);
				assertIdenticalTypes(resultRead, createInstanceOf<null[]>());
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("array of functions with properties becomes ({...}|null)[]", () => {
				const resultRead = passThru(arrayOfFunctionsWithProperties, [null]);
				assertIdenticalTypes(resultRead, createInstanceOf<({ property: number } | null)[]>());
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("array of objects and functions becomes ({...}|null)[]", () => {
				const resultRead = passThru(arrayOfObjectAndFunctions, [{ property: 6 }]);
				assertIdenticalTypes(resultRead, createInstanceOf<({ property: number } | null)[]>());
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("array of `bigint | symbol` becomes null[]", () => {
				const resultRead = passThru(arrayOfBigintOrSymbols, [null]);
				assertIdenticalTypes(resultRead, createInstanceOf<null[]>());
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("array of `number | bigint | symbol` becomes (number|null)[]", () => {
				const resultRead = passThru(arrayOfNumberBigintOrSymbols, [7]);
				assertIdenticalTypes(resultRead, createInstanceOf<(number | null)[]>());
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("readonly array of supported types (numbers) are preserved", () => {
				const resultRead = passThru(readonlyArrayOfNumbers);
				assertIdenticalTypes(resultRead, readonlyArrayOfNumbers);
				assertNever<AnyLocations<typeof resultRead>>();
				// @ts-expect-error readonly array does not appear to support `push`, but works at runtime.
				// eslint-disable-next-line @typescript-eslint/no-unsafe-call
				resultRead.push(0);
				assert.deepStrictEqual(resultRead, [...readonlyArrayOfNumbers, 0]);
			});
			it("readonly array of supported types (simple object) are preserved", () => {
				const resultRead = passThru(readonlyArrayOfObjects);
				assertIdenticalTypes(resultRead, readonlyArrayOfObjects);
				assertNever<AnyLocations<typeof resultRead>>();
				// @ts-expect-error readonly array does not appear to support `push`, but works at runtime.
				// eslint-disable-next-line @typescript-eslint/no-unsafe-call
				resultRead.push("not even an object");
				assert.deepStrictEqual(resultRead, [...readonlyArrayOfObjects, "not even an object"]);
			});
		});

		describe("fully supported object types are preserved", () => {
			it("empty object", () => {
				const resultRead = passThru(emptyObject);
				assertIdenticalTypes(resultRead, emptyObject);
				assertNever<AnyLocations<typeof resultRead>>();
			});

			it("object with `boolean`", () => {
				const resultRead = passThru(objectWithBoolean);
				assertIdenticalTypes(resultRead, objectWithBoolean);
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("object with `number`", () => {
				const resultRead = passThru(objectWithNumber);
				assertIdenticalTypes(resultRead, objectWithNumber);
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("object with `string`", () => {
				const resultRead = passThru(objectWithString);
				assertIdenticalTypes(resultRead, objectWithString);
				assertNever<AnyLocations<typeof resultRead>>();
			});

			it("object with number key", () => {
				const resultRead = passThru(objectWithNumberKey);
				assertIdenticalTypes(resultRead, objectWithNumberKey);
				assertNever<AnyLocations<typeof resultRead>>();
			});

			it("object with array of supported types (numbers) are preserved", () => {
				const resultRead = passThru(objectWithArrayOfNumbers);
				assertIdenticalTypes(resultRead, objectWithArrayOfNumbers);
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("object with sparse array is filled in with null", () => {
				const resultRead = passThru(objectWithArrayOfNumbersSparse, {
					arrayOfNumbersSparse: [0, null, null, 3],
				});
				assertIdenticalTypes(resultRead, objectWithArrayOfNumbersSparse);
				assertNever<AnyLocations<typeof resultRead>>();
			});

			it("object with branded `number`", () => {
				const resultRead = passThru(objectWithBrandedNumber);
				assertIdenticalTypes(resultRead, objectWithBrandedNumber);
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("object with branded `string`", () => {
				const resultRead = passThru(objectWithBrandedString);
				assertIdenticalTypes(resultRead, objectWithBrandedString);
				assertNever<AnyLocations<typeof resultRead>>();
			});

			it("`string` indexed record of `number`s", () => {
				const resultRead = passThru(stringRecordOfNumbers);
				assertIdenticalTypes(resultRead, stringRecordOfNumbers);
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("`string`|`number` indexed record of `string`s", () => {
				const resultRead = passThru(stringOrNumberRecordOfStrings);
				assertIdenticalTypes(resultRead, stringOrNumberRecordOfStrings);
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("`string`|`number` indexed record of objects", () => {
				const resultRead = passThru(stringOrNumberRecordOfObjects);
				assertIdenticalTypes(resultRead, stringOrNumberRecordOfObjects);
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("`string` indexed record of `number`|`string`s with known properties", () => {
				const resultRead = passThru(stringRecordOfNumbersOrStringsWithKnownProperties);
				assertIdenticalTypes(resultRead, stringRecordOfNumbersOrStringsWithKnownProperties);
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("`string`|`number` indexed record of `strings` with known `number` property (unassignable)", () => {
				const resultRead = passThru(stringOrNumberRecordOfStringWithKnownNumber);
				assertIdenticalTypes(resultRead, stringOrNumberRecordOfStringWithKnownNumber);
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("templated record of `numbers`", () => {
				const resultRead = passThru(templatedRecordOfNumbers, {
					key1: 0,
				});
				assertIdenticalTypes(resultRead, templatedRecordOfNumbers);
				assertNever<AnyLocations<typeof resultRead>>();
			});

			it("object with possible type recursion through union", () => {
				const resultRead = passThru(objectWithPossibleRecursion);
				assertIdenticalTypes(resultRead, objectWithPossibleRecursion);
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("object with optional type recursion", () => {
				const resultRead = passThru(objectWithOptionalRecursion);
				assertIdenticalTypes(resultRead, objectWithOptionalRecursion);
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("object with deep type recursion", () => {
				const resultRead = passThru(objectWithEmbeddedRecursion);
				assertIdenticalTypes(resultRead, objectWithEmbeddedRecursion);
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("object with alternating type recursion", () => {
				const resultRead = passThru(objectWithAlternatingRecursion);
				assertIdenticalTypes(resultRead, objectWithAlternatingRecursion);
				assertNever<AnyLocations<typeof resultRead>>();
			});

			it("simple non-null Json object (`NonNullJsonObjectWith<never>`)", () => {
				const resultRead = passThru(jsonObject);
				assertIdenticalTypes(resultRead, jsonObject);
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("simple read-only non-null Json object (`ReadonlyNonNullJsonObjectWith<never>`)", () => {
				const resultRead = passThru(immutableJsonObject);
				assertIdenticalTypes(resultRead, immutableJsonObject);
				assertNever<AnyLocations<typeof resultRead>>();
			});

			it("non-const enum", () => {
				// Note: typescript doesn't do a great job checking that a filtered type satisfies an enum
				// type. The numeric indices are not checked. So far most robust inspection is manually
				// after any change.
				const resultNumericRead = passThru(NumericEnum);
				assertIdenticalTypes(resultNumericRead, NumericEnum);
				assertNever<AnyLocations<typeof resultNumericRead>>();
				const resultStringRead = passThru(StringEnum);
				assertIdenticalTypes(resultStringRead, StringEnum);
				assertNever<AnyLocations<typeof resultStringRead>>();
				const resultComputedRead = passThru(ComputedEnum);
				assertIdenticalTypes(resultComputedRead, ComputedEnum);
				assertNever<AnyLocations<typeof resultComputedRead>>();
			});

			it("object with `readonly`", () => {
				const resultRead = passThru(objectWithReadonly);
				assertIdenticalTypes(resultRead, objectWithReadonly);
				assertNever<AnyLocations<typeof resultRead>>();
			});

			it("object with getter implemented via value", () => {
				const resultRead = passThru(objectWithGetterViaValue);
				assertIdenticalTypes(resultRead, objectWithGetterViaValue);
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("object with setter implemented via value", () => {
				const resultRead = passThru(objectWithSetterViaValue);
				assertIdenticalTypes(resultRead, objectWithSetterViaValue);
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("object with matched getter and setter implemented via value", () => {
				const resultRead = passThru(objectWithMatchedGetterAndSetterPropertyViaValue);
				assertIdenticalTypes(resultRead, objectWithMatchedGetterAndSetterPropertyViaValue);
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("object with mismatched getter and setter implemented via value", () => {
				const resultRead = passThru(objectWithMismatchedGetterAndSetterPropertyViaValue);
				assertIdenticalTypes(resultRead, objectWithMismatchedGetterAndSetterPropertyViaValue);
				assertNever<AnyLocations<typeof resultRead>>();
				// @ts-expect-error 'number' is not assignable to type 'string'
				objectWithMismatchedGetterAndSetterPropertyViaValue.property = -1;
				// @ts-expect-error 'number' is not assignable to type 'string'
				resultRead.property = -1;
			});

			// Class instances are indistinguishable from general objects by type checking.
			// They are considered supported despite loss of instanceof support after
			// deserialization.
			describe("class instance", () => {
				it("with public data (propagated)", () => {
					const instanceRead = passThru(classInstanceWithPublicData, {
						public: "public",
					});
					assertIdenticalTypes(instanceRead, classInstanceWithPublicData);
					assertNever<AnyLocations<typeof instanceRead>>();
					assert.ok(
						classInstanceWithPublicData instanceof ClassWithPublicData,
						"classInstanceWithPublicData is an instance of ClassWithPublicData",
					);
					assert.ok(
						!(instanceRead instanceof ClassWithPublicData),
						"instanceRead is not an instance of ClassWithPublicData",
					);
				});
			});

			describe("object with optional property (remains optional)", () => {
				it("without property", () => {
					const resultRead = passThru(objectWithOptionalNumberNotPresent);
					assertIdenticalTypes(resultRead, objectWithOptionalNumberNotPresent);
					assertNever<AnyLocations<typeof resultRead>>();
				});
				it("with undefined value (property is removed in value)", () => {
					const resultRead = passThru(objectWithOptionalNumberUndefined, {});
					assertIdenticalTypes(resultRead, objectWithOptionalNumberUndefined);
					assertNever<AnyLocations<typeof resultRead>>();
				});
				it("with defined value", () => {
					const resultRead = passThru(objectWithOptionalNumberDefined);
					assertIdenticalTypes(resultRead, objectWithOptionalNumberDefined);
					assertNever<AnyLocations<typeof resultRead>>();
				});
			});

			it("OpaqueJsonDeserialized<{number:number}>", () => {
				const resultRead = passThru(opaqueDeserializedObject);
				assertIdenticalTypes(resultRead, opaqueDeserializedObject);
				assertNever<AnyLocations<typeof resultRead>>();
				const transparentResult = exposeFromOpaqueJson(resultRead);
				assertIdenticalTypes(transparentResult, objectWithNumber);
			});

			it("OpaqueJsonDeserialized<unknown>", () => {
				const resultRead = passThru(opaqueDeserializedUnknown);
				assertIdenticalTypes(resultRead, opaqueDeserializedUnknown);
				assertNever<AnyLocations<typeof resultRead>>();
				const transparentResult = exposeFromOpaqueJson(resultRead);
				assertIdenticalTypes(transparentResult, createInstanceOf<JsonTypeWith<never>>());
				const revealedResult = revealOpaqueJson(resultRead);
				assertIdenticalTypes(revealedResult, transparentResult);
			});

			it("object with OpaqueJsonDeserialized<unknown>", () => {
				const resultRead = passThru(objectWithOpaqueDeserializedUnknown);
				assertIdenticalTypes(resultRead, objectWithOpaqueDeserializedUnknown);
				assertNever<AnyLocations<typeof resultRead>>();
				const revealedResult = revealOpaqueJson(resultRead);
				assertIdenticalTypes(
					revealedResult,
					createInstanceOf<{ opaque: JsonTypeWith<never> }>(),
				);
				assertNever<AnyLocations<typeof resultRead>>();
			});

			it("recursive object with OpaqueJsonDeserialized<unknown>", () => {
				const resultRead = passThru(opaqueDeserializedInRecursiveStructure);
				assertIdenticalTypes(resultRead, opaqueDeserializedInRecursiveStructure);
				assertNever<AnyLocations<typeof resultRead>>();
				const revealedResult = revealOpaqueJson(resultRead);
				assertIdenticalTypes(
					revealedResult,
					createInstanceOf<DirectoryOfValues<JsonTypeWith<never>>>(),
				);
			});
		});

		describe("partially supported object types are modified", () => {
			describe("fully unsupported properties are removed", () => {
				it("object with exactly `bigint`", () => {
					const resultRead = passThruThrows(
						objectWithBigint,
						new TypeError("Do not know how to serialize a BigInt"),
					);
					assertIdenticalTypes(resultRead, {});
					assertNever<AnyLocations<typeof resultRead>>();
					// @ts-expect-error `bigint` missing
					assertIdenticalTypes(resultRead, objectWithBigint);
				});
				it("object with exactly `symbol`", () => {
					const resultRead = passThru(objectWithSymbol, {});
					assertIdenticalTypes(resultRead, {});
					assertNever<AnyLocations<typeof resultRead>>();
					// @ts-expect-error `symbol` missing
					assertIdenticalTypes(resultRead, objectWithSymbol);
				});
				it("object with exactly function", () => {
					const resultRead = passThru(objectWithFunction, {});
					assertIdenticalTypes(resultRead, {});
					assertNever<AnyLocations<typeof resultRead>>();
					// @ts-expect-error `function` missing
					assertIdenticalTypes(resultRead, objectWithFunction);
				});
				it("object with exactly `Function | symbol`", () => {
					const resultRead = passThru(objectWithFunctionOrSymbol, {});
					assertIdenticalTypes(resultRead, {});
					assertNever<AnyLocations<typeof resultRead>>();
					// @ts-expect-error `functionOrSymbol` missing
					assertIdenticalTypes(resultRead, objectWithFunctionOrSymbol);
				});

				it("object with inherited recursion extended with unsupported properties", () => {
					const objectWithInheritedRecursionAndNestedSymbol = {
						outer: objectInheritingOptionalRecursionAndWithNestedSymbol,
					};
					const resultRead = passThru(objectWithInheritedRecursionAndNestedSymbol, {
						outer: {
							recursive: { recursive: { recursive: {} } },
							complex: { number: 0 },
						},
					});
					assertIdenticalTypes(
						resultRead,
						createInstanceOf<{
							outer: {
								recursive?: ObjectWithOptionalRecursion;
								complex: { number: number };
							};
						}>(),
					);
					assertNever<AnyLocations<typeof resultRead>>();
				});

				it("object with required exact `undefined`", () => {
					const resultRead = passThru(objectWithUndefined, {});
					assertIdenticalTypes(resultRead, {});
					assertNever<AnyLocations<typeof resultRead>>();
					// @ts-expect-error `undef` property (required) should no longer exist
					resultRead satisfies typeof objectWithUndefined;
				});
				it("object with optional exact `undefined`", () => {
					const resultRead = passThru(objectWithOptionalUndefined, {});
					assertIdenticalTypes(resultRead, {});
					assertNever<AnyLocations<typeof resultRead>>();
					// @ts-expect-error `undef` property (required) should no longer exist
					assertIdenticalTypes(resultRead, objectWithOptionalUndefined);
				});
				it("object with exactly `never`", () => {
					const resultRead = passThru(objectWithNever);
					assertIdenticalTypes(resultRead, {});
					assertNever<AnyLocations<typeof resultRead>>();
					// @ts-expect-error `never` property (type never) should not be preserved
					resultRead satisfies typeof objectWithNever;
				});

				it("object with `symbol` key", () => {
					const resultRead = passThru(objectWithSymbolKey, {});
					assertIdenticalTypes(resultRead, {});
					assertNever<AnyLocations<typeof resultRead>>();
				});
				it("object with [unique] symbol key", () => {
					const resultRead = passThru(objectWithUniqueSymbolKey, {});
					assertIdenticalTypes(resultRead, {});
					assertNever<AnyLocations<typeof resultRead>>();
				});

				it("`string` indexed record of `undefined`", () => {
					const resultRead = passThru(stringRecordOfUndefined, {});
					assertIdenticalTypes(resultRead, {});
					assertNever<AnyLocations<typeof resultRead>>();
					// `Record<string, undefined>` has no required properties; so, result `{}` does satisfy original type.
					resultRead satisfies typeof stringRecordOfUndefined;
				});
				it("`string` indexed record of `undefined` and known `number` property (unassignable)", () => {
					const resultRead = passThru(stringOrNumberRecordOfUndefinedWithKnownNumber, {
						knownNumber: 4,
					});
					assertIdenticalTypes(
						resultRead,
						createInstanceOf<{
							knownNumber: number;
						}>(),
					);
					assertNever<AnyLocations<typeof resultRead>>();
					// If this type were not unassignable to begin with, then result would
					// satisfy the original type.
					// @ts-expect-error Property 'knownNumber' is incompatible with index signature. Type 'number' is not assignable to type 'undefined'.
					resultRead satisfies typeof stringOrNumberRecordOfUndefinedWithKnownNumber;
				});
			});

			describe("partially unsupported properties become optional for those supported", () => {
				describe("object with `undefined`", () => {
					it("with undefined value", () => {
						const resultRead = passThru(objectWithNumberOrUndefinedUndefined, {});
						assertIdenticalTypes(
							resultRead,
							createInstanceOf<{
								numOrUndef?: number;
							}>(),
						);
						assertNever<AnyLocations<typeof resultRead>>();
					});

					it("with defined value", () => {
						const resultRead = passThru(objectWithNumberOrUndefinedNumbered);
						assertIdenticalTypes(
							resultRead,
							createInstanceOf<{
								numOrUndef?: number;
							}>(),
						);
						assertNever<AnyLocations<typeof resultRead>>();
					});

					it("`Partial<>` `string` indexed record of `numbers`", () => {
						// Warning: as of TypeScript 5.8.2, a Partial<> of an indexed type
						// gains `| undefined` even under exactOptionalPropertyTypes=true.
						// Preferred result is that there is no change applying Partial<>.
						// Since indexed properties are always inherently optional,
						// `| undefined` is removed. (If TypeScript addresses Partial
						// issue, then this may move to the unmodified case set.)
						const resultRead = passThru(partialStringRecordOfNumbers, {
							key1: 0,
						});
						assertIdenticalTypes(resultRead, createInstanceOf<Record<string, number>>());
						assertNever<AnyLocations<typeof resultRead>>();
					});

					it("`Partial<>` templated record of `numbers`", () => {
						// Warning: as of TypeScript 5.8.2, a Partial<> of an indexed type
						// gains `| undefined` even under exactOptionalPropertyTypes=true.
						// Preferred result is that there is no change applying Partial<>.
						// Since indexed properties are always inherently optional,
						// `| undefined` is removed. (If TypeScript addresses Partial
						// issue, then this may move to the unmodified case set.)
						const resultRead = passThru(partialTemplatedRecordOfNumbers, {
							key1: 0,
						});
						assertIdenticalTypes(
							resultRead,
							createInstanceOf<Record<`key${number}`, number>>(),
						);
						assertNever<AnyLocations<typeof resultRead>>();
					});

					it("`| number` in string indexed record", () => {
						const resultRead = passThru(stringRecordOfNumberOrUndefined, { number });
						assertIdenticalTypes(resultRead, createInstanceOf<Record<string, number>>());
						assertNever<AnyLocations<typeof resultRead>>();
					});
				});

				it("object with exactly `string | symbol`", () => {
					const resultRead = passThru(
						objectWithStringOrSymbol,
						// value is a symbol; so removed.
						{},
					);
					assertIdenticalTypes(resultRead, createInstanceOf<{ stringOrSymbol?: string }>());
					assertNever<AnyLocations<typeof resultRead>>();
					// @ts-expect-error { stringOrSymbol: string | symbol; } does not satisfy { stringOrSymbol?: string; }
					objectWithStringOrSymbol satisfies typeof resultRead;
				});
				it("object with exactly `bigint | string`", () => {
					const resultRead = passThru(
						objectWithBigintOrString,
						// value is a string; so no runtime error.
					);
					assertIdenticalTypes(resultRead, createInstanceOf<{ bigintOrString: string }>());
					assertNever<AnyLocations<typeof resultRead>>();
					// @ts-expect-error { bigintOrString: string | bigint } does not satisfy { bigintOrString: string }
					objectWithBigintOrString satisfies typeof resultRead;
				});
				it("object with exactly `bigint | symbol`", () => {
					const resultRead = passThru(objectWithBigintOrSymbol, {});
					assertIdenticalTypes(resultRead, {});
					assertNever<AnyLocations<typeof resultRead>>();
				});
				it("object with exactly `number | bigint | symbol`", () => {
					const resultRead = passThru(objectWithNumberOrBigintOrSymbol, {
						numberOrBigintOrSymbol: 7,
					});
					assertIdenticalTypes(
						resultRead,
						createInstanceOf<{ numberOrBigintOrSymbol?: number }>(),
					);
					assertNever<AnyLocations<typeof resultRead>>();
				});
				it("`string` indexed record of `symbol | boolean`", () => {
					const resultRead = passThru(stringRecordOfSymbolOrBoolean, { boolean });
					assertIdenticalTypes(resultRead, createInstanceOf<Record<string, boolean>>());
					assertNever<AnyLocations<typeof resultRead>>();
				});

				it("object with recursion and `symbol` unrolls once and then has OpaqueJsonDeserialized wrapper", () => {
					const resultRead = passThru(objectWithSymbolOrRecursion, { recurse: {} });
					assertIdenticalTypes(
						resultRead,
						createInstanceOf<{
							recurse?: OpaqueJsonDeserialized<typeof objectWithSymbolOrRecursion>;
						}>(),
					);
					assertNever<AnyLocations<typeof resultRead>>();
				});

				it("object with exactly function with properties", () => {
					const resultRead = passThru(objectWithFunctionWithProperties, {});
					assertIdenticalTypes(
						resultRead,
						createInstanceOf<{
							function?: {
								property: number;
							};
						}>(),
					);
					assertNever<AnyLocations<typeof resultRead>>();
				});
				it("object with exactly object and function", () => {
					const resultRead = passThru(objectWithObjectAndFunction, {
						object: { property: 6 },
					});
					assertIdenticalTypes(
						resultRead,
						createInstanceOf<{
							object?: {
								property: number;
							};
						}>(),
					);
					assertNever<AnyLocations<typeof resultRead>>();
				});
				it("object with function object with recursion", () => {
					const objectWithFunctionObjectAndRecursion = {
						outerFnOjb: selfRecursiveFunctionWithProperties,
					};
					const resultRead = passThru(objectWithFunctionObjectAndRecursion, {});
					assertIdenticalTypes(
						resultRead,
						createInstanceOf<{
							outerFnOjb?: {
								recurse?: OpaqueJsonDeserialized<
									(typeof objectWithFunctionObjectAndRecursion)["outerFnOjb"]
								>;
							};
						}>(),
					);
					assertNever<AnyLocations<typeof resultRead>>();
				});
				it("object with object and function with recursion", () => {
					const objectWithObjectAndFunctionWithRecursion = {
						outerFnOjb: selfRecursiveObjectAndFunction,
					};
					const resultRead = passThru(objectWithObjectAndFunctionWithRecursion, {
						outerFnOjb: { recurse: {} },
					});
					assertIdenticalTypes(
						resultRead,
						createInstanceOf<{
							outerFnOjb?: {
								recurse?: OpaqueJsonDeserialized<
									(typeof objectWithObjectAndFunctionWithRecursion)["outerFnOjb"]
								>;
							};
						}>(),
					);
					assertNever<AnyLocations<typeof resultRead>>();
				});
				it("object with required `unknown` in recursion when `unknown` is allowed unrolls once and then has OpaqueJsonDeserialized wrapper", () => {
					const resultRead = passThruPreservingUnknown(objectWithUnknownInOptionalRecursion);
					assertIdenticalTypes(
						resultRead,
						createInstanceOf<{
							unknown?: unknown;
							recurse?: OpaqueJsonDeserialized<
								typeof objectWithUnknownInOptionalRecursion,
								[unknown]
							>;
						}>(),
					);
					assertNever<AnyLocations<typeof resultRead>>();
				});
			});

			describe("partially supported array properties are modified like top-level arrays", () => {
				it("object with array of partially supported (numbers or undefined) is modified with null", () => {
					const resultRead = passThru(objectWithArrayOfNumbersOrUndefined, {
						arrayOfNumbersOrUndefined: [0, null, 2],
					});
					assertIdenticalTypes(
						resultRead,
						createInstanceOf<{ arrayOfNumbersOrUndefined: (number | null)[] }>(),
					);
					assertNever<AnyLocations<typeof resultRead>>();
				});
				it("object with array of `unknown` becomes array of `JsonTypeWith<never>`", () => {
					const resultRead = passThru(objectWithArrayOfUnknown);
					assertIdenticalTypes(
						resultRead,
						createInstanceOf<{ arrayOfUnknown: JsonTypeWith<never>[] }>(),
					);
					assertNever<AnyLocations<typeof resultRead>>();
				});
				it("object with array of partially supported (bigint or basic object) becomes basic object only", () => {
					const resultRead = passThruThrows(
						objectWithArrayOfBigintOrObjects,
						new TypeError("Do not know how to serialize a BigInt"),
					);
					assertIdenticalTypes(
						resultRead,
						createInstanceOf<{ arrayOfBigintOrObjects: { property: string }[] }>(),
					);
					assertNever<AnyLocations<typeof resultRead>>();
				});
				it("object with array of partially supported (symbols or basic object) is modified with null", () => {
					const resultRead = passThru(objectWithArrayOfSymbolOrObjects, {
						arrayOfSymbolOrObjects: [null],
					});
					assertIdenticalTypes(
						resultRead,
						createInstanceOf<{ arrayOfSymbolOrObjects: ({ property: string } | null)[] }>(),
					);
					assertNever<AnyLocations<typeof resultRead>>();
				});
				it("object with array of unsupported (bigint) becomes never[]", () => {
					const resultRead = passThruThrows(
						objectWithArrayOfBigints,
						new TypeError("Do not know how to serialize a BigInt"),
					);
					assertIdenticalTypes(resultRead, createInstanceOf<{ arrayOfBigints: never[] }>());
					assertNever<AnyLocations<typeof resultRead>>();
				});
				it("object with array of unsupported (symbols) becomes null[]", () => {
					const resultRead = passThru(objectWithArrayOfSymbols, { arrayOfSymbols: [null] });
					assertIdenticalTypes(resultRead, createInstanceOf<{ arrayOfSymbols: null[] }>());
					assertNever<AnyLocations<typeof resultRead>>();
				});
				it("object with array of unsupported (functions) becomes null[]", () => {
					const resultRead = passThru(objectWithArrayOfFunctions, {
						arrayOfFunctions: [null],
					});
					assertIdenticalTypes(resultRead, createInstanceOf<{ arrayOfFunctions: null[] }>());
					assertNever<AnyLocations<typeof resultRead>>();
				});
				it("object with array of functions with properties becomes ({...}|null)[]", () => {
					const resultRead = passThru(objectWithArrayOfFunctionsWithProperties, {
						arrayOfFunctionsWithProperties: [null],
					});
					assertIdenticalTypes(
						resultRead,
						createInstanceOf<{
							arrayOfFunctionsWithProperties: ({ property: number } | null)[];
						}>(),
					);
					assertNever<AnyLocations<typeof resultRead>>();
				});
				it("object with array of objects and functions becomes ({...}|null)[]", () => {
					const resultRead = passThru(objectWithArrayOfObjectAndFunctions, {
						arrayOfObjectAndFunctions: [{ property: 6 }],
					});
					assertIdenticalTypes(
						resultRead,
						createInstanceOf<{ arrayOfObjectAndFunctions: ({ property: number } | null)[] }>(),
					);
					assertNever<AnyLocations<typeof resultRead>>();
				});
				it("object with array of `bigint | symbol` becomes null[]", () => {
					const objectWithArrayOfBigintOrSymbols = { array: [bigintOrSymbol] };
					const resultRead = passThru(objectWithArrayOfBigintOrSymbols, { array: [null] });
					assertIdenticalTypes(resultRead, createInstanceOf<{ array: null[] }>());
					assertNever<AnyLocations<typeof resultRead>>();
				});
				it("object with array of `number | bigint | symbol` becomes (number|null)[]", () => {
					const objectWithArrayOfNumberBigintOrSymbols = { array: [numberOrBigintOrSymbol] };
					const resultRead = passThru(objectWithArrayOfNumberBigintOrSymbols, { array: [7] });
					assertIdenticalTypes(resultRead, createInstanceOf<{ array: (number | null)[] }>());
					assertNever<AnyLocations<typeof resultRead>>();
				});
				it("object with readonly array of supported types (numbers) are preserved", () => {
					const resultRead = passThru(objectWithReadonlyArrayOfNumbers);
					assertIdenticalTypes(resultRead, objectWithReadonlyArrayOfNumbers);
					assertNever<AnyLocations<typeof resultRead>>();
					// @ts-expect-error readonly array does not appear to support `push`, but works at runtime.
					// eslint-disable-next-line @typescript-eslint/no-unsafe-call
					resultRead.readonlyArrayOfNumbers.push(0);
					assert.deepStrictEqual(resultRead.readonlyArrayOfNumbers, [
						...objectWithReadonlyArrayOfNumbers.readonlyArrayOfNumbers,
						0,
					]);
				});
			});

			describe("function & object intersections preserve object portion", () => {
				it("function with properties", () => {
					const resultRead = passThruThrows(
						functionWithProperties,
						new Error("JSON.stringify returned undefined"),
					);
					assertIdenticalTypes(resultRead, createInstanceOf<{ property: number }>());
					assertNever<AnyLocations<typeof resultRead>>();
				});
				it("object and function", () => {
					const resultRead = passThru(objectAndFunction, { property: 6 });
					assertIdenticalTypes(resultRead, createInstanceOf<{ property: number }>());
					assertNever<AnyLocations<typeof resultRead>>();
				});
				it("function with class instance with private data", () => {
					const resultRead = passThruThrows(
						functionObjectWithPrivateData,
						new Error("JSON.stringify returned undefined"),
					);
					assertIdenticalTypes(resultRead, createInstanceOf<{ public: string }>());
					assertNever<AnyLocations<typeof resultRead>>();
				});
				it("function with class instance with public data", () => {
					const resultRead = passThruThrows(
						functionObjectWithPublicData,
						new Error("JSON.stringify returned undefined"),
					);
					assertIdenticalTypes(resultRead, createInstanceOf<{ public: string }>());
					assertNever<AnyLocations<typeof resultRead>>();
				});
				it("class instance with private data and is function", () => {
					const resultRead = passThru(classInstanceWithPrivateDataAndIsFunction, {
						public: "public",
						// secret is also not allowed but is present
						secret: 0,
					});
					assertIdenticalTypes(resultRead, createInstanceOf<{ public: string }>());
					assertNever<AnyLocations<typeof resultRead>>();
					// Keep this assert at end of scope to avoid assertion altering type
					const varTypeof = typeof classInstanceWithPrivateDataAndIsFunction;
					assert(
						varTypeof === "object",
						"class instance that is also a function is an object at runtime",
					);
				});
				it("class instance with public data and is function", () => {
					const resultRead = passThru(classInstanceWithPublicDataAndIsFunction, {
						public: "public",
					});
					assertIdenticalTypes(resultRead, createInstanceOf<{ public: string }>());
					assertNever<AnyLocations<typeof resultRead>>();
				});
				it("class instance in object with optional recursion", () => {
					const resultRead = passThru(objectWithClassWithPrivateDataInOptionalRecursion, {
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
					});
					assertIdenticalTypes(
						resultRead,
						createInstanceOf<{
							class: {
								public: string;
							};
							recurse?: OpaqueJsonDeserialized<
								typeof objectWithClassWithPrivateDataInOptionalRecursion
							>;
						}>(),
					);
					assertNever<AnyLocations<typeof resultRead>>();
				});
				it("function object with recursion", () => {
					const resultRead = passThruThrows(
						selfRecursiveFunctionWithProperties,
						new Error("JSON.stringify returned undefined"),
					);
					assertIdenticalTypes(
						resultRead,
						createInstanceOf<{
							recurse?: OpaqueJsonDeserialized<typeof selfRecursiveFunctionWithProperties>;
						}>(),
					);
					assertNever<AnyLocations<typeof resultRead>>();
				});
				it("object and function with recursion", () => {
					const resultRead = passThru(selfRecursiveObjectAndFunction, { recurse: {} });
					assertIdenticalTypes(
						resultRead,
						createInstanceOf<{
							recurse?: OpaqueJsonDeserialized<typeof selfRecursiveObjectAndFunction>;
						}>(),
					);
					assertNever<AnyLocations<typeof resultRead>>();
				});
			});

			// Class instances are indistinguishable from general objects by type checking.
			// They are considered supported despite loss of instanceof support after
			// deserialization.
			describe("class instance methods and non-public properties are removed", () => {
				it("with public method (removes method)", () => {
					const instanceRead = passThru(classInstanceWithPublicMethod, {
						public: "public",
					});
					assertIdenticalTypes(
						instanceRead,
						createInstanceOf<{
							public: string;
						}>(),
					);
					assertNever<AnyLocations<typeof instanceRead>>();
					// @ts-expect-error getSecret is missing, but required
					instanceRead satisfies typeof classInstanceWithPublicMethod;
					// @ts-expect-error getSecret is missing, but required
					assertIdenticalTypes(instanceRead, classInstanceWithPublicMethod);
					assert.ok(
						classInstanceWithPublicMethod instanceof ClassWithPublicMethod,
						"classInstanceWithPublicMethod is an instance of ClassWithPublicMethod",
					);
					assert.ok(
						!(instanceRead instanceof ClassWithPublicMethod),
						"instanceRead is not an instance of ClassWithPublicMethod",
					);
				});
				it("with private method (removes method)", () => {
					const instanceRead = passThru(classInstanceWithPrivateMethod, {
						public: "public",
					});
					assertIdenticalTypes(
						instanceRead,
						createInstanceOf<{
							public: string;
						}>(),
					);
					assertNever<AnyLocations<typeof instanceRead>>();
					// @ts-expect-error getSecret is missing, but required
					instanceRead satisfies typeof classInstanceWithPrivateMethod;
					// @ts-expect-error getSecret is missing, but required
					assertIdenticalTypes(instanceRead, classInstanceWithPrivateMethod);
					assert.ok(
						classInstanceWithPrivateMethod instanceof ClassWithPrivateMethod,
						"classInstanceWithPrivateMethod is an instance of ClassWithPrivateMethod",
					);
					assert.ok(
						!(instanceRead instanceof ClassWithPrivateMethod),
						"instanceRead is not an instance of ClassWithPrivateMethod",
					);
				});
				it("with private getter (removes getter)", () => {
					const instanceRead = passThru(classInstanceWithPrivateGetter, {
						public: "public",
					});
					assertIdenticalTypes(
						instanceRead,
						createInstanceOf<{
							public: string;
						}>(),
					);
					assertNever<AnyLocations<typeof instanceRead>>();
					// @ts-expect-error secret is missing, but required
					instanceRead satisfies typeof classInstanceWithPrivateGetter;
					// @ts-expect-error secret is missing, but required
					assertIdenticalTypes(instanceRead, classInstanceWithPrivateGetter);
					assert.ok(
						classInstanceWithPrivateGetter instanceof ClassWithPrivateGetter,
						"classInstanceWithPrivateGetter is an instance of ClassWithPrivateGetter",
					);
					assert.ok(
						!(instanceRead instanceof ClassWithPrivateGetter),
						"instanceRead is not an instance of ClassWithPrivateGetter",
					);
				});
				it("with private setter (removes setter)", () => {
					const instanceRead = passThru(classInstanceWithPrivateSetter, {
						public: "public",
					});
					assertIdenticalTypes(
						instanceRead,
						createInstanceOf<{
							public: string;
						}>(),
					);
					assertNever<AnyLocations<typeof instanceRead>>();
					// @ts-expect-error secret is missing, but required
					instanceRead satisfies typeof classInstanceWithPrivateSetter;
					// @ts-expect-error secret is missing, but required
					assertIdenticalTypes(instanceRead, classInstanceWithPrivateSetter);
					assert.ok(
						classInstanceWithPrivateSetter instanceof ClassWithPrivateSetter,
						"classInstanceWithPrivateSetter is an instance of ClassWithPrivateSetter",
					);
					assert.ok(
						!(instanceRead instanceof ClassWithPrivateSetter),
						"instanceRead is not an instance of ClassWithPrivateSetter",
					);
				});
				it("with private data (hides private data that propagates)", () => {
					const instanceRead = passThru(classInstanceWithPrivateData, {
						public: "public",
						secret: 0,
					});
					assertIdenticalTypes(
						instanceRead,
						createInstanceOf<{
							public: string;
						}>(),
					);
					assertNever<AnyLocations<typeof instanceRead>>();
					// @ts-expect-error secret is missing, but required
					instanceRead satisfies typeof classInstanceWithPrivateData;
					// @ts-expect-error secret is missing, but required
					assertIdenticalTypes(instanceRead, classInstanceWithPrivateData);
					assert.ok(
						classInstanceWithPrivateData instanceof ClassWithPrivateData,
						"classInstanceWithPrivateData is an instance of ClassWithPrivateData",
					);
					assert.ok(
						!(instanceRead instanceof ClassWithPrivateData),
						"instanceRead is not an instance of ClassWithPrivateData",
					);
				});
				it("object with recursion and handle unrolls once listing public properties and then has OpaqueJsonDeserialized wrapper", () => {
					const resultRead = passThru(objectWithFluidHandleOrRecursion, {
						recurseToHandle: { recurseToHandle: "fake-handle" },
					});
					assertIdenticalTypes(
						resultRead,
						createInstanceOf<{
							recurseToHandle:
								| OpaqueJsonDeserialized<typeof objectWithFluidHandleOrRecursion>
								| {
										readonly isAttached: boolean;
								  };
						}>(),
					);
					assertNever<AnyLocations<typeof resultRead>>();
				});

				describe("for common class instance of", () => {
					it("Map", () => {
						const instanceRead = passThru(mapOfStringsToNumbers, {});
						assertIdenticalTypes(instanceRead, {
							size: number,
						} as const);
						assertNever<AnyLocations<typeof instanceRead>>();
						// @ts-expect-error methods are missing, but required
						instanceRead satisfies typeof mapOfStringsToNumbers;
						// @ts-expect-error methods are missing, but required
						assertIdenticalTypes(instanceRead, mapOfStringsToNumbers);
						assert.ok(
							mapOfStringsToNumbers instanceof Map,
							"mapOfStringsToNumbers is an instance of Map",
						);
						assert.ok(
							!(instanceRead instanceof Map),
							"instanceRead is not an instance of Map",
						);
					});
					it("ReadonlyMap", () => {
						const instanceRead = passThru(readonlyMapOfStringsToNumbers, {});
						assertIdenticalTypes(instanceRead, {
							size: number,
						} as const);
						assertNever<AnyLocations<typeof instanceRead>>();
						// @ts-expect-error methods are missing, but required
						instanceRead satisfies typeof readonlyMapOfStringsToNumbers;
						// @ts-expect-error methods are missing, but required
						assertIdenticalTypes(instanceRead, readonlyMapOfStringsToNumbers);
						assert.ok(
							mapOfStringsToNumbers instanceof Map,
							"mapOfStringsToNumbers is an instance of Map",
						);
						assert.ok(
							!(instanceRead instanceof Map),
							"instanceRead is not an instance of Map",
						);
					});
					it("Set", () => {
						const instanceRead = passThru(setOfNumbers, {});
						assertIdenticalTypes(instanceRead, {
							size: number,
						} as const);
						assertNever<AnyLocations<typeof instanceRead>>();
						// @ts-expect-error methods are missing, but required
						instanceRead satisfies typeof setOfNumbers;
						// @ts-expect-error methods are missing, but required
						assertIdenticalTypes(instanceRead, setOfNumbers);
						assert.ok(
							setOfNumbers instanceof Set,
							"mapOfStringsToNumbers is an instance of Set",
						);
						assert.ok(
							!(instanceRead instanceof Set),
							"instanceRead is not an instance of Set",
						);
					});
					it("ReadonlySet", () => {
						const instanceRead = passThru(readonlySetOfNumbers, {});
						assertIdenticalTypes(instanceRead, {
							size: number,
						} as const);
						assertNever<AnyLocations<typeof instanceRead>>();
						// @ts-expect-error methods are missing, but required
						instanceRead satisfies typeof readonlySetOfNumbers;
						// @ts-expect-error methods are missing, but required
						assertIdenticalTypes(instanceRead, readonlySetOfNumbers);
						assert.ok(
							setOfNumbers instanceof Set,
							"mapOfStringsToNumbers is an instance of Set",
						);
						assert.ok(
							!(instanceRead instanceof Set),
							"instanceRead is not an instance of Set",
						);
					});
				});
			});

			describe("branded non-primitive types lose branding", () => {
				// Ideally there could be a transformation to JsonTypeWith<never> but
				// `object` intersected with branding (which is an object) is just the branding.
				it("branded `object` becomes just empty", () => {
					const resultRead = passThru(brandedObject);
					assertIdenticalTypes(resultRead, emptyObject);
					assertNever<AnyLocations<typeof resultRead>>();
				});
				it("branded object with `string`", () => {
					const resultRead = passThru(brandedObjectWithString);
					assertIdenticalTypes(resultRead, objectWithString);
					assertNever<AnyLocations<typeof resultRead>>();
				});
			});

			it("`object` (plain object) becomes non-null Json object", () => {
				const resultRead = passThru(
					object,
					// object's value is actually supported; so, no runtime error.
				);
				assertIdenticalTypes(resultRead, createInstanceOf<NonNullJsonObjectWith<never>>());
				assertNever<AnyLocations<typeof resultRead>>();
			});

			describe("OpaqueJsonSerialized becomes OpaqueJsonDeserialized counterpart", () => {
				it("OpaqueJsonSerializable<{number:number}> becomes OpaqueJsonDeserialized<{number:number}>", () => {
					const resultRead = passThru(opaqueSerializableObject);
					assertIdenticalTypes(
						resultRead,
						createInstanceOf<OpaqueJsonDeserialized<{ number: number }>>(),
					);
					assertNever<AnyLocations<typeof resultRead>>();
					const transparentResult = exposeFromOpaqueJson(resultRead);
					assertIdenticalTypes(transparentResult, objectWithNumber);
				});
				it("OpaqueJsonSerializable<{number:number}>&OpaqueJsonDeserialized<{number:number}> becomes OpaqueJsonDeserialized<{number:number}>", () => {
					const resultRead = passThru(opaqueSerializableAndDeserializedObject);
					assertIdenticalTypes(
						resultRead,
						createInstanceOf<OpaqueJsonDeserialized<{ number: number }>>(),
					);
					assertNever<AnyLocations<typeof resultRead>>();
					const transparentResult = exposeFromOpaqueJson(resultRead);
					assertIdenticalTypes(transparentResult, objectWithNumber);
				});
				it("OpaqueJsonSerializable<unknown> becomes OpaqueJsonDeserialized<unknown>", () => {
					const resultRead = passThru(opaqueSerializableUnknown);
					assertIdenticalTypes(
						resultRead,
						createInstanceOf<OpaqueJsonDeserialized<unknown>>(),
					);
					assertNever<AnyLocations<typeof resultRead>>();
					const transparentResult = exposeFromOpaqueJson(resultRead);
					assertIdenticalTypes(transparentResult, createInstanceOf<JsonTypeWith<never>>());
				});
				it("object with OpaqueJsonSerializable<unknown> becomes object with OpaqueJsonDeserialized<unknown>", () => {
					const resultRead = passThru(objectWithOpaqueSerializableUnknown);
					assertIdenticalTypes(
						resultRead,
						createInstanceOf<{ opaque: OpaqueJsonDeserialized<unknown> }>(),
					);
					assertNever<AnyLocations<typeof resultRead>>();
					const transparentResult = revealOpaqueJson(resultRead);
					assertIdenticalTypes(
						transparentResult,
						createInstanceOf<{ opaque: JsonTypeWith<never> }>(),
					);
				});
				it("object with OpaqueJsonSerializable<unknown> in recursion is unrolled one time with OpaqueJsonDeserialized", () => {
					const resultRead = passThru(opaqueSerializableInRecursiveStructure);
					interface DeserializedOpaqueSerializableInRecursiveStructure {
						items: {
							[x: string | number]:
								| OpaqueJsonDeserialized<DirectoryOfValues<OpaqueJsonSerializable<unknown>>>
								| {
										value?: OpaqueJsonDeserialized<unknown>;
								  };
						};
					}
					assertIdenticalTypes(
						resultRead,
						createInstanceOf<DeserializedOpaqueSerializableInRecursiveStructure>(),
					);
					assertNever<AnyLocations<typeof resultRead>>();
					const transparentResult = revealOpaqueJson(resultRead);
					assertIdenticalTypes(
						transparentResult,
						createInstanceOf<{
							items: {
								[x: string | number]:
									| DeserializedOpaqueSerializableInRecursiveStructure
									| {
											value?: JsonTypeWith<never>;
									  };
							};
						}>(),
					);
				});
				// It might be better to preserve the intersection and return original type.
				it("object with OpaqueJsonSerializable<unknown> & OpaqueJsonDeserialized<unknown> in recursion is unrolled one time with OpaqueJsonDeserialized", () => {
					const resultRead = passThru(opaqueSerializableAndDeserializedInRecursiveStructure);
					interface DeserializedOpaqueSerializableInRecursiveStructure {
						items: {
							[x: string | number]:
								| OpaqueJsonDeserialized<
										DirectoryOfValues<
											OpaqueJsonSerializable<unknown> & OpaqueJsonDeserialized<unknown>
										>
								  >
								| {
										value?: OpaqueJsonDeserialized<unknown>;
								  };
						};
					}
					assertIdenticalTypes(
						resultRead,
						createInstanceOf<DeserializedOpaqueSerializableInRecursiveStructure>(),
					);
					assertNever<AnyLocations<typeof resultRead>>();
					const transparentResult = revealOpaqueJson(resultRead);
					assertIdenticalTypes(
						transparentResult,
						createInstanceOf<{
							items: {
								[x: string | number]:
									| DeserializedOpaqueSerializableInRecursiveStructure
									| {
											value?: JsonTypeWith<never>;
									  };
							};
						}>(),
					);
				});
			});

			describe("opaque Json types requiring extra allowed types have extras removed", () => {
				it("opaque serializable object with `bigint`", () => {
					const resultRead = passThruThrows(
						opaqueSerializableObjectRequiringBigintSupport,
						new TypeError("Do not know how to serialize a BigInt"),
					);
					assertIdenticalTypes(
						resultRead,
						createInstanceOf<OpaqueJsonDeserialized<{ bigint: bigint }>>(),
					);
					assertNever<AnyLocations<typeof resultRead>>();
					const transparentResult = exposeFromOpaqueJson(resultRead);
					assertIdenticalTypes(transparentResult, {});
				});
				it("opaque deserialized object with `bigint`", () => {
					const resultRead = passThruThrows(
						opaqueDeserializedObjectRequiringBigintSupport,
						new TypeError("Do not know how to serialize a BigInt"),
					);
					assertIdenticalTypes(
						resultRead,
						createInstanceOf<OpaqueJsonDeserialized<{ bigint: bigint }>>(),
					);
					assertNever<AnyLocations<typeof resultRead>>();
					const transparentResult = exposeFromOpaqueJson(resultRead);
					assertIdenticalTypes(transparentResult, {});
				});
				it("opaque serializable and deserialized object with `bigint`", () => {
					const resultRead = passThruThrows(
						opaqueSerializableAndDeserializedObjectRequiringBigintSupport,
						new TypeError("Do not know how to serialize a BigInt"),
					);
					assertIdenticalTypes(
						resultRead,
						createInstanceOf<OpaqueJsonDeserialized<{ bigint: bigint }>>(),
					);
					assertNever<AnyLocations<typeof resultRead>>();
					const transparentResult = exposeFromOpaqueJson(resultRead);
					assertIdenticalTypes(transparentResult, {});
				});

				it("opaque serializable object with number array expecting `bigint` support", () => {
					const resultRead = passThru(opaqueSerializableObjectExpectingBigintSupport);
					assertIdenticalTypes(
						resultRead,
						createInstanceOf<
							OpaqueJsonDeserialized<{ readonlyArrayOfNumbers: readonly number[] }>
						>(),
					);
					assertNever<AnyLocations<typeof resultRead>>();
					const transparentResult = exposeFromOpaqueJson(resultRead);
					assertIdenticalTypes(transparentResult, objectWithReadonlyArrayOfNumbers);
				});
				it("opaque deserialized object with number array expecting `bigint` support", () => {
					const resultRead = passThru(opaqueDeserializedObjectExpectingBigintSupport);
					assertIdenticalTypes(
						resultRead,
						createInstanceOf<
							OpaqueJsonDeserialized<{ readonlyArrayOfNumbers: readonly number[] }>
						>(),
					);
					assertNever<AnyLocations<typeof resultRead>>();
					const transparentResult = exposeFromOpaqueJson(resultRead);
					assertIdenticalTypes(transparentResult, objectWithReadonlyArrayOfNumbers);
				});
				it("opaque serializable and deserialized object with number array expecting `bigint` support", () => {
					const resultRead = passThru(
						opaqueSerializableAndDeserializedObjectExpectingBigintSupport,
					);
					assertIdenticalTypes(
						resultRead,
						createInstanceOf<
							OpaqueJsonDeserialized<{ readonlyArrayOfNumbers: readonly number[] }>
						>(),
					);
					assertNever<AnyLocations<typeof resultRead>>();
					const transparentResult = exposeFromOpaqueJson(resultRead);
					assertIdenticalTypes(transparentResult, objectWithReadonlyArrayOfNumbers);
				});
			});
		});

		describe("fully supported union types are preserved", () => {
			it("simple json (`JsonTypeWith<never>`)", () => {
				const resultRead = passThru(simpleJson);
				assertIdenticalTypes(resultRead, simpleJson);
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("simple read-only json (`ReadonlyJsonTypeWith<never>`)", () => {
				const resultRead = passThru(simpleImmutableJson);
				assertIdenticalTypes(resultRead, simpleImmutableJson);
				assertNever<AnyLocations<typeof resultRead>>();
			});
		});

		describe("unsupported object types", () => {
			// These cases are demonstrating defects within the current implementation.
			// They show "allowed" incorrect use and the unexpected results.
			describe("known defect expectations", () => {
				describe("getters and setters preserved but do not propagate", () => {
					it("object with `readonly` implemented via getter", () => {
						const resultRead = passThru(objectWithReadonlyViaGetter, {});
						assertIdenticalTypes(resultRead, objectWithReadonlyViaGetter);
					});

					it("object with getter", () => {
						const resultRead = passThru(objectWithGetter, {});
						assertIdenticalTypes(resultRead, objectWithGetter);

						assert.throws(() => {
							// @ts-expect-error Cannot assign to 'getter' because it is a read-only property.
							objectWithGetter.getter = -1;
						}, new TypeError(
							"Cannot set property getter of #<ClassImplementsObjectWithGetter> which has only a getter",
						));
						// @ts-expect-error Cannot assign to 'getter' because it is a read-only property.
						resultRead.getter = -1;
					});

					it("object with setter", () => {
						const resultRead = passThru(objectWithSetter, {});
						assertIdenticalTypes(resultRead, objectWithSetter);

						// Read from setter only produces `undefined` but is typed as `string`.
						const originalSetterValue = objectWithSetter.setter;
						assert.equal(originalSetterValue, undefined);
						// Read from deserialized is the same, but only per lack of propagation.
						const resultSetterValue = resultRead.setter;
						assert.equal(resultSetterValue, undefined);

						assert.throws(() => {
							// @ts-expect-error 'number' is not assignable to type 'string'
							objectWithSetter.setter = -1;
						}, new Error("ClassImplementsObjectWithSetter writing 'setter' as -1"));
						// @ts-expect-error 'number' is not assignable to type 'string'
						resultRead.setter = -1;
					});

					it("object with matched getter and setter", () => {
						const resultRead = passThru(objectWithMatchedGetterAndSetterProperty, {});
						assertIdenticalTypes(resultRead, objectWithMatchedGetterAndSetterProperty);
					});

					it("object with mismatched getter and setter", () => {
						const resultRead = passThru(objectWithMismatchedGetterAndSetterProperty, {});
						assertIdenticalTypes(resultRead, objectWithMismatchedGetterAndSetterProperty);

						// @ts-expect-error 'number' is not assignable to type 'string'
						resultRead.property = -1;
						assert.throws(() => {
							// @ts-expect-error 'number' is not assignable to type 'string'
							objectWithMismatchedGetterAndSetterProperty.property = -1;
						}, new Error(
							"ClassImplementsObjectWithMismatchedGetterAndSetterProperty writing 'property' as -1",
						));
					});
				});

				it("array of numbers with holes", () => {
					const resultRead = passThru(arrayOfNumbersSparse, [0, null, null, 3]);
					assertIdenticalTypes(resultRead, arrayOfNumbersSparse);
				});
			});
		});
	});

	// These test cases are not really negative compilation test like they are to JsonSerializable.
	// These cases are for instances of notable loss of original information.
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

		describe("unsupported types", () => {
			it("`undefined` becomes `never`", () => {
				passThruThrows(
					undefined,
					new Error("JSON.stringify returned undefined"),
				) satisfies never;
			});
			it("`unknown` becomes `JsonTypeWith<never>`", () => {
				const resultRead = passThru(
					unknownValueOfSimpleRecord,
					// value is actually supported; so, no runtime error.
				);
				assertIdenticalTypes(resultRead, createInstanceOf<JsonTypeWith<never>>());
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("`string` indexed record of `unknown` replaced with `JsonTypeWith<never>`", () => {
				const resultRead = passThru(stringRecordOfUnknown);
				assertIdenticalTypes(
					resultRead,
					createInstanceOf<Record<string, JsonTypeWith<never>>>(),
				);
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("templated record of `unknown` replaced with `JsonTypeWith<never>`", () => {
				const resultRead = passThru(templatedRecordOfUnknown);
				assertIdenticalTypes(
					resultRead,
					createInstanceOf<Record<`${string}Key`, JsonTypeWith<never>>>(),
				);
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("`string` indexed record of `unknown` and known properties has `unknown` replaced with `JsonTypeWith<never>`", () => {
				const resultRead = passThru(stringRecordOfUnknownWithKnownProperties);
				assertIdenticalTypes(
					resultRead,
					createInstanceOf<
						InternalUtilityTypes.FlattenIntersection<
							Record<string, JsonTypeWith<never>> & {
								knownString: string;
								knownNumber: number;
							}
						>
					>(),
				);
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("`string` indexed record of `unknown` and optional known properties has `unknown` replaced with `JsonTypeWith<never>`", () => {
				const resultRead = passThru(stringRecordOfUnknownWithOptionalKnownProperties, {
					knownString: "string value",
				});
				assertIdenticalTypes(
					resultRead,
					createInstanceOf<
						InternalUtilityTypes.FlattenIntersection<
							Record<string, JsonTypeWith<never>> & {
								knownString?: string;
								knownNumber?: number;
							}
						>
					>(),
				);
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("`string` indexed record of `unknown` and required known `unknown` has all `unknown` replaced with `JsonTypeWith<never>` (and known becomes explicitly optional)", () => {
				const resultRead = passThru(stringRecordOfUnknownWithKnownUnknown);
				assertIdenticalTypes(
					resultRead,
					createInstanceOf<
						InternalUtilityTypes.FlattenIntersection<
							Record<string, JsonTypeWith<never>> & {
								knownUnknown?: JsonTypeWith<never>;
							}
						>
					>(),
				);
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("`string` indexed record of `unknown` and optional known `unknown` has all `unknown` replaced with `JsonTypeWith<never>`", () => {
				const resultRead = passThru(stringRecordOfUnknownWithOptionalKnownUnknown);
				assertIdenticalTypes(
					resultRead,
					createInstanceOf<
						InternalUtilityTypes.FlattenIntersection<
							Record<string, JsonTypeWith<never>> & {
								knownUnknown?: JsonTypeWith<never>;
							}
						>
					>(),
				);
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("`Partial<>` `string` indexed record of `unknown` replaced with `JsonTypeWith<never>` (and is inherently optional)", () => {
				const resultRead = passThru(partialStringRecordOfUnknown);
				assertIdenticalTypes(
					resultRead,
					createInstanceOf<Record<string, JsonTypeWith<never>>>(),
				);
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("`Partial<>` `string` indexed record of `unknown` and known properties has `unknown` replaced with `JsonTypeWith<never>` (and is inherently optional)", () => {
				const resultRead = passThru(partialStringRecordOfUnknownWithKnownProperties);
				assertIdenticalTypes(
					resultRead,
					createInstanceOf<
						InternalUtilityTypes.FlattenIntersection<
							Record<string, JsonTypeWith<never>> & {
								knownString: string;
								knownNumber: number;
							}
						>
					>(),
				);
				assertNever<AnyLocations<typeof resultRead>>();
			});
			it("`symbol` becomes `never`", () => {
				passThruThrows(symbol, new Error("JSON.stringify returned undefined")) satisfies never;
			});
			it("`unique symbol` becomes `never`", () => {
				passThruThrows(
					uniqueSymbol,
					new Error("JSON.stringify returned undefined"),
				) satisfies never;
			});
			it("`bigint` becomes `never`", () => {
				passThruThrows(
					bigint,
					new TypeError("Do not know how to serialize a BigInt"),
				) satisfies never;
			});
			it("function becomes `never`", () => {
				passThruThrows(
					aFunction,
					new Error("JSON.stringify returned undefined"),
				) satisfies never;
			});
			it("`void` becomes `never`", () => {
				passThru(
					voidValue,
					// voidValue is actually `null`; so, no runtime error.
				) satisfies never;
			});
		});
	});

	describe("special cases", () => {
		it("explicit `any` generic limits result type", () => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const resultRead = passThruThrows<any>(
				undefined,
				new Error("JSON.stringify returned undefined"),
			);
			assertIdenticalTypes(resultRead, createInstanceOf<JsonTypeWith<never>>());
			assertNever<AnyLocations<typeof resultRead>>();
		});

		describe("using alternately allowed types", () => {
			describe("are preserved", () => {
				it("`bigint`", () => {
					const resultRead = passThruHandlingBigint(bigint);
					assertIdenticalTypes(resultRead, createInstanceOf<bigint>());
					assertNever<AnyLocations<typeof resultRead>>();
				});
				it("object with `bigint`", () => {
					const resultRead = passThruHandlingBigint(objectWithBigint);
					assertIdenticalTypes(resultRead, objectWithBigint);
					assertNever<AnyLocations<typeof resultRead>>();
				});
				it("object with optional `bigint`", () => {
					const resultRead = passThruHandlingBigint(objectWithOptionalBigint);
					assertIdenticalTypes(resultRead, objectWithOptionalBigint);
					assertNever<AnyLocations<typeof resultRead>>();
				});
				it("array of `bigint`s", () => {
					const resultRead = passThruHandlingBigint(arrayOfBigints);
					assertIdenticalTypes(resultRead, arrayOfBigints);
					assertNever<AnyLocations<typeof resultRead>>();
				});
				it("array of `bigint` or basic object", () => {
					const resultRead = passThruHandlingBigint(arrayOfBigintOrObjects);
					assertIdenticalTypes(resultRead, arrayOfBigintOrObjects);
					assertNever<AnyLocations<typeof resultRead>>();
				});
				it("opaque serializable object with `bigint`", () => {
					const resultRead = passThruHandlingBigint(
						opaqueSerializableObjectRequiringBigintSupport,
					);
					assertIdenticalTypes(
						resultRead,
						createInstanceOf<OpaqueJsonDeserialized<{ bigint: bigint }, [bigint]>>(),
					);
					assertNever<AnyLocations<typeof resultRead>>();
				});
				it("opaque deserialized object with `bigint`", () => {
					const resultRead = passThruHandlingBigint(
						opaqueDeserializedObjectRequiringBigintSupport,
					);
					assertIdenticalTypes(resultRead, opaqueDeserializedObjectRequiringBigintSupport);
					assertNever<AnyLocations<typeof resultRead>>();
				});
				it("opaque serializable and deserialized object with `bigint`", () => {
					const resultRead = passThruHandlingBigint(
						opaqueSerializableAndDeserializedObjectRequiringBigintSupport,
					);
					assertIdenticalTypes(
						resultRead,
						createInstanceOf<OpaqueJsonDeserialized<{ bigint: bigint }, [bigint]>>(),
					);
					assertNever<AnyLocations<typeof resultRead>>();
				});
				it("object with specific function", () => {
					const objectWithSpecificFunction = {
						genericFn: () => undefined as unknown,
						specificFn: (v: string) => v.length,
						specificFnOrAnother: ((v: string) => v.length) as
							| ((v: string) => number)
							| ((n: number) => string),
						specificFnWithExtraProperties: Object.assign((v: string) => v.length, {
							number: 4,
							otherFn: () => undefined as unknown,
						}),
						lessRequirementsFn: () => 0 as number,
						moreSpecificOutputFn: (_v: string) => 0 as const,
						nestedWithNumberAndGenericFn: { number: 4, otherFn: () => undefined as unknown },
					};
					const resultRead = passThruHandlingSpecificFunction(objectWithSpecificFunction);
					assertIdenticalTypes(
						resultRead,
						createInstanceOf<{
							specificFn: (_: string) => number;
							specificFnOrAnother?: (_: string) => number;
							specificFnWithExtraProperties?: {
								number: number;
							};
							nestedWithNumberAndGenericFn: { number: number };
						}>(),
					);
					assertNever<AnyLocations<typeof resultRead>>();
				});
				it("`IFluidHandle`", () => {
					const resultRead = passThruHandlingFluidHandle(fluidHandleToNumber);
					assertIdenticalTypes(resultRead, createInstanceOf<IFluidHandle<number>>());
					assertNever<AnyLocations<typeof resultRead>>();
				});
				it("object with `IFluidHandle`", () => {
					const resultRead = passThruHandlingFluidHandle(objectWithFluidHandle);
					assertIdenticalTypes(resultRead, objectWithFluidHandle);
					assertNever<AnyLocations<typeof resultRead>>();
				});
				it("object with `IFluidHandle` and recursion", () => {
					const resultRead = passThruHandlingFluidHandle(objectWithFluidHandleOrRecursion);
					assertIdenticalTypes(resultRead, objectWithFluidHandleOrRecursion);
					assertNever<AnyLocations<typeof resultRead>>();
				});
				it("`unknown`", () => {
					const resultRead = passThruPreservingUnknown(
						unknownValueOfSimpleRecord,
						// value is actually supported; so, no runtime error.
					);
					assertIdenticalTypes(resultRead, unknownValueOfSimpleRecord);
					assertNever<AnyLocations<typeof resultRead>>();
				});
				it("object with optional `unknown`", () => {
					const resultRead = passThruPreservingUnknown(objectWithOptionalUnknown);
					assertIdenticalTypes(resultRead, objectWithOptionalUnknown);
					assertNever<AnyLocations<typeof resultRead>>();
				});
				it("object with optional `unknown` and recursion", () => {
					const resultRead = passThruPreservingUnknown(
						objectWithOptionalUnknownInOptionalRecursion,
					);
					assertIdenticalTypes(resultRead, objectWithOptionalUnknownInOptionalRecursion);
					assertNever<AnyLocations<typeof resultRead>>();
				});
				it("`string` indexed record of `unknown`", () => {
					const resultRead = passThruPreservingUnknown(stringRecordOfUnknown);
					assertIdenticalTypes(resultRead, stringRecordOfUnknown);
					assertNever<AnyLocations<typeof resultRead>>();
				});
				it("templated record of `unknown`", () => {
					const resultRead = passThruPreservingUnknown(templatedRecordOfUnknown);
					assertIdenticalTypes(resultRead, templatedRecordOfUnknown);
					assertNever<AnyLocations<typeof resultRead>>();
				});
				it("`string` indexed record of `unknown` and known properties", () => {
					const resultRead = passThruPreservingUnknown(
						stringRecordOfUnknownWithKnownProperties,
					);
					assertIdenticalTypes(resultRead, stringRecordOfUnknownWithKnownProperties);
					assertNever<AnyLocations<typeof resultRead>>();
				});
				it("`string` indexed record of `unknown` and optional known properties", () => {
					const resultRead = passThruPreservingUnknown(
						stringRecordOfUnknownWithOptionalKnownProperties,
					);
					assertIdenticalTypes(resultRead, stringRecordOfUnknownWithOptionalKnownProperties);
					assertNever<AnyLocations<typeof resultRead>>();
				});
				it("`string` indexed record of `unknown` and optional known `unknown`", () => {
					const resultRead = passThruPreservingUnknown(
						stringRecordOfUnknownWithOptionalKnownUnknown,
					);
					assertIdenticalTypes(resultRead, stringRecordOfUnknownWithOptionalKnownUnknown);
					assertNever<AnyLocations<typeof resultRead>>();
				});
				it("`Partial<>` `string` indexed record of `unknown`", () => {
					const resultRead = passThruPreservingUnknown(partialStringRecordOfUnknown);
					assertIdenticalTypes(resultRead, partialStringRecordOfUnknown);
					assertNever<AnyLocations<typeof resultRead>>();
				});
				it("`Partial<>` `string` indexed record of `unknown` and known properties", () => {
					const resultRead = passThruPreservingUnknown(
						partialStringRecordOfUnknownWithKnownProperties,
					);
					assertIdenticalTypes(resultRead, partialStringRecordOfUnknownWithKnownProperties);
					assertNever<AnyLocations<typeof resultRead>>();
				});
				it("array of `unknown`", () => {
					const resultRead = passThruPreservingUnknown(arrayOfUnknown);
					assertIdenticalTypes(resultRead, arrayOfUnknown);
					assertNever<AnyLocations<typeof resultRead>>();
				});
				it("object with array of `unknown`", () => {
					const resultRead = passThruPreservingUnknown(objectWithArrayOfUnknown);
					assertIdenticalTypes(resultRead, objectWithArrayOfUnknown);
					assertNever<AnyLocations<typeof resultRead>>();
				});
			});

			describe("still modifies required `unknown` to become optional", () => {
				it("object with required `unknown`", () => {
					const resultRead = passThruPreservingUnknown(objectWithUnknown);
					assertIdenticalTypes(resultRead, createInstanceOf<{ unknown?: unknown }>());
					assertNever<AnyLocations<typeof resultRead>>();
				});
				it("object with required `unknown` adjacent to recursion", () => {
					const resultRead = passThruPreservingUnknown(
						objectWithUnknownAdjacentToOptionalRecursion,
					);
					assertIdenticalTypes(
						resultRead,
						objectWithOptionalUnknownAdjacentToOptionalRecursion,
					);
					assertNever<AnyLocations<typeof resultRead>>();
				});
				it("mixed record of `unknown`", () => {
					const resultRead = passThruPreservingUnknown(mixedRecordOfUnknown);
					assertIdenticalTypes(
						resultRead,
						createInstanceOf<
							Partial<Record<number | "aKey" | `bKey_${string}` | `bKey_${number}`, unknown>>
						>(),
					);
					assertNever<AnyLocations<typeof resultRead>>();
				});
				it("`string` indexed record of `unknown` and required known `unknown`", () => {
					const resultRead = passThruPreservingUnknown(stringRecordOfUnknownWithKnownUnknown);
					assertIdenticalTypes(resultRead, stringRecordOfUnknownWithOptionalKnownUnknown);
					assertNever<AnyLocations<typeof resultRead>>();
				});
			});

			describe("continues rejecting unsupported that are not alternately allowed", () => {
				it("`unknown` (simple object) becomes `JsonTypeWith<bigint>`", () => {
					const resultRead = passThruHandlingBigint(
						unknownValueOfSimpleRecord,
						// value is actually supported; so, no runtime error.
					);
					assertIdenticalTypes(resultRead, createInstanceOf<JsonTypeWith<bigint>>());
					assertNever<AnyLocations<typeof resultRead>>();
				});
				it("`unknown` (with bigint) becomes `JsonTypeWith<bigint>`", () => {
					const resultRead = passThruHandlingBigint(
						unknownValueWithBigint,
						// value is actually supported; so, no runtime error.
					);
					assertIdenticalTypes(resultRead, createInstanceOf<JsonTypeWith<bigint>>());
					assertNever<AnyLocations<typeof resultRead>>();
				});
				it("`symbol` still becomes `never`", () => {
					passThruHandlingBigintThrows(
						symbol,
						new Error("JSON.stringify returned undefined"),
					) satisfies never;
				});
				it("`object` (plain object) still becomes non-null Json object", () => {
					const resultRead = passThruHandlingBigint(
						object,
						// object's value is actually supported; so, no runtime error.
					);
					assertIdenticalTypes(resultRead, createInstanceOf<NonNullJsonObjectWith<bigint>>());
					assertNever<AnyLocations<typeof resultRead>>();
				});
			});
		});
	});
});

/* eslint-enable unicorn/no-null */
