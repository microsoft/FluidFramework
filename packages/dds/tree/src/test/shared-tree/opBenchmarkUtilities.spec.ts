/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { assertApproximatelyConstant, assertLinear } from "./opBenchmarkUtilities.js";

describe("opBenchmarkUtilities", () => {
	describe("assertLinear", () => {
		it("throws when given fewer than 3 points", () => {
			assert.throws(() => assertLinear({ points: [] }));
			assert.throws(() => assertLinear({ points: [{ x: 0, y: 0 }] }));
			assert.throws(() =>
				assertLinear({
					points: [
						{ x: 0, y: 0 },
						{ x: 1, y: 1 },
					],
				}),
			);
		});

		it("throws when all points share the same x-value", () => {
			assert.throws(() =>
				assertLinear({
					points: [
						{ x: 5, y: 10 },
						{ x: 5, y: 10 },
						{ x: 5, y: 10 },
					],
				}),
			);
		});

		it("throws when two points share an x-value but have different y-values", () => {
			assert.throws(() =>
				assertLinear({
					points: [
						{ x: 1, y: 5 },
						{ x: 2, y: 7 },
						{ x: 1, y: 6 },
					],
				}),
			);
		});

		it("throws when a point is off the line by even 1 unit", () => {
			// y = 10x + 5, but (4, 46) should be (4, 45)
			assert.throws(() =>
				assertLinear({
					points: [
						{ x: 1, y: 15 },
						{ x: 2, y: 25 },
						{ x: 3, y: 35 },
						{ x: 4, y: 46 }, // off by 1
						{ x: 5, y: 55 },
					],
				}),
			);
		});

		it("returns slope and intercept for a perfect line (positive slope)", () => {
			// y = 2x + 3
			const points = [
				{ x: 1, y: 5 },
				{ x: 2, y: 7 },
				{ x: 3, y: 9 },
				{ x: 4, y: 11 },
			];
			const { slope, intercept } = assertLinear({ points });
			assert.equal(slope, 2);
			assert.equal(intercept, 3);
		});

		it("returns slope and intercept for a perfect line (negative slope)", () => {
			// y = -3x + 100
			const points = [
				{ x: 0, y: 100 },
				{ x: 10, y: 70 },
				{ x: 20, y: 40 },
				{ x: 30, y: 10 },
			];
			const { slope, intercept } = assertLinear({ points });
			assert.equal(slope, -3);
			assert.equal(intercept, 100);
		});

		it("returns slope=0 and correct intercept when all y values are equal", () => {
			const points = [
				{ x: 1, y: 42 },
				{ x: 5, y: 42 },
				{ x: 10, y: 42 },
			];
			const { slope, intercept } = assertLinear({ points });
			assert.equal(slope, 0);
			assert.equal(intercept, 42);
		});

		it("handles duplicate (x, y) points — treats them as one unique point", () => {
			// y = 2x + 3, with point (2, 7) repeated
			const points = [
				{ x: 1, y: 5 },
				{ x: 2, y: 7 },
				{ x: 2, y: 7 }, // duplicate
				{ x: 3, y: 9 },
			];
			const { slope, intercept } = assertLinear({ points });
			assert.equal(slope, 2);
			assert.equal(intercept, 3);
		});

		describe("maxDeviation", () => {
			it("passes when all points are exactly on the regression line (no deviation)", () => {
				// y = 2x + 3
				const points = [
					{ x: 1, y: 5 },
					{ x: 2, y: 7 },
					{ x: 3, y: 9 },
				];
				const { slope, intercept } = assertLinear({ points, maxDeviation: 0 });
				assert.equal(slope, 2);
				assert.equal(intercept, 3);
			});

			it("passes when a point is within tolerance", () => {
				// y = 2x + 3, but (2, 8) is off by 1
				const points = [
					{ x: 1, y: 5 },
					{ x: 2, y: 8 }, // off by 1 from the true line y=7
					{ x: 3, y: 9 },
				];
				// Should not throw with tolerance of 2 bytes
				const { slope } = assertLinear({ points, maxDeviation: 2 });
				// Regression slope should still be close to 2
				assert(Math.abs(slope - 2) < 0.5);
			});

			it("throws when a point exceeds tolerance", () => {
				// y = 2x + 3, but (2, 8) is off by 1
				const points = [
					{ x: 1, y: 5 },
					{ x: 2, y: 8 }, // off by 1
					{ x: 3, y: 9 },
				];
				// Should throw when tolerance is 0 (exact mode)
				assert.throws(() => assertLinear({ points, maxDeviation: 0 }));
			});

			it("uses regression slope, not just first-two-points slope", () => {
				// Three points that are not exactly collinear but close
				// True regression line is approximately y = 6x + 670
				const points = [
					{ x: 1, y: 676 },
					{ x: 10, y: 752 },
					{ x: 100, y: 1294 },
				];
				const { slope, intercept } = assertLinear({ points, maxDeviation: 15 });
				// Regression slope should be between 5 and 8 bytes/unit
				assert(slope > 5 && slope < 8, `Expected slope between 5 and 8, got ${slope}`);
				assert(
					intercept > 650 && intercept < 700,
					`Expected intercept near 670, got ${intercept}`,
				);
			});
		});
	});

	describe("assertApproximatelyConstant", () => {
		it("throws when given fewer than 2 values", () => {
			assert.throws(() => assertApproximatelyConstant({ sizes: [], maxDeltaBytes: 0 }));
			assert.throws(() => assertApproximatelyConstant({ sizes: [42], maxDeltaBytes: 100 }));
		});

		it("passes when all values are identical", () => {
			assertApproximatelyConstant({ sizes: [100, 100, 100], maxDeltaBytes: 0 });
		});

		it("passes when delta equals maxDeltaBytes exactly", () => {
			assertApproximatelyConstant({ sizes: [100, 105], maxDeltaBytes: 5 });
		});

		it("throws when delta exceeds maxDeltaBytes", () => {
			assert.throws(() =>
				assertApproximatelyConstant({ sizes: [100, 107], maxDeltaBytes: 5 }),
			);
		});
	});
});
