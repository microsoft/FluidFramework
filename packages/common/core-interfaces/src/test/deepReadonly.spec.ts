/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { assertIdenticalTypes, createInstanceOf } from "./testUtils.js";
import type {
	ClassWithPublicData,
	Point,
	ReadonlyObjectWithOptionalRecursion,
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
	voidValue,
	never,
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
	arrayOfFunctions,
	arrayOfFunctionsWithProperties,
	arrayOfObjectAndFunctions,
	arrayOfBigintOrSymbols,
	arrayOfNumberBigintOrSymbols,
	arrayOfBigintOrObjects,
	arrayOfSymbolOrObjects,
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
	objectWithNumberOrUndefinedUndefined,
	objectWithReadonly,
	objectWithReadonlyViaGetter,
	objectWithGetter,
	objectWithGetterViaValue,
	objectWithSetter,
	objectWithMatchedGetterAndSetterProperty,
	objectWithMatchedGetterAndSetterPropertyViaValue,
	objectWithMismatchedGetterAndSetterProperty,
	objectWithMismatchedGetterAndSetterPropertyViaValue,
	objectWithNever,
	stringRecordOfNumbers,
	stringRecordOfUnknown,
	stringOrNumberRecordOfStrings,
	stringOrNumberRecordOfObjects,
	partialStringRecordOfNumbers,
	partialStringRecordOfUnknown,
	templatedRecordOfNumbers,
	mixedRecordOfUnknown,
	stringRecordOfNumbersOrStringsWithKnownProperties,
	stringRecordOfUnknownWithOptionalKnownProperties,
	stringOrNumberRecordOfStringWithKnownNumber,
	objectWithPossibleRecursion,
	objectWithOptionalRecursion,
	readonlyObjectWithOptionalRecursion,
	objectWithEmbeddedRecursion,
	readonlyOjectWithEmbeddedRecursion,
	objectWithAlternatingRecursion,
	readonlyObjectWithAlternatingRecursion,
	objectWithSymbolOrRecursion,
	readonlyObjectWithSymbolOrRecursion,
	objectWithFluidHandleOrRecursion,
	stringRecordWithRecursionOrNumber,
	readonlyStringRecordWithRecursionOrNumber,
	selfRecursiveFunctionWithProperties,
	selfRecursiveObjectAndFunction,
	readonlySelfRecursiveFunctionWithProperties,
	readonlySelfRecursiveObjectAndFunction,
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
	mapOfPointToRecord,
	readonlyMapOfPointToRecord,
	setOfNumbers,
	readonlySetOfNumbers,
	setOfRecords,
	readonlySetOfRecords,
	brandedNumber,
	brandedString,
	brandedObject,
	brandedObjectWithString,
	objectWithBrandedNumber,
	objectWithBrandedString,
	fluidHandleToNumber,
	fluidHandleToRecord,
	objectWithFluidHandle,
	readonlyObjectWithFluidHandleOrRecursion,
	erasedType,
} from "./testValues.js";

import type { IFluidHandle } from "@fluidframework/core-interfaces";
import type { DeepReadonly } from "@fluidframework/core-interfaces/internal/exposedUtilityTypes";

/* eslint-disable @typescript-eslint/explicit-function-return-type */

/**
 * Result is defined using `DeepReadonly` type generator.
 *
 * @param v - value whose type is passed through `DeepReadonly`
 * @returns the original value with modified type
 */
function makeReadonly<const T>(v: T) {
	return v as DeepReadonly<T>;
}

function makeReadonlyDeepeningHandleTypes<const T>(v: T) {
	return v as DeepReadonly<T, { DeepenedGenerics: IFluidHandle }>;
}

function makeReadonlyNoGenericsDeepening<const T>(v: T) {
	return v as DeepReadonly<T, { DeepenedGenerics: never }>;
}

function makeReadonlyBailingOnRecursiveTypes<const T>(v: T) {
	return v as DeepReadonly<T, { RecurseLimit: 0 }>;
}

function makeReadonlyWithRecurseLimitThree<const T>(v: T) {
	return v as DeepReadonly<T, { RecurseLimit: "+++" }>;
}

/* eslint-enable @typescript-eslint/explicit-function-return-type */

describe("DeepReadonly", () => {
	describe("primitive types are preserved", () => {
		it("`undefined`", () => {
			const result = makeReadonly(undefined);
			assertIdenticalTypes(result, undefined);
		});
		it("`boolean`", () => {
			const result = makeReadonly(boolean);
			assertIdenticalTypes(result, boolean);
		});
		it("`number`", () => {
			const result = makeReadonly(number);
			assertIdenticalTypes(result, number);
		});
		it("`string`", () => {
			const result = makeReadonly(string);
			assertIdenticalTypes(result, string);
		});
		it("`symbol`", () => {
			const result = makeReadonly(symbol);
			assertIdenticalTypes(result, symbol);
		});
		it("`bigint`", () => {
			const result = makeReadonly(bigint);
			assertIdenticalTypes(result, bigint);
		});
		it("function", () => {
			const result = makeReadonly(aFunction);
			assertIdenticalTypes(result, aFunction);
		});
		it("numeric enum", () => {
			const result = makeReadonly(numericEnumValue);
			assertIdenticalTypes(result, numericEnumValue);
		});
		it("string enum", () => {
			const result = makeReadonly(stringEnumValue);
			assertIdenticalTypes(result, stringEnumValue);
		});
		it("const heterogenous enum", () => {
			const result = makeReadonly(constHeterogenousEnumValue);
			assertIdenticalTypes(result, constHeterogenousEnumValue);
		});
		it("computed enum", () => {
			const result = makeReadonly(computedEnumValue);
			assertIdenticalTypes(result, computedEnumValue);
		});
	});

	describe("unions of primitive types are preserved", () => {
		it("`string | symbol`", () => {
			const result = makeReadonly(stringOrSymbol);
			assertIdenticalTypes(result, stringOrSymbol);
		});
		it("`bigint | string`", () => {
			const result = makeReadonly(bigintOrString);
			assertIdenticalTypes(result, bigintOrString);
		});
		it("`bigint | symbol`", () => {
			const result = makeReadonly(bigintOrSymbol);
			assertIdenticalTypes(result, bigintOrSymbol);
		});
		it("`number | bigint | symbol`", () => {
			const result = makeReadonly(numberOrBigintOrSymbol);
			assertIdenticalTypes(result, numberOrBigintOrSymbol);
		});
	});

	describe("literal types are preserved", () => {
		it("`true`", () => {
			const result = makeReadonly(true as const);
			assertIdenticalTypes(result, true);
		});
		it("`false`", () => {
			const result = makeReadonly(false as const);
			assertIdenticalTypes(result, false);
		});
		it("`0`", () => {
			const result = makeReadonly(0 as const);
			assertIdenticalTypes(result, 0);
		});
		it('"string"', () => {
			const result = makeReadonly("string" as const);
			assertIdenticalTypes(result, "string");
		});
		it("object with literals", () => {
			const result = makeReadonly(objectWithLiterals);
			assertIdenticalTypes(result, objectWithLiterals);
		});
		it("array of literals", () => {
			const result = makeReadonly(arrayOfLiterals);
			assertIdenticalTypes(result, arrayOfLiterals);
		});
		it("tuple of literals", () => {
			const result = makeReadonly(tupleWithLiterals);
			assertIdenticalTypes(result, tupleWithLiterals);
		});
		it("specific numeric enum value", () => {
			const result = makeReadonly(NumericEnum.two as const);
			assertIdenticalTypes(result, NumericEnum.two);
		});
		it("specific string enum value", () => {
			const result = makeReadonly(StringEnum.b as const);
			assertIdenticalTypes(result, StringEnum.b);
		});
		it("specific const heterogenous enum value", () => {
			const result = makeReadonly(ConstHeterogenousEnum.zero as const);
			assertIdenticalTypes(result, ConstHeterogenousEnum.zero);
		});
		it("specific computed enum value", () => {
			const result = makeReadonly(ComputedEnum.computed as const);
			assertIdenticalTypes(result, ComputedEnum.computed);
		});
	});

	describe("arrays become immutable", () => {
		it("array of numbers", () => {
			const result = makeReadonly(arrayOfNumbers);
			assertIdenticalTypes(result, readonlyArrayOfNumbers);
		});
		it("array of numbers with holes", () => {
			const result = makeReadonly(arrayOfNumbersSparse);
			assertIdenticalTypes(result, readonlyArrayOfNumbers);
		});
		it("array of numbers or undefined", () => {
			const result = makeReadonly(arrayOfNumbersOrUndefined);
			assertIdenticalTypes(result, createInstanceOf<readonly (number | undefined)[]>());
		});
		it("array of bigint or basic object", () => {
			const result = makeReadonly(arrayOfBigintOrObjects);
			assertIdenticalTypes(
				result,
				createInstanceOf<readonly (bigint | { readonly property: string })[]>(),
			);
		});
		it("array of supported types (symbols or basic object)", () => {
			const result = makeReadonly(arrayOfSymbolOrObjects);
			assertIdenticalTypes(
				result,
				createInstanceOf<readonly (symbol | { readonly property: string })[]>(),
			);
		});
		it("array of bigint", () => {
			const result = makeReadonly(arrayOfBigints);
			assertIdenticalTypes(result, createInstanceOf<readonly bigint[]>());
		});
		it("array of symbols", () => {
			const result = makeReadonly(arrayOfSymbols);
			assertIdenticalTypes(result, createInstanceOf<readonly symbol[]>());
		});
		it("array of functions", () => {
			const result = makeReadonly(arrayOfFunctions);
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			assertIdenticalTypes(result, createInstanceOf<readonly (() => any)[]>());
		});
		it("array of functions with properties", () => {
			const result = makeReadonly(arrayOfFunctionsWithProperties);
			assertIdenticalTypes(
				result,
				createInstanceOf<readonly ((() => number) & { readonly property: number })[]>(),
			);
		});
		it("array of objects and functions", () => {
			const result = makeReadonly(arrayOfObjectAndFunctions);
			assertIdenticalTypes(
				result,
				createInstanceOf<readonly ({ readonly property: number } & (() => number))[]>(),
			);
		});
		it("array of `bigint | symbol`", () => {
			const result = makeReadonly(arrayOfBigintOrSymbols);
			assertIdenticalTypes(result, createInstanceOf<readonly (bigint | symbol)[]>());
		});
		it("array of `number | bigint | symbol`", () => {
			const result = makeReadonly(arrayOfNumberBigintOrSymbols);
			assertIdenticalTypes(result, createInstanceOf<readonly (number | bigint | symbol)[]>());
		});
	});

	describe("read-only arrays are preserved", () => {
		it("readonly array of primitive is preserved", () => {
			const result = makeReadonly(readonlyArrayOfNumbers);
			assertIdenticalTypes(result, readonlyArrayOfNumbers);
		});
		it("readonly array of mutable object becomes deeply immutable", () => {
			const result = makeReadonly(readonlyArrayOfObjects);
			assertIdenticalTypes(
				result,
				createInstanceOf<readonly { readonly property: string }[]>(),
			);
		});
	});

	describe("object properties become immutable", () => {
		it("empty object", () => {
			const result = makeReadonly(emptyObject);
			assertIdenticalTypes(result, emptyObject);
		});

		it("object with `boolean`", () => {
			const result = makeReadonly(objectWithBoolean);
			assertIdenticalTypes(result, createInstanceOf<{ readonly boolean: boolean }>());
		});
		it("object with `number`", () => {
			const result = makeReadonly(objectWithNumber);
			assertIdenticalTypes(result, createInstanceOf<{ readonly number: number }>());
		});
		it("object with `string`", () => {
			const result = makeReadonly(objectWithString);
			assertIdenticalTypes(result, createInstanceOf<{ readonly string: string }>());
		});
		it("object with `bigint`", () => {
			const result = makeReadonly(objectWithBigint);
			assertIdenticalTypes(result, createInstanceOf<{ readonly bigint: bigint }>());
		});
		it("object with `symbol`", () => {
			const result = makeReadonly(objectWithSymbol);
			assertIdenticalTypes(result, createInstanceOf<{ readonly symbol: symbol }>());
		});
		it("object with function", () => {
			const result = makeReadonly(objectWithFunction);
			assertIdenticalTypes(result, createInstanceOf<{ readonly function: () => void }>());
		});
		it("object with `unknown`", () => {
			const result = makeReadonly(objectWithUnknown);
			assertIdenticalTypes(result, createInstanceOf<{ readonly unknown: unknown }>());
		});
		it("object with required `undefined`", () => {
			const result = makeReadonly(objectWithUndefined);
			assertIdenticalTypes(result, createInstanceOf<{ readonly undef: undefined }>());
		});
		it("object with optional `undefined`", () => {
			const result = makeReadonly(objectWithOptionalUndefined);
			assertIdenticalTypes(result, createInstanceOf<{ readonly optUndef?: undefined }>());
		});
		it("object with optional `bigint`", () => {
			const result = makeReadonly(objectWithOptionalBigint);
			assertIdenticalTypes(result, createInstanceOf<{ readonly bigint?: bigint }>());
		});
		it("object with optional `unknown`", () => {
			const result = makeReadonly(objectWithOptionalUnknown);
			assertIdenticalTypes(result, createInstanceOf<{ readonly optUnknown?: unknown }>());
		});
		it("object with exactly `never`", () => {
			const result = makeReadonly(objectWithNever);
			assertIdenticalTypes(result, createInstanceOf<{ readonly never: never }>());
		});
		it("object with `number | undefined`", () => {
			const result = makeReadonly(objectWithNumberOrUndefinedUndefined);
			assertIdenticalTypes(
				result,
				createInstanceOf<{
					readonly numOrUndef: number | undefined;
				}>(),
			);
		});
		it("object with `string | symbol`", () => {
			const result = makeReadonly(objectWithStringOrSymbol);
			assertIdenticalTypes(
				result,
				createInstanceOf<{ readonly stringOrSymbol: string | symbol }>(),
			);
		});
		it("object with `bigint | string`", () => {
			const result = makeReadonly(objectWithBigintOrString);
			assertIdenticalTypes(
				result,
				createInstanceOf<{ readonly bigintOrString: bigint | string }>(),
			);
		});
		it("object with `bigint | symbol`", () => {
			const result = makeReadonly(objectWithBigintOrSymbol);
			assertIdenticalTypes(
				result,
				createInstanceOf<{ readonly bigintOrSymbol: bigint | symbol }>(),
			);
		});
		it("object with `Function | symbol`", () => {
			const result = makeReadonly(objectWithFunctionOrSymbol);
			assertIdenticalTypes(
				result,
				createInstanceOf<{ readonly functionOrSymbol: (() => void) | symbol }>(),
			);
		});
		it("object with `number | bigint | symbol`", () => {
			const result = makeReadonly(objectWithNumberOrBigintOrSymbol);
			assertIdenticalTypes(
				result,
				createInstanceOf<{ readonly numberOrBigintOrSymbol: number | bigint | symbol }>(),
			);
		});

		it("object with function with properties", () => {
			const result = makeReadonly(objectWithFunctionWithProperties);
			assertIdenticalTypes(
				result,
				createInstanceOf<{
					readonly function: (() => number) & {
						readonly property: number;
					};
				}>(),
			);
		});
		it("object with object and function", () => {
			const result = makeReadonly(objectWithObjectAndFunction);
			assertIdenticalTypes(
				result,
				createInstanceOf<{
					readonly object: (() => number) & {
						readonly property: number;
					};
				}>(),
			);
		});

		it("object with number key", () => {
			const result = makeReadonly(objectWithNumberKey);
			assertIdenticalTypes(result, createInstanceOf<{ readonly 3: string }>());
		});
		it("object with symbol key", () => {
			const result = makeReadonly(objectWithSymbolKey);
			assertIdenticalTypes(result, createInstanceOf<{ readonly [x: symbol]: string }>());
		});
		it("object with unique symbol key", () => {
			const result = makeReadonly(objectWithUniqueSymbolKey);
			assertIdenticalTypes(result, createInstanceOf<{ readonly [uniqueSymbol]: string }>());
		});

		it("object with array of `number`s", () => {
			const result = makeReadonly(objectWithArrayOfNumbers);
			assertIdenticalTypes(
				result,
				createInstanceOf<{ readonly arrayOfNumbers: readonly number[] }>(),
			);
		});
		it("object with array of `number | undefined`", () => {
			const result = makeReadonly(objectWithArrayOfNumbersOrUndefined);
			assertIdenticalTypes(
				result,
				createInstanceOf<{
					readonly arrayOfNumbersOrUndefined: readonly (number | undefined)[];
				}>(),
			);
		});
		it("object with array of `bigint`s", () => {
			const result = makeReadonly(objectWithArrayOfBigints);
			assertIdenticalTypes(
				result,
				createInstanceOf<{ readonly arrayOfBigints: readonly bigint[] }>(),
			);
		});
		it("object with array of `symbol`s", () => {
			const result = makeReadonly(objectWithArrayOfSymbols);
			assertIdenticalTypes(
				result,
				createInstanceOf<{ readonly arrayOfSymbols: readonly symbol[] }>(),
			);
		});
		it("object with array of `unknown`", () => {
			const result = makeReadonly(objectWithArrayOfUnknown);
			assertIdenticalTypes(
				result,
				createInstanceOf<{ readonly arrayOfUnknown: readonly unknown[] }>(),
			);
		});
		it("object with array of functions", () => {
			const result = makeReadonly(objectWithArrayOfFunctions);
			assertIdenticalTypes(
				result,
				createInstanceOf<{ readonly arrayOfFunctions: readonly (typeof aFunction)[] }>(),
			);
		});
		it("object with array of functions with properties", () => {
			const result = makeReadonly(objectWithArrayOfFunctionsWithProperties);
			assertIdenticalTypes(
				result,
				createInstanceOf<{
					readonly arrayOfFunctionsWithProperties: readonly ((() => number) & {
						readonly property: number;
					})[];
				}>(),
			);
		});
		it("object with array of objects and functions", () => {
			const result = makeReadonly(objectWithArrayOfObjectAndFunctions);
			assertIdenticalTypes(
				result,
				createInstanceOf<{
					readonly arrayOfObjectAndFunctions: readonly ((() => number) & {
						readonly property: number;
					})[];
				}>(),
			);
		});
		it("object with array of `bigint`s or objects", () => {
			const result = makeReadonly(objectWithArrayOfBigintOrObjects);
			assertIdenticalTypes(
				result,
				createInstanceOf<{
					readonly arrayOfBigintOrObjects: readonly (
						| bigint
						| {
								readonly property: string;
						  }
					)[];
				}>(),
			);
		});
		it("object with array of `symbol`s or objects", () => {
			const result = makeReadonly(objectWithArrayOfSymbolOrObjects);
			assertIdenticalTypes(
				result,
				createInstanceOf<{
					readonly arrayOfSymbolOrObjects: readonly (
						| symbol
						| {
								readonly property: string;
						  }
					)[];
				}>(),
			);
		});
		it("object with readonly array of `number`", () => {
			const result = makeReadonly(objectWithReadonlyArrayOfNumbers);
			assertIdenticalTypes(
				result,
				createInstanceOf<{ readonly readonlyArrayOfNumbers: readonly number[] }>(),
			);
		});

		it("`string` indexed record of `number`s", () => {
			const result = makeReadonly(stringRecordOfNumbers);
			assertIdenticalTypes(
				result,
				createInstanceOf<{
					readonly [x: string]: number;
				}>(),
			);
		});
		it("`string` indexed record of `unknown`s", () => {
			const result = makeReadonly(stringRecordOfUnknown);
			assertIdenticalTypes(
				result,
				createInstanceOf<{
					readonly [x: string]: unknown;
				}>(),
			);
		});
		it("`string`|`number` indexed record of `string`s", () => {
			const result = makeReadonly(stringOrNumberRecordOfStrings);
			assertIdenticalTypes(
				result,
				createInstanceOf<Readonly<Record<string | number, string>>>(),
			);
		});
		it("`string`|`number` indexed record of objects", () => {
			const result = makeReadonly(stringOrNumberRecordOfObjects);
			assertIdenticalTypes(
				result,
				createInstanceOf<Readonly<Record<string | number, { readonly string: string }>>>(),
			);
		});
		it("`string` indexed record of `number`|`string`s with known properties", () => {
			const result = makeReadonly(stringRecordOfNumbersOrStringsWithKnownProperties);
			assertIdenticalTypes(
				result,
				createInstanceOf<Readonly<typeof stringRecordOfNumbersOrStringsWithKnownProperties>>(),
			);
		});
		it("`string` indexed record of `unknown` and optional known properties", () => {
			const result = makeReadonly(stringRecordOfUnknownWithOptionalKnownProperties);
			assertIdenticalTypes(
				result,
				createInstanceOf<Readonly<typeof stringRecordOfUnknownWithOptionalKnownProperties>>(),
			);
		});
		it("`string`|`number` indexed record of `strings` with known `number` property (unassignable)", () => {
			const result = makeReadonly(stringOrNumberRecordOfStringWithKnownNumber);
			assertIdenticalTypes(
				result,
				createInstanceOf<Readonly<typeof stringOrNumberRecordOfStringWithKnownNumber>>(),
			);
		});
		it("`Partial<>` `string` indexed record of `numbers`", () => {
			// Warning: as of TypeScript 5.8.2, a Partial<> of an indexed type
			// gains `| undefined` even under exactOptionalPropertyTypes=true.
			// Preferred result is that there is no change applying Partial<>.
			// In either case, this test can hold since there isn't a downside
			// to allowing `undefined` in the result if that is how type is
			// given since indexed properties are always inherently optional.
			const result = makeReadonly(partialStringRecordOfNumbers);
			assertIdenticalTypes(
				result,
				createInstanceOf<Readonly<typeof partialStringRecordOfNumbers>>(),
			);
		});
		it("`Partial<>` `string` indexed record of `numbers`", () => {
			const result = makeReadonly(partialStringRecordOfUnknown);
			assertIdenticalTypes(
				result,
				createInstanceOf<Readonly<typeof partialStringRecordOfUnknown>>(),
			);
		});
		it("templated record of `numbers`", () => {
			const result = makeReadonly(templatedRecordOfNumbers);
			assertIdenticalTypes(
				result,
				createInstanceOf<Readonly<typeof templatedRecordOfNumbers>>(),
			);
		});
		it("templated record of `numbers`", () => {
			const result = makeReadonly(mixedRecordOfUnknown);
			assertIdenticalTypes(result, createInstanceOf<Readonly<typeof mixedRecordOfUnknown>>());
		});

		it("object with recursion and `symbol`", () => {
			const result = makeReadonly(objectWithSymbolOrRecursion);
			assertIdenticalTypes(result, readonlyObjectWithSymbolOrRecursion);
		});

		it("object with recursion and handle", () => {
			const result = makeReadonly(objectWithFluidHandleOrRecursion);
			assertIdenticalTypes(result, readonlyObjectWithFluidHandleOrRecursion);
		});

		it("object with function object with recursion", () => {
			const objectWithSelfRecursiveFunctionWithProperties = {
				outerFnOjb: selfRecursiveFunctionWithProperties,
			};
			const result = makeReadonly(objectWithSelfRecursiveFunctionWithProperties);
			const expected = {
				outerFnOjb: readonlySelfRecursiveFunctionWithProperties,
			} as const;
			assertIdenticalTypes(result, expected);
		});
		it("object with object and function with recursion", () => {
			const objectWithSelfRecursiveObjectAndFunction = {
				outerFnOjb: selfRecursiveObjectAndFunction,
			};
			const result = makeReadonly(objectWithSelfRecursiveObjectAndFunction);
			const expected = {
				outerFnOjb: readonlySelfRecursiveObjectAndFunction,
			} as const;
			assertIdenticalTypes(result, expected);
		});

		it("object with possible type recursion through union", () => {
			const result = makeReadonly(objectWithPossibleRecursion);
			interface ReadonlyObjectWithPossibleRecursion {
				readonly [x: string]: ReadonlyObjectWithPossibleRecursion | string;
			}
			assertIdenticalTypes(result, createInstanceOf<ReadonlyObjectWithPossibleRecursion>());
		});
		it("object with optional type recursion", () => {
			const result = makeReadonly(objectWithOptionalRecursion);
			assertIdenticalTypes(result, readonlyObjectWithOptionalRecursion);
		});
		it("object with deep type recursion", () => {
			const result = makeReadonly(objectWithEmbeddedRecursion);
			assertIdenticalTypes(result, readonlyOjectWithEmbeddedRecursion);
		});
		it("object with alternating type recursion", () => {
			const result = makeReadonly(objectWithAlternatingRecursion);
			assertIdenticalTypes(result, readonlyObjectWithAlternatingRecursion);
		});

		it("object with inherited recursion and extended with mutable properties", () => {
			const result = makeReadonly({
				outer: objectInheritingOptionalRecursionAndWithNestedSymbol,
			});
			assertIdenticalTypes(
				result,
				createInstanceOf<{
					readonly outer: {
						readonly recursive?: ReadonlyObjectWithOptionalRecursion;
						readonly complex: { readonly number: number; readonly symbol: symbol };
					};
				}>(),
			);
		});

		it("`string` indexed record of recursion or `number`", () => {
			const result = makeReadonly(stringRecordWithRecursionOrNumber);
			assertIdenticalTypes(result, readonlyStringRecordWithRecursionOrNumber);
		});

		it("simple json (`JsonTypeWith<never>`)", () => {
			const result = makeReadonly(simpleJson);
			assertIdenticalTypes(result, simpleImmutableJson);
		});

		it("simple non-null object json (`NonNullJsonObjectWith<never>`)", () => {
			const result = makeReadonly(jsonObject);
			assertIdenticalTypes(result, immutableJsonObject);
		});

		it("non-const enum", () => {
			// Note: typescript doesn't do a great job checking that a generated type satisfies an enum
			// type. The numeric indices are not checked. So far, most robust inspection is manual
			// after any change.
			const resultNumericRead = makeReadonly(NumericEnum);
			assertIdenticalTypes(resultNumericRead, NumericEnum);
			const resultStringRead = makeReadonly(StringEnum);
			assertIdenticalTypes(resultStringRead, StringEnum);
			const resultComputedRead = makeReadonly(ComputedEnum);
			assertIdenticalTypes(resultComputedRead, ComputedEnum);
		});

		it("object with matched getter and setter", () => {
			const result = makeReadonly(objectWithMatchedGetterAndSetterProperty);
			assertIdenticalTypes(
				result,
				createInstanceOf<{
					get property(): number;
				}>(),
			);
		});

		it("object with matched getter and setter implemented via value", () => {
			const result = makeReadonly(objectWithMatchedGetterAndSetterPropertyViaValue);
			assertIdenticalTypes(
				result,
				createInstanceOf<{
					get property(): number;
				}>(),
			);
		});
		it("object with mismatched getter and setter implemented via value", () => {
			const result = makeReadonly(objectWithMismatchedGetterAndSetterPropertyViaValue);
			assertIdenticalTypes(
				result,
				createInstanceOf<{
					get property(): number;
				}>(),
			);
			// @ts-expect-error Cannot assign to 'property' because it is a read-only property
			result.property = -1;
		});
		it("object with mismatched getter and setter", () => {
			const result = makeReadonly(objectWithMismatchedGetterAndSetterProperty);
			assertIdenticalTypes(
				result,
				createInstanceOf<{
					get property(): number;
				}>(),
			);

			assert.throws(() => {
				// @ts-expect-error Cannot assign to 'property' because it is a read-only property
				result.property = -1;
			}, new Error(
				"ClassImplementsObjectWithMismatchedGetterAndSetterProperty writing 'property' as -1",
			));
		});

		describe("class instance", () => {
			it("with public data", () => {
				const result = makeReadonly(classInstanceWithPublicData);
				assertIdenticalTypes(result, createInstanceOf<Readonly<ClassWithPublicData>>());
			});
			it("with public method", () => {
				const result = makeReadonly(classInstanceWithPublicMethod);
				assertIdenticalTypes(
					result,
					createInstanceOf<Readonly<typeof classInstanceWithPublicMethod>>(),
				);
				result satisfies typeof classInstanceWithPublicMethod;
			});
			it("with public data and is function", () => {
				const result = makeReadonly(classInstanceWithPublicDataAndIsFunction);
				assertIdenticalTypes(
					result,
					createInstanceOf<(() => 26) & { readonly public: string }>(),
				);
			});
		});

		it("object with optional property (remains optional)", () => {
			const result = makeReadonly(objectWithOptionalNumberNotPresent);
			assertIdenticalTypes(result, createInstanceOf<{ readonly optNumber?: number }>());
		});
	});

	describe("function & object intersections result in immutable object portion", () => {
		it("function with properties", () => {
			const result = makeReadonly(functionWithProperties);
			assertIdenticalTypes(
				result,
				createInstanceOf<
					(() => number) & {
						readonly property: number;
					}
				>(),
			);
		});
		it("object and function", () => {
			const result = makeReadonly(objectAndFunction);
			assertIdenticalTypes(
				result,
				createInstanceOf<
					{
						readonly property: number;
					} & (() => number)
				>(),
			);
		});
		it("function with class instance with private data", () => {
			const result = makeReadonly(functionObjectWithPrivateData);
			assertIdenticalTypes(
				result,
				createInstanceOf<
					(() => 23) & {
						readonly public: string;
					}
				>(),
			);
		});
		it("function with class instance with public data", () => {
			const result = makeReadonly(functionObjectWithPublicData);
			assertIdenticalTypes(
				result,
				createInstanceOf<
					(() => 24) & {
						readonly public: string;
					}
				>(),
			);
		});
		it("function object with recursion", () => {
			const result = makeReadonly(selfRecursiveFunctionWithProperties);
			assertIdenticalTypes(result, readonlySelfRecursiveFunctionWithProperties);
		});
		it("object and function with recursion", () => {
			const result = makeReadonly(selfRecursiveObjectAndFunction);
			assertIdenticalTypes(result, readonlySelfRecursiveObjectAndFunction);
		});
	});

	describe("read-only objects are preserved", () => {
		it("object with `readonly`", () => {
			const result = makeReadonly(objectWithReadonly);
			assertIdenticalTypes(result, objectWithReadonly);
		});

		it("object with getter implemented via value", () => {
			const result = makeReadonly(objectWithGetterViaValue);
			assertIdenticalTypes(result, objectWithGetterViaValue);
		});
		it("object with `readonly` implemented via getter", () => {
			const result = makeReadonly(objectWithReadonlyViaGetter);
			assertIdenticalTypes(result, objectWithReadonlyViaGetter);
		});

		it("object with getter", () => {
			const result = makeReadonly(objectWithGetter);
			assertIdenticalTypes(result, objectWithGetter);

			assert.throws(() => {
				// @ts-expect-error Cannot assign to 'getter' because it is a read-only property.
				objectWithGetter.getter = -1;
			}, new TypeError(
				"Cannot set property getter of #<ClassImplementsObjectWithGetter> which has only a getter",
			));
			assert.throws(() => {
				// @ts-expect-error Cannot assign to 'getter' because it is a read-only property.
				result.getter = -1;
			}, new TypeError(
				"Cannot set property getter of #<ClassImplementsObjectWithGetter> which has only a getter",
			));
		});

		it("simple read-only json (`ReadonlyJsonTypeWith<never>`)", () => {
			const result = makeReadonly(simpleImmutableJson);
			assertIdenticalTypes(result, simpleImmutableJson);
		});

		it("simple read-only non-null object json (`NonNullJsonObjectWith<never>`)", () => {
			const result = makeReadonly(immutableJsonObject);
			assertIdenticalTypes(result, immutableJsonObject);
		});
	});

	describe("built-in or common class instances", () => {
		it("ErasedType is preserved", () => {
			const result = makeReadonly(erasedType);
			assertIdenticalTypes(result, erasedType);
		});

		describe("`IFluidHandle<T>` becomes `Readonly<IFluidHandle<T>>`", () => {
			it("`IFluidHandle<number>`", () => {
				const result = makeReadonly(fluidHandleToNumber);
				assertIdenticalTypes(result, createInstanceOf<Readonly<typeof fluidHandleToNumber>>());
			});
			it("`IFluidHandle<{...}>` generic remains intact by default", () => {
				const result = makeReadonly(fluidHandleToRecord);
				assertIdenticalTypes(result, createInstanceOf<Readonly<typeof fluidHandleToRecord>>());
			});
			it("`IFluidHandle<{...}>` generic becomes deeply immutable when enabled", () => {
				const result = makeReadonlyDeepeningHandleTypes(fluidHandleToRecord);
				assertIdenticalTypes(
					result,
					createInstanceOf<
						Readonly<
							IFluidHandle<{
								readonly [p: string]: { readonly x: number; readonly y: number };
							}>
						>
					>(),
				);
			});
			it("object with `IFluidHandle<number>`", () => {
				const result = makeReadonly(objectWithFluidHandle);
				assertIdenticalTypes(
					result,
					createInstanceOf<{
						readonly handle: Readonly<IFluidHandle<number>>;
					}>(),
				);
			});
			it("object with `IFluidHandle<string>` or recursion", () => {
				const result = makeReadonly(objectWithFluidHandleOrRecursion);
				assertIdenticalTypes(result, readonlyObjectWithFluidHandleOrRecursion);
			});
			it("read-only object with `FluidHandle<string>` or recursion", () => {
				const result = makeReadonly(readonlyObjectWithFluidHandleOrRecursion);
				assertIdenticalTypes(result, readonlyObjectWithFluidHandleOrRecursion);
			});
		});

		describe("Branded primitive is preserved", () => {
			it("`number & BrandedType<T>`", () => {
				const result = makeReadonly(brandedNumber);
				assertIdenticalTypes(result, brandedNumber);
			});
			it("`string & BrandedType<T>`", () => {
				const result = makeReadonly(brandedString);
				assertIdenticalTypes(result, brandedString);
			});
			it("object with `number & BrandedType<T>`", () => {
				const result = makeReadonly(objectWithBrandedNumber);
				assertIdenticalTypes(
					result,
					createInstanceOf<Readonly<typeof objectWithBrandedNumber>>(),
				);
			});
			it("object with `string & BrandedType<T>`", () => {
				const result = makeReadonly(objectWithBrandedString);
				assertIdenticalTypes(
					result,
					createInstanceOf<Readonly<typeof objectWithBrandedString>>(),
				);
			});
		});

		describe("that are mutable become immutable version", () => {
			describe("Map becomes ReadonlyMap", () => {
				it("Map<string,number>", () => {
					const result = makeReadonly(mapOfStringsToNumbers);
					assertIdenticalTypes(result, readonlyMapOfStringsToNumbers);

					mapOfStringsToNumbers satisfies typeof result;
					// @ts-expect-error methods are missing, but required
					result satisfies typeof mapOfStringsToNumbers;
				});
				it("Map<object, object> generics become deeply immutable by default", () => {
					const result = makeReadonly(mapOfPointToRecord);
					assertIdenticalTypes(
						result,
						createInstanceOf<
							ReadonlyMap<
								Readonly<Point>,
								{
									readonly [p: string]: Readonly<Point>;
								}
							>
						>(),
					);

					mapOfPointToRecord satisfies typeof result;
					// @ts-expect-error methods are missing, but required
					result satisfies typeof mapOfPointToRecord;
				});
				it("Map<object, object> generics are intact when built-in deepening is disabled", () => {
					const result = makeReadonlyNoGenericsDeepening(mapOfPointToRecord);
					assertIdenticalTypes(result, readonlyMapOfPointToRecord);
				});
			});
			describe("Set becomes ReadonlySet", () => {
				it("Set<number>", () => {
					const result = makeReadonly(setOfNumbers);
					assertIdenticalTypes(result, readonlySetOfNumbers);

					setOfNumbers satisfies typeof result;
					// @ts-expect-error methods are missing, but required
					result satisfies typeof setOfNumbers;
				});
				it("Set<object> generics become deeply immutable by default", () => {
					const result = makeReadonly(setOfRecords);
					assertIdenticalTypes(
						result,
						createInstanceOf<
							ReadonlySet<{
								readonly [p: string]: Readonly<Point>;
							}>
						>(),
					);

					setOfRecords satisfies typeof result;
					// @ts-expect-error methods are missing, but required
					result satisfies typeof setOfRecords;
				});
				it("Set<object> generics are intact when built-in deepening is disabled", () => {
					const result = makeReadonlyNoGenericsDeepening(setOfRecords);
					assertIdenticalTypes(result, readonlySetOfRecords);
				});
			});
		});
		describe("that are immutable make generics immutable by default", () => {
			it("ReadonlyMap<string,number>", () => {
				const result = makeReadonly(readonlyMapOfStringsToNumbers);
				assertIdenticalTypes(result, readonlyMapOfStringsToNumbers);
				result satisfies typeof readonlyMapOfStringsToNumbers;
			});
			it("ReadonlyMap<object, object>", () => {
				const result = makeReadonly(readonlyMapOfPointToRecord);
				assertIdenticalTypes(
					result,
					createInstanceOf<
						ReadonlyMap<
							Readonly<Point>,
							{
								readonly [p: string]: Readonly<Point>;
							}
						>
					>(),
				);
				result satisfies typeof readonlyMapOfPointToRecord;
			});
			it("ReadonlySet<number>", () => {
				const result = makeReadonly(readonlySetOfNumbers);
				assertIdenticalTypes(result, readonlySetOfNumbers);
				result satisfies typeof readonlySetOfNumbers;
			});
			it("ReadonlySet<object>", () => {
				const result = makeReadonly(readonlySetOfRecords);
				assertIdenticalTypes(
					result,
					createInstanceOf<
						ReadonlySet<{
							readonly [p: string]: Readonly<Point>;
						}>
					>(),
				);
				result satisfies typeof readonlySetOfRecords;
			});
		});
		describe("that are immutable keep generics intact when deepening disabled", () => {
			it("ReadonlyMap<object, object>", () => {
				const result = makeReadonlyNoGenericsDeepening(readonlyMapOfPointToRecord);
				assertIdenticalTypes(result, readonlyMapOfPointToRecord);
				result satisfies typeof readonlyMapOfPointToRecord;
			});
			it("ReadonlySet<object>", () => {
				const result = makeReadonlyNoGenericsDeepening(readonlySetOfRecords);
				assertIdenticalTypes(result, readonlySetOfRecords);
				result satisfies typeof readonlySetOfRecords;
			});
		});
	});

	describe("partially supported object types are modified", () => {
		describe("class instance non-public properties are removed", () => {
			it("with private method", () => {
				const result = makeReadonly(classInstanceWithPrivateMethod);
				assertIdenticalTypes(
					result,
					createInstanceOf<{
						readonly public: string;
					}>(),
				);
				// @ts-expect-error getSecret is missing, but required
				result satisfies typeof classInstanceWithPrivateMethod;
				// @ts-expect-error getSecret is missing, but required
				assertIdenticalTypes(result, classInstanceWithPrivateMethod);
			});
			it("with private getter", () => {
				const result = makeReadonly(classInstanceWithPrivateGetter);
				assertIdenticalTypes(
					result,
					createInstanceOf<{
						readonly public: string;
					}>(),
				);
				// @ts-expect-error secret is missing, but required
				result satisfies typeof classInstanceWithPrivateGetter;
				// @ts-expect-error secret is missing, but required
				assertIdenticalTypes(result, classInstanceWithPrivateGetter);
			});
			it("with private setter", () => {
				const result = makeReadonly(classInstanceWithPrivateSetter);
				assertIdenticalTypes(
					result,
					createInstanceOf<{
						readonly public: string;
					}>(),
				);
				// @ts-expect-error secret is missing, but required
				result satisfies typeof classInstanceWithPrivateSetter;
				// @ts-expect-error secret is missing, but required
				assertIdenticalTypes(result, classInstanceWithPrivateSetter);
			});
			it("with private data", () => {
				const result = makeReadonly(classInstanceWithPrivateData);
				assertIdenticalTypes(
					result,
					createInstanceOf<{
						readonly public: string;
					}>(),
				);
				// @ts-expect-error secret is missing, but required
				result satisfies typeof classInstanceWithPrivateData;
				// @ts-expect-error secret is missing, but required
				assertIdenticalTypes(result, classInstanceWithPrivateData);
			});
			it("with private data and is function", () => {
				const result = makeReadonly(classInstanceWithPrivateDataAndIsFunction);
				assertIdenticalTypes(
					result,
					createInstanceOf<{ readonly public: string } & (() => 25)>(),
				);
			});
		});

		// A class branded object cannot be detected without knowing the branding type.
		// And will class privates removed just the original type is made immutable.
		describe("branded non-primitive types lose branding", () => {
			// class branding with `object` is just the class branding and produces
			// an empty object, {}, which happens to be a special any object type.
			it("`object & BrandedType<T>`", () => {
				const result = makeReadonly(brandedObject);
				assertIdenticalTypes(result, {});
			});
			it("`object & BrandedType<T>`", () => {
				const result = makeReadonly(brandedObjectWithString);
				assertIdenticalTypes(result, createInstanceOf<{ readonly string: string }>());
			});
		});
	});

	describe("types that cannot be made immutable are unchanged", () => {
		it("`any`", () => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const any: any = undefined;
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
			const result = makeReadonly(any);
			assertIdenticalTypes(result, any);
		});
		it("`unknown`", () => {
			const result = makeReadonly(unknownValueOfSimpleRecord);
			assertIdenticalTypes(result, unknownValueOfSimpleRecord);
		});
		it("`object` (plain object)", () => {
			const result = makeReadonly(object);
			assertIdenticalTypes(result, object);
		});
		it("`null`", () => {
			/* eslint-disable unicorn/no-null */
			const result = makeReadonly(null);
			assertIdenticalTypes(result, null);
			/* eslint-enable unicorn/no-null */
		});
		it("`void`", () => {
			const result = makeReadonly(voidValue);
			assertIdenticalTypes(result, voidValue);
		});
		it("`never`", () => {
			const result = makeReadonly(never);
			assertIdenticalTypes(result, never);
		});
	});

	describe("using `RecurseLimit` limits processing of recursive types", () => {
		it("no recursion: object with optional type recursion is readonly once", () => {
			const result = makeReadonlyBailingOnRecursiveTypes(objectWithOptionalRecursion);
			assertIdenticalTypes(
				result,
				createInstanceOf<{
					readonly recursive?: typeof objectWithOptionalRecursion;
				}>(),
			);
		});
		it("3 recursions: object with optional type recursion is readonly thru 4 levels", () => {
			const result = makeReadonlyWithRecurseLimitThree(objectWithOptionalRecursion);
			assertIdenticalTypes(
				result,
				createInstanceOf<{
					readonly recursive?: {
						readonly recursive?: {
							readonly recursive?: {
								readonly recursive?: typeof objectWithOptionalRecursion;
							};
						};
					};
				}>(),
			);
		});
	});

	describe("unsupported types", () => {
		// These cases are demonstrating defects within the current implementation.
		// They show "allowed" incorrect use and the unexpected results.
		describe("known defect expectations", () => {
			it("object with setter becomes read-only property", () => {
				const result = makeReadonly(objectWithSetter);
				// @ts-expect-error `setter` is no longer mutable
				assertIdenticalTypes(result, objectWithSetter);
				assertIdenticalTypes(result, createInstanceOf<{ readonly setter: string }>());

				// Read from setter only produces `undefined` but is typed as `string`.
				const originalSetterValue = objectWithSetter.setter;
				assert.equal(originalSetterValue, undefined);
				// Read from modified type is the same (as it is the same object).
				const resultSetterValue = result.setter;
				assert.equal(resultSetterValue, undefined);

				assert.throws(() => {
					objectWithSetter.setter = "test string 1";
				}, new Error("ClassImplementsObjectWithSetter writing 'setter' as test string 1"));
				assert.throws(() => {
					// @ts-expect-error Cannot assign to 'setter' because it is a read-only property.
					result.setter = "test string 2";
				}, new Error("ClassImplementsObjectWithSetter writing 'setter' as test string 2"));
			});
		});

		it("unique symbol becomes `symbol`", () => {
			const result = makeReadonly(uniqueSymbol);
			// @ts-expect-error `uniqueSymbol` is no longer a specific (unique) symbol
			assertIdenticalTypes(result, uniqueSymbol);
			// mysteriously becomes `symbol` (can't be preserved)
			assertIdenticalTypes(result, symbol);
		});
	});
});
