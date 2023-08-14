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
 * Given two JSON strings, determines if the objects they represent are equivalent
 *
 * @internal
 */
export function compareJson(left: string, right: string) {
	// This helper only handles inputs parsed from JSON
	function deepCompareParsedInputs(a: unknown, b: unknown) {
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
			if (!deepCompareParsedInputs(a[key], b[key])) {
				return false;
			}
		}

		return true;
	}

	// If the strings match, return immediately without bothering to parse
	if (left === right) {
		return true;
	}

	// Parse and compare the results
	try {
		return deepCompareParsedInputs(JSON.parse(left), JSON.parse(right));
	} catch (e) {
		// If either fails to parse, they can't be considered equivalent
		return false;
	}
}
