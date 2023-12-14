/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { Type } from "@sinclair/typebox";
import structuredClone from "@ungap/structured-clone";
import {
	generateStableId as runtimeGenerateStableId,
	assertIsStableId,
	StableId,
} from "@fluidframework/id-compressor";

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

/**
 * Make all field required and omits fields whose ony valid value would be `undefined`.
 * This is analogous to `Required<T>` except it tolerates 'optional undefined'.
 */
export type Populated<T> = {
	[P in keyof T as Exclude<P, T[P] extends undefined ? P : never>]-?: T[P];
};

/**
 * Casts a readonly object to a mutable one.
 * Better than casting to `Mutable<Foo>` because it doesn't risk casting a non-`Foo` to a `Mutable<Foo>`.
 * @param readonly - The object with readonly fields.
 * @returns The same object but with a type that makes all fields mutable.
 */
export function asMutable<T>(readonly: T): Mutable<T> {
	return readonly as Mutable<T>;
}

export const clone = structuredClone;

/**
 * @alpha
 */
export function fail(message: string): never {
	throw new Error(message);
}

/**
 * Checks whether or not the given object is a `readonly` array.
 *
 * Note that this does NOT indicate if a given array should be treated as readonly.
 * This instead indicates if an object is an Array, and is typed to tolerate the readonly case.
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
 * @remarks TODO: Audit usage of this type in schemas, evaluating whether it is necessary and performance
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

/**
 * Verifies that the supplied indices are valid within the supplied array.
 * @param startIndex - The starting index in the range. Must be in [0, length).
 * @param endIndex - The ending index in the range. Must be within (start, length].
 * @param array - The array the indices refer to
 */
export function assertValidRangeIndices(
	startIndex: number,
	endIndex: number,
	array: { readonly length: number },
) {
	assert(endIndex >= startIndex, 0x79c /* Range indices are malformed. */);
	assertValidIndex(startIndex, array, false);
	assertValidIndex(endIndex, array, true);
}

export function assertValidIndex(
	index: number,
	array: { readonly length: number },
	allowOnePastEnd: boolean = false,
) {
	assertNonNegativeSafeInteger(index);
	if (allowOnePastEnd) {
		assert(index <= array.length, 0x378 /* index must be less than or equal to length */);
	} else {
		assert(index < array.length, 0x379 /* index must be less than length */);
	}
}

export function assertValidRange(
	{ start, end }: { start: number; end: number },
	array: { readonly length: number },
) {
	assertNonNegativeSafeInteger(start);
	assertNonNegativeSafeInteger(end);
	assert(end <= array.length, 0x79d /* Range end must be less than or equal to length */);
	assert(start <= end, 0x79e /* Range start must be less than or equal to range start */);
}

export function assertNonNegativeSafeInteger(index: number) {
	assert(Number.isSafeInteger(index), 0x376 /* index must be an integer */);
	assert(index >= 0, 0x377 /* index must be non-negative */);
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
export type Assume<TInput, TAssumeToBe> = [TInput] extends [TAssumeToBe] ? TInput : TAssumeToBe;

/**
 * The counter used to generate deterministic stable ids for testing purposes.
 */
let deterministicStableIdCount: number | undefined;

/**
 * Runs `f` with {@link generateStableId} altered to return sequential StableIds starting as a fixed seed.
 * Used to make test logic that uses {@link generateStableId} deterministic.
 *
 * @remarks Only use this function for testing purposes.
 *
 * @example
 *
 * ```typescript
 * function f() {
 *    const id = generateStableId();
 *    ...
 * }
 * const result = useDeterministicStableId(f());
 * ```
 */
export function useDeterministicStableId<T>(f: () => T): T {
	assert(
		deterministicStableIdCount === undefined,
		0x6ce /* useDeterministicStableId cannot be nested */,
	);
	deterministicStableIdCount = 1;
	try {
		return f();
		// Since this is intended to be used by tests, and test runners often recover from exceptions to run more tests,
		// clean this up with a finally block to reduce risk of breaking unrelated tests after a failure.
	} finally {
		deterministicStableIdCount = undefined;
	}
}

export async function useAsyncDeterministicStableId<T>(f: () => Promise<T>): Promise<T> {
	assert(
		deterministicStableIdCount === undefined,
		0x79f /* useAsyncDeterministicStableId cannot be nested */,
	);
	deterministicStableIdCount = 1;
	try {
		return await f();
		// Since this is intended to be used by tests, and test runners often recover from exceptions to run more tests,
		// clean this up with a finally block to reduce risk of breaking unrelated tests after a failure.
	} finally {
		deterministicStableIdCount = undefined;
	}
}

/**
 * Generates a random StableId.
 *
 * For test usage desiring deterministic results, see {@link useDeterministicStableId}.
 */
export function generateStableId(): StableId {
	if (deterministicStableIdCount !== undefined) {
		assert(
			deterministicStableIdCount < 281_474_976_710_656,
			0x6cf /* The maximum valid value for deterministicStableIdCount is 16^12 */,
		);
		// Tried to generate a unique id prefixing it with the word 'beef'
		return assertIsStableId(
			`beefbeef-beef-4000-8000-${(deterministicStableIdCount++)
				.toString(16)
				.padStart(12, "0")}`,
		);
	}
	return runtimeGenerateStableId();
}

/**
 * Convert an object into a Map.
 *
 * This function must only be used with objects specifically intended to encode map like information.
 * The only time such objects should be used is for encoding maps as object literals to allow for developer ergonomics or JSON compatibility.
 * Even those two use-cases need to be carefully considered as using objects as maps can have a lot of issues
 * (including but not limited to unintended access to __proto__ and other non-owned keys).
 * This function helps these few cases get into using an actual map in as safe of was as is practical.
 */
export function objectToMap<MapKey extends string | number | symbol, MapValue>(
	objectMap: Record<MapKey, MapValue>,
): Map<MapKey, MapValue> {
	const map = new Map<MapKey, MapValue>();
	// This function must only be used with objects specifically intended to encode map like information.
	for (const key of Object.keys(objectMap)) {
		const element = objectMap[key as MapKey];
		map.set(key as MapKey, element);
	}
	return map;
}

/**
 * Convert an object used as a map into a new object used like a map.
 *
 * @remarks
 * This function must only be used with objects specifically intended to encode map like information.
 * The only time such objects should be used is for encoding maps as object literals to allow for developer ergonomics or JSON compatibility.
 * Even those two use-cases need to be carefully considered as using objects as maps can have a lot of issues
 * (including but not limited to unintended access to __proto__ and other non-owned keys).
 * {@link objectToMap} helps these few cases get into using an actual map in as safe of a way as is practical.
 */
export function transformObjectMap<MapKey extends string | number | symbol, MapValue, NewMapValue>(
	objectMap: Record<MapKey, MapValue>,
	transformer: (value: MapValue, key: MapKey) => NewMapValue,
): Record<MapKey, MapValue> {
	const output: Record<MapKey, MapValue> = Object.create(null);
	// This function must only be used with objects specifically intended to encode map like information.
	for (const key of Object.keys(objectMap)) {
		const element = objectMap[key as MapKey];
		Object.defineProperty(output, key, {
			enumerable: true,
			configurable: true,
			writable: true,
			value: transformer(element, key as MapKey),
		});
	}
	return output;
}

/**
 * Make an inverted copy of a map.
 *
 * @returns a map which can look up the keys from the values of the original map.
 */
export function invertMap<Key, Value>(input: Map<Key, Value>): Map<Value, Key> {
	const result = new Map<Value, Key>(mapIterable(input, ([key, value]) => [value, key]));
	assert(result.size === input.size, "all values in a map must be unique to invert it");
	return result;
}

/**
 * Returns the value from `set` if it contains exactly one item, otherwise `undefined`.
 * @alpha
 */
export function oneFromSet<T>(set: ReadonlySet<T> | undefined): T | undefined {
	if (set === undefined) {
		return undefined;
	}
	if (set.size !== 1) {
		return undefined;
	}
	for (const item of set) {
		return item;
	}
}

/**
 * Type with a name describing what it is.
 * Typically used with values (like schema) that can be stored in a map, but in some representations have their name/key as a field.
 * @alpha
 */
export interface Named<TName> {
	readonly name: TName;
}

/**
 * Placeholder for `Symbol.dispose`.
 *
 * Replace this with `Symbol.dispose` when it is available.
 * @beta
 */
export const disposeSymbol: unique symbol = Symbol("Symbol.dispose placeholder");

/**
 * An object with an explicit lifetime that can be ended.
 * @privateRemarks
 * TODO: align this with core-utils/IDisposable and {@link https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-2.html#using-declarations-and-explicit-resource-management| TypeScript's Disposable}.
 * @beta
 */
export interface IDisposable {
	/**
	 * Call to end the lifetime of this object.
	 *
	 * It is invalid to use this object after this,
	 * except for operations which explicitly document they are valid after disposal.
	 *
	 * @remarks
	 * May cleanup resources retained by this object.
	 * Often includes un-registering from events and thus preventing other objects from retaining a reference to this indefinably.
	 *
	 * Usually the only operations allowed after disposal are querying if an object is already disposed,
	 * but this can vary between implementations.
	 */
	[disposeSymbol](): void;
}

/**
 * Capitalize a string.
 */
export function capitalize<S extends string>(s: S): Capitalize<S> {
	// To avoid splitting characters which are made of multiple UTF-16 code units,
	// use iteration instead of indexing to separate the first character.
	const iterated = s[Symbol.iterator]().next();
	if (iterated.done === true) {
		// Empty string case.
		return "" as Capitalize<S>;
	}

	return (iterated.value.toUpperCase() + s.slice(iterated.value.length)) as Capitalize<S>;
}

/**
 * Compares strings lexically to form a strict partial ordering.
 */
export function compareStrings<T extends string>(a: T, b: T): number {
	return a > b ? 1 : a === b ? 0 : -1;
}
