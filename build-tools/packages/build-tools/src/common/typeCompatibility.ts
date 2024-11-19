/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// We use namespaces as part of type test generation
/* eslint-disable @typescript-eslint/no-namespace */

// Blocks are used in this file intentionally for scoping.
/* eslint-disable no-lone-blocks */

/* eslint-disable @typescript-eslint/no-unused-vars */

/**
 * The types defined here cannot be in build-cli because it is an ESM-only package, and these types are imported in
 * packages that are dual-emit or CJS-only. Long term these types should move to a shared library between build-cli and
 * build-tools.
 */

/**
 * Compile time assert that A is assignable to (extends) B.
 * To use, simply define a type:
 * `type _check = requireAssignableTo<T, Expected>;`
 */
export type requireAssignableTo<_A extends B, B> = true;

/*
 * Type meta-functions which take in a type and remove some of its type information to get structural typing.
 * This is necessary since TypeScript does not always treat identical declarations of the same type in two different places as assignable.
 *
 * The most common case of this is with classes where [private and protected members trigger nominal typing](https://www.typescriptlang.org/docs/handbook/type-compatibility.html#private-and-protected-members-in-classes).
 * A mapped type (for example `{ [P in keyof T]: T[P]; }`) is used preserve only the list of members, and discard the fact that it is a class.
 *
 * Another case is with `const enum`. The [docs for enum compatibility](https://www.typescriptlang.org/docs/handbook/type-compatibility.html#enums) seems to be only partly accurate, so tests for their behavior are included below.
 *
 * The `T extends number ? number :` included here is a workaround for how const enums behave (that fixes the case where the value is a number).
 * This will strip some type branding information which ideally would be kept for stricter checking, but without it, const enums show up as breaking when unchanged.
 *
 * Another case is custom symbols.
 * To mitigate this, symbols which are not either `symbol` or a [well known symbol (like Symbols.iterator)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Symbol#static_properties),
 * are replaced with `never`.
 *
 * MinimalType can be used in cases where TypeOnly fails to handle the type properly
 * and a fallback to something known to conservatively work (by testing nothing but the type exists currently).
 *
 * FullType can be explicitly opted into to test the type unmodified.
 * This will cause issues with symbols, enums, and classes with private or protected members.
 */

type ValueOf<T> = T[keyof T];
type OnlySymbols<T> = T extends symbol ? T : never;
type WellKnownSymbols = OnlySymbols<ValueOf<typeof Symbol>>;
/**
 * Omit (replace with never) a key if it is a custom symbol,
 * not just symbol or a well known symbol from the global Symbol.
 */
export type SkipUniqueSymbols<Key> = symbol extends Key
	? Key // Key is symbol or a generalization of symbol, so leave it as is.
	: Key extends symbol
		? Key extends WellKnownSymbols
			? Key // Key is a well known symbol from the global Symbol object. These are shared between packages, so they are fine and kept as is.
			: never // Key is most likely some specialized symbol, typically a unique symbol. These break type comparisons so are removed by replacing them with never.
		: Key; // Key is not a symbol (for example its a string or number), so leave it as is.
/**
 * Remove details of T which are incompatible with type testing while keeping as much as is practical.
 *
 * See 'build-tools/packages/build-cli/src/typeValidator/compatibility.ts' for more information.
 */
export type TypeOnly<T> = T extends number
	? number
	: T extends boolean | bigint | string
		? T
		: T extends symbol
			? SkipUniqueSymbols<T>
			: {
					[P in keyof T as SkipUniqueSymbols<P>]: TypeOnly<T[P]>;
				};

/**
 * Type preprocessing function selected with the `@typeTestMinimal` tag.
 *
 * This throws away even more type information that the default {@link TypeOnly} option, resulting in only the most minimal of type compatibility testing.
 * Currently this minimal level of compatibility resting only includes existence of the type and does not preserve any details.
 *
 * This can be used for cases where {@link TypeOnly} preserves too much information, resulting in equivalent copies of a type being considered unequal to themselves.
 *
 * @privateRemarks
 * See `selectTypePreprocessor` for selection logic.
 */
export type MinimalType<T> = 0;

/**
 * Type preprocessing function selected with the `@typeTestFull` tag.
 *
 * This allows opting into full type compatibility: two types will only be considered compatible if they are assignable unmodified.
 *
 * Typically this cannot be used on any type that reference any classes, symbols or const enums defined in the set of packages being tested for compatibility:
 * doing so would cause false positives (errors) when comparing a type to an identical one from its published package.
 *
 * @privateRemarks
 * See `selectTypePreprocessor` for selection logic.
 */
export type FullType<T> = T;

// Checks //
// Confirm typeOnly and general compatibility in TypeScript works as expected.
// This behavior seems odd and undocumented in some cases, and this code will break if it changes.

// Non-Const enums

namespace Test1 {
	export enum A {
		y = 0,
	}
}

namespace Test2 {
	export enum A {
		x = 0,
		y = 1,
	}

	export enum Renamed {
		y = 0,
	}
}

{
	// @ts-expect-error Changing the value of an enum member breaks assignability (this changed somewhere between TypeScript 5.1 and 5.4).
	type _check = requireAssignableTo<Test1.A, Test2.A>;
	// TypeOnly does not consider renumbering the Enum to be a breaking change.
	// Maybe this is ok for non const enums since the references should be to the enum member not the constant.
	type _check4 = requireAssignableTo<TypeOnly<Test1.A>, TypeOnly<Test2.A>>;

	// @ts-expect-error This means that renaming an Enum (even if you also export an alias to it under the old name) would be incorrectly detected as a breaking change.
	type _check2 = requireAssignableTo<Test1.A, Test2.Renamed>;
	// TypeOnly prevents this mistake from being flagged as breaking:
	type _check3 = requireAssignableTo<TypeOnly<Test1.A>, TypeOnly<Test2.Renamed>>;
}

// Const enums

namespace Test3 {
	export const enum A {
		y = 0,
	}
}

namespace Test4 {
	export const enum A {
		x = 0,
		y = 1,
	}

	export enum Renamed {
		y = 0,
	}
}

namespace Test5 {
	export const enum A {
		y = 0,
	}
}

{
	// @ts-expect-error The odd case that used to compile for non-const enums clearly should not be considered compatible for const ones, and fortunately it is not.
	type _check = requireAssignableTo<Test3.A, Test4.A>;
	// @ts-expect-error This stricter checking introduces another issue: identical const enums in different locations are not assignable.
	type _check5 = requireAssignableTo<Test3.A, Test5.A>;
	// Stripping type information from numbers and strings with TypeOnly mitigates this (this is important as otherwise unchanged const enums would be considered a breaking change):
	type _check6 = requireAssignableTo<TypeOnly<Test3.A>, TypeOnly<Test5.A>>;
	// However TypeOnly erases the type information that allows the earlier case to error, making the type tests unable to detect this kind of breaking change.
	type _check4 = requireAssignableTo<TypeOnly<Test3.A>, TypeOnly<Test4.A>>;

	// @ts-expect-error Renaming works the same as with non-const enums.
	type _check2 = requireAssignableTo<Test3.A, Test4.Renamed>;
	// TypeOnly prevents this mistake from being flagged as breaking:
	type _check3 = requireAssignableTo<TypeOnly<Test3.A>, TypeOnly<Test4.Renamed>>;
}

// Classes with protected members

namespace Test6 {
	export class Foo {
		protected x!: number;
	}
}

namespace Test7 {
	export class Foo {
		protected x!: number;
	}

	export class Bar {
		protected y!: number;
	}

	export class Baz {
		protected x!: number;

		// eslint-disable-next-line @typescript-eslint/no-empty-function
		public method(): void {}
	}
}

{
	// @ts-expect-error Classes are nominally typed when they have private or protected members.
	type _check = requireAssignableTo<Test6.Foo, Test7.Foo>;
	// TypeOnly removes this:
	type _check2 = requireAssignableTo<TypeOnly<Test6.Foo>, TypeOnly<Test7.Foo>>;
	// This also allows renames of the class, and different private members.
	// Note that different private members can break code that subclasses the class (at runtime), and that is not checked for!
	type _check3 = requireAssignableTo<TypeOnly<Test6.Foo>, TypeOnly<Test7.Bar>>;

	// @ts-expect-error Adding a public member is a breaking change,
	type _check4 = requireAssignableTo<TypeOnly<Test6.Foo>, TypeOnly<Test7.Baz>>;
	// but only in one direction:
	type _check5 = requireAssignableTo<TypeOnly<Test7.Baz>, TypeOnly<Test6.Foo>>;
}

namespace Test_TypeOnly_Preserves_Primitives {
	// The 'null' and 'undefined' values cannot be nominal typed (they are not
	// valid enum values and intersection ('&') with 'null'/'undefined' -> 'never').
	// Just verify that the 'null' and 'undefined' values are preserved.
	type _check_undefined1 = requireAssignableTo<TypeOnly<undefined>, undefined>;
	type _check_undefined2 = requireAssignableTo<undefined, TypeOnly<undefined>>;

	type _check_null1 = requireAssignableTo<TypeOnly<null>, null>;
	type _check_null2 = requireAssignableTo<null, TypeOnly<null>>;

	// Due to limitations of the current version of TypeOnly, brands on number are lost,
	// but the number type is preserved:
	type brandedNumber = number & { brand: "Number" };
	type _check_number1 = requireAssignableTo<TypeOnly<brandedNumber>, number>;
	type _check_number2 = requireAssignableTo<brandedNumber, TypeOnly<brandedNumber>>;

	// Due to limitations of the current version of TypeOnly, brands on string are lost,
	// but the string type is preserved:
	type brandedString = string & { brand: "String" };
	type _check_string1 = requireAssignableTo<TypeOnly<brandedString>, string>;
	type _check_string2 = requireAssignableTo<brandedString, TypeOnly<brandedString>>;

	// Due to limitations of the current version of TypeOnly, brands on unions involving
	// 'string' or 'number' are lost, but the 'string | number' type is preserved:
	type brandedNumberOrString = (number | string) & { brand: "NumberOrString" };
	type _check_number_or_string1 = requireAssignableTo<
		TypeOnly<brandedNumberOrString>,
		number | string
	>;
	type _check_number_or_string2 = requireAssignableTo<
		brandedNumberOrString,
		TypeOnly<brandedNumberOrString>
	>;

	// Other branded primitive types are preserved.
	type brandedBoolean = boolean & { brand: "Boolean" };
	type _check_bool1 = requireAssignableTo<TypeOnly<brandedBoolean>, brandedBoolean>;
	type _check_bool2 = requireAssignableTo<brandedBoolean, TypeOnly<brandedBoolean>>;

	type brandedBigInt = bigint & { brand: "BigInt" };
	type _check_bigint1 = requireAssignableTo<TypeOnly<brandedBigInt>, bigint>;
	type _check_bigint2 = requireAssignableTo<brandedBigInt, TypeOnly<bigint>>;

	type brandedSymbol = symbol & { brand: "Symbol" };
	type _check_symbol1 = requireAssignableTo<TypeOnly<brandedSymbol>, symbol>;
	type _check_symbol2 = requireAssignableTo<brandedSymbol, TypeOnly<symbol>>;

	// Unions of primitive types are preserved.
	type union = undefined | null | boolean | number | bigint | string | symbol;
	type _check_union1 = requireAssignableTo<TypeOnly<union>, union>;
	type _check_union2 = requireAssignableTo<union, TypeOnly<union>>;

	// Branded unions of primitive types are preserved, except for string and number,
	// which are stripped to just 'string | number'.
	// Symbols are excluded from this as they are more aggressively omitted to handle unique symbols.
	type brandedUnion = (undefined | null | boolean | bigint) & {
		brand: "Union";
	};
	type _check_union3 = requireAssignableTo<TypeOnly<brandedUnion>, brandedUnion>;
	type _check_union4 = requireAssignableTo<brandedUnion, TypeOnly<brandedUnion>>;
}

namespace Test_TypeOnly_Symbols {
	interface A {
		[Symbol.iterator]: number;
	}

	// Ensure well known symbols are preserved
	type _check1 = requireAssignableTo<TypeOnly<A>, A>;
	type _check2 = requireAssignableTo<A, TypeOnly<A>>;

	// Custom symbols are skipped, since they are likely from the package in question,
	// and thus will not be considered equal to the version from the other copy of the package.
	// eslint-disable-next-line symbol-description
	const X: unique symbol = Symbol();
	interface B {
		[X]: number;
	}

	// @ts-expect-error Symbol is skipped
	type _check = requireAssignableTo<TypeOnly<B>, B>;

	type _check3 = requireAssignableTo<TypeOnly<B>, object>;
	type _check4 = requireAssignableTo<object, TypeOnly<B>>;
}

namespace TestNeverParameter {
	type FooNever<T extends never> = T;
	type AnyNever<T extends never> = T;

	// @ts-expect-error any not assignable to never
	type _check1 = FooNever<any>;

	// never is assignable to any
	type _check2 = AnyNever<never>;
}
