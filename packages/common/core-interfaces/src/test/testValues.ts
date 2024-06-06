/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable jsdoc/require-jsdoc */
/* eslint-disable unicorn/no-null */

export const boolean: boolean = true as boolean; // Use `as` to avoid type conversion to `true`

export const number: number = 0;
export const string: string = "";
export const symbol = Symbol("symbol");
export const uniqueSymbol: unique symbol = Symbol("unique symbol");
export const bigint: bigint = 0n;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const aFunction = (): any => {};
export const voidValue = null as unknown as void;
const never = null as never;
export enum NumericEnum {
	zero,
	one,
	two,
}
export enum StringEnum {
	a = "a",
	b = "b",
}
export const enum ConstHeterogenousEnum {
	zero,
	a = "a",
}
export enum ComputedEnum {
	fixed,
	computed = (<T>(v: T): T => v)(5),
}
// Define these enum values with functions to avoid static analysis determining their specific value.
export const numericEnumValue = ((): NumericEnum => NumericEnum.one)();
export const stringEnumValue = ((): StringEnum => StringEnum.a)();
export const constHeterogenousEnumValue = ((): ConstHeterogenousEnum => ConstHeterogenousEnum.a)();
export const computedEnumValue = ((): ComputedEnum => ComputedEnum.computed)();
export const object: object = { key: "value" };
export const emptyObject = {};
export const objectWithUndefined = {
	undef: undefined,
};
export const objectWithOptionalUndefined: {
	optUndef?: undefined;
} = { optUndef: undefined };
export interface ObjectWithOptionalNumber {
	optNumber?: number;
}
export const objectWithOptionalNumberNotPresent: ObjectWithOptionalNumber = {};
export const objectWithOptionalNumberUndefined: ObjectWithOptionalNumber = { optNumber: undefined };
export const objectWithOptionalNumberDefined: ObjectWithOptionalNumber = { optNumber: 4 };
export interface ObjectWithNumberOrUndefined {
	numOrUndef: number | undefined;
}
export const objectWithNumberOrUndefinedUndefined: ObjectWithNumberOrUndefined = {
	numOrUndef: undefined,
};
export const objectWithNumberOrUndefinedNumbered: ObjectWithNumberOrUndefined = { numOrUndef: 5.2 };
export const objectWithNever = {
	never,
};
export const objectWithLiterals = {
	true: true,
	false: false,
	zero: 0,
	string: "string",
	null: null,
} as const;
export const tupleWithLiterals = [true, false, 0, "string", null, 1e113] as const;
export const arrayOfLiterals: readonly (
	| true
	| 0
	| 1
	| "string"
	| "hello"
	// eslint-disable-next-line @rushstack/no-new-null
	| null
)[] = [true, 0, 1, "string", "hello", null];
export class ClassWithPrivateData {
	public public = "public";
	// @ts-expect-error secret is never read
	private readonly secret = 0;
}
export const classInstanceWithPrivateData = new ClassWithPrivateData();
export class ClassWithPrivateMethod {
	public public = "public";
	// @ts-expect-error getSecret is never read
	private getSecret(): number {
		return 0;
	}
}
export const classInstanceWithPrivateMethod = new ClassWithPrivateMethod();
export class ClassWithPrivateGetter {
	public public = "public";
	// @ts-expect-error secret is never read
	private get secret(): number {
		return this.public.length;
	}
}
export const classInstanceWithPrivateGetter = new ClassWithPrivateGetter();
export class ClassWithPrivateSetter {
	public public = "public";
	// @ts-expect-error secret is never read
	private set secret(v: string) {
		this.public = v;
	}
}
export const classInstanceWithPrivateSetter = new ClassWithPrivateSetter();
export class ClassWithPublicData {
	public public = "public";
}
export const classInstanceWithPublicData = new ClassWithPublicData();
export class ClassWithPublicMethod {
	public public = "public";
	public getSecret(): number {
		return 0;
	}
}
export const classInstanceWithPublicMethod = new ClassWithPublicMethod();
export class ClassWithPublicGetter {
	public public = "public";
	public get secret(): number {
		return this.public.length;
	}
}
export const classInstanceWithPublicGetter = new ClassWithPublicGetter();
export class ClassWithPublicSetter {
	public public = "public";
	public set secret(v: string) {
		this.public = v;
	}
}
export const classInstanceWithPublicSetter = new ClassWithPublicSetter();
