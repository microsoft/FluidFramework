/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Use this function to assert that an array index is not out-of-bounds.
 * @example
 * ```ts
 * // We know that `numberArray` has four elements in it, so this is safe.
 * const n: number = numberArray[3] ?? oob();
 * ```
 * @internal
 */
export function oob(): never {
	throw new Error("Array index is out of bounds");
}
