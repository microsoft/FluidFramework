/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { oob } from "@fluidframework/core-utils/internal";

/**
 * Walks `array` from the end and returns the index of the last element matching `predicate`,
 * or `-1` if none match.
 *
 * @privateRemarks
 * This should be replaced with {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/findLastIndex | Array.prototype.findLastIndex}
 * once we are able to target ES2023.
 */
export function findLastIndex<T>(
	array: readonly T[],
	predicate: (item: T) => boolean,
): number {
	for (let i = array.length - 1; i >= 0; i--) {
		if (predicate(array[i] ?? oob())) {
			return i;
		}
	}
	return -1;
}

/**
 * Determines if sets `a` and `b` share no elements.
 *
 * @privateRemarks
 * This should be replaced with {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set/isDisjointFrom | Set.prototype.isDisjointFrom}
 * once we are able to target ES2024 (which also requires at least TypeScript version 5.7).
 */
export function areSetsDisjoint(a: ReadonlySet<unknown>, b: ReadonlySet<unknown>): boolean {
	for (const label of a) {
		if (b.has(label)) {
			return false;
		}
	}
	return true;
}
