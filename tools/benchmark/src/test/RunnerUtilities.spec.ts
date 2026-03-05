/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { formatMeasurementValue, geometricMean, pad, prettyNumber } from "../RunnerUtilities.js";
import { ValueType } from "../ResultTypes.js";

describe("RunnerUtilities", () => {
	it("pad", () => {
		assert.equal(pad(3), "   ");
		assert.equal(pad(3, "x"), "xxx");
		assert.equal(pad(0), "");
	});

	describe("prettyNumber", () => {
		it("formats a number with 3 decimal places by default", () => {
			assert.equal(prettyNumber(1.5), "1.500");
			assert.equal(prettyNumber(0), "0.000");
		});

		it("respects a custom decimal count", () => {
			assert.equal(prettyNumber(3.14159, 2), "3.14");
			assert.equal(prettyNumber(42, 0), "42");
		});

		it("adds commas to large numbers before the decimal", () => {
			assert.equal(prettyNumber(1234567.89, 2), "1,234,567.89");
			assert.equal(prettyNumber(1000, 0), "1,000");
		});

		it("uses exponential notation when there are more than 9 digits before the decimal", () => {
			// 1234567890 has 10 digits before the decimal
			const result = prettyNumber(1_234_567_890, 2);
			assert.equal(result, "1.23e9");
		});
	});

	describe("geometricMean", () => {
		function assertApproximatelyEqual(actual: number, expected: number, epsilon = 1e-10): void {
			assert.ok(
				Math.abs(actual - expected) < epsilon,
				`Expected ${actual} to be approximately equal to ${expected}`,
			);
		}
		it("computes the geometric mean of positive numbers", () => {
			// geometric mean of [4, 9] = sqrt(4 * 9) = 6
			assertApproximatelyEqual(geometricMean([4, 9]), 6);
		});

		it("returns the value itself for a single-element array", () => {
			assertApproximatelyEqual(geometricMean([5]), 5);
		});

		it("returns 0 when any value is zero", () => {
			assert.equal(geometricMean([1, 0, 2]), 0);
		});

		it("returns 0 when any value is negative", () => {
			assert.equal(geometricMean([1, -1, 2]), 0);
		});

		it("returns NaN when any value is NaN", () => {
			assert.equal(geometricMean([1, NaN, 2]), Number.NaN);
		});
	});

	describe("formatMeasurementValue", () => {
		it("formats count measurements as integers without units", () => {
			assert.equal(
				formatMeasurementValue({ name: "items", value: 42, units: "count" }),
				"42",
			);
			assert.equal(
				formatMeasurementValue({ name: "items", value: 1000, units: "count" }),
				"1,000",
			);
		});

		it("throws for non-integer count measurements", () => {
			assert.throws(() =>
				formatMeasurementValue({ name: "items", value: 1.5, units: "count" }),
			);
		});

		it("formats bytes with binary prefix scaling", () => {
			assert.equal(
				formatMeasurementValue({ name: "mem", value: 1024, units: "bytes" }),
				"1.00 KiB",
			);
			assert.equal(
				formatMeasurementValue({ name: "mem", value: 1024 * 1024, units: "bytes" }),
				"1.00 MiB",
			);
		});

		it("formats bytes without scaling when scaleUnits is false", () => {
			assert.equal(
				formatMeasurementValue({ name: "mem", value: 1024, units: "bytes" }, false),
				"1,024.00 B",
			);
		});

		it("formats percentage measurements", () => {
			assert.equal(
				formatMeasurementValue({ name: "rate", value: 42.5, units: "%" }),
				"42.500%",
			);
		});

		it("scales ns/op to ms/op when value reaches 1e6", () => {
			assert.equal(
				formatMeasurementValue({ name: "time", value: 1_000_000, units: "ns/op" }),
				"1.00 ms/op",
			);
		});

		it("scales ns/op to s/op when value reaches 1e9", () => {
			assert.equal(
				formatMeasurementValue({ name: "time", value: 1_000_000_000, units: "ns/op" }),
				"1.00 s/op",
			);
		});

		it("keeps ns/op units when scaleUnits is false", () => {
			const result = formatMeasurementValue(
				{ name: "time", value: 1_000_000, units: "ns/op" },
				false,
			);
			assert.match(result, /ns\/op/);
		});

		it("formats measurements with custom units", () => {
			assert.equal(
				formatMeasurementValue({ name: "score", value: 42.123, units: "custom" }),
				"42.123 custom",
			);
		});

		it("formats measurements with no units", () => {
			assert.equal(formatMeasurementValue({ name: "score", value: 42.123 }), "42.123");
		});

		it("handles ValueType on non-special units without affecting format", () => {
			assert.equal(
				formatMeasurementValue({
					name: "score",
					value: 1.5,
					units: "ops",
					type: ValueType.LargerIsBetter,
				}),
				"1.500 ops",
			);
		});
	});
});
