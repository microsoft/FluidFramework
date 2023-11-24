/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * A dictionary whose values are keyed off of two objects (key1, key2).
 * As it is a nested map, size() will return the number of distinct key1s.
 * If you need constant-time access to the number of values, use SizedNestedMap instead.
 *
 * This code assumes values will not be undefined (keys can be undefined).
 *
 * @alpha
 */
export type NestedMap<Key1, Key2, Value> = Map<Key1, Map<Key2, Value>>;

/**
 * If (key1, key2) already has a value in the map, it is returned, otherwise value is added under (key1, key2) and undefined is returned.
 *
 * @alpha
 */
export function tryAddToNestedMap<Key1, Key2, Value>(
	map: NestedMap<Key1, Key2, Value>,
	key1: Key1,
	key2: Key2,
	value: Value,
): Value | undefined {
	let innerMap = map.get(key1);
	if (innerMap === undefined) {
		innerMap = new Map();
		map.set(key1, innerMap);
	}
	if (innerMap.has(key2)) {
		return innerMap.get(key2);
	}
	innerMap.set(key2, value);
	return undefined;
}

/**
 * Copies over all entries from the source map into the destination map.
 *
 * @alpha
 */
export function populateNestedMap<Key1, Key2, Value>(
	source: NestedMap<Key1, Key2, Value>,
	destination: NestedMap<Key1, Key2, Value>,
): void {
	for (const [key1, innerMap] of source) {
		destination.set(key1, new Map(innerMap));
	}
}
/**
 * Sets the value at (key1, key2) in map to value.
 * If there already is a value for (key1, key2), it is replaced with the provided one.
 *
 * @alpha
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
 * Sets the value at `key` in map to value if not already present.
 * Returns the value at `key` after setting it.
 * This is equivalent to a get or default that adds the default to the map.
 *
 * @alpha
 */
export function getOrAddInMap<Key, Value>(map: Map<Key, Value>, key: Key, value: Value): Value {
	const currentValue = map.get(key);
	if (currentValue !== undefined) {
		return currentValue;
	}
	map.set(key, value);
	return value;
}

/**
 * Returns the value at (key1, key2) in map, or undefined if not present.
 *
 * @alpha
 */
export function tryGetFromNestedMap<Key1, Key2, Value>(
	map: NestedMap<Key1, Key2, Value>,
	key1: Key1,
	key2: Key2,
): Value | undefined {
	const innerMap = map.get(key1);
	if (innerMap === undefined) {
		return undefined;
	}
	return innerMap.get(key2);
}

/**
 * If (key1, key2) is not in the map, add value to the map.
 * Returns whatever is at (key1, key2) in map (which will be value if it was empty before).
 *
 * @alpha
 */
export function getOrAddInNestedMap<Key1, Key2, Value>(
	map: NestedMap<Key1, Key2, Value>,
	key1: Key1,
	key2: Key2,
	value: Value,
): Value {
	const existing = tryAddToNestedMap(map, key1, key2, value);
	if (existing !== undefined) {
		return existing;
	}
	return value;
}

/**
 * Does not change map.
 * If (key1, key2) is not in map, returns value.
 * If (key1, key2) is in map, return its entry.
 *
 * @alpha
 */
export function getOrDefaultInNestedMap<Key1, Key2, Value>(
	map: NestedMap<Key1, Key2, Value>,
	key1: Key1,
	key2: Key2,
	value: Value,
): Value {
	const existing = tryGetFromNestedMap(map, key1, key2);
	if (existing !== undefined) {
		return existing;
	}
	return value;
}

/**
 * Removes the value at (key1, key2) from the map.
 *
 * @returns true iff found.
 *
 * @alpha
 */
export function deleteFromNestedMap<Key1, Key2, Value>(
	map: NestedMap<Key1, Key2, Value>,
	key1: Key1,
	key2: Key2,
): boolean {
	const innerMap = map.get(key1);
	if (innerMap === undefined) {
		return false;
	}
	const deleted = innerMap.delete(key2);
	if (innerMap.size === 0) {
		map.delete(key1);
	}
	return deleted;
}

/**
 * Converts a nested map to a flat list of triplets.
 */
export function nestedMapToFlatList<Key1, Key2, Value>(
	map: NestedMap<Key1, Key2, Value>,
): [Key1, Key2, Value][] {
	const list: [Key1, Key2, Value][] = [];
	map.forEach((innerMap, key1) => {
		innerMap.forEach((val, key2) => {
			list.push([key1, key2, val]);
		});
	});
	return list;
}

/**
 * Builds a nested map from a flat list of triplets.
 */
export function nestedMapFromFlatList<Key1, Key2, Value>(
	list: readonly (readonly [Key1, Key2, Value])[],
): NestedMap<Key1, Key2, Value> {
	const map = new Map<Key1, Map<Key2, Value>>();
	for (const [key1, key2, val] of list) {
		getOrAddInMap(map, key1, new Map<Key2, Value>()).set(key2, val);
	}
	return map;
}

export function forEachInNestedMap<Key1, Key2, Value>(
	map: NestedMap<Key1, Key2, Value>,
	delegate: (value: Value, key1: Key1, key2: Key2) => void,
): void {
	map.forEach((innerMap, keyFirst) => {
		innerMap.forEach((val, keySecond) => {
			delegate(val, keyFirst, keySecond);
		});
	});
}

/**
 * Map with two keys; same semantics as NestedMap, but maintains a size count for the entire collection.
 * Note: undefined is not supported as a value, and will cause incorrect behavior.
 *
 * @alpha
 */
export class SizedNestedMap<Key1, Key2, Value> {
	private readonly nestedMap: NestedMap<Key1, Key2, Value> = new Map();
	private count = 0;

	/**
	 * Returns the total number of elements in this nested map.
	 */
	public get size(): number {
		return this.count;
	}

	/**
	 * If (key1, key2) already has a value in the map, it is returned, otherwise value is added under (key1, key2) and undefined is
	 * returned.
	 */
	public tryGet(key1: Key1, key2: Key2): Value | undefined {
		return tryGetFromNestedMap(this.nestedMap, key1, key2);
	}

	/**
	 * Does not change map.
	 * If (key1, key2) is not in map, returns value.
	 * If (key1, key2) is in map, return its entry.
	 */
	public getOrDefault(key1: Key1, key2: Key2, value: Value): Value {
		return getOrDefaultInNestedMap(this.nestedMap, key1, key2, value);
	}

	/**
	 * If (key1, key2) already has a value in the map, it is returned, otherwise value is added under (key1, key2) and undefined is
	 * returned.
	 */
	public tryAdd(key1: Key1, key2: Key2, value: Value): Value | undefined {
		const currentVal = tryAddToNestedMap(this.nestedMap, key1, key2, value);
		if (currentVal === undefined) {
			this.count++;
		}
		return currentVal;
	}

	/**
	 * Sets the value at (key1, key2) in map to value.
	 * If there already is a value for (key1, key2), it is replaced with the provided one.
	 */
	public set(key1: Key1, key2: Key2, value: Value): void {
		if (this.tryAdd(key1, key2, value) !== undefined) {
			setInNestedMap(this.nestedMap, key1, key2, value);
		}
	}

	/**
	 * Removes the value at (key1, key2) from the map.
	 * Returns true iff found.
	 */
	public delete(key1: Key1, key2: Key2): boolean {
		const deleted = deleteFromNestedMap(this.nestedMap, key1, key2);
		if (deleted) {
			this.count--;
		}
		return deleted;
	}

	/**
	 * Runs the supplied delegate for every (value, key1, key2).
	 */
	public forEach(delegate: (value: Value, key1: Key1, key2: Key2) => void): void {
		forEachInNestedMap(this.nestedMap, delegate);
	}

	/**
	 * Clears the map.
	 */
	public clear(): void {
		this.count = 0;
		this.nestedMap.clear();
	}

	public values(): IterableIterator<Value> {
		return Array.from(this.nestedMap.values()).flatMap((innerMap) => innerMap.values())[0];
	}

	public [Symbol.iterator]() {
		return this.nestedMap[Symbol.iterator]();
	}
}
