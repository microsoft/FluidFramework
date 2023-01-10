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

export function fail(message: string): never {
    throw new Error(message);
}

/**
 * Use as a default branch in switch statements to enforce (at compile time) that all possible branches are accounted
 * for, according to the TypeScript type system.
 * As an additional protection, it errors if called.
 *
 * Example:
 * ```typescript
 * const bool: true | false = ...;
 * switch(bool) {
 *   case true: {...}
 *   case false: {...}
 *   default: unreachableCase(bool);
 * }
 * ```
 *
 * @param never - The switch value
 */
export function unreachableCase(never: never): never {
    fail("unreachableCase was called");
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
 * Compares strings lexically to form a strict partial ordering.
 */
export function compareStrings<T extends string>(a: T, b: T): number {
    return a > b ? 1 : a === b ? 0 : -1;
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
 * Copies a property in such a way that it is only set on `destination` if it is present on `source`.
 * This avoids having explicit undefined values under properties that would cause `Object.hasOwnProperty` to return true.
 */
export function copyPropertyIfDefined<TSrc, TDst>(
    source: TSrc,
    destination: TDst,
    property: keyof TSrc,
): void {
    const value = source[property];
    if (value !== undefined) {
        (destination as any)[property] = value;
    }
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

/**
 * Use for Json compatible data.
 *
 * Note that this does not robustly forbid non json comparable data via type checking,
 * but instead mostly restricts access to it.
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
 */
export type JsonCompatibleObject = { [P in string]: JsonCompatible };

/**
 * Use for readonly view of Json compatible data.
 *
 * Note that this does not robustly forbid non json comparable data via type checking,
 * but instead mostly restricts access to it.
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

/** A union type of the first `N` positive integers */
export type TakeWholeNumbers<N extends number, A extends never[] = []> = N extends A["length"]
    ? never
    : A["length"] | TakeWholeNumbers<N, [never, ...A]>;

/** Returns a tuple type with exactly `Length` elements of type `T` */
export type ArrayOfLength<T, Length extends number, A extends T[] = []> = Length extends A["length"]
    ? A
    : ArrayOfLength<T, Length, [T, ...A]>;

/**
 * Returns true iff `array` has exactly `length` elements
 */
export function hasExactlyLength<T, Len extends TakeWholeNumbers<16>>(
    array: readonly T[],
    length: Len,
): array is ArrayOfLength<T, Len> {
    return array.length === length;
}

/**
 * Fails true iff `array` has at least `length` elements
 */
export function hasAtLeastLength<T, Len extends TakeWholeNumbers<16>>(
    array: readonly T[],
    length: Len,
): array is [...ArrayOfLength<T, Len>, ...T[]] {
    return array.length >= length;
}
