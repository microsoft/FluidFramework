/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Utilities for manipulating types.
 */

/**
 * Convert a object type into the type of a ReadonlyMap from field name to value.
 * @alpha
 */
export type ObjectToMap<ObjectMap, MapKey extends number | string, MapValue> = ReadonlyMap<
	MapKey,
	MapValue
> & {
	get<TKey extends keyof ObjectMap>(key: TKey): ObjectMap[TKey];
};

// TODO: test + document
export function objectToMap<
	ObjectMap extends Record<MapKey, MapValue>,
	MapKey extends string,
	MapValue,
>(objectMap: ObjectMap): ObjectToMap<ObjectMap, MapKey, MapValue> {
	const map = new Map<MapKey, MapValue>();
	// This function must only be used with objects specifically intended to encode map like information.
	for (const key of Object.keys(objectMap)) {
		const element = objectMap[key as MapKey];
		map.set(key as MapKey, element);
	}
	return map as unknown as ObjectToMap<ObjectMap, MapKey, MapValue>;
}

/**
 * Convert a Array type into the type of ReadonlySet.
 *
 * Same as `keyof ListToKeys<T, unknown>` but work for values that are not valid keys.
 * @alpha
 */
export type ArrayToUnion<T extends readonly unknown[]> = T extends readonly (infer TValue)[]
	? TValue
	: never;

/**
 * Replaces undefined and unknown with a default value.
 * Handling of `unknown` this way is required to make this work with optional fields,
 * since they seem to infer the `unknown` type, not undefined.
 * @alpha
 */
export type WithDefault<T, Default> = T extends undefined
	? Default
	: unknown extends T
	? Default
	: T;

/**
 * Removes a type brand. See {@link brand}.
 * @alpha
 */
export type Unbrand<T, B> = T extends infer S & B ? S : T;

/**
 * Converts list of branded types into list of unbranded ones.
 * @alpha
 */
export type UnbrandList<T extends unknown[], B> = T extends [infer Head, ...infer Tail]
	? [Unbrand<Head, B>, ...UnbrandList<Tail, B>]
	: [];

/**
 * Return a type thats equivalent to the input, but with different IntelliSense.
 * This tends to convert unions and intersections into objects.
 * @alpha
 */
export type FlattenKeys<T> = [{ [Property in keyof T]: T[Property] }][_InlineTrick];

/**
 * Remove all fields which permit undefined from `T`.
 * @alpha
 */
export type RequiredFields<T> = [
	{
		[P in keyof T as undefined extends T[P] ? never : P]: T[P];
	},
][_InlineTrick];

/**
 * Extract fields which permit undefined but can also hold other types.
 * @alpha
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
 * @alpha
 */
// export type AllowOptionalNotFlattened<T> = [RequiredFields<T> & OptionalFields<T>][_InlineTrick];
export type AllowOptionalNotFlattened<T> = [RequiredFields<T> & OptionalFields<T>][_InlineTrick];

/**
 * Converts properties of an object which permit undefined into optional properties.
 * Removes fields which only allow undefined.
 * @alpha
 */
export type AllowOptional<T> = [FlattenKeys<RequiredFields<T> & OptionalFields<T>>][_InlineTrick];

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
 * @alpha
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
 * @alpha
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
