/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

/**
 * Compile time assert that A is assignable to (extends) B.
 * To use, simply define a type:
 * `type _check = requireAssignableTo<T, Expected>;`
 */
type requireAssignableTo<_A extends B, B> = true;

/**
 * Type meta-function which takes in a type, and removes some of its type information to get structural typing.
 * This is necessary since TypeScript does not always treat identical declarations of the same type in two different places as assignable.
 *
 * The most common case of this is with classes where [private and protected members trigger nominal typing](https://www.typescriptlang.org/docs/handbook/type-compatibility.html#private-and-protected-members-in-classes].
 * The `{ [P in keyof T]: TypeOnly<T[P]>; }` logic handles this by only preserving the list of members, and not fact that its a class.
 *
 * Another case is with `const enum`. The [docs for enum compatibility](https://www.typescriptlang.org/docs/handbook/type-compatibility.html#enums) seems to be only partly accurate, so tests for their behavior are included below.
 *
 * The `T extends number ? number :` included here is a workaround for how const enums behave (that fixes the case where the value is a number).
 * This will strip some type branding information which ideally would be kept for stricter checking, but without it, const enums show up as breaking when unchanged.
 */
export const typeOnly = `
type TypeOnly<T> = T extends number
	? number
	: T extends string
	? string
	: {
			[P in keyof T]: TypeOnly<T[P]>;
	  };
`;

type TypeOnly<T> = T extends number
	? number
	: T extends string
	? string
	: {
			[P in keyof T]: TypeOnly<T[P]>;
	  };

// Checks //
// Confirm typeOnly and general compatibility in TypeScript works as expected.
// This behavior seems odd and undocumented in some cases, and this code will break if it changes.

// Non-Const enums

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace Test1 {
	export enum A {
		y = 0,
	}
}

// eslint-disable-next-line @typescript-eslint/no-namespace
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
	// This really seems like it shouldn't compile, but maybe its ok for non const enums since the actual values are
	// Enums apparently just check that the names (of both the enum and its members) and the values of its members match, but not that the pairing of them is the same.
	type _check = requireAssignableTo<Test1.A, Test2.A>;

	// @ts-expect-error This means that renaming an Enum (even if you also export an alias to it under the old name) would be incorrectly detected as a breaking change.
	type _check2 = requireAssignableTo<Test1.A, Test2.Renamed>;
	// TypeOnly prevents this mistake from being flagged as breaking:
	type _check3 = requireAssignableTo<TypeOnly<Test1.A>, TypeOnly<Test2.Renamed>>;
}

// Const enums

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace Test3 {
	export const enum A {
		y = 0,
	}
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace Test4 {
	export const enum A {
		x = 0,
		y = 1,
	}

	export enum Renamed {
		y = 0,
	}
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace Test5 {
	export const enum A {
		y = 0,
	}
}

{
	// @ts-expect-error The odd case that compiles for non-const enums clearly should not be considered compatible for const ones, and fortunately it is not.
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

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace Test6 {
	export class Foo {
		protected x!: number;
	}
}

// eslint-disable-next-line @typescript-eslint/no-namespace
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
