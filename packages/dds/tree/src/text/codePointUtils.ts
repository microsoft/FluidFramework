/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

/**
 * Returns the number of Unicode code points in `value`.
 * @remarks
 * Use this to translate a JavaScript string length (which is in UTF-16 code units) into
 * the atom/code-point space used by {@link TextAsTree}.
 *
 * @example
 * ```typescript
 * codePointCount("");     // 0
 * codePointCount("abc");  // 3
 * codePointCount("a😀b"); // 3 — emoji is one code point, but "a😀b".length === 4 (UTF-16 surrogate pair)
 * ```
 *
 * @internal
 */
export function codePointCount(value: string): number {
	// Iterate instead of spreading to avoid allocating an intermediate array.
	let count = 0;
	for (const _ of value) {
		count++;
	}
	return count;
}

/**
 * Returns the number of UTF-16 code units occupied by the first `count` Unicode code points in `value`,
 * starting at UTF-16 index `start`.
 * @remarks
 * Use this to translate {@link TextAsTree}-space counts (code points) into JavaScript string indices (UTF-16).
 * One code point outside the Basic Multilingual Plane (e.g. most emoji) occupies two UTF-16 code units.
 *
 * Asserts that the requested `count` code points are fully consumable from `start`; silent truncation
 * would misalign delta offsets applied to strings rather than surface the drift to the caller.
 *
 * @example
 * ```typescript
 * utf16LengthForCodePoints("abc", 0, 3);  // 3 — three single-unit characters
 * utf16LengthForCodePoints("a😀b", 0, 3); // 4 — a (1) + 😀 (2) + b (1)
 * utf16LengthForCodePoints("a😀b", 1, 1); // 2 — just the emoji
 * utf16LengthForCodePoints("abc", 0, 0);  // 0 — no code points requested
 * ```
 *
 * @param value - The string to measure.
 * @param start - The UTF-16 index in `value` to start measuring from. Must be in `[0, value.length]`.
 * @param count - The number of Unicode code points to measure. Must be non-negative, and there must
 * be at least `count` code points available in `value` starting at `start`.
 * @internal
 */
export function utf16LengthForCodePoints(value: string, start: number, count: number): number {
	assert(start >= 0 && start <= value.length, "start must be within value bounds");
	assert(count >= 0, "count must be non-negative");
	let utf16 = 0;
	let counted = 0;
	while (counted < count && start + utf16 < value.length) {
		// Code points above 0xFFFF are encoded in UTF-16 as a surrogate pair (2 units);
		// everything else takes a single UTF-16 unit.
		utf16 += (value.codePointAt(start + utf16) ?? 0) > 0xffff ? 2 : 1;
		counted++;
	}
	assert(counted === count, "count exceeds available code points from start");
	return utf16;
}
