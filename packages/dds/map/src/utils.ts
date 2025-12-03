/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Rough polyfill for Array.findLastIndex until we target ES2023 or greater.
 */
export const findLastIndex = <T>(array: T[], callbackFn: (value: T) => boolean): number => {
	for (let i = array.length - 1; i >= 0; i--) {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		if (callbackFn(array[i]!)) {
			return i;
		}
	}
	return -1;
};

/**
 * Rough polyfill for Array.findLast until we target ES2023 or greater.
 */
export const findLast = <T>(array: T[], callbackFn: (value: T) => boolean): T | undefined =>
	array[findLastIndex(array, callbackFn)];
