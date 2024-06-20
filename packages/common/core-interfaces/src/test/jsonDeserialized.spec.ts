/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { DeserializationErrorPerNonPublicProperties } from "../exposedUtilityTypes.js";
import type { JsonDeserialized } from "../jsonDeserialized.js";
import type { JsonTypeWith, NonNullJsonObject } from "../jsonType.js";

import type { ObjectWithNumberOrUndefined, ObjectWithOptionalNumber } from "./testValues.js";
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
 * Type filter to determine if T is or contains `any` type.
 * Use by checking if result `satisfied never`.
 */
type ContainsAny<T, TRecursion = never> = boolean extends (T extends never ? true : false)
	? true
	: T extends TRecursion
		? never
		: T extends object
			? T extends readonly (infer A)[]
				? ContainsAny<A, TRecursion | T>
				: {
						[K in keyof T]-?: ContainsAny<Exclude<Required<T>[K], undefined>, TRecursion | T>;
					}[keyof T]
			: never;

function ContainsAny<T>(_: T): ContainsAny<T> {
	return undefined as ContainsAny<T>;
}

/**
 * Defined using `JsonDeserialized` type filter tests `JsonDeserialized` at call site.
 * Internally value given is round-tripped through JSON serialization to ensure it is
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
 * @remarks All uses are expect to trigger a compile-time error that must be ts-ignore'd.
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
	expected?: JsonDeserialized<T, bigint>,
): JsonDeserialized<T, bigint> {
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
	}) as JsonDeserialized<T, bigint>;
	assert.deepStrictEqual(result, expected ?? v);
	return result;
}

/**
 * Similar to {@link passThruThrows} but specifically handles `bigint` values.
 */
function passThruHandlingBigintThrows<T>(
	v: T,
	expectedThrow: Error,
): JsonDeserialized<T, bigint> {
	assert.throws(() => passThruHandlingBigint(v), expectedThrow);
	return undefined as unknown as JsonDeserialized<T, bigint>;
}

describe("JsonDeserialized", () => {
	describe("positive compilation tests", () => {
		describe("supported primitive types are preserved", () => {
			it("`boolean`", () => {
				passThru(boolean) satisfies boolean;
			});
			it("`number`", () => {
				passThru(number) satisfies number;
			});
			it("`string`", () => {
				passThru(string) satisfies string;
			});
			it("numeric enum", () => {
				passThru(numericEnumValue) satisfies NumericEnum;
			});
			it("string enum", () => {
				passThru(stringEnumValue) satisfies StringEnum;
			});
			it("const heterogenous enum", () => {
				passThru(constHeterogenousEnumValue) satisfies ConstHeterogenousEnum;
			});
			it("computed enum", () => {
				passThru(computedEnumValue) satisfies ComputedEnum;
			});
		});

		describe("supported literal types are preserved", () => {
			it("`true`", () => {
				passThru(true) satisfies true;
			});
			it("`false`", () => {
				passThru(false) satisfies false;
			});
			it("`0`", () => {
				passThru(0) satisfies 0;
			});
			it('"string"', () => {
				passThru("string") satisfies "string";
			});
			it("`null`", () => {
				// eslint-disable-next-line unicorn/no-null
				passThru(null) satisfies null;
			});
			it("object with literals", () => {
				const objectRead = passThru(objectWithLiterals) satisfies typeof objectWithLiterals;
				assert.ok(
					objectWithLiterals instanceof Object,
					"objectWithLiterals is at least a plain Object",
				);
				assert.ok(
					objectRead instanceof objectWithLiterals.constructor,
					"objectRead is same type as objectWithLiterals (plain Object)",
				);
			});
			it("array of literals", () => {
				const resultRead = passThru(arrayOfLiterals);
				resultRead satisfies typeof arrayOfLiterals;
				ContainsAny(resultRead) satisfies never;
			});
			it("tuple of literals", () => {
				const resultRead = passThru(tupleWithLiterals);
				resultRead satisfies typeof tupleWithLiterals;
				ContainsAny(resultRead) satisfies never;
			});
			it("specific numeric enum value", () => {
				passThru(NumericEnum.two) satisfies NumericEnum.two;
			});
			it("specific string enum value", () => {
				passThru(StringEnum.b) satisfies StringEnum.b;
			});
			it("specific const heterogenous enum value", () => {
				passThru(ConstHeterogenousEnum.zero) satisfies ConstHeterogenousEnum.zero;
			});
			it("specific computed enum value", () => {
				passThru(
					// This assertion is necessary; otherwise, typescript will just use `ComputedEnum`
					// as type for ComputedEnum.computed.
					// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
					ComputedEnum.computed as ComputedEnum.computed,
				) satisfies ComputedEnum.computed;
			});
		});

		describe("supported object types", () => {
			it("empty object", () => {
				const resultRead = passThru(emptyObject);
				ContainsAny(resultRead) satisfies never;
				emptyObject satisfies typeof resultRead;
				resultRead satisfies typeof emptyObject;
			});

			it("with `boolean`", () => {
				const resultRead = passThru(objectWithBoolean);
				ContainsAny(resultRead) satisfies never;
				objectWithBoolean satisfies typeof resultRead;
				resultRead satisfies typeof objectWithBoolean;
			});
			it("with `number`", () => {
				const resultRead = passThru(objectWithNumber);
				ContainsAny(resultRead) satisfies never;
				objectWithNumber satisfies typeof resultRead;
				resultRead satisfies typeof objectWithNumber;
			});
			it("with `string`", () => {
				const resultRead = passThru(objectWithString);
				ContainsAny(resultRead) satisfies never;
				objectWithString satisfies typeof resultRead;
				resultRead satisfies typeof objectWithString;
			});

			it("with `readonly`", () => {
				const resultRead = passThru(objectWithReadonly);
				ContainsAny(resultRead) satisfies never;
				objectWithReadonly satisfies typeof resultRead;
				resultRead satisfies typeof objectWithReadonly;
			});

			it("with getter implemented via value", () => {
				const resultRead = passThru(objectWithGetterViaValue);
				ContainsAny(resultRead) satisfies never;
				objectWithGetterViaValue satisfies typeof resultRead;
				resultRead satisfies typeof objectWithGetterViaValue;
			});

			it("with setter implemented via value", () => {
				const resultRead = passThru(objectWithSetterViaValue);
				ContainsAny(resultRead) satisfies never;
				objectWithSetterViaValue satisfies typeof resultRead;
				resultRead satisfies typeof objectWithSetterViaValue;
			});

			it("with matched getter and setter implemented via value", () => {
				const resultRead = passThru(objectWithMatchedGetterAndSetterPropertyViaValue);
				ContainsAny(resultRead) satisfies never;
				objectWithMatchedGetterAndSetterPropertyViaValue satisfies typeof resultRead;
				resultRead satisfies typeof objectWithMatchedGetterAndSetterPropertyViaValue;
			});

			it("with mismatched getter and setter implemented via value", () => {
				const resultRead = passThru(objectWithMismatchedGetterAndSetterPropertyViaValue);
				ContainsAny(resultRead) satisfies never;
				objectWithMismatchedGetterAndSetterPropertyViaValue satisfies typeof resultRead;
				resultRead satisfies typeof objectWithMismatchedGetterAndSetterPropertyViaValue;
				// @ts-expect-error 'number' is not assignable to type 'string'
				objectWithMismatchedGetterAndSetterPropertyViaValue.property = -1;
				// @ts-expect-error 'number' is not assignable to type 'string'
				resultRead.property = -1;
			});

			it("object with possible type recursion through union", () => {
				const resultRead = passThru(objectWithPossibleRecursion);
				ContainsAny(resultRead) satisfies never;
				objectWithPossibleRecursion satisfies typeof resultRead;
				resultRead satisfies typeof objectWithPossibleRecursion;
			});

			it("object with optional type recursion", () => {
				const resultRead = passThru(objectWithRecursion);
				ContainsAny(resultRead) satisfies never;
				objectWithRecursion satisfies typeof resultRead;
				resultRead satisfies typeof objectWithRecursion;
			});

			it("object with deep type recursion", () => {
				const resultRead = passThru(objectWithEmbeddedRecursion);
				ContainsAny(resultRead) satisfies never;
				objectWithEmbeddedRecursion satisfies typeof resultRead;
				resultRead satisfies typeof objectWithEmbeddedRecursion;
			});

			it("object with alternating type recursion", () => {
				const resultRead = passThru(objectWithAlternatingRecursion);
				ContainsAny(resultRead) satisfies never;
				objectWithAlternatingRecursion satisfies typeof resultRead;
				resultRead satisfies typeof objectWithAlternatingRecursion;
			});

			it("simple json (`JsonTypeWith<never>`)", () => {
				const resultRead = passThru(simpleJson);
				ContainsAny(resultRead) satisfies never;
				simpleJson satisfies typeof resultRead;
				resultRead satisfies typeof simpleJson;
			});

			it("non-const enum are supported as themselves", () => {
				// Note: typescript doesn't do a great job checking that a filtered type satisfies an enum
				// type. The numeric indices are not checked. So far most robust inspection is manually
				// after any change.
				passThru(NumericEnum) satisfies typeof NumericEnum;
				passThru(StringEnum) satisfies typeof StringEnum;
				passThru(ComputedEnum) satisfies typeof ComputedEnum;
			});

			// Class instances are indistinguishable from general objects by type checking.
			// They are considered supported despite loss of instanceof support after
			// deserialization.
			describe("class instance", () => {
				it("with public data (propagated)", () => {
					const instanceRead = passThru(classInstanceWithPublicData, {
						public: "public",
					}) satisfies typeof classInstanceWithPublicData;
					assert.ok(
						classInstanceWithPublicData instanceof ClassWithPublicData,
						"classInstanceWithPublicData is an instance of ClassWithPublicData",
					);
					assert.ok(
						!(instanceRead instanceof ClassWithPublicData),
						"instanceRead is not an instance of ClassWithPublicData",
					);
				});
				it("with public method (removes method)", () => {
					const instanceRead = passThru(classInstanceWithPublicMethod, {
						public: "public",
						// @ts-expect-error getSecret is missing, but required
					}) satisfies typeof classInstanceWithPublicMethod;
					assert.ok(
						classInstanceWithPublicMethod instanceof ClassWithPublicMethod,
						"classInstanceWithPublicMethod is an instance of ClassWithPublicMethod",
					);
					assert.ok(
						!(instanceRead instanceof ClassWithPublicMethod),
						"instanceRead is not an instance of ClassWithPublicMethod",
					);
				});
				// TO FIX: add option to ignore inaccessible members
				describe("with `ignore-inaccessible-members`", () => {
					it("with private method (removes method)", () => {
						const instanceRead = passThru(classInstanceWithPrivateMethod, {
							public: "public",
							// @ts-expect-error getSecret is missing, but required
						}) satisfies typeof classInstanceWithPrivateMethod;
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
							// @ts-expect-error secret is missing, but required
						}) satisfies typeof classInstanceWithPrivateGetter;
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
							// @ts-expect-error secret is missing, but required
						}) satisfies typeof classInstanceWithPrivateSetter;
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
							// @ts-expect-error secret is missing, but required
						}) satisfies typeof classInstanceWithPrivateData;
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
			});
		});

		describe("unsupported object types", () => {
			// These cases are demonstrating defects within the current implementation.
			// They show "allowed" incorrect use and the unexpected results.
			describe("known defect expectations", () => {
				describe("getters and setters preserved but do not propagate", () => {
					it("with `readonly` implemented via getter", () => {
						const resultRead = passThru(
							objectWithReadonlyViaGetter,
							// @ts-expect-error readonly is missing, but required
							{},
						);
						ContainsAny(resultRead) satisfies never;
						objectWithReadonlyViaGetter satisfies typeof resultRead;
						resultRead satisfies typeof objectWithReadonlyViaGetter;
					});

					it("with getter", () => {
						const resultRead = passThru(
							objectWithGetter,
							// @ts-expect-error getter is missing, but required
							{},
						);
						ContainsAny(resultRead) satisfies never;
						objectWithGetter satisfies typeof resultRead;
						resultRead satisfies typeof objectWithGetter;

						assert.throws(() => {
							// @ts-expect-error Cannot assign to 'getter' because it is a read-only property.
							objectWithGetter.getter = -1;
						}, new TypeError(
							"Cannot set property getter of #<ClassImplementsObjectWithGetter> which has only a getter",
						));
						// @ts-expect-error Cannot assign to 'getter' because it is a read-only property.
						resultRead.getter = -1;
					});

					it("with setter", () => {
						const resultRead = passThru(
							objectWithSetter,
							// @ts-expect-error setter is missing, but required
							{},
						);
						ContainsAny(resultRead) satisfies never;
						objectWithSetter satisfies typeof resultRead;
						resultRead satisfies typeof objectWithSetter;

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

					it("with matched getter and setter", () => {
						const resultRead = passThru(
							objectWithMatchedGetterAndSetterProperty,
							// @ts-expect-error property is missing, but required
							{},
						);
						ContainsAny(resultRead) satisfies never;
						objectWithMatchedGetterAndSetterProperty satisfies typeof resultRead;
						resultRead satisfies typeof objectWithMatchedGetterAndSetterProperty;
					});

					it("with mismatched getter and setter", () => {
						const resultRead = passThru(
							objectWithMismatchedGetterAndSetterProperty,
							// @ts-expect-error property is missing, but required
							{},
						);
						ContainsAny(resultRead) satisfies never;
						objectWithMismatchedGetterAndSetterProperty satisfies typeof resultRead;
						resultRead satisfies typeof objectWithMismatchedGetterAndSetterProperty;

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
				// @ts-expect-error `unknown` does not satisfy `JsonTypeWith<never>`
				unknownValueOfSimpleRecord satisfies typeof resultRead;
				resultRead satisfies JsonTypeWith<never>;
				ContainsAny(resultRead) satisfies never;
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
			it("`function` becomes `never`", () => {
				passThruThrows(
					aFunction,
					new SyntaxError("Unexpected token u in JSON at position 0"),
				) satisfies never;
			});
			it("`object` (plain object) becomes non-null Json object", () => {
				const resultRead = passThru(
					object,
					// object's value is actually supported; so, no runtime error.
				);
				resultRead satisfies NonNullJsonObject;
				ContainsAny(resultRead) satisfies never;
			});
			it("`void` becomes `never`", () => {
				passThru(
					voidValue,
					// voidValue is actually `null`; so, no runtime error.
				) satisfies never;
			});
			describe("object", () => {
				describe("drops properties", () => {
					it("with exactly `bigint`", () => {
						const resultRead = passThruThrows(
							objectWithBigint,
							new TypeError("Do not know how to serialize a BigInt"),
						);
						// @ts-expect-error `bigint` missing
						resultRead satisfies typeof objectWithBigint;
						objectWithBigint satisfies typeof resultRead;
					});
					it("with exactly `symbol`", () => {
						passThru(
							objectWithSymbol,
							{},
							// @ts-expect-error `symbol` missing
						) satisfies typeof objectWithSymbol;
					});
					it("with exactly `function`", () => {
						passThru(
							objectWithFunction,
							{},
							// @ts-expect-error `function` missing
						) satisfies typeof objectWithFunction;
					});
					it("with exactly `Function | symbol`", () => {
						passThru(
							objectWithFunctionOrSymbol,
							{},
							// @ts-expect-error `functionOrSymbol` missing
						) satisfies typeof objectWithFunctionOrSymbol;
					});

					describe("of class instance", () => {
						it("with private method (becomes `DeserializationErrorPerNonPublicProperties`)", () => {
							const instanceRead = passThru(classInstanceWithPrivateMethod, {
								// @ts-expect-error DeserializationErrorPerNonPublicProperties
								public: "public",
							});
							instanceRead satisfies DeserializationErrorPerNonPublicProperties;
							// @ts-expect-error DeserializationErrorPerNonPublicProperties is missing ...
							instanceRead satisfies typeof classInstanceWithPrivateMethod;
							assert.ok(
								classInstanceWithPrivateMethod instanceof ClassWithPrivateMethod,
								"classInstanceWithPrivateMethod is an instance of ClassWithPrivateMethod",
							);
							assert.ok(
								!(instanceRead instanceof ClassWithPrivateMethod),
								"instanceRead is not an instance of ClassWithPrivateMethod",
							);
						});
						it("with private getter (becomes `DeserializationErrorPerNonPublicProperties`)", () => {
							const instanceRead = passThru(classInstanceWithPrivateGetter, {
								// @ts-expect-error DeserializationErrorPerNonPublicProperties
								public: "public",
							});
							instanceRead satisfies DeserializationErrorPerNonPublicProperties;
							// @ts-expect-error DeserializationErrorPerNonPublicProperties is missing ...
							instanceRead satisfies typeof classInstanceWithPrivateGetter;
							assert.ok(
								classInstanceWithPrivateGetter instanceof ClassWithPrivateGetter,
								"classInstanceWithPrivateGetter is an instance of ClassWithPrivateGetter",
							);
							assert.ok(
								!(instanceRead instanceof ClassWithPrivateGetter),
								"instanceRead is not an instance of ClassWithPrivateGetter",
							);
						});
						it("with private setter (becomes `DeserializationErrorPerNonPublicProperties`)", () => {
							const instanceRead = passThru(classInstanceWithPrivateSetter, {
								// @ts-expect-error DeserializationErrorPerNonPublicProperties
								public: "public",
							});
							instanceRead satisfies DeserializationErrorPerNonPublicProperties;
							// @ts-expect-error DeserializationErrorPerNonPublicProperties is missing ...
							instanceRead satisfies typeof classInstanceWithPrivateSetter;
							assert.ok(
								classInstanceWithPrivateSetter instanceof ClassWithPrivateSetter,
								"classInstanceWithPrivateSetter is an instance of ClassWithPrivateSetter",
							);
							assert.ok(
								!(instanceRead instanceof ClassWithPrivateSetter),
								"instanceRead is not an instance of ClassWithPrivateSetter",
							);
						});
					});
				});

				it("will only propagate with `string` for `bigint | string`", () => {
					const resultRead = passThru(
						objectWithBigintOrString,
						// value is a string; so no runtime error.
					);
					// @ts-expect-error { bigintOrString: string | bigint } does not satisfy { bigintOrString: string }
					objectWithBigintOrString satisfies typeof resultRead;
					resultRead satisfies { bigintOrString: string };
					ContainsAny(resultRead) satisfies never;
				});

				describe("class instance", () => {
					it("with private data becomes `DeserializationErrorPerNonPublicProperties` (but propagates)", () => {
						const instanceRead = passThru(classInstanceWithPrivateData, {
							// @ts-expect-error DeserializationErrorPerNonPublicProperties
							public: "public",
							secret: 0,
						});
						instanceRead satisfies DeserializationErrorPerNonPublicProperties;
						// @ts-expect-error DeserializationErrorPerNonPublicProperties is missing ...
						instanceRead satisfies typeof classInstanceWithPrivateData;
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
			resultRead satisfies JsonTypeWith<never>;
			ContainsAny(resultRead) satisfies never;
		});

		describe("possibly `undefined` property is only supported as optional", () => {
			describe("with `undefined` in union property becomes optional", () => {
				it("with undefined value", () => {
					const objectWithNumberOrUndefinedUndefinedRead = passThru(
						objectWithNumberOrUndefinedUndefined,
						{},
					);
					// @ts-expect-error `numOrUndef` property (required) should no longer be required
					objectWithNumberOrUndefinedUndefinedRead satisfies ObjectWithNumberOrUndefined;
					objectWithNumberOrUndefinedUndefinedRead satisfies Partial<ObjectWithNumberOrUndefined>;
				});

				it("with defined value", () => {
					const objectWithNumberOrUndefinedNumberedRead = passThru(
						objectWithNumberOrUndefinedNumbered,
					);
					// @ts-expect-error `numOrUndef` property (required) should no longer be required
					objectWithNumberOrUndefinedNumberedRead satisfies ObjectWithNumberOrUndefined;
					objectWithNumberOrUndefinedNumberedRead satisfies Partial<ObjectWithNumberOrUndefined>;
				});
			});

			describe("with optional property remains optional", () => {
				it("without property", () => {
					const objectWithOptionalNumberNotPresentRead = passThru(
						objectWithOptionalNumberNotPresent,
					);
					objectWithOptionalNumberNotPresentRead satisfies ObjectWithOptionalNumber;
				});
				it("with undefined value", () => {
					const objectWithOptionalNumberUndefinedRead = passThru(
						objectWithOptionalNumberUndefined,
						{},
					);
					objectWithOptionalNumberUndefinedRead satisfies ObjectWithOptionalNumber;
				});
				it("with defined value", () => {
					const objectWithOptionalNumberDefinedRead = passThru(
						objectWithOptionalNumberDefined,
					);
					objectWithOptionalNumberDefinedRead satisfies ObjectWithOptionalNumber;
				});
			});
		});

		it("`undefined` property is erased", () => {
			const objectWithUndefinedRead = passThru(objectWithUndefined, {});
			// @ts-expect-error `undef` property (required) should no longer exist
			objectWithUndefinedRead satisfies typeof objectWithUndefined;
			emptyObject satisfies typeof objectWithUndefinedRead;

			const objectWithOptionalUndefinedRead = passThru(objectWithOptionalUndefined, {});
			objectWithOptionalUndefinedRead satisfies typeof objectWithOptionalUndefined;
			emptyObject satisfies typeof objectWithOptionalUndefinedRead;
		});

		it("`never` property is filtered away", () => {
			// @ts-expect-error `never` property (type never) should not be preserved
			passThru(objectWithNever) satisfies typeof objectWithNever;
			passThru(objectWithNever) satisfies Omit<typeof objectWithNever, "never">;
		});

		describe("using replaced types", () => {
			describe("are preserved", () => {
				it("`bigint`", () => {
					passThruHandlingBigint(bigint) satisfies bigint;
				});
				it("object with `bigint`", () => {
					passThruHandlingBigint(objectWithBigint) satisfies typeof objectWithBigint;
				});
				it("object with optional `bigint`", () => {
					passThruHandlingBigint(
						objectWithOptionalBigint,
					) satisfies typeof objectWithOptionalBigint;
				});
			});

			describe("continue rejecting unsupported that are not replaced", () => {
				it("`unknown` (simple object) becomes `JsonTypeWith<bigint>`", () => {
					const resultRead = passThruHandlingBigint(
						unknownValueOfSimpleRecord,
						// value is actually supported; so, no runtime error.
					);
					// @ts-expect-error `unknown` does not satisfy `JsonTypeWith<bigint>`
					unknownValueOfSimpleRecord satisfies typeof resultRead;
					resultRead satisfies JsonTypeWith<bigint>;
				});
				it("`unknown` (with bigint) becomes `JsonTypeWith<bigint>`", () => {
					const resultRead = passThruHandlingBigint(
						unknownValueWithBigint,
						// value is actually supported; so, no runtime error.
					);
					// @ts-expect-error `unknown` does not satisfy `JsonTypeWith<bigint>`
					unknownValueWithBigint satisfies typeof resultRead;
					resultRead satisfies JsonTypeWith<bigint>;
				});
				it("`symbol` still becomes `never`", () => {
					passThruHandlingBigintThrows(
						symbol,
						new SyntaxError("Unexpected token u in JSON at position 0"),
					) satisfies never;
				});
				it("`object` (plain object) still becomes non-null Json object", () => {
					passThruHandlingBigint(
						object,
						// object's value is actually supported; so, no runtime error.
					) satisfies NonNullJsonObject;
				});
			});
		});
	});
});
