/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { JsonDeserialized } from "../jsonDeserialized.js";
import type { JsonSerializable } from "../jsonSerializable.js";

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
	emptyObject,
	objectWithOptionalUndefined,
	symbol,
	uniqueSymbol,
	bigint,
	aFunction,
	object,
	voidValue,
	objectWithUndefined,
	objectWithNumberOrUndefinedUndefined,
	objectWithNumberOrUndefinedNumbered,
	objectWithOptionalNumberNotPresent,
	objectWithOptionalNumberUndefined,
	objectWithOptionalNumberDefined,
	objectWithNever,
	classInstanceWithPrivateData,
	classInstanceWithPrivateMethod,
	classInstanceWithPublicData,
	classInstanceWithPublicMethod,
	ClassWithPrivateData,
	ClassWithPrivateMethod,
	ClassWithPublicData,
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
function passThru<T>(v: JsonSerializable<T>, expected?: JsonDeserialized<T>): JsonSerializable<T> {
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
 */
function passThruThrows<T>(v: JsonSerializable<T>, expectedThrow: Error): void {
	assert.throws(() => passThru(v), expectedThrow);
}

describe("JsonSerializable", () => {
	describe("positive compilation tests", () => {
		describe("supported primitive types", () => {
			it("boolean", () => {
				passThru(boolean) satisfies boolean;
			});
			it("number", () => {
				passThru(number) satisfies number;
			});
			it("string", () => {
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

		describe("supported literal types", () => {
			it("true", () => {
				passThru(true) satisfies true;
			});
			it("false", () => {
				passThru(false) satisfies false;
			});
			it("0", () => {
				passThru(0) satisfies 0;
			});
			it('"string"', () => {
				passThru("string") satisfies "string";
			});
			it("null", () => {
				// eslint-disable-next-line unicorn/no-null
				passThru(null) satisfies null;
			});
			it("object with literals", () => {
				const objectResult = passThru(
					objectWithLiterals,
				) satisfies typeof objectWithLiterals;
				assert.ok(
					objectWithLiterals instanceof Object,
					"objectWithLiterals is at least a plain Object",
				);
				assert.ok(
					objectResult instanceof objectWithLiterals.constructor,
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
			it("empty object is supported", () => {
				passThru(emptyObject) satisfies typeof emptyObject;
			});

			it("object with optional `undefined` property is supported", () => {
				passThru(
					objectWithOptionalUndefined,
					{},
				) satisfies typeof objectWithOptionalUndefined;
			});

			it("non-const enums are supported as themselves", () => {
				// Note: typescript doesn't do a great job checking that a filtered type satisfies an enum
				// type. The numeric indices are not checked. So far most robust inspection is manually
				// after any change.
				passThru(NumericEnum) satisfies typeof NumericEnum;
				passThru(StringEnum) satisfies typeof StringEnum;
				passThru(ComputedEnum) satisfies typeof ComputedEnum;
			});

			describe("class instance", () => {
				it("with public data (just cares about data)", () => {
					const instanceResult = passThru(classInstanceWithPublicData, {
						public: "public",
					}) satisfies typeof classInstanceWithPublicData;
					assert.ok(
						classInstanceWithPublicData instanceof ClassWithPublicData,
						"classInstanceWithPublicData is an instance of ClassWithPublicData",
					);
					assert.ok(
						!(instanceResult instanceof ClassWithPublicData),
						"instanceResult is not an instance of ClassWithPublicData",
					);
				});
			});
		});
		describe("unsupported object types", () => {
			// Class instances are indistinguishable from general objects by type checking.
			// Non-public (non-function) members are preserved, but they are filtered away
			// by the type filters and thus produce an incorrectly narrowed type. Though
			// such a result may be customer desired.
			// Additionally because non-public members are not observed by type mapping,
			// objects with private functions are not appropriately rejected.
			// Perhaps a https://github.com/microsoft/TypeScript/issues/22677 fix will
			// enable support.
			describe("class instance", () => {
				it("with private method (ignores private method)", () => {
					const instanceResult = passThru(classInstanceWithPrivateMethod, {
						public: "public",
						// @ts-expect-error Property 'getSecret' is missing
					}) satisfies typeof classInstanceWithPrivateMethod;
					assert.ok(
						classInstanceWithPrivateMethod instanceof ClassWithPrivateMethod,
						"classInstanceWithPrivateMethod is an instance of ClassWithPrivateMethod",
					);
					assert.ok(
						!(instanceResult instanceof ClassWithPrivateMethod),
						"instanceResult is not an instance of ClassWithPrivateMethod",
					);
				});
				it("with private data (ignores private data)", () => {
					const instanceResult = passThru(classInstanceWithPrivateData, {
						public: "public",
						// @ts-expect-error secret is not allowed but is present
						secret: 0,
						// @ts-expect-error Property 'secret' is missing
					}) satisfies typeof classInstanceWithPrivateData;
					assert.ok(
						classInstanceWithPrivateData instanceof ClassWithPrivateData,
						"classInstanceWithPrivateData is an instance of ClassWithPrivateData",
					);
					assert.ok(
						!(instanceResult instanceof ClassWithPrivateData),
						"instanceResult is not an instance of ClassWithPrivateData",
					);
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
			it("undefined", () => {
				passThruThrows(
					// @ts-expect-error `undefined` is not supported (becomes `never`)
					undefined,
					new SyntaxError("Unexpected token u in JSON at position 0"),
				);
			});
			it("unknown", () => {
				passThru(
					// @ts-expect-error `unknown` is not supported (expects `JsonTypeWith<never>`)
					{} as unknown,
				); // {} value is actually supported; so, no runtime error.
			});
			it("symbol", () => {
				passThruThrows(
					// @ts-expect-error `symbol` is not supported (becomes `never`)
					symbol,
					new SyntaxError("Unexpected token u in JSON at position 0"),
				);
			});
			it("unique symbol", () => {
				passThruThrows(
					// @ts-expect-error [unique] `symbol` is not supported (becomes `never`)
					uniqueSymbol,
					new SyntaxError("Unexpected token u in JSON at position 0"),
				);
			});
			it("bigint", () => {
				passThruThrows(
					// @ts-expect-error `bigint` is not supported (becomes `never`)
					bigint,
					new TypeError("Do not know how to serialize a BigInt"),
				);
			});
			it("function", () => {
				passThruThrows(
					// @ts-expect-error `Function` is not supported (becomes `never`)
					aFunction,
					new SyntaxError("Unexpected token u in JSON at position 0"),
				);
			});
			it("object", () => {
				passThru(
					// @ts-expect-error `unknown` is not supported (expects `JsonTypeWith<never>`)
					object,
				); // object's value is actually supported; so, no runtime error.
			});
			it("void", () => {
				passThru(
					// @ts-expect-error `void` is not supported (becomes `never`)
					voidValue,
				); // voidValue is actually `null`; so, no runtime error.
			});

			describe("object types", () => {
				describe("with `undefined`", () => {
					it("as exact property type", () => {
						passThru(
							// @ts-expect-error not assignable to "error-required-property-may-not-allow-undefined-value"
							objectWithUndefined,
							{},
						);
					});
					it("in union property", () => {
						passThru(
							// @ts-expect-error not assignable to "error-required-property-may-not-allow-undefined-value"
							objectWithNumberOrUndefinedUndefined,
							{},
						);
						passThru(
							// @ts-expect-error not assignable to "error-required-property-may-not-allow-undefined-value"
							objectWithNumberOrUndefinedNumbered,
						);
					});
				});
				describe("class instance", () => {
					it("with public method", () => {
						passThru(
							// @ts-expect-error function not assignable to never
							classInstanceWithPublicMethod,
							{ public: "public" },
						);
					});
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
			describe("with optional property remains optional", () => {
				it("without property", () => {
					passThru(
						objectWithOptionalNumberNotPresent,
					) satisfies typeof objectWithOptionalNumberNotPresent;
				});
				it("with undefined value", () => {
					passThru(
						objectWithOptionalNumberUndefined,
						{},
					) satisfies typeof objectWithOptionalNumberUndefined;
				});
				it("with defined value", () => {
					passThru(
						objectWithOptionalNumberDefined,
					) satisfies typeof objectWithOptionalNumberDefined;
				});
			});
		});

		it("never property is accepted", () => {
			passThru(objectWithNever) satisfies typeof objectWithNever;
			passThru(objectWithNever) satisfies Omit<typeof objectWithNever, "never">;
		});
	});
});
