/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Compare two arrays.  Returns true if their elements are equivalent and in the same order.
 *
 * @legacy
 * @alpha
 *
 * @param left - The first array to compare
 * @param right - The second array to compare
 * @param comparator - The function used to check if two `T`s are equivalent.
 * Defaults to `Object.is()` equality (a shallow compare where NaN = NaN and -0 ≠ 0)
 */
export const compareArrays = <T>(
	left: readonly T[],
	right: readonly T[],
	comparator: (leftItem: T, rightItem: T, index: number) => boolean = (
		leftItem: T,
		rightItem: T,
	): boolean => Object.is(leftItem, rightItem),
): boolean => {
	// PERF: 'for-loop' and 'Array.every()' tied.
	//       '===' and 'Object.is()' tied.
	//       Trivial acceptance adds no measurable overhead.
	//       30% penalty vs. baseline for exported function [node 14 x64].
	return (
		left === right || // Trivial acceptance: 'left' and 'right' are the same instance
		(left.length === right.length && // Trivial rejection: 'left' and 'right' are different lengths
			left.every((leftItem, index) => comparator(leftItem, right[index], index)))
	);
};
