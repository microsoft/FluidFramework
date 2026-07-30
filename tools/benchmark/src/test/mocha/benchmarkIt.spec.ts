/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { BenchmarkMode, currentBenchmarkMode } from "../../Configuration.js";
import { benchmarkDuration } from "../../durationBenchmarking/getDuration.js";
import { benchmarkIt } from "../../mocha/index.js";
import { ValueType, type CollectedData } from "../../reportTypes.js";

const sampleData: CollectedData = [
	{
		name: "the data",
		value: 1,
		units: "numbers",
		type: ValueType.SmallerIsBetter,
		significance: "Primary",
	},
];

describe("benchmarkIt", () => {
	benchmarkIt({
		title: "benchmarkIt test",
		run: (): CollectedData => sampleData,
	});

	benchmarkIt({
		title: "benchmarkDuration test",
		...benchmarkDuration({
			minBatchDurationSeconds: 0,
			minBatchCount: 1,
			maxBenchmarkDurationSeconds: 0,
			benchmarkFn: () => {
				// no-op
			},
		}),
	});

	describe("MochaBenchmarkOptions", () => {
		const otherMode =
			currentBenchmarkMode === BenchmarkMode.Correctness
				? BenchmarkMode.Performance
				: BenchmarkMode.Correctness;

		const testTimeout = 12345;
		const timeoutTest = benchmarkIt({
			title: "correctnessTimeoutMs option",
			correctnessTimeoutMs: testTimeout,
			run: (): CollectedData => sampleData,
		});

		const skipMatchingModeTest = benchmarkIt({
			title: "skip matching mode option",
			skip: currentBenchmarkMode,
			run: (): CollectedData => assert.fail("This test should be skipped"),
		});

		const skipOtherModeTest = benchmarkIt({
			title: "skip non-matching mode option",
			skip: otherMode,
			run: (): CollectedData => sampleData,
		});

		const skipAlwaysTest = benchmarkIt({
			title: "skip true option",
			skip: true,
			run: (): CollectedData => sampleData,
		});

		it("correctnessTimeoutMs sets timeout only in Correctness mode", () => {
			if (currentBenchmarkMode === BenchmarkMode.Correctness) {
				assert.equal(timeoutTest.timeout(), testTimeout);
			} else {
				assert.notEqual(timeoutTest.timeout(), testTimeout);
			}
		});

		it("skip", () => {
			assert.equal(skipAlwaysTest.pending, true);
			assert.equal(skipMatchingModeTest.pending, true);
			assert.equal(skipOtherModeTest.pending, false);

			// Ensure non skipped tests are not marked as pending (helps validate the above check is correct)
			assert.equal(timeoutTest.pending, false);
		});
	});
});
