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
 * Return a type thats equivalent to the input, but with different intellisense.
 * Inlines some top level type meta-functions.
 *
 * TODO: figure out why this sometimes works and sometimes does not.
 */
export type InlineOnce<T> = {
	[Property in keyof T]: T[Property];
};

/**
 * TODO: does not work.
 */
export type InlineDeep<T> = {
	[Property in keyof T as Property]: T[Property];
};

/**
 *@alpha
 */
export type RemoveOptionalFields<T> = {
	[P in keyof T as T[P] extends Exclude<T[P], undefined> ? P : never]: T[P];
};

/**
 * Like Partial but removes files which may be undefined.
 * @alpha
 */
export type PartialWithoutUndefined<T> = {
	[P in keyof T as T[P] extends undefined ? never : P]?: T[P];
};

/**
 * Converts properties of an object which permit undefined into optional properties.
 * @alpha
 */
export type AllowOptional<T> = PartialWithoutUndefined<T> & RemoveOptionalFields<T>;
