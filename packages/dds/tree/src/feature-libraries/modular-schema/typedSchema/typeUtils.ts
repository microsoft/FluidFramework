/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Named } from "../../../core";

/**
 * Utilities for manipulating types.
 */

/**
 * https://code.lol/post/programming/higher-kinded-types/
 *
 * @alpha
 */
export type Assume<T, U> = T extends U ? T : U;

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

/**
 * Convert a object type into the type of a ReadonlySet from field name to value.
 */
export type ObjectToSet<ObjectMap, MapKey extends number | string> = ReadonlySet<MapKey> & {
	values<TKey extends keyof ObjectMap>(key: TKey): keyof ObjectMap[];
};

/**
 * Convert a Array type into the type of ReadonlySet.
 *
 * Same as `keyof ListToKeys<T, unknown>` but work for values that are not valid keys.
 */
export type ArrayToUnion<T extends readonly unknown[]> = T extends readonly (infer TValue)[]
	? TValue
	: never;

/**
 * Takes in a list of strings, and returns an object with those strings as keys.
 * @alpha
 */
export type ListToKeys<T extends readonly (string | symbol)[], TValue> = {
	[key in T[number]]: TValue;
};

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
 * @alpha
 */
export type AsName<T extends unknown | Named<unknown>> = T extends Named<infer Name> ? Name : T;

/**
 * Converts list of names or named objects into list of names.
 *
 * Version of AsNames that does not use "hkt-toolbelt".
 * @alpha
 */
export type AsNames<T extends (unknown | Named<TName>)[], TName = string> = Assume<
	T extends [infer Head, ...infer Tail] ? [AsName<Head>, ...AsNames<Tail, TName>] : [],
	TName[]
>;

/**
 * Converts list of names or named objects into list of names.
 *
 * Version of AsNames that does not use "hkt-toolbelt".
 * @alpha
 */
export type Unbrand<T, B> = T extends infer S & B ? S : T;

/**
 * Converts list of names or named objects into list of names.
 *
 * Version of AsNames that does not use "hkt-toolbelt".
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
export type FlattenKeys<T> = [{ [Property in keyof T]: T[Property] }][_dummy];

/**
 *@alpha
 */
export type RemoveOptionalFields<T> = [
	{
		[P in keyof T as T[P] extends Exclude<T[P], undefined> ? P : never]: T[P];
	},
][_dummy];

/**
 * Like Partial but removes files which may be undefined.
 * @alpha
 */
export type PartialWithoutUndefined<T> = [
	{
		[P in keyof T as T[P] extends undefined ? never : P]?: T[P];
	},
][_dummy];

/**
 * Converts properties of an object which permit undefined into optional properties.
 * @alpha
 */
export type AllowOptional<T> = [PartialWithoutUndefined<T> & RemoveOptionalFields<T>][_dummy];

/**
 * Field to use for trick to "inline" generic types.
 *
 * @remarks
 * The TypeScript compiler can be convinced to inline a generic type
 * (so the result of evaluating the generic type show up in IntelliSense and error messages instead of just the invocation of the generic type)
 * by creating an object with a field, and returning the type of that field.
 *
 * For example:
 * ```typescript
 * type MyGeneric<T1, T2> = {x: T1 extends [] ? T1 : T2 };
 * type MyGenericExpanded<T1, T2> = [{x: T1 extends [] ? T1 : T2 }][_dummy]
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
export type _dummy = 0;
