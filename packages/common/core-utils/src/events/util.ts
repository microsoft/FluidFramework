/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { MapGetSet, NestedMap } from "@fluidframework/core-interfaces/internal";

/**
 * Sets the value at `key` in map to value if not already present.
 * Returns the value at `key` after setting it.
 * This is equivalent to a get or default that adds the default to the map.
 * @internal
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
 * @internal
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

/**
 * Retrieve a value from a map with the given key, or create a new entry if the key is not in the map.
 * @param map - The map to query/update
 * @param key - The key to lookup in the map
 * @param defaultValue - a function which returns a default value. This is called and used to set an initial value for the given key in the map if none exists
 * @returns either the existing value for the given key, or the newly-created value (the result of `defaultValue`)
 * @internal
 */
export function getOrCreate<K, V>(
	map: MapGetSet<K, V>,
	key: K,
	defaultValue: (key: K) => V,
): V {
	let value = map.get(key);
	if (value === undefined) {
		value = defaultValue(key);
		map.set(key, value);
	}
	return value;
}
