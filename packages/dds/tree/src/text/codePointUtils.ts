/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

/**
 * Returns the number of Unicode code points in `str`.
 * @remarks
 * Use this to translate a JavaScript string length (which is in UTF-16 code units) into
 * the atom/code-point space used by {@link TextAsTree}.
 * @internal
 */
export function codePointCount(str: string): number {
	// Iterate instead of spreading to avoid allocating an intermediate array.
	let count = 0;
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- counting iterator steps
	for (const _ of str) {
		count++;
	}
	return count;
}

/**
 * Returns the number of UTF-16 code units occupied by the first `count` Unicode code points in `str`,
 * starting at UTF-16 index `start`.
 * @remarks
 * Use this to translate {@link TextAsTree}-space counts (code points) into JavaScript string indices (UTF-16).
 * One code point outside the Basic Multilingual Plane (e.g. most emoji) occupies two UTF-16 code units.
 *
 * Asserts that the requested `count` code points are fully consumable from `start`; silent truncation
 * would misalign delta offsets applied to strings rather than surface the drift to the caller.
 * @param str - The string to measure.
 * @param start - The UTF-16 index in `str` to start measuring from. Must be in `[0, str.length]`.
 * @param count - The number of Unicode code points to measure. Must be non-negative, and there must
 * be at least `count` code points available in `str` starting at `start`.
 * @internal
 */
export function utf16LengthForCodePoints(str: string, start: number, count: number): number {
	assert(start >= 0 && start <= str.length, "start must be within str bounds");
	assert(count >= 0, "count must be non-negative");
	let utf16 = 0;
	let counted = 0;
	while (counted < count && start + utf16 < str.length) {
		utf16 += (str.codePointAt(start + utf16) ?? 0) > 0xffff ? 2 : 1;
		counted++;
	}
	assert(counted === count, "count exceeds available code points from start");
	return utf16;
}
