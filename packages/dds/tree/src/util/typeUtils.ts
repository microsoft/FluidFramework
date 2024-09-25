/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Utilities for manipulating types.
 */

/**
 * Return a type thats equivalent to the input, but with different IntelliSense.
 * This tends to convert unions and intersections into objects.
 * @system @public
 */
export type FlattenKeys<T> = [{ [Property in keyof T]: T[Property] }][_InlineTrick];

/**
 * Use for trick to "inline" generic types.
 *
 * @remarks
 * The TypeScript compiler can be convinced to inline a generic type
 * (so the result of evaluating the generic type show up in IntelliSense and error messages instead of just the invocation of the generic type)
 * by creating an object with a field, and returning the type of that field.
 *
 * For example:
 * ```typescript
 * type MyGeneric<T1, T2> = {x: T1 extends [] ? T1 : T2 };
 * type MyGenericExpanded<T1, T2> = [{x: T1 extends [] ? T1 : T2 }][_InlineTrick]
 *
 * // Type is MyGeneric<5, string>
 * const foo: MyGeneric<5, string> = {x: "x"}
 * // Type is {x: "x"}
 * const foo2: MyGenericExpanded<5, string> = {x: "x"}
 * ```
 *
 * This constant is defined to provide a way to find this documentation from types which use this pattern,
 * and to locate types which use this pattern in case they need updating for compiler changes.
 * @system @public
 */
export type _InlineTrick = 0;

/**
 * Use for trick to prevent self reference error `ts(2456)`.
 *
 * Prefix a type expression with `K extends _RecursiveTrick ? _RecursiveTrick : ` for some K to break the cycle.
 *
 * @remarks
 * The TypeScript compiler handles some cases of recursive types, but not others.
 * Sometimes adding an otherwise needless conditional can make a type compile.
 * Use this type in such cases.
 *
 *For example:
 * ```typescript
 * // The TypeScript compiler can't handle this case
 * type Broken<T> = FlattenKeys<
 *	{
 * 		[K in keyof T]: 0;
 * 	} & {
 * 		[K in keyof T]: Broken<T[K]>;
 * 	}
 * >;
 *
 * // Adding `K extends _RecursiveTrick ? _RecursiveTrick :` makes it compile, and has no effect on the type produced.
 * type Works<T> = FlattenKeys<
 * 	{
 * 		[K in keyof T]: 0;
 * 	} & {
 * 		// Trick added here. Since `k` never extends `never`, the second conditional option is always taken,
 * 		// making this equivalent to the broken version, except this one compiles.
 * 		[K in keyof T]: K extends _RecursiveTrick ? _RecursiveTrick : Works<T[K]>;
 * 	}
 * >;
 * ```
 *
 * This trick appears to start working in TypeScript 4.1 and is confirmed to still work in 5.0.4.
 *
 * This constant is defined to provide a way to find this documentation from types which use this pattern,
 * and to locate types which use this pattern in case they need updating for compiler changes.
 */
export type _RecursiveTrick = never;

// This block is kept here to ensure the above example behaves as documented, and can be copied into the example to update it as needed.
{
	/* eslint-disable @typescript-eslint/no-unused-vars */

	// @ts-expect-error The TypeScript compiler can't handle this case
	type Broken<T> = FlattenKeys<
		{
			[K in keyof T]: 0;
		} & {
			// @ts-expect-error Same error as above.
			[K in keyof T]: Broken<T[K]>;
		}
	>;

	// Adding `K extends _RecursiveTrick ? _RecursiveTrick:` OR `T extends _RecursiveTrick ? _RecursiveTrick :` makes it compile and has no effect on the type produced.
	type Works<T> = FlattenKeys<
		{
			[K in keyof T]: 0;
		} & {
			// Trick added here. Since `K` never extends `never`, the second conditional option is always taken,
			// making this equivalent to the broken version, except this one compiles.
			[K in keyof T]: T extends _RecursiveTrick ? _RecursiveTrick : Works<T[K]>;
		}
	>;

	/* eslint-enable @typescript-eslint/no-unused-vars */
}

/**
 * Alternative to the built in Record type which does not permit unexpected members,
 * and is readonly.
 *
 * @remarks
 * This does not work correctly when `K` is more specific than `string` or `symbol`.
 * For example `{a: 5}` is not assignable to `RestrictiveReadonlyRecord<"a",: number>`
 *
 * @privateRemarks
 * `number` is not allowed as a key here since doing so causes the compiler to reject recursive schema.
 * The cause for this is unclear, but empirically it was the case when this comment was written.
 *
 * @deprecated Use a more robust / specific type instead. This type never worked as intended.
 * @public
 */
export type RestrictiveReadonlyRecord<K extends symbol | string, T> = {
	readonly [P in symbol | string]: P extends K ? T : never;
};

/**
 * Alternative to the built-in `Record<string, T>` type which is readonly and does not permit symbols.
 * @remarks
 * It would be nice if `keyof RestrictiveStringRecord<T>` returned string, but it does not: use `keyof RestrictiveStringRecord<T> & string` instead.
 * @system @public
 */
export type RestrictiveStringRecord<T> = {
	readonly [P in string]: T;
} & {
	readonly [P in symbol]?: never;
};
