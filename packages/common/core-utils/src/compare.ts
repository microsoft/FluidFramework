/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Compare two arrays.  Returns true if their elements are equivalent and in the same order.
 *
 * @internal
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
	) => Object.is(leftItem, rightItem),
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

/**
 * Deep compare left and right to see if their serializations would be equivalent.
 * Roundtrips through JSON, then does a recursive comparison iterating at each level via Object.keys
 *
 * @internal
 */
export function deepCompareForSerialization(left: unknown, right: unknown) {
	// This helper only handles values round-trippable through JSON.
	function deepCompareRoundtrippedInputs(a: unknown, b: unknown) {
		// Start with strict equality
		if (a === b) {
			return true;
		}

		// Strict equality failed. Deep equality only applies to objects,
		// so only proceed if they're both non-null objects.
		if (typeof a !== "object" || !a || typeof b !== "object" || !b) {
			return false;
		}

		// Ensure the property count matches
		const keysA = Object.keys(a);
		const keysB = Object.keys(b);
		if (keysA.length !== keysB.length) {
			return false;
		}

		// Ensure all properties of A are found identically in B
		for (const key of keysA) {
			if (!deepCompareRoundtrippedInputs(a[key], b[key])) {
				return false;
			}
		}

		return true;
	}

	// Handle undefined first, since JSON.stringify(undefined) throws
	if (left === undefined || right === undefined) {
		return left === right;
	}

	// Roundtrip each input through JSON
	const leftRoundtripped = JSON.parse(JSON.stringify(left));
	const rightRoundtripped = JSON.parse(JSON.stringify(right));

	// Compare the roundtripped inputs
	return deepCompareRoundtrippedInputs(leftRoundtripped, rightRoundtripped);
}
