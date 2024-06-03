/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { JsonDeserialized } from "../jsonDeserialized.js";

/* eslint-disable unicorn/no-null */

// TODO: add testing infrastructure
function describe(desc: string, test: () => void): void {
	test();
}
const it = describe;

function passThru<T>(v: JsonDeserialized<T>): JsonDeserialized<T> {
	return JSON.parse(JSON.stringify(v)) as JsonDeserialized<T>;
}

const boolean: boolean = true;
const number: number = 0;
const string: string = "";
const symbol = Symbol("symbol");
const uniqueSymbol: unique symbol = Symbol("unique symbol");
const bigint: bigint = 0n;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const aFunction = (): any => {};
const voidValue = null as unknown as void;
const never = null as never;
enum NumericEnum {
	zero,
	one,
	two,
}
enum StringEnum {
	a = "a",
	b = "b",
}
const enum ConstHeterogenousEnum {
	zero,
	a = "a",
}
enum ComputedEnum {
	fixed,
	computed = passThru(5),
}
// Define these enum values with functions to avoid static analysis determining their specific value.
const numericEnumValue = ((): NumericEnum => NumericEnum.one)();
const stringEnumValue = ((): StringEnum => StringEnum.a)();
const constHeterogenousEnumValue = ((): ConstHeterogenousEnum => ConstHeterogenousEnum.a)();
const computedEnumValue = ((): ComputedEnum => ComputedEnum.computed)();

const object: object = { key: "value" };
const emptyObject = {};
const objectWithUndefined = {
	undef: undefined,
};
const objectWithOptionalUndefined: {
	optUndef?: undefined;
} = { optUndef: undefined };
const objectWithOptionalNumber: {
	optNumber?: number;
} = { optNumber: undefined };
const objectWithNumberOrUndefined: {
	numOrUndef: number | undefined;
} = { numOrUndef: undefined };
const objectWithNever = {
	never,
};
const objectWithLiterals = {
	true: true,
	false: false,
	zero: 0,
	string: "string",
	null: null,
} as const;
const tupleWithLiterals = [true, false, 0, "string", null, 1e113] as const;
const arrayOfLiterals: readonly (
	| true
	| 0
	| 1
	| "string"
	| "hello"
	// eslint-disable-next-line @rushstack/no-new-null
	| null
)[] = [true, 0, 1, "string", "hello", null];

describe("JsonDeserialized", () => {
	// Positive compilation tests

	it("supported primitive types are preserved", () => {
		passThru(boolean) satisfies boolean;
		passThru(number) satisfies number;
		passThru(string) satisfies string;
		passThru(numericEnumValue) satisfies NumericEnum;
		passThru(stringEnumValue) satisfies StringEnum;
		passThru(constHeterogenousEnumValue) satisfies ConstHeterogenousEnum;
		passThru(computedEnumValue) satisfies ComputedEnum;
	});

	it("supported literal types are preserved", () => {
		passThru(true) satisfies true;
		passThru(false) satisfies false;
		passThru(0) satisfies 0;
		passThru("string") satisfies "string";
		passThru(null) satisfies null;
		passThru(objectWithLiterals) satisfies typeof objectWithLiterals;
		passThru(arrayOfLiterals) satisfies typeof arrayOfLiterals;
		passThru(tupleWithLiterals) satisfies typeof tupleWithLiterals;
		passThru(NumericEnum.two) satisfies NumericEnum.two;
		passThru(StringEnum.b) satisfies StringEnum.b;
		passThru(ConstHeterogenousEnum.zero) satisfies ConstHeterogenousEnum.zero;
		passThru(ComputedEnum.computed) satisfies ComputedEnum.computed;
	});

	it("empty object is supported", () => {
		passThru(emptyObject) satisfies typeof emptyObject;
	});

	it("unsupported types cause compiler error", () => {
		// @ts-expect-error `undefined` is not supported (becomes `never`)
		passThru(undefined);
		// @ts-expect-error `unknown` is not supported (expects `JsonTypeWith<never>`)
		passThru({} as unknown);
		// @ts-expect-error `symbol` is not supported (becomes `never`)
		passThru(symbol);
		// @ts-expect-error [unique] `symbol` is not supported (becomes `never`)
		passThru(uniqueSymbol);
		// @ts-expect-error `bigint` is not supported (becomes `never`)
		passThru(bigint);
		// @ts-expect-error `Function` is not supported (becomes `never`)
		passThru(aFunction);
		// @ts-expect-error `unknown` is not supported (expects `JsonTypeWith<never>`)
		passThru(object);
		// @ts-expect-error `void` is not supported (becomes `never`)
		passThru(voidValue);
		// @ts-expect-error `const enums` are not accessible for reading
		passThru(ConstHeterogenousEnum);
	});

	it("explicit `any` generic still limits allowed types", () => {
		// @ts-expect-error `any` is not an open door (expects `JsonTypeWith<never>`)
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		passThru<any>(undefined);
	});

	it("possibly `undefined` property is only supported as optional", () => {
		const objectWithNumberOrUndefinedRead = passThru(objectWithNumberOrUndefined);
		// @ts-expect-error `numOrUndef` property (required) should no longer be required
		objectWithNumberOrUndefinedRead satisfies typeof objectWithNumberOrUndefined;
		objectWithNumberOrUndefinedRead satisfies Partial<typeof objectWithNumberOrUndefined>;

		const objectWithOptionalNumberRead = passThru(objectWithOptionalNumber);
		objectWithOptionalNumberRead satisfies typeof objectWithOptionalNumber;
	});

	it("`undefined` property is erased", () => {
		const objectWithUndefinedRead = passThru(objectWithUndefined);
		// @ts-expect-error `undef` property (required) should no longer exist
		objectWithUndefinedRead satisfies typeof objectWithUndefined;
		emptyObject satisfies typeof objectWithUndefinedRead;

		const objectWithOptionalUndefinedRead = passThru(objectWithOptionalUndefined);
		objectWithOptionalUndefinedRead satisfies typeof objectWithOptionalUndefined;
		emptyObject satisfies typeof objectWithOptionalUndefinedRead;
	});

	it("never property is filtered away", () => {
		// @ts-expect-error `never` property (type never) should not be preserved
		passThru(objectWithNever) satisfies typeof objectWithNever;
		passThru(objectWithNever) satisfies Omit<typeof objectWithNever, "never">;
	});

	it("non-const enum are supported as themselves", () => {
		// Note: typescript doesn't do a great job checking that a filtered type satisfies an enum
		// type. The numeric indices are not checked. So far most robust inspection is manually
		// after any change.
		passThru(NumericEnum) satisfies typeof NumericEnum;
		passThru(StringEnum) satisfies typeof StringEnum;
		passThru(ComputedEnum) satisfies typeof ComputedEnum;
	});
});

/* eslint-enable unicorn/no-null */
