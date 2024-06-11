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
	symbol,
	uniqueSymbol,
	bigint,
	aFunction,
	voidValue,
	emptyObject,
	object,
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
	objectWithOptionalUndefinedEnclosingRequiredUndefined,
	objectWithNever,
	objectWithPossibleRecursion,
	objectWithRecursion,
	objectWithEmbeddedRecursion,
	objectWithAlternatingRecursion,
	objectWithSelfReference,
	objectWithSymbolAndRecursion,
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
	ClassWithPublicGetter,
	ClassWithPublicSetter,
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

		describe("supported literal types", () => {
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

			it("with `boolean`", () => {
				passThru(objectWithBoolean) satisfies typeof objectWithBoolean;
			});
			it("with `number`", () => {
				passThru(objectWithNumber) satisfies typeof objectWithNumber;
			});
			it("with `string`", () => {
				passThru(objectWithString) satisfies typeof objectWithString;
			});

			it("object with optional `undefined` property is supported", () => {
				passThru(
					objectWithOptionalUndefined,
					{},
				) satisfies typeof objectWithOptionalUndefined;
			});

			it("object with possible type recursion through union", () => {
				passThru(objectWithPossibleRecursion) satisfies typeof objectWithPossibleRecursion;
			});

			it("object with optional type recursion", () => {
				passThru(objectWithRecursion) satisfies typeof objectWithRecursion;
			});

			it("object with deep type recursion", () => {
				passThru(objectWithEmbeddedRecursion) satisfies typeof objectWithEmbeddedRecursion;
			});

			it("object with alternating type recursion", () => {
				passThru(
					objectWithAlternatingRecursion,
				) satisfies typeof objectWithAlternatingRecursion;
			});

			it("simple json (JsonTypeWith<never>)", () => {
				passThru(simpleJson) satisfies typeof simpleJson;
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
				it("with private getter (removes getter)", () => {
					const instanceResult = passThru(classInstanceWithPrivateGetter, {
						public: "public",
						// @ts-expect-error secret is missing, but required
					}) satisfies typeof classInstanceWithPrivateGetter;
					assert.ok(
						classInstanceWithPrivateGetter instanceof ClassWithPrivateGetter,
						"classInstanceWithPrivateGetter is an instance of ClassWithPrivateGetter",
					);
					assert.ok(
						!(instanceResult instanceof ClassWithPrivateGetter),
						"instanceResult is not an instance of ClassWithPrivateGetter",
					);
				});
				it("with private setter (removes setter)", () => {
					const instanceResult = passThru(classInstanceWithPrivateSetter, {
						public: "public",
						// @ts-expect-error secret is missing, but required
					}) satisfies typeof classInstanceWithPrivateSetter;
					assert.ok(
						classInstanceWithPrivateSetter instanceof ClassWithPrivateSetter,
						"classInstanceWithPrivateSetter is an instance of ClassWithPrivateSetter",
					);
					assert.ok(
						!(instanceResult instanceof ClassWithPrivateSetter),
						"instanceResult is not an instance of ClassWithPrivateSetter",
					);
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
				// Class instances are indistinguishable from general objects by type checking.
				// Non-public (non-function) members are preserved, but they are filtered away
				// by the type filters and thus produce an incorrectly narrowed type. Though
				// such a result may be customer desired.
				// Additionally because non-public members are not observed by type mapping,
				// objects with private functions are not appropriately rejected.
				// Perhaps a https://github.com/microsoft/TypeScript/issues/22677 fix will
				// enable support.
				describe("class instance", () => {
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
					it("with public getter (preserves getter that doesn't propagate)", () => {
						const instanceResult = passThru(
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
							!(instanceResult instanceof ClassWithPublicGetter),
							"instanceResult is not an instance of ClassWithPublicGetter",
						);
					});
					it("with public setter (add value that doesn't propagate)", () => {
						const instanceResult = passThru(
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
							!(instanceResult instanceof ClassWithPublicSetter),
							"instanceResult is not an instance of ClassWithPublicSetter",
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

		describe("unsupported types cause compiler error", () => {
			it("`undefined`", () => {
				passThruThrows(
					// @ts-expect-error `undefined` is not supported (becomes `never`)
					undefined,
					new SyntaxError("Unexpected token u in JSON at position 0"),
				);
			});
			it("`unknown`", () => {
				passThru(
					// @ts-expect-error `unknown` is not supported (expects `JsonTypeWith<never>`)
					{} as unknown,
				); // {} value is actually supported; so, no runtime error.
			});
			it("`symbol`", () => {
				passThruThrows(
					// @ts-expect-error `symbol` is not supported (becomes `never`)
					symbol,
					new SyntaxError("Unexpected token u in JSON at position 0"),
				);
			});
			it("`unique symbol`", () => {
				passThruThrows(
					// @ts-expect-error [unique] `symbol` is not supported (becomes `never`)
					uniqueSymbol,
					new SyntaxError("Unexpected token u in JSON at position 0"),
				);
			});
			it("`bigint`", () => {
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
			it("`object`", () => {
				passThru(
					// @ts-expect-error `object` is not supported (expects `JsonTypeWith<never>`)
					object,
				); // object's value is actually supported; so, no runtime error.
			});
			it("`void`", () => {
				passThru(
					// @ts-expect-error `void` is not supported (becomes `never`)
					voidValue,
				); // voidValue is actually `null`; so, no runtime error.
			});

			describe("object types", () => {
				it("with `bigint`", () => {
					passThruThrows(
						// @ts-expect-error `bigint` is not supported (becomes `never`)
						objectWithBigint,
						new TypeError("Do not know how to serialize a BigInt"),
					);
				});
				it("with `symbol`", () => {
					passThru(
						// @ts-expect-error `symbol` is not supported (becomes `never`)
						objectWithSymbol,
						{},
					);
				});
				it("with function", () => {
					passThru(
						// @ts-expect-error `Function` is not supported (becomes `never`)
						objectWithFunction,
						{},
					);
				});
				it("with `bigint | string`", () => {
					passThru(
						// @ts-expect-error `bigint` | `string` is not assignable to `string`
						objectWithBigintOrString,
						// value is a string; so no runtime error.
					);
				});

				it("with recursion and `symbol`", () => {
					passThru(
						// @ts-expect-error 'ObjectWithSymbolAndRecursion' is not assignable to parameter of type '{ recurse: { recurse: ObjectWithSymbolAndRecursion; }; }' (`symbol` becomes `never`)
						objectWithSymbolAndRecursion,
						// JsonDeserialized does not yet handle recursive types, but we use filter here as the general expectation.
						// @ts-expect-error 'recurse' circularly references itself in mapped type '{ [K in "recurse"]: JsonDeserialized<ObjectWithSymbolAndRecursion[K], never>; }'
						{ recurse: {} },
					);
				});

				describe("with `undefined`", () => {
					it("as exact property type", () => {
						passThru(
							// @ts-expect-error not assignable to `{ "error required property may not allow undefined value": never; }`
							objectWithUndefined,
							{},
						);
					});
					it("in union property", () => {
						passThru(
							// @ts-expect-error not assignable to `{ "error required property may not allow undefined value": never; }`
							objectWithNumberOrUndefinedUndefined,
							{},
						);
						passThru(
							// @ts-expect-error not assignable to `{ "error required property may not allow undefined value": never; }`
							objectWithNumberOrUndefinedNumbered,
						);
					});
					it("under an optional property", () => {
						passThru(
							// @ts-expect-error not assignable to `{ "error required property may not allow undefined value": never; }`
							objectWithOptionalUndefinedEnclosingRequiredUndefined,
							{ opt: {} },
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

		it("`never` property is accepted", () => {
			passThru(objectWithNever) satisfies typeof objectWithNever;
			passThru(objectWithNever) satisfies Omit<typeof objectWithNever, "never">;
		});
	});
});
