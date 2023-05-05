/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { Type } from "@sinclair/typebox";
import structuredClone from "@ungap/structured-clone";

/**
 * Subset of Map interface.
 */
export interface MapGetSet<K, V> {
	get(key: K): V | undefined;
	set(key: K, value: V): void;
}

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
export function getOrCreate<K, V>(map: MapGetSet<K, V>, key: K, defaultValue: (key: K) => V): V {
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
export function getOrAddEmptyToMap<K, V>(map: MapGetSet<K, V[]>, key: K): V[] {
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
		nextA.done !== true && nextB.done !== true;
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
export type JsonCompatibleObject = { [P in string]?: JsonCompatible };

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
	| { readonly [P in string]?: JsonCompatibleReadOnly };

/**
 * @remarks - TODO: Audit usage of this type in schemas, evaluating whether it is necessary and performance
 * of alternatives.
 *
 * True "arbitrary serializable data" is probably fine, but some persisted types declarations might be better
 * expressed using composition of schemas for runtime validation, even if we don't think making the types
 * generic is worth the maintenance cost.
 */
export const JsonCompatibleReadOnlySchema = Type.Any();

/**
 * Returns if a particular json compatible value is an object.
 * Does not include `null` or arrays.
 */
export function isJsonObject(
	value: JsonCompatibleReadOnly,
): value is { readonly [P in string]?: JsonCompatibleReadOnly } {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function assertValidIndex(
	index: number,
	array: { readonly length: number },
	allowOnePastEnd: boolean = false,
) {
	assert(Number.isInteger(index), 0x376 /* index must be an integer */);
	assert(index >= 0, 0x377 /* index must be non-negative */);
	if (allowOnePastEnd) {
		assert(index <= array.length, 0x378 /* index must be less than or equal to length */);
	} else {
		assert(index < array.length, 0x379 /* index must be less than length */);
	}
}

/**
 * Assume that `TInput` is a `TAssumeToBe`.
 *
 * @remarks
 * This is useful in generic code when it is impractical (or messy)
 * to to convince the compiler that a generic type `TInput` will extend `TAssumeToBe`.
 * In these cases `TInput` can be replaced with `Assume<TInput, TAssumeToBe>` to allow compilation of the generic code.
 * When the generic code is parameterized with a concrete type, if that type actually does extend `TAssumeToBe`,
 * it will behave like `TInput` was used directly.
 *
 * @alpha
 */
export type Assume<TInput, TAssumeToBe> = TInput extends TAssumeToBe ? TInput : TAssumeToBe;
