/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Convert a union of types to an intersection of those types. Useful for `TransformEvents`.
 * @privateRemarks
 * First an always true extends clause is used (T extends T) to distribute T into to a union of types contravariant over each member of the T union.
 * Then the constraint on the type parameter in this new context is inferred, giving the intersection.
 * @system @public
 */
export type UnionToIntersection<T> = (T extends T ? (k: T) => unknown : never) extends (
	k: infer U,
) => unknown
	? U
	: never;

/**
 * Subset of Map interface.
 */
export interface MapGetSet<K, V> {
	get(key: K): V | undefined;
	set(key: K, value: V): void;
}

/**
 * A dictionary whose values are keyed off of two objects (key1, key2).
 * As it is a nested map, size() will return the number of distinct key1s.
 * If you need constant-time access to the number of values, use SizedNestedMap instead.
 *
 * This code assumes values will not be undefined (keys can be undefined).
 */
export type NestedMap<Key1, Key2, Value> = Map<Key1, Map<Key2, Value>>;

/**
 * Sets the value at `key` in map to value if not already present.
 * Returns the value at `key` after setting it.
 * This is equivalent to a get or default that adds the default to the map.
 */
export function getOrAddInMap<Key, Value>(
	map: MapGetSet<Key, Value>,
	key: Key,
	value: Value,
): Value {
	const currentValue = map.get(key);
	if (currentValue !== undefined) {
		return currentValue;
	}
	map.set(key, value);
	return value;
}

/**
 * Sets the value at (key1, key2) in map to value.
 * If there already is a value for (key1, key2), it is replaced with the provided one.
 */
export function setInNestedMap<Key1, Key2, Value>(
	map: NestedMap<Key1, Key2, Value>,
	key1: Key1,
	key2: Key2,
	value: Value,
): void {
	const innerMap = getOrAddInMap(map, key1, new Map<Key2, Value>());
	innerMap.set(key2, value);
}
