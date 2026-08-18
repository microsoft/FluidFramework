/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { benchmarkDuration, benchmarkIt } from "@fluid-tools/benchmark";
import { validateUsageError } from "@fluidframework/test-runtime-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

// eslint-disable-next-line import-x/no-internal-modules -- Import the implementations being tested.
import { codePointCount, utf16LengthForCodePoints } from "../../text/codePointUtils.js";
import { validateIndex } from "../../util/index.js";

/**
 * Simpler but slightly slower implementation of utf16LengthForCodePoints using the string iterator.
 * Used as a reference implementation.
 */
function utf16LengthForCodePointsUsingIterator(
	value: string,
	start: number,
	count: number,
): number {
	validateIndex(start, value, "utf16LengthForCodePoints", true);
	if (count < 0) {
		throw new UsageError(`count (${count}) must be non-negative.`);
	}
	let utf16 = 0;
	let counted = 0;
	for (const codePoint of value.slice(start)) {
		if (counted === count) {
			break;
		}
		utf16 += codePoint.length;
		counted++;
	}
	if (counted !== count) {
		throw new UsageError(
			`count (${count}) exceeds the ${counted} code point(s) available from start (${start}) in a value of length ${value.length}.`,
		);
	}
	return utf16;
}

const implementations = [
	["codePointAt", utf16LengthForCodePoints],
	["string iterator", utf16LengthForCodePointsUsingIterator],
] as const;

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

	for (const [implementationName, implementation] of implementations) {
		describe(`utf16LengthForCodePoints (${implementationName})`, () => {
			it("returns 0 for count = 0", () => {
				assert.equal(implementation("abc", 0, 0), 0);
				assert.equal(implementation("", 0, 0), 0);
				assert.equal(implementation("abc", 3, 0), 0); // at end of string
			});

			it("matches the code-point count for ASCII", () => {
				assert.equal(implementation("abc", 0, 3), 3);
				assert.equal(implementation("abc", 1, 2), 2);
			});

			it("doubles each supplementary-plane code point", () => {
				// "a😀b": a (1) + 😀 (2) + b (1) = 4 UTF-16 units, 3 code points.
				assert.equal(implementation("a😀b", 0, 1), 1); // a
				assert.equal(implementation("a😀b", 0, 2), 3); // a + 😀
				assert.equal(implementation("a😀b", 0, 3), 4); // a + 😀 + b
			});

			it("starts measuring from `start`", () => {
				// "a😀b": skip 'a' (1 unit), measure 1 code point ('😀') = 2 units
				assert.equal(implementation("a😀b", 1, 1), 2);
				// skip 'a' + '😀' (3 units), measure 1 code point ('b') = 1 unit
				assert.equal(implementation("a😀b", 3, 1), 1);
			});

			it("throws UsageError when start is negative", () => {
				assert.throws(
					() => implementation("abc", -1, 1),
					validateUsageError(/Expected non-negative index.*got -1/),
				);
			});

			it("throws UsageError when start is past end of string", () => {
				assert.throws(
					() => implementation("abc", 4, 1),
					validateUsageError(/out of bounds.*Expected at most 3, got 4/),
				);
			});

			it("throws UsageError when count is negative", () => {
				assert.throws(() => implementation("abc", 0, -1), validateUsageError(/count \(-1\)/));
			});

			it("throws UsageError when count exceeds available code points from start", () => {
				assert.throws(() => implementation("abc", 0, 4), validateUsageError(/count \(4\)/));
				assert.throws(() => implementation("abc", 1, 3), validateUsageError(/count \(3\)/));
				// Only 2 code points from index 1 in "a😀b"
				assert.throws(() => implementation("a😀b", 1, 3), validateUsageError(/count \(3\)/));
			});
		});
	}

	describe("benchmarks", () => {
		const cases = [
			{
				name: "short ASCII string",
				value: "The quick brown fox jumps over the lazy dog.",
				start: 4,
				count: 20,
			},
			{
				name: "short mixed string",
				value: "Hello 😀 world 👋 from Fluid 🎉",
				start: 6,
				count: 16,
			},
			{
				name: "small prefix of long mixed string",
				value: "abc😀".repeat(10_000),
				start: 0,
				count: 20,
			},
			{
				name: "entire long mixed string",
				value: "abc😀".repeat(1000),
				start: 0,
				count: 4000,
			},
		] as const;

		for (const benchmarkCase of cases) {
			for (const [implementationName, implementation] of implementations) {
				benchmarkIt({
					title: `${benchmarkCase.name}: ${implementationName}`,
					...benchmarkDuration({
						benchmarkFn: () => {
							implementation(benchmarkCase.value, benchmarkCase.start, benchmarkCase.count);
						},
					}),
				});
			}
		}
	});
});
