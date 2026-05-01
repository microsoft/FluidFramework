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
	});
});
