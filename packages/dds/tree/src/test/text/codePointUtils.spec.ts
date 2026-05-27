/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { validateUsageError } from "@fluidframework/test-runtime-utils/internal";

// Allow importing file being tested
// eslint-disable-next-line import-x/no-internal-modules
import { codePointCount, utf16LengthForCodePoints } from "../../text/codePointUtils.js";

describe("codePointUtils", () => {
	describe("codePointCount", () => {
		it("returns 0 for empty string", () => {
			assert.equal(codePointCount(""), 0);
		});

		it("counts ASCII characters one-for-one", () => {
			assert.equal(codePointCount("abc"), 3);
		});

		it("counts a supplementary-plane code point as 1 (not its UTF-16 unit count)", () => {
			// "😀".length === 2 because it's a UTF-16 surrogate pair, but it's 1 code point.
			assert.equal(codePointCount("😀"), 1);
			// Mixed BMP + supplementary: "a😀b".length === 4, but 3 code points.
			assert.equal(codePointCount("a😀b"), 3);
			// Adjacent emoji aren't merged.
			assert.equal(codePointCount("👋🌍🎉"), 3);
		});
	});

	describe("utf16LengthForCodePoints", () => {
		it("returns 0 for count = 0", () => {
			assert.equal(utf16LengthForCodePoints("abc", 0, 0), 0);
			assert.equal(utf16LengthForCodePoints("", 0, 0), 0);
			assert.equal(utf16LengthForCodePoints("abc", 3, 0), 0); // at end of string
		});

		it("matches the code-point count for ASCII", () => {
			assert.equal(utf16LengthForCodePoints("abc", 0, 3), 3);
			assert.equal(utf16LengthForCodePoints("abc", 1, 2), 2);
		});

		it("doubles each supplementary-plane code point", () => {
			// "a😀b": a (1) + 😀 (2) + b (1) = 4 UTF-16 units, 3 code points.
			assert.equal(utf16LengthForCodePoints("a😀b", 0, 1), 1); // a
			assert.equal(utf16LengthForCodePoints("a😀b", 0, 2), 3); // a + 😀
			assert.equal(utf16LengthForCodePoints("a😀b", 0, 3), 4); // a + 😀 + b
		});

		it("starts measuring from `start`", () => {
			// "a😀b": skip 'a' (1 unit), measure 1 code point ('😀') = 2 units
			assert.equal(utf16LengthForCodePoints("a😀b", 1, 1), 2);
			// skip 'a' + '😀' (3 units), measure 1 code point ('b') = 1 unit
			assert.equal(utf16LengthForCodePoints("a😀b", 3, 1), 1);
		});

		it("throws UsageError when start is negative", () => {
			assert.throws(
				() => utf16LengthForCodePoints("abc", -1, 1),
				validateUsageError(/start \(-1\)/),
			);
		});

		it("throws UsageError when start is past end of string", () => {
			assert.throws(
				() => utf16LengthForCodePoints("abc", 4, 1),
				validateUsageError(/start \(4\)/),
			);
		});

		it("throws UsageError when count is negative", () => {
			assert.throws(
				() => utf16LengthForCodePoints("abc", 0, -1),
				validateUsageError(/count \(-1\)/),
			);
		});

		it("throws UsageError when count exceeds available code points from start", () => {
			assert.throws(
				() => utf16LengthForCodePoints("abc", 0, 4),
				validateUsageError(/count \(4\)/),
			);
			assert.throws(
				() => utf16LengthForCodePoints("abc", 1, 3),
				validateUsageError(/count \(3\)/),
			);
			// Only 2 code points from index 1 in "a😀b"
			assert.throws(
				() => utf16LengthForCodePoints("a😀b", 1, 3),
				validateUsageError(/count \(3\)/),
			);
		});
	});
});
