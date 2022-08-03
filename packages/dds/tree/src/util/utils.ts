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
