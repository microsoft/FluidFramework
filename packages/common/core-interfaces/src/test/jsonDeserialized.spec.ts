/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

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
	unknownValue,
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
	objectWithUndefined,
	objectWithOptionalUndefined,
	objectWithOptionalNumberNotPresent,
	objectWithOptionalNumberUndefined,
	objectWithOptionalNumberDefined,
	objectWithNumberOrUndefinedUndefined,
	objectWithNumberOrUndefinedNumbered,
	objectWithNever,
	objectWithPossibleRecursion,
	objectWithRecursion,
	simpleJson,
	classInstanceWithPrivateData,
	classInstanceWithPrivateMethod,
	classInstanceWithPrivateGetter,
	classInstanceWithPrivateSetter,
	classInstanceWithPublicData,
	classInstanceWithPublicMethod,
	classInstanceWithPublicGetter,
	classInstanceWithPublicSetter,
	ClassWithPrivateData,
	ClassWithPrivateMethod,
	ClassWithPrivateGetter,
	ClassWithPrivateSetter,
	ClassWithPublicData,
	ClassWithPublicMethod,
	ClassWithPublicGetter,
	ClassWithPublicSetter,
} from "./testValues.js";

/**
 * Defined using `JsonDeserialized` type filter tests `JsonDeserialized` at call site.
 * Internally value given is round-tripped through JSON serialization to ensure it is
 * unchanged or converted to given optional value.
 *
 * @param v - value to pass through JSON serialization
 * @param expected - alternate value to compare against after round-trip
 * @returns the round-tripped value
 */
function passThru<T>(v: JsonDeserialized<T>, expected?: JsonDeserialized<T>): JsonDeserialized<T> {
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
function passThruThrows<T>(v: JsonDeserialized<T>, expectedThrow: Error): JsonDeserialized<T> {
	assert.throws(() => passThru(v), expectedThrow);
	return undefined as unknown as JsonDeserialized<T>;
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
				passThru(arrayOfLiterals) satisfies typeof arrayOfLiterals;
			});
			it("tuple of literals", () => {
				passThru(tupleWithLiterals) satisfies typeof tupleWithLiterals;
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
				passThru(ComputedEnum.computed) satisfies ComputedEnum.computed;
			});
		});

		describe("supported object types", () => {
			it("empty object", () => {
				passThru(emptyObject) satisfies typeof emptyObject;
			});

			it("with `boolean`", () => {
				passThru(objectWithBoolean) satisfies typeof objectWithBoolean;
			});
			it("with `number`", () => {
				passThru(objectWithNumber) satisfies typeof objectWithNumber;
			});
			it("with `string`", () => {
				passThru(objectWithString) satisfies typeof objectWithString;
			});

			it("object with possible type recursion through union", () => {
				passThru(objectWithPossibleRecursion) satisfies typeof objectWithPossibleRecursion;
			});

			it("object with optional type recursion", () => {
				// FIX: @ts-expect-error typeof `objectWithRecursion` is recursive
				passThru(
					objectWithRecursion,
					// no error
				) satisfies typeof objectWithRecursion;
			});

			it("simple json (`JsonTypeWith<never>`)", () => {
				// FIX: @ts-expect-error `JsonTypeWith<never>` is recursive
				passThru(
					simpleJson,
					// no error
				) satisfies typeof simpleJson;
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
			// Non-public (non-function) members are preserved, but they are filtered away
			// by the type filters and thus produce an incorrectly narrowed type. Though
			// such a result may be customer desired.
			// Additionally because non-public members are not observed by type mapping,
			// objects with private functions are not appropriately rejected.
			// Perhaps a https://github.com/microsoft/TypeScript/issues/22677 fix will
			// enable support.
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
			});
		});

		describe("unsupported object types", () => {
			// These cases are demonstrating defects within the current implementation.
			// They show "allowed" incorrect use and the unexpected results.
			describe("known defect expectations", () => {
				describe("class instance", () => {
					it("with public getter (preserves getter that doesn't propagate)", () => {
						const instanceRead = passThru(
							classInstanceWithPublicGetter,
							// @ts-expect-error secret is missing, but required
							{
								public: "public",
							},
						) satisfies typeof classInstanceWithPublicGetter;
						assert.ok(
							classInstanceWithPublicGetter instanceof ClassWithPublicGetter,
							"classInstanceWithPublicGetter is an instance of ClassWithPublicGetter",
						);
						assert.ok(
							!(instanceRead instanceof ClassWithPublicGetter),
							"instanceRead is not an instance of ClassWithPublicGetter",
						);
					});
					it("with public setter (add value that doesn't propagate)", () => {
						const instanceRead = passThru(
							classInstanceWithPublicSetter,
							// @ts-expect-error secret is missing, but required
							{
								public: "public",
							},
						) satisfies typeof classInstanceWithPublicSetter;
						assert.ok(
							classInstanceWithPublicSetter instanceof ClassWithPublicSetter,
							"classInstanceWithPublicSetter is an instance of ClassWithPublicSetter",
						);
						assert.ok(
							!(instanceRead instanceof ClassWithPublicSetter),
							"instanceRead is not an instance of ClassWithPublicSetter",
						);
					});
					it("with private data (hides private data that propagates)", () => {
						const instanceRead = passThru(classInstanceWithPrivateData, {
							public: "public",
							// @ts-expect-error secret is not allowed but is present
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
					// @ts-expect-error `undefined` is not supported (becomes `never`)
					undefined,
					new SyntaxError("Unexpected token u in JSON at position 0"),
				) satisfies never;
			});
			it("`unknown` becomes `JsonTypeWith<never>`", () => {
				const resultRead = passThru(
					// @ts-expect-error `unknown` is not supported (expects `JsonTypeWith<never>`)
					unknownValue,
					// value is actually supported; so, no runtime error.
				);
				// @ts-expect-error `unknown` does not satisfy `JsonTypeWith<never>`
				unknownValue satisfies typeof resultRead;
				resultRead satisfies JsonTypeWith<never>;
			});
			it("`symbol` becomes `never`", () => {
				passThruThrows(
					// @ts-expect-error `symbol` is not supported (becomes `never`)
					symbol,
					new SyntaxError("Unexpected token u in JSON at position 0"),
				) satisfies never;
			});
			it("`unique symbol` becomes `never`", () => {
				passThruThrows(
					// @ts-expect-error [unique] `symbol` is not supported (becomes `never`)
					uniqueSymbol,
					new SyntaxError("Unexpected token u in JSON at position 0"),
				) satisfies never;
			});
			it("`bigint` becomes `never`", () => {
				passThruThrows(
					// @ts-expect-error `bigint` is not supported (becomes `never`)
					bigint,
					new TypeError("Do not know how to serialize a BigInt"),
				) satisfies never;
			});
			it("`function` becomes `never`", () => {
				passThruThrows(
					// @ts-expect-error `Function` is not supported (becomes `never`)
					aFunction,
					new SyntaxError("Unexpected token u in JSON at position 0"),
				) satisfies never;
			});
			it("`object` (plain object) becomes non-null Json object", () => {
				passThru(
					// @ts-expect-error `unknown` is not supported (expects `JsonTypeWith<never>`)
					object,
					// object's value is actually supported; so, no runtime error.
				) satisfies NonNullJsonObject;
			});
			it("`void` becomes `never`", () => {
				passThru(
					// @ts-expect-error `void` is not supported (becomes `never`)
					voidValue,
					// voidValue is actually `null`; so, no runtime error.
				) satisfies never;
			});
			describe("object", () => {
				describe("drops properties", () => {
					it("with exactly `bigint`", () => {
						const resultRead = passThruThrows(
							// @ts-expect-error `bigint` is not supported (becomes `never`)
							objectWithBigint,
							new TypeError("Do not know how to serialize a BigInt"),
						);
						// @ts-expect-error `bigint` missing
						resultRead satisfies typeof objectWithBigint;
						objectWithBigint satisfies typeof resultRead;
					});
					it("with exactly `symbol`", () => {
						passThru(
							// @ts-expect-error `symbol` is not supported (becomes `never`)
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
				});
				it("will only propagate with `string` for `bigint | string`", () => {
					const resultRead = passThru(
						// @ts-expect-error `bigint` | `string` is not assignable to `string`
						objectWithBigintOrString,
						// value is a string; so no runtime error.
					);
					// @ts-expect-error { bigintOrString: string | bigint } does not satisfy { bigintOrString: string }
					objectWithBigintOrString satisfies typeof resultRead;
					resultRead satisfies { bigintOrString: string };
				});
			});
		});

		it("explicit `any` generic still limits allowed types", () => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			passThruThrows<any>(
				// @ts-expect-error `any` is not an open door (expects `JsonTypeWith<never>`)
				undefined,
				new SyntaxError("Unexpected token u in JSON at position 0"),
			);
		});
	});

	describe("special cases", () => {
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
	});
});
