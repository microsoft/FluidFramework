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
	ObjectWithSymbolOrRecursion,
	SimpleObjectWithOptionalRecursion,
	ObjectWithFluidHandleOrRecursion,
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
	arrayOfFunctions,
	arrayOfFunctionsWithProperties,
	arrayOfObjectAndFunctions,
	arrayOfBigintAndObjects,
	arrayOfSymbolsAndObjects,
	readonlyArrayOfNumbers,
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
	objectWithOptionalSymbol,
	objectWithOptionalBigint,
	objectWithNumberKey,
	objectWithSymbolKey,
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
	objectWithPossibleRecursion,
	objectWithRecursion,
	objectWithEmbeddedRecursion,
	objectWithAlternatingRecursion,
	objectWithSelfReference,
	objectWithSymbolOrRecursion,
	selfRecursiveFunctionWithProperties,
	selfRecursiveObjectAndFunction,
	objectInheritingOptionalRecursionAndWithNestedSymbol,
	simpleJson,
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
	fluidHandleToNumber,
	objectWithFluidHandle,
	objectWithFluidHandleOrRecursion,
} from "./testValues.js";

import type { IFluidHandle } from "@fluidframework/core-interfaces";
import type {
	JsonDeserialized,
	JsonSerializable,
	JsonSerializableOptions,
	JsonTypeWith,
	NonNullJsonObjectWith,
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
 * @returns the round-tripped value cast to the filter result type
 */
export function passThru<
	T,
	TExpected,
	// eslint-disable-next-line @typescript-eslint/ban-types
	Options extends JsonSerializableOptions = {},
>(
	filteredIn: JsonSerializable<T, Options>,
	expectedDeserialization?: JsonDeserialized<TExpected>,
): {
	filteredIn: JsonSerializable<T, Options>;
	out: JsonDeserialized<T>;
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
	return { filteredIn, out: result as JsonDeserialized<T> };
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
function passThruThrows<T>(
	filteredIn: JsonSerializable<T>,
	expectedThrow: Error,
): { filteredIn: JsonSerializable<T> } {
	assert.throws(() => passThru(filteredIn), expectedThrow);
	return { filteredIn };
}

/**
 * Similar to {@link passThru} but ignores hidden (private/protected) members.
 */
function passThruIgnoreInaccessibleMembers<T, TExpected>(
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
function passThruHandlingBigint<T, TExpected>(
	filteredIn: JsonSerializable<T, { AllowExactly: bigint }>,
	expectedDeserialization?: JsonDeserialized<TExpected, { AllowExactly: bigint }>,
): {
	filteredIn: JsonSerializable<T, { AllowExactly: bigint }>;
	out: JsonDeserialized<T, { AllowExactly: bigint }>;
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
		{ AllowExactly: bigint }
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
function passThruHandlingBigintThrows<T>(
	filteredIn: JsonSerializable<T, { AllowExactly: bigint }>,
	expectedThrow: Error,
): { filteredIn: JsonSerializable<T, { AllowExactly: bigint }> } {
	assert.throws(() => passThruHandlingBigint(filteredIn), expectedThrow);
	return { filteredIn };
}

/**
 * Similar to {@link passThru} but specifically handles certain function signatures.
 */
function passThruHandlingSpecificFunction<T>(
	filteredIn: JsonSerializable<T, { AllowExactly: (_: string) => number }>,
): {
	filteredIn: JsonSerializable<T, { AllowExactly: (_: string) => number }>;
	out: JsonDeserialized<T, { AllowExactly: (_: string) => number }>;
} {
	return {
		filteredIn,
		out: undefined as unknown as JsonDeserialized<T, { AllowExactly: (_: string) => number }>,
	};
}

/**
 * Similar to {@link passThru} but specifically handles any Fluid handle.
 */
function passThruHandlingFluidHandle<T>(
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

describe("JsonSerializable", () => {
	describe("positive compilation tests", () => {
		describe("supported primitive types", () => {
			it("`boolean`", () => {
				const { filteredIn } = passThru(boolean);
				assertIdenticalTypes(filteredIn, boolean);
			});
			it("`number`", () => {
				const { filteredIn } = passThru(number);
				assertIdenticalTypes(filteredIn, number);
			});
			it("`string`", () => {
				const { filteredIn } = passThru(string);
				assertIdenticalTypes(filteredIn, string);
			});
			it("numeric enum", () => {
				const { filteredIn } = passThru(numericEnumValue);
				assertIdenticalTypes(filteredIn, numericEnumValue);
			});
			it("string enum", () => {
				const { filteredIn } = passThru(stringEnumValue);
				assertIdenticalTypes(filteredIn, stringEnumValue);
			});
			it("const heterogenous enum", () => {
				const { filteredIn } = passThru(constHeterogenousEnumValue);
				assertIdenticalTypes(filteredIn, constHeterogenousEnumValue);
			});
			it("computed enum", () => {
				const { filteredIn } = passThru(computedEnumValue);
				assertIdenticalTypes(filteredIn, computedEnumValue);
			});
		});

		describe("supported literal types", () => {
			it("`true`", () => {
				const { filteredIn } = passThru(true);
				assertIdenticalTypes(filteredIn, true);
			});
			it("`false`", () => {
				const { filteredIn } = passThru(false);
				assertIdenticalTypes(filteredIn, false);
			});
			it("`0`", () => {
				const { filteredIn } = passThru(0);
				assertIdenticalTypes(filteredIn, 0);
			});
			it('"string"', () => {
				const { filteredIn } = passThru("string");
				assertIdenticalTypes(filteredIn, "string");
			});
			it("`null`", () => {
				const { filteredIn } = passThru(null);
				assertIdenticalTypes(filteredIn, null);
			});
			it("object with literals", () => {
				const { filteredIn } = passThru(objectWithLiterals);
				assertIdenticalTypes(filteredIn, objectWithLiterals);
				// In the meantime, until https://github.com/microsoft/TypeScript/pull/58296,
				// we can check assignability.
				filteredIn satisfies typeof objectWithLiterals;
				assert.ok(
					objectWithLiterals instanceof Object,
					"objectWithLiterals is at least a plain Object",
				);
				assert.ok(
					filteredIn instanceof objectWithLiterals.constructor,
					"objectRead is same type as objectWithLiterals (plain Object)",
				);
			});
			it("array of literals", () => {
				const { filteredIn } = passThru(arrayOfLiterals);
				assertIdenticalTypes(filteredIn, arrayOfLiterals);
			});
			it("tuple of literals", () => {
				const { filteredIn } = passThru(tupleWithLiterals);
				assertIdenticalTypes(filteredIn, tupleWithLiterals);
			});
			it("specific numeric enum value", () => {
				const { filteredIn } = passThru(NumericEnum.two);
				assertIdenticalTypes(filteredIn, NumericEnum.two);
			});
			it("specific string enum value", () => {
				const { filteredIn } = passThru(StringEnum.b);
				assertIdenticalTypes(filteredIn, StringEnum.b);
			});
			it("specific const heterogenous enum value", () => {
				const { filteredIn } = passThru(ConstHeterogenousEnum.zero);
				assertIdenticalTypes(filteredIn, ConstHeterogenousEnum.zero);
			});
			it("specific computed enum value", () => {
				const { filteredIn } = passThru(ComputedEnum.computed);
				assertIdenticalTypes(filteredIn, ComputedEnum.computed);
			});
		});

		describe("supported array types", () => {
			it("array of `number`s", () => {
				const { filteredIn } = passThru(arrayOfNumbers);
				assertIdenticalTypes(filteredIn, arrayOfNumbers);
			});
			it("readonly array of `number`s", () => {
				const { filteredIn } = passThru(readonlyArrayOfNumbers);
				assertIdenticalTypes(filteredIn, readonlyArrayOfNumbers);
			});
		});

		describe("supported object types", () => {
			it("empty object", () => {
				const { filteredIn } = passThru(emptyObject);
				assertIdenticalTypes(filteredIn, emptyObject);
			});

			it("object with `never`", () => {
				const { filteredIn } = passThru(objectWithNever);
				assertIdenticalTypes(filteredIn, objectWithNever);
			});

			it("object with `boolean`", () => {
				const { filteredIn } = passThru(objectWithBoolean);
				assertIdenticalTypes(filteredIn, objectWithBoolean);
			});
			it("object with `number`", () => {
				const { filteredIn } = passThru(objectWithNumber);
				assertIdenticalTypes(filteredIn, objectWithNumber);
			});
			it("object with `string`", () => {
				const { filteredIn } = passThru(objectWithString);
				assertIdenticalTypes(filteredIn, objectWithString);
			});

			it("object with number key", () => {
				const { filteredIn } = passThru(objectWithNumberKey);
				assertIdenticalTypes(filteredIn, objectWithNumberKey);
			});

			it("object with possible type recursion through union", () => {
				const { filteredIn } = passThru(objectWithPossibleRecursion);
				assertIdenticalTypes(filteredIn, objectWithPossibleRecursion);
			});
			it("object with optional type recursion", () => {
				const { filteredIn } = passThru(objectWithRecursion);
				assertIdenticalTypes(filteredIn, objectWithRecursion);
			});
			it("object with deep type recursion", () => {
				const { filteredIn } = passThru(objectWithEmbeddedRecursion);
				assertIdenticalTypes(filteredIn, objectWithEmbeddedRecursion);
			});
			it("object with alternating type recursion", () => {
				const { filteredIn } = passThru(objectWithAlternatingRecursion);
				assertIdenticalTypes(filteredIn, objectWithAlternatingRecursion);
			});

			it("simple json (JsonTypeWith<never>)", () => {
				const { filteredIn } = passThru(simpleJson);
				assertIdenticalTypes(filteredIn, simpleJson);
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
				const { filteredIn } = passThru(objectWithReadonly);
				assertIdenticalTypes(filteredIn, objectWithReadonly);
				// In the meantime, until https://github.com/microsoft/TypeScript/pull/58296,
				// we can check assignability.
				filteredIn satisfies typeof objectWithReadonly;
			});

			it("object with getter implemented via value", () => {
				const { filteredIn } = passThru(objectWithGetterViaValue);
				assertIdenticalTypes(filteredIn, objectWithGetterViaValue);
				// In the meantime, until https://github.com/microsoft/TypeScript/pull/58296,
				// we can check assignability.
				filteredIn satisfies typeof objectWithGetterViaValue;
			});
			it("object with setter implemented via value", () => {
				const { filteredIn } = passThru(objectWithSetterViaValue);
				assertIdenticalTypes(filteredIn, objectWithSetterViaValue);
			});
			it("object with matched getter and setter implemented via value", () => {
				const { filteredIn } = passThru(objectWithMatchedGetterAndSetterPropertyViaValue);
				assertIdenticalTypes(filteredIn, objectWithMatchedGetterAndSetterPropertyViaValue);
			});
			it("object with mismatched getter and setter implemented via value", () => {
				const { filteredIn } = passThru(objectWithMismatchedGetterAndSetterPropertyViaValue);
				assertIdenticalTypes(filteredIn, objectWithMismatchedGetterAndSetterPropertyViaValue);
			});

			describe("class instance", () => {
				it("with public data (just cares about data)", () => {
					const { filteredIn } = passThru(classInstanceWithPublicData, {
						public: "public",
					});
					assertIdenticalTypes(filteredIn, classInstanceWithPublicData);
				});
				describe("with `ignore-inaccessible-members`", () => {
					it("with private method ignores method", () => {
						const { filteredIn } = passThruIgnoreInaccessibleMembers(
							classInstanceWithPrivateMethod,
							{
								public: "public",
							},
						);
						assertIdenticalTypes(filteredIn, {
							public: "public",
						});
						// @ts-expect-error getSecret is missing, but required
						filteredIn satisfies typeof classInstanceWithPrivateMethod;
					});
					it("with private getter ignores getter", () => {
						const { filteredIn } = passThruIgnoreInaccessibleMembers(
							classInstanceWithPrivateGetter,
							{
								public: "public",
							},
						);
						assertIdenticalTypes(filteredIn, {
							public: "public",
						});
						// @ts-expect-error secret is missing, but required
						filteredIn satisfies typeof classInstanceWithPrivateGetter;
					});
					it("with private setter ignores setter", () => {
						const { filteredIn } = passThruIgnoreInaccessibleMembers(
							classInstanceWithPrivateSetter,
							{
								public: "public",
							},
						);
						assertIdenticalTypes(filteredIn, {
							public: "public",
						});
						// @ts-expect-error secret is missing, but required
						filteredIn satisfies typeof classInstanceWithPrivateSetter;
					});
				});
			});

			describe("object with optional property", () => {
				it("without property", () => {
					const { filteredIn } = passThru(objectWithOptionalNumberNotPresent);
					assertIdenticalTypes(filteredIn, objectWithOptionalNumberNotPresent);
				});
				it("with undefined value", () => {
					const { filteredIn } = passThru(objectWithOptionalNumberUndefined, {});
					assertIdenticalTypes(filteredIn, objectWithOptionalNumberUndefined);
				});
				it("with defined value", () => {
					const { filteredIn } = passThru(objectWithOptionalNumberDefined);
					assertIdenticalTypes(filteredIn, objectWithOptionalNumberDefined);
				});
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
						const { filteredIn } = passThru(objectWithReadonlyViaGetter, {});
						assertIdenticalTypes(filteredIn, objectWithReadonlyViaGetter);
					});

					it("object with getter", () => {
						const { filteredIn } = passThru(objectWithGetter, {});
						assertIdenticalTypes(filteredIn, objectWithGetter);
					});

					it("object with setter", () => {
						const { filteredIn } = passThru(objectWithSetter, {});
						assertIdenticalTypes(filteredIn, objectWithSetter);
					});

					it("object with matched getter and setter", () => {
						const { filteredIn } = passThru(objectWithMatchedGetterAndSetterProperty, {});
						assertIdenticalTypes(filteredIn, objectWithMatchedGetterAndSetterProperty);
					});

					it("object with mismatched getter and setter", () => {
						const { filteredIn } = passThru(objectWithMismatchedGetterAndSetterProperty, {});
						assertIdenticalTypes(filteredIn, objectWithMismatchedGetterAndSetterProperty);
					});
				});

				describe("class instance", () => {
					describe("with `ignore-inaccessible-members`", () => {
						it("with private data ignores private data (that propagates)", () => {
							const { filteredIn } = passThruIgnoreInaccessibleMembers(
								classInstanceWithPrivateData,
								{
									public: "public",
									secret: 0,
								},
							);
							assertIdenticalTypes(filteredIn, {
								public: "public",
							});
							// @ts-expect-error secret is missing, but required
							filteredIn satisfies typeof classInstanceWithPrivateData;
						});
					});
				});

				it("sparse array of supported types", () => {
					const { filteredIn } = passThru(arrayOfNumbersSparse, [0, null, null, 3]);
					assertIdenticalTypes(filteredIn, arrayOfNumbersSparse);
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
						arrayOfBigintAndObjects,
						new TypeError("Do not know how to serialize a BigInt"),
					);
					assertIdenticalTypes(filteredIn, createInstanceOf<{ property: string }[]>());
				});
				it("array of `symbol` or basic object", () => {
					const { filteredIn } = passThru(
						// @ts-expect-error 'symbol' is not supported (becomes 'never')
						arrayOfSymbolsAndObjects,
						[null],
					);
					assertIdenticalTypes(filteredIn, createInstanceOf<{ property: string }[]>());
				});
				it("array of `bigint | symbol`s", () => {
					const { filteredIn } = passThru(
						// @ts-expect-error 'bigint | symbol' is not assignable to 'never'
						[bigintOrSymbol],
						[null],
					);
					assertIdenticalTypes(filteredIn, createInstanceOf<never[]>());
				});
				it("array of `number | bigint | symbol`s", () => {
					const { filteredIn } = passThru(
						// @ts-expect-error 'number | bigint | symbol' is not assignable to 'number'
						[numberOrBigintOrSymbol],
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

				it("object with symbol key", () => {
					const { filteredIn } = passThru(
						// @ts-expect-error `symbol` key is not supported (property type becomes `never`)
						objectWithSymbolKey,
						{},
					);
					assertIdenticalTypes(filteredIn, createInstanceOf<{ [symbol]: never }>());
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
					const { filteredIn } = passThru(
						// @ts-expect-error 'SelfRecursiveFunctionWithProperties' is not assignable to parameter of type 'never' (function even with properties becomes `never`)
						{ outerFnOjb: selfRecursiveFunctionWithProperties },
						{},
					);
					assertIdenticalTypes(filteredIn, createInstanceOf<{ outerFnOjb: never }>());
				});
				it("nested object and function with recursion", () => {
					const { filteredIn } = passThru(
						// @ts-expect-error 'SelfRecursiveObjectAndFunction' is not assignable to parameter of type 'never' (function even with properties becomes `never`)
						{ outerFnOjb: selfRecursiveObjectAndFunction },
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
							recursive?: SimpleObjectWithOptionalRecursion;
							complex: { number: number; symbol: never };
						}>(),
					);
				});

				describe("object with `undefined`", () => {
					it("as exact property type", () => {
						const { filteredIn } = passThru(
							// @ts-expect-error not assignable to `{ "error required property may not allow undefined value": never; }`
							objectWithUndefined,
							{},
						);
						assertIdenticalTypes(
							filteredIn,
							createInstanceOf<{
								undef: { "error required property may not allow undefined value": never };
							}>(),
						);
					});
					it("in union property", () => {
						const { filteredIn: resultUndefined } = passThru(
							// @ts-expect-error not assignable to `{ "error required property may not allow undefined value": never; }`
							objectWithNumberOrUndefinedUndefined,
							{},
						);
						assertIdenticalTypes(
							resultUndefined,
							createInstanceOf<{
								numOrUndef: { "error required property may not allow undefined value": never };
							}>(),
						);
						const { filteredIn: resultNumbered } = passThru(
							// @ts-expect-error not assignable to `{ "error required property may not allow undefined value": never; }`
							objectWithNumberOrUndefinedNumbered,
						);
						assertIdenticalTypes(
							resultNumbered,
							createInstanceOf<{
								numOrUndef: { "error required property may not allow undefined value": never };
							}>(),
						);
					});

					it("as optional exact property type > varies by exactOptionalPropertyTypes setting", () => {
						// See sibling test files
					});

					it("under an optional property", () => {
						const { filteredIn } = passThru(
							// @ts-expect-error not assignable to `{ "error required property may not allow undefined value": never; }`
							objectWithOptionalUndefinedEnclosingRequiredUndefined,
							{ opt: {} },
						);
						assertIdenticalTypes(
							filteredIn,
							createInstanceOf<{
								opt?: {
									requiredUndefined: {
										"error required property may not allow undefined value": never;
									};
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
					const { filteredIn } = passThru(Number.MIN_SAFE_INTEGER);
					assertIdenticalTypes(filteredIn, createInstanceOf<number>());
				});
				it("MAX_SAFE_INTEGER", () => {
					const { filteredIn } = passThru(Number.MAX_SAFE_INTEGER);
					assertIdenticalTypes(filteredIn, createInstanceOf<number>());
				});
				it("MIN_VALUE", () => {
					const { filteredIn } = passThru(Number.MIN_VALUE);
					assertIdenticalTypes(filteredIn, createInstanceOf<number>());
				});
				it("MAX_VALUE", () => {
					const { filteredIn } = passThru(Number.MAX_VALUE);
					assertIdenticalTypes(filteredIn, createInstanceOf<number>());
				});
			});
			describe("resulting in `null`", () => {
				it("NaN", () => {
					const { filteredIn } = passThru(Number.NaN, null);
					assertIdenticalTypes(filteredIn, createInstanceOf<number>());
				});

				it("+Infinity", () => {
					const { filteredIn } = passThru(Number.POSITIVE_INFINITY, null);
					assertIdenticalTypes(filteredIn, createInstanceOf<number>());
				});
				it("-Infinity", () => {
					const { filteredIn } = passThru(Number.NEGATIVE_INFINITY, null);
					assertIdenticalTypes(filteredIn, createInstanceOf<number>());
				});
			});
		});

		describe("using alternately allowed types", () => {
			describe("are supported", () => {
				it("`bigint`", () => {
					const { filteredIn } = passThruHandlingBigint(bigint);
					assertIdenticalTypes(filteredIn, createInstanceOf<bigint>());
				});
				it("object with `bigint`", () => {
					const { filteredIn } = passThruHandlingBigint(objectWithBigint);
					assertIdenticalTypes(filteredIn, objectWithBigint);
				});
				it("object with optional `bigint`", () => {
					const { filteredIn } = passThruHandlingBigint(objectWithOptionalBigint);
					assertIdenticalTypes(filteredIn, objectWithOptionalBigint);
				});
				it("array of `bigint`s", () => {
					const { filteredIn } = passThruHandlingBigint(arrayOfBigints);
					assertIdenticalTypes(filteredIn, arrayOfBigints);
				});
				it("array of `bigint` or basic object", () => {
					const { filteredIn } = passThruHandlingBigint(arrayOfBigintAndObjects);
					assertIdenticalTypes(filteredIn, arrayOfBigintAndObjects);
				});
				it("object with specific alternately allowed function", () => {
					const { filteredIn } = passThruHandlingSpecificFunction({
						specificFn: (v: string) => v.length,
					});
					assertIdenticalTypes(
						filteredIn,
						createInstanceOf<{
							specificFn: (_: string) => number;
						}>(),
					);
				});
				it("`IFluidHandle`", () => {
					const { filteredIn } = passThruHandlingFluidHandle(fluidHandleToNumber);
					assertIdenticalTypes(filteredIn, createInstanceOf<IFluidHandle<number>>());
				});
				it("object with `IFluidHandle`", () => {
					const { filteredIn } = passThruHandlingFluidHandle(objectWithFluidHandle);
					assertIdenticalTypes(
						filteredIn,
						createInstanceOf<{
							handle: IFluidHandle<number>;
						}>(),
					);
				});
				it("object with `IFluidHandle` and recursion", () => {
					const { filteredIn } = passThruHandlingFluidHandle(objectWithFluidHandleOrRecursion);
					assertIdenticalTypes(
						filteredIn,
						createInstanceOf<ObjectWithFluidHandleOrRecursion>(),
					);
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
					const { filteredIn } = passThruHandlingSpecificFunction({
						// @ts-expect-error '() => unknown' is not assignable to type 'never'
						genericFn: () => undefined as unknown,
					});
					assertIdenticalTypes(
						filteredIn,
						createInstanceOf<{
							genericFn: never;
						}>(),
					);
				});
				it("object with non-alternately allowed too input permissive function", () => {
					const { filteredIn } = passThruHandlingSpecificFunction({
						// @ts-expect-error '() => number' is not assignable to type 'never'
						lessRequirementsFn: () => 0,
					});
					assertIdenticalTypes(
						filteredIn,
						createInstanceOf<{
							lessRequirementsFn: never;
						}>(),
					);
				});
				it("object with non-alternately allowed more restrictive output function", () => {
					const { filteredIn } = passThruHandlingSpecificFunction({
						// @ts-expect-error '(_v: string) => 0' is not assignable to type 'never'
						stricterOutputFn: (_v: string) => 0 as const,
					});
					assertIdenticalTypes(
						filteredIn,
						createInstanceOf<{
							stricterOutputFn: never;
						}>(),
					);
				});
				it("object with supported or non-supported function union", () => {
					const { filteredIn } = passThruHandlingSpecificFunction({
						// @ts-expect-error '((v: string) => number) | ((n: number) => string)' is not assignable to type '(v: string) => number'
						specificFnOrAnother: ((v: string) => v.length) as
							| ((v: string) => number)
							| ((n: number) => string),
					});
					assertIdenticalTypes(
						filteredIn,
						createInstanceOf<{
							specificFnOrAnother: (_: string) => number;
						}>(),
					);
				});
			});
		});
	});
});

/* eslint-enable unicorn/no-null */
