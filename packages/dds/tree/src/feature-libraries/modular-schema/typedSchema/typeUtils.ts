/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { $, List, Kind } from "hkt-toolbelt";

import { Named } from "../../../core";
import { Brand } from "../../../util";

/**
 * Utilities for manipulating types.
 */

/**
 * https://code.lol/post/programming/higher-kinded-types/
 */
export type Assume<T, U> = T extends U ? T : U;

/**
 * Convert a object type into the type of a ReadonlyMap from field name to value.
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
 * Convert a Array type into the type of a ReadonlySet from field name to value.
 */
export type ArrayToSet<T extends readonly unknown[]> = ReadonlySet<ArrayToUnion<T>>;

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
 */
export type ListToKeys<T extends readonly (string | symbol)[], TValue> = {
	[key in T[number]]: TValue;
};

/**
 * Replaces undefined and unknown with a default value.
 * Handling of `unknown` this way is required to make this work with optional fields,
 * since they seem to infer the `unknown` type, not undefined.
 */
export type WithDefault<T, Default> = T extends undefined
	? Default
	: unknown extends T
	? Default
	: T;

/**
 * Converts list of names or named objects into list of names.
 */
export type AsNames<T extends (TName | Named<TName>)[], TName = string> = Assume<
	$<$<List.Map, AsNameKind>, T>,
	TName[]
>;

export interface AsNameKind extends Kind.Kind {
	f(x: this[Kind._]): AsName<typeof x>;
}

export type AsName<T extends unknown | Named<unknown>> = T extends Named<infer Name> ? Name : T;

/**
 * Version of AsNames that does not use "hkt-toolbelt".
 */
type AsNamesX<T extends [...(unknown | Named<TName>)[]], TName = string> = Assume<
	T extends [infer Head, ...infer Tail] ? [AsName<Head>, ...AsNamesX<Tail, TName>] : [],
	TName[]
>;

/**
 * Converts list of names or named objects into list of branded names.
 */
export type AsBrandedNames<
	T extends readonly (string | Named<TBranded>)[],
	TBranded extends Brand<any, string>,
> = {
	readonly [Index in keyof T]: AsBrandedName<T[Index], TBranded>;
};

export type AsBrandedName<
	T extends unknown | Named<TBranded>,
	TBranded extends Brand<any, string>,
> = T extends Named<infer Name> ? Name : T & TBranded;
