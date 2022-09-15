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
export function compareSets<T>({ a, b, aExtra, bExtra, same }: {
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
 * Use for Json compatible data.
 *
 * Note that this does not robustly forbid non json comparable data via type checking,
 * but instead mostly restricts access to it.
 */
// eslint-disable-next-line @rushstack/no-new-null
export type JsonCompatible = string | number | boolean | null | JsonCompatible[] | { [P in string]: JsonCompatible; };

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
    | { readonly [P in string]: JsonCompatibleReadOnly | undefined; };
