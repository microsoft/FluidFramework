/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { SerializationErrorPerNonPublicProperties } from "../exposedUtilityTypes.js";
import type { JsonDeserialized } from "../jsonDeserialized.js";
import type { JsonSerializable } from "../jsonSerializable.js";
import type { JsonTypeWith, NonNullJsonObjectWith } from "../jsonType.js";

import { assertIdenticalTypes, createInstanceOf } from "./testUtils.js";
import type { ObjectWithSymbolOrRecursion } from "./testValues.js";
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
	simpleJson,
	classInstanceWithPrivateData,
	classInstanceWithPrivateMethod,
	classInstanceWithPrivateGetter,
	classInstanceWithPrivateSetter,
	classInstanceWithPublicData,
	classInstanceWithPublicMethod,
} from "./testValues.js";

/**
 * Defined using `JsonSerializable` type filter tests `JsonSerializable` at call site.
 * Internally value given is round-tripped through JSON serialization to ensure it is
 * unchanged or converted to given optional value.
 *
 * @param v - value to pass through JSON serialization
 * @param expected - alternate value to compare against after round-trip
 * @returns the round-tripped value cast to the filter result type
 */
function passThru<T>(
	v: JsonSerializable<T>,
	expected?: JsonDeserialized<T>,
): JsonSerializable<T> {
	const stringified = JSON.stringify(v);
	const result = JSON.parse(stringified) as JsonDeserialized<T>;
	assert.deepStrictEqual(result, expected ?? v);
	return result as JsonSerializable<T>;
}

/**
 * Defined using `JsonSerializable` type filter tests `JsonSerializable` at call site.
 *
 * @remarks All uses are expect to trigger a compile-time error that must be ts-ignore'd.
 *
 * @param v - value to pass through JSON serialization
 * @param error - error expected during serialization round-trip
 * @returns dummy result to allow further type checking
 */
function passThruThrows<T>(v: JsonSerializable<T>, expectedThrow: Error): JsonSerializable<T> {
	assert.throws(() => passThru(v), expectedThrow);
	return undefined as unknown as JsonSerializable<T>;
}

/**
 * Similar to {@link passThru} but specifically handles `bigint` values.
 */
function passThruHandlingBigint<T>(
	filteredIn: JsonSerializable<T, bigint>,
	expected?: JsonDeserialized<T, bigint>,
): { filteredIn: JsonSerializable<T, bigint>; out: JsonDeserialized<T, bigint> } {
	const stringified = JSON.stringify(filteredIn, (_key, value) => {
		if (typeof value === "bigint") {
			return `<bigint>${value.toString()}</bigint>`;
		}
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		return value;
	});
	const out = JSON.parse(stringified, (_key, value) => {
		if (
			typeof value === "string" &&
			value.startsWith("<bigint>") &&
			value.endsWith("</bigint>")
		) {
			return BigInt(value.slice(8, -9));
		}
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		return value;
	}) as JsonDeserialized<T, bigint>;
	assert.deepStrictEqual(out, expected ?? filteredIn);
	return { filteredIn, out };
}

/**
 * Similar to {@link passThruThrows} but specifically handles `bigint` values.
 */
function passThruHandlingBigintThrows<T>(
	v: JsonSerializable<T, bigint>,
	expectedThrow: Error,
): { filteredIn: JsonSerializable<T, bigint> } {
	assert.throws(() => passThruHandlingBigint(v), expectedThrow);
	return { filteredIn: undefined as unknown as JsonSerializable<T, bigint> };
}

describe("JsonSerializable", () => {
	describe("positive compilation tests", () => {
		describe("supported primitive types", () => {
			it("`boolean`", () => {
				const result = passThru(boolean);
				assertIdenticalTypes(result, boolean);
			});
			it("`number`", () => {
				const result = passThru(number);
				assertIdenticalTypes(result, number);
			});
			it("`string`", () => {
				const result = passThru(string);
				assertIdenticalTypes(result, string);
			});
			it("numeric enum", () => {
				const result = passThru(numericEnumValue);
				assertIdenticalTypes(result, numericEnumValue);
			});
			it("string enum", () => {
				const result = passThru(stringEnumValue);
				assertIdenticalTypes(result, stringEnumValue);
			});
			it("const heterogenous enum", () => {
				const result = passThru(constHeterogenousEnumValue);
				assertIdenticalTypes(result, constHeterogenousEnumValue);
			});
			it("computed enum", () => {
				const result = passThru(computedEnumValue);
				assertIdenticalTypes(result, computedEnumValue);
			});
		});

		describe("supported literal types", () => {
			it("`true`", () => {
				const result = passThru(true);
				assertIdenticalTypes(result, true);
			});
			it("`false`", () => {
				const result = passThru(false);
				assertIdenticalTypes(result, false);
			});
			it("`0`", () => {
				const result = passThru(0);
				assertIdenticalTypes(result, 0);
			});
			it('"string"', () => {
				const result = passThru("string");
				assertIdenticalTypes(result, "string");
			});
			it("`null`", () => {
				// eslint-disable-next-line unicorn/no-null
				const result = passThru(null);
				// eslint-disable-next-line unicorn/no-null
				assertIdenticalTypes(result, null);
			});
			it("object with literals", () => {
				const result = passThru(objectWithLiterals);
				assertIdenticalTypes(result, objectWithLiterals);
				// In the meantime, until https://github.com/microsoft/TypeScript/pull/58296,
				// we can check assignability.
				result satisfies typeof objectWithLiterals;
				assert.ok(
					objectWithLiterals instanceof Object,
					"objectWithLiterals is at least a plain Object",
				);
				assert.ok(
					result instanceof objectWithLiterals.constructor,
					"objectRead is same type as objectWithLiterals (plain Object)",
				);
			});
			it("array of literals", () => {
				const result = passThru(arrayOfLiterals);
				assertIdenticalTypes(result, arrayOfLiterals);
			});
			it("tuple of literals", () => {
				const result = passThru(tupleWithLiterals);
				assertIdenticalTypes(result, tupleWithLiterals);
			});
			it("specific numeric enum value", () => {
				const result = passThru(NumericEnum.two);
				assertIdenticalTypes(result, NumericEnum.two);
			});
			it("specific string enum value", () => {
				const result = passThru(StringEnum.b);
				assertIdenticalTypes(result, StringEnum.b);
			});
			it("specific const heterogenous enum value", () => {
				const result = passThru(ConstHeterogenousEnum.zero);
				assertIdenticalTypes(result, ConstHeterogenousEnum.zero);
			});
			it("specific computed enum value", () => {
				const result = passThru(ComputedEnum.computed);
				assertIdenticalTypes(result, ComputedEnum.computed);
			});
		});

		describe("supported object types", () => {
			it("empty object", () => {
				const result = passThru(emptyObject);
				assertIdenticalTypes(result, emptyObject);
			});

			it("object with `never`", () => {
				const result = passThru(objectWithNever);
				assertIdenticalTypes(result, objectWithNever);
			});

			it("object with `boolean`", () => {
				const result = passThru(objectWithBoolean);
				assertIdenticalTypes(result, objectWithBoolean);
			});
			it("object with `number`", () => {
				const result = passThru(objectWithNumber);
				assertIdenticalTypes(result, objectWithNumber);
			});
			it("object with `string`", () => {
				const result = passThru(objectWithString);
				assertIdenticalTypes(result, objectWithString);
			});

			it("object with optional exact `undefined`", () => {
				const result = passThru(objectWithOptionalUndefined, {});
				assertIdenticalTypes(result, objectWithOptionalUndefined);
			});

			it("object with possible type recursion through union", () => {
				const result = passThru(objectWithPossibleRecursion);
				assertIdenticalTypes(result, objectWithPossibleRecursion);
			});
			it("object with optional type recursion", () => {
				const result = passThru(objectWithRecursion);
				assertIdenticalTypes(result, objectWithRecursion);
			});
			it("object with deep type recursion", () => {
				const result = passThru(objectWithEmbeddedRecursion);
				assertIdenticalTypes(result, objectWithEmbeddedRecursion);
			});
			it("object with alternating type recursion", () => {
				const result = passThru(objectWithAlternatingRecursion);
				assertIdenticalTypes(result, objectWithAlternatingRecursion);
			});

			it("simple json (JsonTypeWith<never>)", () => {
				const result = passThru(simpleJson);
				assertIdenticalTypes(result, simpleJson);
			});

			it("non-const enums", () => {
				// Note: typescript doesn't do a great job checking that a filtered type satisfies an enum
				// type. The numeric indices are not checked. So far most robust inspection is manually
				// after any change.
				const resultNumeric = passThru(NumericEnum);
				assertIdenticalTypes(resultNumeric, NumericEnum);
				const resultString = passThru(StringEnum);
				assertIdenticalTypes(resultString, StringEnum);
				const resultComputed = passThru(ComputedEnum);
				assertIdenticalTypes(resultComputed, ComputedEnum);
			});

			it("object with `readonly`", () => {
				const result = passThru(objectWithReadonly);
				assertIdenticalTypes(result, objectWithReadonly);
				// In the meantime, until https://github.com/microsoft/TypeScript/pull/58296,
				// we can check assignability.
				result satisfies typeof objectWithReadonly;
			});

			it("object with getter implemented via value", () => {
				const result = passThru(objectWithGetterViaValue);
				assertIdenticalTypes(result, objectWithGetterViaValue);
				// In the meantime, until https://github.com/microsoft/TypeScript/pull/58296,
				// we can check assignability.
				result satisfies typeof objectWithGetterViaValue;
			});
			it("object with setter implemented via value", () => {
				const result = passThru(objectWithSetterViaValue);
				assertIdenticalTypes(result, objectWithSetterViaValue);
			});
			it("object with matched getter and setter implemented via value", () => {
				const result = passThru(objectWithMatchedGetterAndSetterPropertyViaValue);
				assertIdenticalTypes(result, objectWithMatchedGetterAndSetterPropertyViaValue);
			});
			it("object with mismatched getter and setter implemented via value", () => {
				const result = passThru(objectWithMismatchedGetterAndSetterPropertyViaValue);
				assertIdenticalTypes(result, objectWithMismatchedGetterAndSetterPropertyViaValue);
			});

			describe("class instance", () => {
				it("with public data (just cares about data)", () => {
					const result = passThru(classInstanceWithPublicData, {
						public: "public",
					});
					assertIdenticalTypes(result, classInstanceWithPublicData);
				});
				// TODO FIX: add option to ignore inaccessible members
				describe("with `ignore-inaccessible-members`", () => {
					it("with private method ignores method", () => {
						const result = passThru(classInstanceWithPrivateMethod, {
							public: "public",
						});
						assertIdenticalTypes(result, {
							public: "public",
						});
						// @ts-expect-error getSecret is missing, but required
						result satisfies typeof classInstanceWithPrivateMethod;
					});
					it("with private getter ignores getter", () => {
						const result = passThru(classInstanceWithPrivateGetter, {
							public: "public",
						});
						assertIdenticalTypes(result, {
							public: "public",
						});
						// @ts-expect-error secret is missing, but required
						result satisfies typeof classInstanceWithPrivateGetter;
					});
					it("with private setter ignores setter", () => {
						const result = passThru(classInstanceWithPrivateSetter, {
							public: "public",
						});
						assertIdenticalTypes(result, {
							public: "public",
						});
						// @ts-expect-error secret is missing, but required
						result satisfies typeof classInstanceWithPrivateSetter;
					});
				});
			});

			describe("object with optional property", () => {
				it("without property", () => {
					const result = passThru(objectWithOptionalNumberNotPresent);
					assertIdenticalTypes(result, objectWithOptionalNumberNotPresent);
				});
				it("with undefined value", () => {
					const result = passThru(objectWithOptionalNumberUndefined, {});
					assertIdenticalTypes(result, objectWithOptionalNumberUndefined);
				});
				it("with defined value", () => {
					const result = passThru(objectWithOptionalNumberDefined);
					assertIdenticalTypes(result, objectWithOptionalNumberDefined);
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
						const result = passThru(
							objectWithReadonlyViaGetter,
							// @ts-expect-error readonly is missing, but required
							{},
						);
						assertIdenticalTypes(result, objectWithReadonlyViaGetter);
					});

					it("object with getter", () => {
						const result = passThru(
							objectWithGetter,
							// @ts-expect-error getter is missing, but required
							{},
						);
						assertIdenticalTypes(result, objectWithGetter);
					});

					it("object with setter", () => {
						const result = passThru(
							objectWithSetter,
							// @ts-expect-error setter is missing, but required
							{},
						);
						assertIdenticalTypes(result, objectWithSetter);
					});

					it("object with matched getter and setter", () => {
						const result = passThru(
							objectWithMatchedGetterAndSetterProperty,
							// @ts-expect-error property is missing, but required
							{},
						);
						assertIdenticalTypes(result, objectWithMatchedGetterAndSetterProperty);
					});

					it("object with mismatched getter and setter", () => {
						const result = passThru(
							objectWithMismatchedGetterAndSetterProperty,
							// @ts-expect-error property is missing, but required
							{},
						);
						assertIdenticalTypes(result, objectWithMismatchedGetterAndSetterProperty);
					});
				});

				describe("class instance", () => {
					describe("with `ignore-inaccessible-members`", () => {
						it("with private data ignores private data (that propagates)", () => {
							const result = passThru(classInstanceWithPrivateData, {
								public: "public",
								secret: 0,
							});
							assertIdenticalTypes(result, {
								public: "public",
							});
							// @ts-expect-error secret is missing, but required
							result satisfies typeof classInstanceWithPrivateData;
						});
					});
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

		describe("unsupported types cause compiler error", () => {
			it("`undefined`", () => {
				const result = passThruThrows(
					// @ts-expect-error `undefined` is not supported (becomes `never`)
					undefined,
					new SyntaxError("Unexpected token u in JSON at position 0"),
				);
				result satisfies never;
			});
			it("`unknown`", () => {
				const result = passThru(
					// @ts-expect-error `unknown` is not supported (expects `JsonTypeWith<never>`)
					{} as unknown,
				); // {} value is actually supported; so, no runtime error.
				assertIdenticalTypes(result, createInstanceOf<JsonTypeWith<never>>());
			});
			it("`symbol`", () => {
				passThruThrows(
					// @ts-expect-error `symbol` is not supported (becomes `never`)
					symbol,
					new SyntaxError("Unexpected token u in JSON at position 0"),
				) satisfies never;
			});
			it("`unique symbol`", () => {
				passThruThrows(
					// @ts-expect-error [unique] `symbol` is not supported (becomes `never`)
					uniqueSymbol,
					new SyntaxError("Unexpected token u in JSON at position 0"),
				) satisfies never;
			});
			it("`bigint`", () => {
				passThruThrows(
					// @ts-expect-error `bigint` is not supported (becomes `never`)
					bigint,
					new TypeError("Do not know how to serialize a BigInt"),
				) satisfies never;
			});
			it("function", () => {
				passThruThrows(
					// @ts-expect-error `Function` is not supported (becomes `never`)
					aFunction,
					new SyntaxError("Unexpected token u in JSON at position 0"),
				) satisfies never;
			});
			it("`object` (plain object)", () => {
				const result = passThru(
					// @ts-expect-error `object` is not supported (expects `JsonTypeWith<never>`)
					object,
					// object's value is actually supported; so, no runtime error.
				);
				assertIdenticalTypes(result, createInstanceOf<JsonTypeWith<never>>());
			});
			it("`void`", () => {
				passThru(
					// @ts-expect-error `void` is not supported (becomes `never`)
					voidValue,
					// voidValue is actually `null`; so, no runtime error.
				) satisfies never;
			});

			describe("object", () => {
				it("object with exactly `bigint`", () => {
					const result = passThruThrows(
						// @ts-expect-error `bigint` is not supported (becomes `never`)
						objectWithBigint,
						new TypeError("Do not know how to serialize a BigInt"),
					);
					assertIdenticalTypes(result, createInstanceOf<{ bigint: never }>());
				});
				it("object with exactly `symbol`", () => {
					const result = passThru(
						// @ts-expect-error `symbol` is not supported (becomes `never`)
						objectWithSymbol,
						{},
					);
					assertIdenticalTypes(result, createInstanceOf<{ symbol: never }>());
				});
				it("object with exactly `function`", () => {
					const result = passThru(
						// @ts-expect-error `Function` is not supported (becomes `never`)
						objectWithFunction,
						{},
					);
					assertIdenticalTypes(result, createInstanceOf<{ function: never }>());
				});
				it("object with exactly `Function | symbol`", () => {
					const result = passThru(
						// @ts-expect-error `symbol | (() => void)` is not supported (becomes `never`)
						objectWithFunctionOrSymbol,
						{},
					);
					assertIdenticalTypes(result, createInstanceOf<{ functionOrSymbol: never }>());
				});
				it("object with exactly `string | symbol`", () => {
					const result = passThru(
						// @ts-expect-error `string | symbol` is not assignable to `string`
						objectWithStringOrSymbol,
						{},
					);
					assertIdenticalTypes(result, createInstanceOf<{ stringOrSymbol: string }>());
				});
				it("object with exactly `bigint | string`", () => {
					const result = passThru(
						// @ts-expect-error `bigint` | `string` is not assignable to `string`
						objectWithBigintOrString,
						// value is a string; so no runtime error.
					);
					assertIdenticalTypes(result, createInstanceOf<{ bigintOrString: string }>());
				});

				it("object with recursion and `symbol`", () => {
					const result = passThru(
						// @ts-expect-error 'ObjectWithSymbolOrRecursion' is not assignable to parameter of type '{ recurse: ObjectWithSymbolOrRecursion; }' (`symbol` becomes `never`)
						objectWithSymbolOrRecursion,
						{ recurse: {} },
					);
					assertIdenticalTypes(
						result,
						createInstanceOf<{
							recurse: ObjectWithSymbolOrRecursion;
						}>(),
					);
				});

				describe("object with `undefined`", () => {
					it("as exact property type", () => {
						const result = passThru(
							// @ts-expect-error not assignable to `{ "error required property may not allow undefined value": never; }`
							objectWithUndefined,
							{},
						);
						assertIdenticalTypes(
							result,
							createInstanceOf<{
								undef: { "error required property may not allow undefined value": never };
							}>(),
						);
					});
					it("in union property", () => {
						const resultUndefined = passThru(
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
						const resultNumbered = passThru(
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
					it("under an optional property", () => {
						const result = passThru(
							// @ts-expect-error not assignable to `{ "error required property may not allow undefined value": never; }`
							objectWithOptionalUndefinedEnclosingRequiredUndefined,
							{ opt: {} },
						);
						assertIdenticalTypes(
							result,
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
						const result = passThru(
							// @ts-expect-error SerializationErrorPerNonPublicProperties
							classInstanceWithPrivateData,
							{
								public: "public",
								// secret is also not allowed but is present
								secret: 0,
							},
						);
						assertIdenticalTypes(
							result,
							createInstanceOf<SerializationErrorPerNonPublicProperties>(),
						);
					});
					it("with private method", () => {
						const result = passThru(
							// @ts-expect-error SerializationErrorPerNonPublicProperties
							classInstanceWithPrivateMethod,
							{
								public: "public",
							},
						);
						assertIdenticalTypes(
							result,
							createInstanceOf<SerializationErrorPerNonPublicProperties>(),
						);
					});
					it("with private getter", () => {
						const result = passThru(
							// @ts-expect-error SerializationErrorPerNonPublicProperties
							classInstanceWithPrivateGetter,
							{
								public: "public",
							},
						);
						assertIdenticalTypes(
							result,
							createInstanceOf<SerializationErrorPerNonPublicProperties>(),
						);
					});
					it("with private setter", () => {
						const result = passThru(
							// @ts-expect-error SerializationErrorPerNonPublicProperties
							classInstanceWithPrivateSetter,
							{
								public: "public",
							},
						);
						assertIdenticalTypes(
							result,
							createInstanceOf<SerializationErrorPerNonPublicProperties>(),
						);
					});
					it("with public method", () => {
						const result = passThru(
							// @ts-expect-error function not assignable to never
							classInstanceWithPublicMethod,
							{ public: "public" },
						);
						assertIdenticalTypes(
							result,
							createInstanceOf<{
								public: string;
								getSecret: never;
							}>(),
						);
					});
				});
			});
		});
	});

	describe("special cases", () => {
		it("explicit `any` generic still limits allowed types", () => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const result = passThruThrows<any>(
				// @ts-expect-error `any` is not an open door (expects `JsonTypeWith<never>`)
				undefined,
				new SyntaxError("Unexpected token u in JSON at position 0"),
			);
			assertIdenticalTypes(result, createInstanceOf<JsonTypeWith<never>>());
		});

		describe("using replaced types", () => {
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
			});

			describe("continue rejecting unsupported that are not replaced", () => {
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
						new SyntaxError("Unexpected token u in JSON at position 0"),
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
			});
		});
	});
});
