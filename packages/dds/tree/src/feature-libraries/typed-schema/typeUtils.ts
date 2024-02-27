/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { objectToMap } from "../../util/index.js";

/**
 * Utilities for manipulating types.
 */

/**
 * Convert a object type into the type of a ReadonlyMap from field name to value.
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
 * Convert a Array type into a union of its value types.
 * @public
 */
export type ArrayToUnion<T extends readonly unknown[]> = T[number];

/**
 * Convert a Array type into the type of ReadonlySet.
 *
 * Same as `keyof ListToKeys<T, unknown>` but work for values that are not valid keys.
 * @public
 */
export type ArrayToUnion2<T extends readonly unknown[]> = T extends readonly (infer TValue)[]
	? TValue
	: never;
