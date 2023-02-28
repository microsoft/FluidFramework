/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import structuredClone from "@ungap/structured-clone";

/**
 * Make all transitive properties in T readonly
 */
export type RecursiveReadonly<T> = {
	readonly [P in keyof T]: RecursiveReadonly<T[P]>;
};

/**
 * Remove `readonly` from all fields.
 */
export type Mutable<T> = { -readonly [P in keyof T]: T[P] };

export function clone<T>(original: T): T {
	return structuredClone(original);
}

/**
 * @alpha
 */
export function fail(message: string): never {
	throw new Error(message);
}

/**
 * Checks whether or not the given object is a `readonly` array.
 */
export function isReadonlyArray<T>(x: readonly T[] | unknown): x is readonly T[] {
	// `Array.isArray()` does not properly narrow `readonly` array types by itself,
	// so we wrap it in this type guard. This may become unnecessary if/when
	// https://github.com/microsoft/TypeScript/issues/17002 is resolved.
	return Array.isArray(x);
}

/**
 * Creates and populates a new array.
 * @param size - The size of the array to be created.
 * @param filler - Callback for populating the array with a value for a given index
 */
export function makeArray<T>(size: number, filler: (index: number) => T): T[] {
	const array = [];
	for (let i = 0; i < size; ++i) {
		array.push(filler(i));
	}
	return array;
}

/**
 * Compare two arrays and return true if their elements are equivalent and in the same order.
 * @param arrayA - The first array to compare
 * @param arrayB - The second array to compare
 * @param elementComparator - The function used to check if two `T`s are equivalent.
 * Defaults to `Object.is()` equality (a shallow compare)
 */
export function compareArrays<T>(
	arrayA: readonly T[],
	arrayB: readonly T[],
	elementComparator: (a: T, b: T) => boolean = Object.is,
): boolean {
	if (arrayA.length !== arrayB.length) {
		return false;
	}

	for (let i = 0; i < arrayA.length; i++) {
		if (!elementComparator(arrayA[i], arrayB[i])) {
			return false;
		}
	}

	return true;
}

/**
 * Compares two sets using callbacks.
 * Early returns on first false comparison.
 *
 * @param a - One Set.
 * @param b - The other Set.
 * @param aExtra - Called for items in `a` but not `b`.
 * @param bExtra - Called for items in `b` but not `a`.
 * @param same - Called for items in `a` and `b`.
 * @returns false iff any of the call backs returned false.
 */
export function compareSets<T>({
	a,
	b,
	aExtra,
	bExtra,
	same,
}: {
	a: ReadonlySet<T> | ReadonlyMap<T, unknown>;
	b: ReadonlySet<T> | ReadonlyMap<T, unknown>;
	aExtra?: (t: T) => boolean;
	bExtra?: (t: T) => boolean;
	same?: (t: T) => boolean;
}): boolean {
	for (const item of a.keys()) {
		if (!b.has(item)) {
			if (aExtra && !aExtra(item)) {
				return false;
			}
		} else {
			if (same && !same(item)) {
				return false;
			}
		}
	}
	for (const item of b.keys()) {
		if (!a.has(item)) {
			if (bExtra && !bExtra(item)) {
				return false;
			}
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
 * Utility for dictionaries whose values are lists.
 * Gets the list associated with the provided key, if it exists.
 * Otherwise, creates an entry with an empty list, and returns that list.
 */
export function getOrAddEmptyToMap<K, V>(map: Map<K, V[]>, key: K): V[] {
	let collection = map.get(key);
	if (collection === undefined) {
		collection = [];
		map.set(key, collection);
	}
	return collection;
}

/**
 * Map one iterable to another by transforming each element one at a time
 * @param iterable - the iterable to transform
 * @param map - the transformation function to run on each element of the iterable
 * @returns a new iterable of elements which have been transformed by the `map` function
 */
export function* mapIterable<T, U>(iterable: Iterable<T>, map: (t: T) => U): Iterable<U> {
	for (const t of iterable) {
		yield map(t);
	}
}

/**
 * Returns an iterable of tuples containing pairs of elements from the given iterables
 * @param iterableA - an iterable to zip together with `iterableB`
 * @param iterableB - an iterable to zip together with `iterableA`
 * @returns in iterable of tuples of elements zipped together from `iterableA` and `iterableB`.
 * If the input iterables are of different lengths, then the extra elements in the longer will be ignored.
 */
export function* zipIterables<T, U>(
	iterableA: Iterable<T>,
	iterableB: Iterable<U>,
): Iterable<[T, U]> {
	const iteratorA = iterableA[Symbol.iterator]();
	const iteratorB = iterableB[Symbol.iterator]();
	for (
		let nextA = iteratorA.next(), nextB = iteratorB.next();
		!nextA.done && !nextB.done;
		nextA = iteratorA.next(), nextB = iteratorB.next()
	) {
		yield [nextA.value, nextB.value];
	}
}

/**
 * Use for Json compatible data.
 *
 * Note that this does not robustly forbid non json comparable data via type checking,
 * but instead mostly restricts access to it.
 * @alpha
 */
export type JsonCompatible =
	| string
	| number
	| boolean
	// eslint-disable-next-line @rushstack/no-new-null
	| null
	| JsonCompatible[]
	| JsonCompatibleObject;

/**
 * Use for Json object compatible data.
 *
 * Note that this does not robustly forbid non json comparable data via type checking,
 * but instead mostly restricts access to it.
 * @alpha
 */
export type JsonCompatibleObject = { [P in string]: JsonCompatible };

/**
 * Use for readonly view of Json compatible data.
 *
 * Note that this does not robustly forbid non json comparable data via type checking,
 * but instead mostly restricts access to it.
 * @alpha
 */
export type JsonCompatibleReadOnly =
	| string
	| number
	| boolean
	// eslint-disable-next-line @rushstack/no-new-null
	| null
	| readonly JsonCompatibleReadOnly[]
	| { readonly [P in string]: JsonCompatibleReadOnly | undefined };

/**
 * Returns if a particular json compatible value is an object.
 * Does not include `null` or arrays.
 */
export function isJsonObject(
	value: JsonCompatibleReadOnly,
): value is { readonly [P in string]: JsonCompatibleReadOnly | undefined } {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
