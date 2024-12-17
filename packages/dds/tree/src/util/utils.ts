/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
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
 * Returns the last element of an array, or `undefined` if the array has no elements.
 * @param array - The array to get the last element from.
 * @remarks
 * If the type of the array has been narrowed by e.g. {@link hasSome | hasSome(array)} or {@link hasSingle | hasOne(array)} then the return type will be `T` rather than `T | undefined`.
 */
export function getLast<T>(array: readonly [T, ...T[]]): T;
export function getLast<T>(array: { [index: number]: T; length: number }): T | undefined;
export function getLast<T>(array: { [index: number]: T; length: number }): T | undefined {
	return array[array.length - 1];
}

/**
 * Returns true if and only if the given array has at least one element.
 * @param array - The array to check.
 * @remarks
 * If `array` contains at least one element, its type will be narrowed and can benefit from improved typing from e.g. `array[0]` and {@link getLast | getLast(array)}.
 * This is especially useful when "noUncheckedIndexedAccess" is enabled in the TypeScript compiler options, since the return type of `array[0]` will be `T` rather than `T | undefined`.
 */
export function hasSome<T>(array: T[]): array is [T, ...T[]];
export function hasSome<T>(array: readonly T[]): array is readonly [T, ...T[]];
export function hasSome<T>(array: readonly T[]): array is [T, ...T[]] {
	return array.length > 0;
}

/**
 * Returns true if and only if the given array has exactly one element.
 * @param array - The array to check.
 * @remarks
 * If `array` contains exactly one element, its type will be narrowed and can benefit from improved typing from e.g. `array[0]` and {@link getLast | getLast(array)}.
 * This is especially useful when "noUncheckedIndexedAccess" is enabled in the TypeScript compiler options, since the return type of `array[0]` will be `T` rather than `T | undefined`.
 */
export function hasSingle<T>(array: T[]): array is [T];
export function hasSingle<T>(array: readonly T[]): array is readonly [T];
export function hasSingle<T>(array: readonly T[]): array is [T] {
	return array.length === 1;
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
			if (aExtra !== undefined) {
				if (!aExtra(item)) {
					return false;
				}
			} else {
				return false;
			}
		} else {
			if (same !== undefined && !same(item)) {
				return false;
			}
		}
	}
	for (const item of b.keys()) {
		if (!a.has(item)) {
			if (bExtra !== undefined) {
				if (!bExtra(item)) {
					return false;
				}
			} else {
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
export function* mapIterable<T, U>(
	iterable: Iterable<T>,
	map: (t: T) => U,
): IterableIterator<U> {
	for (const t of iterable) {
		yield map(t);
	}
}

/**
 * Filter one iterable into another
 * @param iterable - the iterable to filter
 * @param filter - the predicate function to run on each element of the iterable
 * @returns a new iterable including only the elements that passed the filter predicate
 */
export function* filterIterable<T>(
	iterable: Iterable<T>,
	filter: (t: T) => boolean,
): IterableIterator<T> {
	for (const t of iterable) {
		if (filter(t)) {
			yield t;
		}
	}
}

/**
 * Finds the first element in the given iterable that satisfies a predicate.
 * @param iterable - The iterable to search for an eligible element
 * @param predicate - The predicate to run against each element
 * @returns The first element in the iterable that satisfies the predicate, or undefined if the iterable contains no such element
 */
export function find<T>(iterable: Iterable<T>, predicate: (t: T) => boolean): T | undefined {
	for (const t of iterable) {
		if (predicate(t)) {
			return t;
		}
	}
}

/**
 * Counts the number of elements in the given iterable.
 * @param iterable - the iterable to enumerate
 * @returns the number of elements that were iterated after exhausting the iterable
 */
export function count(iterable: Iterable<unknown>): number {
	let n = 0;
	for (const _ of iterable) {
		n += 1;
	}
	return n;
}

/**
 * Use for Json compatible data.
 *
 * @typeparam TExtra - Type permitted in addition to the normal JSON types.
 * Commonly used for to allow {@link @fluidframework/core-interfaces#IFluidHandle} within the otherwise JSON compatible content.
 *
 * @remarks
 * This does not robustly forbid non json comparable data via type checking,
 * but instead mostly restricts access to it.
 * @alpha
 */
export type JsonCompatible<TExtra = never> =
	| string
	| number
	| boolean
	// eslint-disable-next-line @rushstack/no-new-null
	| null
	| JsonCompatible<TExtra>[]
	| JsonCompatibleObject<TExtra>
	| TExtra;

/**
 * Use for Json object compatible data.
 * @remarks
 * This does not robustly forbid non json comparable data via type checking,
 * but instead mostly restricts access to it.
 * @alpha
 */
export type JsonCompatibleObject<TExtra = never> = { [P in string]?: JsonCompatible<TExtra> };

/**
 * Use for readonly view of Json compatible data.
 * @remarks
 * This does not robustly forbid non json comparable data via type checking,
 * but instead mostly restricts access to it.
 */
export type JsonCompatibleReadOnly =
	| string
	| number
	| boolean
	// eslint-disable-next-line @rushstack/no-new-null
	| null
	| readonly JsonCompatibleReadOnly[]
	| JsonCompatibleReadOnlyObject;

/**
 * Use for readonly view of Json compatible data.
 * @remarks
 * This does not robustly forbid non json comparable data via type checking,
 * but instead mostly restricts access to it.
 */
export type JsonCompatibleReadOnlyObject = { readonly [P in string]?: JsonCompatibleReadOnly };

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
): void {
	assert(endIndex >= startIndex, 0x79c /* Range indices are malformed. */);
	assertValidIndex(startIndex, array, false);
	assertValidIndex(endIndex, array, true);
}

export function assertValidIndex(
	index: number,
	array: { readonly length: number },
	allowOnePastEnd: boolean = false,
): void {
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
): void {
	assertNonNegativeSafeInteger(start);
	assertNonNegativeSafeInteger(end);
	assert(end <= array.length, 0x79d /* Range end must be less than or equal to length */);
	assert(start <= end, 0x79e /* Range start must be less than or equal to range start */);
}

export function assertNonNegativeSafeInteger(index: number): void {
	assert(Number.isSafeInteger(index), 0x376 /* index must be an integer */);
	assert(index >= 0, 0x377 /* index must be non-negative */);
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
export function transformObjectMap<
	MapKey extends string | number | symbol,
	MapValue,
	NewMapValue,
>(
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
	assert(
		result.size === input.size,
		0x88a /* all values in a map must be unique to invert it */,
	);
	return result;
}

/**
 * Returns the value from `set` if it contains exactly one item, otherwise `undefined`.
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
 */
export interface Named<TName> {
	readonly name: TName;
}

/**
 * Order {@link Named} objects by their name.
 */
export function compareNamed(a: Named<string>, b: Named<string>): -1 | 0 | 1 {
	if (a.name < b.name) {
		return -1;
	}
	if (a.name > b.name) {
		return 1;
	}
	return 0;
}

/**
 * Placeholder for `Symbol.dispose`.
 * @privateRemarks
 * TODO: replace this with `Symbol.dispose` when it is available or make it a valid polyfill.
 */
export const disposeSymbol: unique symbol = Symbol("Symbol.dispose placeholder");

/**
 * An object with an explicit lifetime that can be ended.
 * @privateRemarks
 * Simpler alternative to core-utils/IDisposable for internal use in this package.
 * This avoids adding a named "dispose" method, and will eventually be replaced with
 * {@link https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-2.html#using-declarations-and-explicit-resource-management| TypeScript's Disposable}.
 *
 * Once this is replaced with TypeScript's Disposable, core-utils/IDisposable can extend it, bringing the APIs into a reasonable alignment.
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

/**
 * Defines a property on an object that is lazily initialized and cached.
 * @remarks This is useful for properties that are expensive to compute and it is not guaranteed that they will be accessed.
 * This function initially defines a getter on the object, but after first read it replaces the getter with a value property.
 * @param obj - The object on which to define the property.
 * @param key - The key of the property to define.
 * @param get - The function (called either once or not at all) to compute the value of the property.
 * @returns `obj`, typed such that it has the new property.
 * This allows for the new property to be read off of `obj` in a type-safe manner after calling this function.
 */
export function defineLazyCachedProperty<
	T extends object,
	K extends string | number | symbol,
	V,
>(obj: T, key: K, get: () => V): typeof obj & { [P in K]: V } {
	Reflect.defineProperty(obj, key, {
		get() {
			const value = get();
			Reflect.defineProperty(obj, key, { value });
			return value;
		},
		configurable: true,
	});
	return obj as typeof obj & { [P in K]: V };
}
