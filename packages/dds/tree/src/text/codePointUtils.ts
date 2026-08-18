/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UsageError } from "@fluidframework/telemetry-utils/internal";

import { validateIndex } from "../util/index.js";

/**
 * Returns the number of Unicode code points in `value`.
 * @remarks
 * Use this to translate a JavaScript string length (which is in UTF-16 code units) into
 * the atom/code-point space used by {@link PlainText} and {@link FormattedText}.
 *
 * @example
 * ```typescript
 * codePointCount("");     // 0
 * codePointCount("abc");  // 3
 * codePointCount("a😀b"); // 3 — emoji is one code point, but "a😀b".length === 4 (UTF-16 surrogate pair)
 * ```
 * @privateRemarks
 * Users of this are assuming the segmentation of their string exactly matches what our text utils do.
 * If they are using this to evaluate what they will do, it might be better to just use the text APis directly, and measure the resulting length.
 * If measuring what they did, then measuring the length of the resulting character array would likely be better.
 * In short: using this typically means making an assumption about how data in one of our string arrays is or will be segmented,
 * which can't always be robust since it's possible to violate our default segmentation policy via round tripping the data and injecting irregular segments.
 * Additionally, using this likely means you will have problems if/when handling embedded objects.
 * Therefore we might want to reevaluate the code using this, instead of promoting it a more stable API surface and encouraging use of it.
 *
 * @alpha
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
 * Use this to translate {@link PlainText} substring lengths (code points) into JavaScript string lengths (UTF-16).
 * One code point outside the Basic Multilingual Plane (e.g. most emoji) occupies two UTF-16 code units.
 *
 * Validates that the requested `count` code points are fully consumable from `start`; silent truncation
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
 * @returns The number of UTF-16 code units occupied by the requested code points.
 * @throws A {@link @fluidframework/telemetry-utils#UsageError} if `start` is out of range,
 * `count` is negative, or fewer than `count` code points are available from `start`.
 *
 * @privateRemarks
 * See remarks on {@link codePointCount} regarding the stability of this API and its assumptions about string segmentation.
 *
 * @alpha
 */
export function utf16LengthForCodePoints(value: string, start: number, count: number): number {
	validateIndex(start, value, "utf16LengthForCodePoints", true);
	if (count < 0) {
		throw new UsageError(`count (${count}) must be non-negative.`);
	}
	let utf16 = 0;
	let counted = 0;
	while (counted < count) {
		if (start + utf16 >= value.length) {
			throw new UsageError(
				`count (${count}) exceeds the ${counted} code point(s) available from start (${start}) in a value of length ${value.length}.`,
			);
		}
		// Code points above 0xFFFF are encoded in UTF-16 as a surrogate pair (2 units);
		// everything else takes a single UTF-16 unit.
		utf16 += (value.codePointAt(start + utf16) ?? 0) > 0xffff ? 2 : 1;
		counted++;
	}
	return utf16;
}
