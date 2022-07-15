/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import structuredClone from "@ungap/structured-clone";

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
