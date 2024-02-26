/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Zips two arrays, returning an array where each element is a tuple where the i-th tuple contains the i-th element from
 * each of the argument arrays.
 *
 * @param a - The first array.
 * @param b - The second array.
 * @returns An array of pairs of elements from each array. That is, `[[a[0], b[0]], [a[1], b[1]...]`
 */
export function zip<T, U>(a: T[], b: U[]): [T, U][] {
	return a.map((k, i) => [k, b[i]]);
}
