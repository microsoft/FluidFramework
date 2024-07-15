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
 * @public
 */
export type FlattenKeys<T> = [{ [Property in keyof T]: T[Property] }][_InlineTrick];

/**
 * Remove all fields which permit undefined from `T`.
 * @internal
 */
export type RequiredFields<T> = [
	{
		[P in keyof T as undefined extends T[P] ? never : P]: T[P];
	},
][_InlineTrick];

/**
 * Extract fields which permit undefined but can also hold other types.
 * @internal
 */
export type OptionalFields<T> = [
	{
		[P in keyof T as undefined extends T[P]
			? T[P] extends undefined
				? never
				: P
			: never]?: T[P];
	},
][_InlineTrick];

/**
 * Converts properties of an object which permit undefined into optional properties.
 * Removes fields which only allow undefined.
 *
 * @remarks
 * This version does not flatten the resulting type.
 * This version exists because some cases recursive types need to avoid this
 * flattening since it causes complication issues.
 *
 * See also `AllowOptional`.
 * @internal
 */
// export type AllowOptionalNotFlattened<T> = [RequiredFields<T> & OptionalFields<T>][_InlineTrick];
export type AllowOptionalNotFlattened<T> = [
	RequiredFields<T> & OptionalFields<T>,
][_InlineTrick];

/**
 * Converts properties of an object which permit undefined into optional properties.
 * Removes fields which only allow undefined.
 * @internal
 */
export type AllowOptional<T> = [
	FlattenKeys<RequiredFields<T> & OptionalFields<T>>,
][_InlineTrick];

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
 * @public
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
 * @internal
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
 * @privateRemarks
 * `number` is not allowed as a key here since doing so causes the compiler to reject recursive schema.
 * The cause for this is unclear, but empirically it was the case when this comment was written.
 * @public
 */
export type RestrictiveReadonlyRecord<K extends symbol | string, T> = {
	readonly [P in symbol | string]: P extends K ? T : never;
};

/**
 * Assume that `TInput` is a `TAssumeToBe`.
 *
 * @remarks
 * This is useful in generic code when it is impractical (or messy)
 * to to convince the compiler that a generic type `TInput` will extend `TAssumeToBe`.
 * In these cases `TInput` can be replaced with `Assume<TInput, TAssumeToBe>` to allow compilation of the generic code.
 * When the generic code is parameterized with a concrete type, if that type actually does extend `TAssumeToBe`,
 * it will behave like `TInput` was used directly.
 *
 * @internal
 */
export type Assume<TInput, TAssumeToBe> = [TInput] extends [TAssumeToBe]
	? TInput
	: TAssumeToBe;
