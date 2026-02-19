/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { generateTestSeeds, StressMode } from "../describeFuzz.js";

describe("generateTestSeeds", () => {
	const testCount = 100;

	it("should generate seeds for short stress mode", () => {
		const seeds = generateTestSeeds(testCount, StressMode.Short);
		assert.strictEqual(seeds.length, testCount);
		assert.deepStrictEqual(
			seeds,
			Array.from({ length: testCount }, (_, i) => i),
		);
	});

	it("should generate seeds for normal stress mode", () => {
		const seeds = generateTestSeeds(testCount, StressMode.Normal);
		assert.strictEqual(seeds.length, testCount);
		assert.deepStrictEqual(
			seeds,
			Array.from({ length: testCount }, (_, i) => i),
		);
	});

	it("should generate seeds for long stress mode", () => {
		const seeds = generateTestSeeds(testCount, StressMode.Long);
		assert.strictEqual(seeds.length, testCount * 2);
		// Check that seeds are incrementing
		for (let i = 1; i < seeds.length; i++) {
			assert.strictEqual(seeds[i], seeds[i - 1] + 1);
		}
	});

	it("should generate different seeds for different runs of long stress mode", () => {
		const seeds1 = generateTestSeeds(testCount, StressMode.Long);
		const seeds2 = generateTestSeeds(testCount, StressMode.Long);
		// If this test is ever flaky, consider running multiple trials (as the starting seed is random, sometimes they could be legitimately the same)
		assert.notDeepStrictEqual(seeds1, seeds2);
	});

	it("should have all seeds within valid range for long stress mode", () => {
		const seeds = generateTestSeeds(testCount, StressMode.Long);
		for (const seed of seeds) {
			assert.ok(seed >= 0 && seed <= Number.MAX_SAFE_INTEGER);
		}
	});
});
