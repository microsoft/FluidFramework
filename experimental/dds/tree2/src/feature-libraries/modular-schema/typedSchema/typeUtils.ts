/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { objectToMap } from "../../../util";

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
export function objectToMapTyped<
	ObjectMap extends Record<MapKey, MapValue>,
	MapKey extends string,
	MapValue,
>(objectMap: ObjectMap): ObjectToMap<ObjectMap, MapKey, MapValue> {
	return objectToMap(objectMap) as unknown as ObjectToMap<ObjectMap, MapKey, MapValue>;
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
