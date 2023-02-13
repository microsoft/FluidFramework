/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Like a `join` operation, this injects the specified `separator` between each pair of elements in the
 * array, and returns the result.
 *
 * Unlike `join`, this `separator` can be anything, and the returned result is an `array`, rather than a `string`.
 */
export function injectSeparator<T>(array: T[], separator: T): T[] {
	const result: T[] = [];
	let needsSeparator = false;
	for (const value of array) {
		if (needsSeparator) {
			result.push(separator);
		}
		result.push(value);
		needsSeparator = true;
	}
	return result;
}
