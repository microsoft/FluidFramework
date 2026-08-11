/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Interface for intervals that have comparison override properties.
 */
export const forceCompare = Symbol();

export interface HasComparisonOverride {
	[forceCompare]: number;
}

/**
 * Compares two objects based on their comparison override properties.
 * @returns A number indicating the order of the intervals (negative for a is lower than b, 0 for tie, positive for a is greater than b).
 */
export function compareOverrideables(
	a: Partial<HasComparisonOverride>,
	b: Partial<HasComparisonOverride>,
): number {
	const forceCompareA = a[forceCompare] ?? 0;
	const forceCompareB = b[forceCompare] ?? 0;

	return forceCompareA - forceCompareB;
}
