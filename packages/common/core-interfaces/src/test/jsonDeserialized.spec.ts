/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable unicorn/no-null */

import { strict as assert } from "node:assert";

import type { JsonDeserialized } from "../jsonDeserialized.js";
import type { JsonTypeWith, NonNullJsonObjectWith } from "../jsonType.js";

import { assertIdenticalTypes, createInstanceOf } from "./testUtils.js";
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
	arrayOfNumbers,
	arrayOfNumbersSparse,
	arrayOfNumbersOrUndefined,
	arrayOfSymbols,
	arrayOfFunctions,
	arrayOfSymbolsAndObjects,
	object,
	emptyObject,
	objectWithBoolean,
	objectWithNumber,
	objectWithString,
	objectWithSymbol,
	objectWithBigint,
	objectWithFunction,
	objectWithBigintOrString,
	objectWithFunctionOrSymbol,
	objectWithStringOrSymbol,
	objectWithUndefined,
	objectWithOptionalUndefined,
	objectWithOptionalBigint,
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
	objectWithPossibleRecursion,
	objectWithRecursion,
	objectWithEmbeddedRecursion,
	objectWithAlternatingRecursion,
	objectWithSymbolOrRecursion,
	simpleJson,
	classInstanceWithPrivateData,
	classInstanceWithPrivateMethod,
	classInstanceWithPrivateGetter,
	classInstanceWithPrivateSetter,
	classInstanceWithPublicData,
	classInstanceWithPublicMethod,
	ClassWithPrivateData,
	ClassWithPrivateMethod,
	ClassWithPrivateGetter,
	ClassWithPrivateSetter,
	ClassWithPublicData,
	ClassWithPublicMethod,
} from "./testValues.js";

/**
 * Defined using `JsonDeserialized` type filter tests `JsonDeserialized` at call site.
 * Internally, value given is round-tripped through JSON serialization to ensure it is
 * unchanged or converted to given optional value.
 *
 * @param v - value to pass through JSON serialization
 * @param expected - alternate value to compare against after round-trip
 * @returns the round-tripped value
 */
function passThru<T>(v: T, expected?: JsonDeserialized<T>): JsonDeserialized<T> {
	const stringified = JSON.stringify(v);
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
function passThruThrows<T>(v: T, expectedThrow: Error): JsonDeserialized<T> {
	assert.throws(() => passThru(v), expectedThrow);
	return undefined as unknown as JsonDeserialized<T>;
}

/**
 * Similar to {@link passThru} but specifically handles `bigint` values.
 */
function passThruHandlingBigint<T>(
	v: T,
	expected?: JsonDeserialized<T, { Replaced: bigint }>,
): JsonDeserialized<T, { Replaced: bigint }> {
	const stringified = JSON.stringify(v, (_key, value) => {
		if (typeof value === "bigint") {
			return `<bigint>${value.toString()}</bigint>`;
		}
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		return value;
	});
	const result = JSON.parse(stringified, (_key, value) => {
		if (
			typeof value === "string" &&
			value.startsWith("<bigint>") &&
			value.endsWith("</bigint>")
		) {
			return BigInt(value.slice(8, -9));
		}
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		return value;
	}) as JsonDeserialized<T, { Replaced: bigint }>;
	assert.deepStrictEqual(result, expected ?? v);
	return result;
}

/**
 * Similar to {@link passThruThrows} but specifically handles `bigint` values.
 */
function passThruHandlingBigintThrows<T>(
	v: T,
	expectedThrow: Error,
): JsonDeserialized<T, { Replaced: bigint }> {
	assert.throws(() => passThruHandlingBigint(v), expectedThrow);
	return undefined as unknown as JsonDeserialized<T, { Replaced: bigint }>;
}

/**
 * Similar to {@link passThru} but specifically handles certain function signatures.
 */
function passThruHandlingSpecificFunction<T>(
	_v: T,
): JsonDeserialized<T, { Replaced: (_: string) => number }> {
	return undefined as unknown as JsonDeserialized<T, { Replaced: (_: string) => number }>;
}

describe("JsonDeserialized", () => {
	describe("positive compilation tests", () => {
		describe("supported primitive types are preserved", () => {
			it("`boolean`", () => {
				const resultRead = passThru(boolean);
				assertIdenticalTypes(resultRead, boolean);
			});
			it("`number`", () => {
				const resultRead = passThru(number);
				assertIdenticalTypes(resultRead, number);
			});
			it("`string`", () => {
				const resultRead = passThru(string);
				assertIdenticalTypes(resultRead, string);
			});
			it("numeric enum", () => {
				const resultRead = passThru(numericEnumValue);
				assertIdenticalTypes(resultRead, numericEnumValue);
			});
			it("string enum", () => {
				const resultRead = passThru(stringEnumValue);
				assertIdenticalTypes(resultRead, stringEnumValue);
			});
			it("const heterogenous enum", () => {
				const resultRead = passThru(constHeterogenousEnumValue);
				assertIdenticalTypes(resultRead, constHeterogenousEnumValue);
			});
			it("computed enum", () => {
				const resultRead = passThru(computedEnumValue);
				assertIdenticalTypes(resultRead, computedEnumValue);
			});
		});

		describe("supported literal types are preserved", () => {
			it("`true`", () => {
				const resultRead = passThru(true as const);
				assertIdenticalTypes(resultRead, true);
			});
			it("`false`", () => {
				const resultRead = passThru(false as const);
				assertIdenticalTypes(resultRead, false);
			});
			it("`0`", () => {
				const resultRead = passThru(0 as const);
				assertIdenticalTypes(resultRead, 0);
			});
			it('"string"', () => {
				const resultRead = passThru("string" as const);
				assertIdenticalTypes(resultRead, "string");
			});
			it("`null`", () => {
				const resultRead = passThru(null);
				assertIdenticalTypes(resultRead, null);
			});
			it("object with literals", () => {
				const resultRead = passThru(objectWithLiterals);
				assertIdenticalTypes(resultRead, objectWithLiterals);
				// In the meantime, until https://github.com/microsoft/TypeScript/pull/58296,
				// we can check assignability.
				resultRead satisfies typeof objectWithLiterals;
				assert.ok(
					objectWithLiterals instanceof Object,
					"objectWithLiterals is at least a plain Object",
				);
				assert.ok(
					resultRead instanceof objectWithLiterals.constructor,
					"objectRead is same type as objectWithLiterals (plain Object)",
				);
			});
			it("array of literals", () => {
				const resultRead = passThru(arrayOfLiterals);
				assertIdenticalTypes(resultRead, arrayOfLiterals);
			});
			it("tuple of literals", () => {
				const resultRead = passThru(tupleWithLiterals);
				assertIdenticalTypes(resultRead, tupleWithLiterals);
			});
			it("specific numeric enum value", () => {
				const resultRead = passThru(NumericEnum.two as const);
				assertIdenticalTypes(resultRead, NumericEnum.two);
			});
			it("specific string enum value", () => {
				const resultRead = passThru(StringEnum.b as const);
				assertIdenticalTypes(resultRead, StringEnum.b);
			});
			it("specific const heterogenous enum value", () => {
				const resultRead = passThru(ConstHeterogenousEnum.zero as const);
				assertIdenticalTypes(resultRead, ConstHeterogenousEnum.zero);
			});
			it("specific computed enum value", () => {
				const resultRead = passThru(ComputedEnum.computed as const);
				assertIdenticalTypes(resultRead, ComputedEnum.computed);
			});
		});

		describe("arrays", () => {
			it("array of supported types (numbers) are preserved", () => {
				const resultRead = passThru(arrayOfNumbers);
				assertIdenticalTypes(resultRead, arrayOfNumbers);
			});
			it("sparse array is filled in with null", () => {
				const resultRead = passThru(
					arrayOfNumbersSparse,
					// @ts-expect-error 'null' is injected but not detectable from type information
					[0, null, null, 3],
				);
				assertIdenticalTypes(resultRead, arrayOfNumbersSparse);
			});
			it("array of partially supported (numbers or undefined) is modified with null", () => {
				const resultRead = passThru(arrayOfNumbersOrUndefined, [0, null, 2]);
				assertIdenticalTypes(resultRead, createInstanceOf<(number | null)[]>());
			});
			it("array of partially supported (symbols or basic object) is modified with null", () => {
				const resultRead = passThru(arrayOfSymbolsAndObjects, [null]);
				assertIdenticalTypes(resultRead, createInstanceOf<({ property: string } | null)[]>());
			});
			it("array of unsupported (symbols) becomes null[]", () => {
				const resultRead = passThru(arrayOfSymbols, [null]);
				assertIdenticalTypes(resultRead, createInstanceOf<null[]>());
			});
			it("array of unsupported (functions) becomes null[]", () => {
				const resultRead = passThru(arrayOfFunctions, [null]);
				assertIdenticalTypes(resultRead, createInstanceOf<null[]>());
			});
		});

		describe("fully supported object types are preserved", () => {
			it("empty object", () => {
				const resultRead = passThru(emptyObject);
				assertIdenticalTypes(resultRead, emptyObject);
			});

			it("object with `boolean`", () => {
				const resultRead = passThru(objectWithBoolean);
				assertIdenticalTypes(resultRead, objectWithBoolean);
			});
			it("object with `number`", () => {
				const resultRead = passThru(objectWithNumber);
				assertIdenticalTypes(resultRead, objectWithNumber);
			});
			it("object with `string`", () => {
				const resultRead = passThru(objectWithString);
				assertIdenticalTypes(resultRead, objectWithString);
			});

			it("object with possible type recursion through union", () => {
				const resultRead = passThru(objectWithPossibleRecursion);
				assertIdenticalTypes(resultRead, objectWithPossibleRecursion);
			});
			it("object with optional type recursion", () => {
				const resultRead = passThru(objectWithRecursion);
				assertIdenticalTypes(resultRead, objectWithRecursion);
			});
			it("object with deep type recursion", () => {
				const resultRead = passThru(objectWithEmbeddedRecursion);
				assertIdenticalTypes(resultRead, objectWithEmbeddedRecursion);
			});
			it("object with alternating type recursion", () => {
				const resultRead = passThru(objectWithAlternatingRecursion);
				assertIdenticalTypes(resultRead, objectWithAlternatingRecursion);
			});

			it("simple json (`JsonTypeWith<never>`)", () => {
				const resultRead = passThru(simpleJson);
				assertIdenticalTypes(resultRead, simpleJson);
			});

			it("non-const enum", () => {
				// Note: typescript doesn't do a great job checking that a filtered type satisfies an enum
				// type. The numeric indices are not checked. So far most robust inspection is manually
				// after any change.
				const resultNumericRead = passThru(NumericEnum);
				assertIdenticalTypes(resultNumericRead, NumericEnum);
				const resultStringRead = passThru(StringEnum);
				assertIdenticalTypes(resultStringRead, StringEnum);
				const resultComputedRead = passThru(ComputedEnum);
				assertIdenticalTypes(resultComputedRead, ComputedEnum);
			});

			it("object with `readonly`", () => {
				const resultRead = passThru(objectWithReadonly);
				assertIdenticalTypes(resultRead, objectWithReadonly);
			});

			it("object with getter implemented via value", () => {
				const resultRead = passThru(objectWithGetterViaValue);
				assertIdenticalTypes(resultRead, objectWithGetterViaValue);
			});
			it("object with setter implemented via value", () => {
				const resultRead = passThru(objectWithSetterViaValue);
				assertIdenticalTypes(resultRead, objectWithSetterViaValue);
			});
			it("object with matched getter and setter implemented via value", () => {
				const resultRead = passThru(objectWithMatchedGetterAndSetterPropertyViaValue);
				assertIdenticalTypes(resultRead, objectWithMatchedGetterAndSetterPropertyViaValue);
			});
			it("object with mismatched getter and setter implemented via value", () => {
				const resultRead = passThru(objectWithMismatchedGetterAndSetterPropertyViaValue);
				assertIdenticalTypes(resultRead, objectWithMismatchedGetterAndSetterPropertyViaValue);
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
				});
				it("with undefined value (property is removed in value)", () => {
					const resultRead = passThru(objectWithOptionalNumberUndefined, {});
					assertIdenticalTypes(resultRead, objectWithOptionalNumberUndefined);
				});
				it("with defined value", () => {
					const resultRead = passThru(objectWithOptionalNumberDefined);
					assertIdenticalTypes(resultRead, objectWithOptionalNumberDefined);
				});
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
					// @ts-expect-error `bigint` missing
					assertIdenticalTypes(resultRead, objectWithBigint);
				});
				it("object with exactly `symbol`", () => {
					const resultRead = passThru(objectWithSymbol, {});
					assertIdenticalTypes(resultRead, {});
					// @ts-expect-error `symbol` missing
					assertIdenticalTypes(resultRead, objectWithSymbol);
				});
				it("object with exactly function", () => {
					const resultRead = passThru(objectWithFunction, {});
					assertIdenticalTypes(resultRead, {});
					// @ts-expect-error `function` missing
					assertIdenticalTypes(resultRead, objectWithFunction);
				});
				it("object with exactly `Function | symbol`", () => {
					const resultRead = passThru(objectWithFunctionOrSymbol, {});
					assertIdenticalTypes(resultRead, {});
					// @ts-expect-error `functionOrSymbol` missing
					assertIdenticalTypes(resultRead, objectWithFunctionOrSymbol);
				});
				it("object with required exact `undefined`", () => {
					const resultRead = passThru(objectWithUndefined, {});
					assertIdenticalTypes(resultRead, {});
					// @ts-expect-error `undef` property (required) should no longer exist
					resultRead satisfies typeof objectWithUndefined;
				});
				it("object with optional exact `undefined`", () => {
					const resultRead = passThru(objectWithOptionalUndefined, {});
					assertIdenticalTypes(resultRead, {});
					// @ts-expect-error `undef` property (required) should no longer exist
					assertIdenticalTypes(resultRead, objectWithOptionalUndefined);
				});
				it("object with exactly `never`", () => {
					const resultRead = passThru(objectWithNever);
					assertIdenticalTypes(resultRead, {});
					// @ts-expect-error `never` property (type never) should not be preserved
					resultRead satisfies typeof objectWithNever;
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
					});

					it("with defined value", () => {
						const resultRead = passThru(objectWithNumberOrUndefinedNumbered);
						assertIdenticalTypes(
							resultRead,
							createInstanceOf<{
								numOrUndef?: number;
							}>(),
						);
					});
				});

				// TODO FIX: make properties optional
				it("object with exactly `string | symbol`", () => {
					const resultRead = passThru(
						objectWithStringOrSymbol,
						// value is a symbol; so removed.
						{},
					);
					assertIdenticalTypes(resultRead, createInstanceOf<{ stringOrSymbol?: string }>());
					// @ts-expect-error { stringOrSymbol: string | symbol; } does not satisfy { stringOrSymbol?: string; }
					objectWithStringOrSymbol satisfies typeof resultRead;
				});
				it("object with exactly `bigint | string`", () => {
					const resultRead = passThru(
						objectWithBigintOrString,
						// value is a string; so no runtime error.
					);
					assertIdenticalTypes(resultRead, createInstanceOf<{ bigintOrString?: string }>());
					// @ts-expect-error { bigintOrString: string | bigint } does not satisfy { bigintOrString?: string }
					objectWithBigintOrString satisfies typeof resultRead;
				});
				it("object with recursion and `symbol` unrolls 10 times and then has generic Json", () => {
					const resultRead = passThru(objectWithSymbolOrRecursion, { recurse: {} });
					assertIdenticalTypes(
						resultRead,
						createInstanceOf<{
							recurse?: {
								recurse?: {
									recurse?: {
										recurse?: {
											recurse?: {
												recurse?: {
													recurse?: {
														recurse?: {
															recurse?: {
																recurse?: {
																	recurse?: JsonTypeWith<never>;
																};
															};
														};
													};
												};
											};
										};
									};
								};
							};
						}>(),
					);
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
					assertIdenticalTypes(instanceRead, {
						public: "public",
					});
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
					assertIdenticalTypes(instanceRead, {
						public: "public",
					});
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
					assertIdenticalTypes(instanceRead, {
						public: "public",
					});
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
					assertIdenticalTypes(instanceRead, {
						public: "public",
					});
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
						// @ts-expect-error 'secret' does not exist in type '{ public: string; }'
						secret: 0,
					});
					assertIdenticalTypes(instanceRead, {
						public: "public",
					});
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
			});

			it("`object` (plain object) becomes non-null Json object", () => {
				const resultRead = passThru(
					object,
					// object's value is actually supported; so, no runtime error.
				);
				assertIdenticalTypes(resultRead, createInstanceOf<NonNullJsonObjectWith<never>>());
			});
		});

		describe("unsupported object types", () => {
			// These cases are demonstrating defects within the current implementation.
			// They show "allowed" incorrect use and the unexpected results.
			describe("known defect expectations", () => {
				describe("getters and setters preserved but do not propagate", () => {
					it("object with `readonly` implemented via getter", () => {
						const resultRead = passThru(
							objectWithReadonlyViaGetter,
							// @ts-expect-error readonly is missing, but required
							{},
						);
						assertIdenticalTypes(resultRead, objectWithReadonlyViaGetter);
					});

					it("object with getter", () => {
						const resultRead = passThru(
							objectWithGetter,
							// @ts-expect-error getter is missing, but required
							{},
						);
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
						const resultRead = passThru(
							objectWithSetter,
							// @ts-expect-error setter is missing, but required
							{},
						);
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
						const resultRead = passThru(
							objectWithMatchedGetterAndSetterProperty,
							// @ts-expect-error property is missing, but required
							{},
						);
						assertIdenticalTypes(resultRead, objectWithMatchedGetterAndSetterProperty);
					});

					it("object with mismatched getter and setter", () => {
						const resultRead = passThru(
							objectWithMismatchedGetterAndSetterProperty,
							// @ts-expect-error property is missing, but required
							{},
						);
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
					const resultRead = passThru(
						arrayOfNumbersSparse,
						// @ts-expect-error 'null' is injected for holes but sparse array is not detectable from type information
						[0, null, null, 3],
					);
					assertIdenticalTypes(resultRead, arrayOfNumbersSparse);
				});
			});
		});
	});

	describe("negative compilation tests", () => {
		describe("assumptions", () => {
			it("const enums are never readable", () => {
				// ... and thus don't need accounted for by JsonDeserialized.

				function doNothingPassThru<T>(v: T): T {
					return v;
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
					new SyntaxError("Unexpected token u in JSON at position 0"),
				) satisfies never;
			});
			it("`unknown` becomes `JsonTypeWith<never>`", () => {
				const resultRead = passThru(
					unknownValueOfSimpleRecord,
					// value is actually supported; so, no runtime error.
				);
				assertIdenticalTypes(resultRead, createInstanceOf<JsonTypeWith<never>>());
			});
			it("`symbol` becomes `never`", () => {
				passThruThrows(
					symbol,
					new SyntaxError("Unexpected token u in JSON at position 0"),
				) satisfies never;
			});
			it("`unique symbol` becomes `never`", () => {
				passThruThrows(
					uniqueSymbol,
					new SyntaxError("Unexpected token u in JSON at position 0"),
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
					new SyntaxError("Unexpected token u in JSON at position 0"),
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
				new SyntaxError("Unexpected token u in JSON at position 0"),
			);
			assertIdenticalTypes(resultRead, createInstanceOf<JsonTypeWith<never>>());
		});

		describe("using replaced types", () => {
			describe("are preserved", () => {
				it("`bigint`", () => {
					const resultRead = passThruHandlingBigint(bigint);
					assertIdenticalTypes(resultRead, createInstanceOf<bigint>());
				});
				it("object with `bigint`", () => {
					const resultRead = passThruHandlingBigint(objectWithBigint);
					assertIdenticalTypes(resultRead, objectWithBigint);
				});
				it("object with optional `bigint`", () => {
					const resultRead = passThruHandlingBigint(objectWithOptionalBigint);
					assertIdenticalTypes(resultRead, objectWithOptionalBigint);
				});
				it("object with specific function", () => {
					const resultRead = passThruHandlingSpecificFunction({
						genericFn: () => undefined as unknown,
						specificFn: (v: string) => v.length,
						specificFnOrAnother: ((v: string) => v.length) as
							| ((v: string) => number)
							| ((n: number) => string),
					});
					assertIdenticalTypes(
						resultRead,
						createInstanceOf<{
							specificFn: (_: string) => number;
							specificFnOrAnother?: (_: string) => number;
						}>(),
					);
				});
			});

			describe("continue rejecting unsupported that are not replaced", () => {
				it("`unknown` (simple object) becomes `JsonTypeWith<bigint>`", () => {
					const resultRead = passThruHandlingBigint(
						unknownValueOfSimpleRecord,
						// value is actually supported; so, no runtime error.
					);
					assertIdenticalTypes(resultRead, createInstanceOf<JsonTypeWith<bigint>>());
				});
				it("`unknown` (with bigint) becomes `JsonTypeWith<bigint>`", () => {
					const resultRead = passThruHandlingBigint(
						unknownValueWithBigint,
						// value is actually supported; so, no runtime error.
					);
					assertIdenticalTypes(resultRead, createInstanceOf<JsonTypeWith<bigint>>());
				});
				it("`symbol` still becomes `never`", () => {
					passThruHandlingBigintThrows(
						symbol,
						new SyntaxError("Unexpected token u in JSON at position 0"),
					) satisfies never;
				});
				it("`object` (plain object) still becomes non-null Json object", () => {
					const resultRead = passThruHandlingBigint(
						object,
						// object's value is actually supported; so, no runtime error.
					);
					assertIdenticalTypes(resultRead, createInstanceOf<NonNullJsonObjectWith<bigint>>());
				});
			});
		});
	});
});
// type X = Exclude<(() => any) | ((v: string) => number), (v: string) => number>;
/* eslint-enable unicorn/no-null */
