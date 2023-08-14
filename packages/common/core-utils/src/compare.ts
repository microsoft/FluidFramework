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

export function compareObjects(left: unknown, right: unknown) {
	// Helper function to check if two values are equal.
	// Only handles values round-trippable through JSON.
	function deepEquals(a: unknown, b: unknown) {
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
			if (!deepEquals(a[key], b[key])) {
				return false;
			}
		}

		return true;
	}

	// Roundtrip each object through JSON
	const leftRoundtripped = JSON.parse(JSON.stringify(left));
	const rightRoundtripped = JSON.parse(JSON.stringify(right));

	// Compare the roundtripped objects
	return deepEquals(leftRoundtripped, rightRoundtripped);
}

/**
 * Deep compare left and right to see if their serializations would be equivalent.
 * Uses Object.entries to recurse through each object's enumerable properties.
 * Can't use JSON.stringify because properties aren't ordered, and may miss some edge
 * cases where serialization is lossy and different values become equivalent
 * (e.g. NaN serializes to null but that comparison will return false)
 */
export const deepCompareForSerialization = (
	left: unknown, //* Readonly<Record<any, unknown>> | Readonly<Record<number, unknown>>,
	right: unknown, //* Readonly<Record<any, unknown>> | Readonly<Record<number, unknown>>,
): boolean => {
	if (left === right) {
		return true;
	}

	// Do not use for comparing primitives - only proceed if both are objects
	if (typeof left !== "object" || !left || typeof right !== "object" || !right) {
		return false;
	}

	const leftEntries = Object.entries(left);
	const rightEntries = Object.entries(right);
	if (leftEntries.length !== rightEntries.length) {
		return false;
	}

	for (const [key, leftValue] of leftEntries) {
		//* Necessary?  Maybe for props equal to undefined? Don't think we care.
		if (!Object.prototype.hasOwnProperty.call(right, key)) {
			return false;
		}
		const rightValue = right[key];

		if (
			typeof leftValue === "object" &&
			typeof rightValue === "object" &&
			deepCompareForSerialization(
				leftValue as Record<any, unknown>,
				rightValue as Record<any, unknown>,
			)
		) {
			continue;
		}

		if (rightValue !== leftValue) {
			return false;
		}
	}

	return true;
};
