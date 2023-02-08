/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Remove `readonly` from all fields.
 */
export type Mutable<T> = { -readonly [P in keyof T]: T[P] };

/** A union type of the first `N` positive integers */
export type TakeWholeNumbers<N extends number, A extends never[] = []> = N extends A["length"]
	? never
	: A["length"] | TakeWholeNumbers<N, [never, ...A]>;

/** Returns a tuple type with exactly `Length` elements of type `T` */
export type ArrayOfLength<T, Length extends number, A extends T[] = []> = Length extends A["length"]
	? A
	: ArrayOfLength<T, Length, [T, ...A]>;

/**
 * Fails true iff `array` has at least `length` elements
 */
export function hasAtLeastLength<T, Len extends TakeWholeNumbers<16>>(
	array: readonly T[],
	length: Len,
): array is [...ArrayOfLength<T, Len>, ...T[]] {
	return array.length >= length;
}

/**
 * A numeric comparator used for sorting in ascending order.
 *
 * Handles +/-0 like Map: -0 is equal to +0.
 */
export function compareFiniteNumbers<T extends number>(a: T, b: T): number {
	return a - b;
}

/**
 * A numeric comparator used for sorting in descending order.
 *
 * Handles +/-0 like Map: -0 is equal to +0.
 */
export function compareFiniteNumbersReversed<T extends number>(a: T, b: T): number {
	return b - a;
}

/**
 * Compare two maps and return true if their contents are equivalent.
 * @param mapA - The first array to compare
 * @param mapB - The second array to compare
 * @param elementComparator - The function used to check if two `T`s are equivalent.
 * Defaults to `Object.is()` equality (a shallow compare)
 */
export function compareMaps<K, V>(
	mapA: ReadonlyMap<K, V>,
	mapB: ReadonlyMap<K, V>,
	elementComparator: (a: V, b: V) => boolean = Object.is,
): boolean {
	if (mapA.size !== mapB.size) {
		return false;
	}

	for (const [keyA, valueA] of mapA) {
		const valueB = mapB.get(keyA);
		if (valueB === undefined || !elementComparator(valueA, valueB)) {
			return false;
		}
	}

	return true;
}

/**
 * Retrieve a value from a map with the given key, or create a new entry if the key is not in the map.
 * @param map - The map to query/update
 * @param key - The key to lookup in the map
 * @param defaultValue - a function which returns a default value. This is called and used to set an initial value for the given key in the map if none exists
 * @returns either the existing value for the given key, or the newly-created value (the result of `defaultValue`)
 */
export function getOrCreate<K, V>(map: Map<K, V>, key: K, defaultValue: (key: K) => V): V {
	let value = map.get(key);
	if (value === undefined) {
		value = defaultValue(key);
		map.set(key, value);
	}
	return value;
}

/**
 * Compares strings lexically to form a strict partial ordering.
 */
export function compareStrings<T extends string>(a: T, b: T): number {
	return a > b ? 1 : a === b ? 0 : -1;
}

export function fail(message: string): never {
	throw new Error(message);
}

/**
 * Sets a property in such a way that it is only set on `destination` if the provided value is not undefined.
 * This avoids having explicit undefined values under properties that would cause `Object.hasOwnProperty` to return true.
 */
export function setPropertyIfDefined<TDst, P extends keyof TDst>(
	value: TDst[P] | undefined,
	destination: TDst,
	property: P,
): void {
	if (value !== undefined) {
		destination[property] = value;
	}
}
