/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { collectDurationData } from "../../durationBenchmarking/index.js";
import {
	Phase,
	runBenchmarkAsync,
	runBenchmarkSync,
} from "../../durationBenchmarking/getDuration.js";
import * as Configuration from "../../Configuration.js";
import type { CollectedData } from "../../ResultTypes.js";

describe("getDuration", () => {
	it("collectDurationData sync", async () => {
		let ran = false;
		const result = await collectDurationData({
			maxBenchmarkDurationSeconds: 0.1,
			minBatchCount: 1,
			minBatchDurationSeconds: 0,
			benchmarkFn: () => {
				ran = true;
			},
		});
		assert(ran);
		assert.equal(result[0].name, "Period");
	});

	it("runBenchmarkSync", async () => {
		let ran = false;
		runBenchmarkSync({
			maxBenchmarkDurationSeconds: 0.1,
			minBatchCount: 1,
			minBatchDurationSeconds: 0,
			benchmarkFn: () => {
				ran = true;
			},
		});
		assert(ran);
	});

	it("collectDurationData async", async () => {
		let ran = false;
		await collectDurationData({
			maxBenchmarkDurationSeconds: 0.1,
			minBatchCount: 1,
			minBatchDurationSeconds: 0,
			benchmarkFnAsync: async () => {
				await delay(0);
				ran = true;
			},
		});
		assert(ran);
	});

	it("runBenchmarkAsync", async () => {
		let ran = false;
		await runBenchmarkAsync({
			maxBenchmarkDurationSeconds: 0.1,
			minBatchCount: 1,
			minBatchDurationSeconds: 0,
			benchmarkFnAsync: async () => {
				ran = true;
				await delay(0);
			},
		});
		assert(ran);
	});

	it("collectDurationData custom", async () => {
		let ran = false;
		await collectDurationData({
			maxBenchmarkDurationSeconds: 0.1,
			minBatchCount: 1,
			minBatchDurationSeconds: 0,
			benchmarkFnCustom: async (state) => {
				// Before test custom setup
				const foo = { value: -1 };
				let running: boolean;
				do {
					// Per batch custom setup
					foo.value = 0;
					running = state.timeBatch(() => {
						foo.value++;
					});
					// After batch custom cleanup/validation
					assert.equal(foo.value, state.iterationsPerBatch);
				} while (running);
				// After test custom cleanup
				foo.value = -1;

				await delay(0);
				ran = true;
			},
		});
		assert(ran);
	});

	it("collectDurationData output validation", async () => {
		const before = Configuration.isInPerformanceTestingMode;

		// This test checks that when in performance testing mode,
		// that the output of duration tests is as expected.
		// Currently doing this requires forcing `isInPerformanceTestingMode` to true,
		// which is not ideal but is worth it to have this test.
		// A better option would to allow setting `isInPerformanceTestingMode` as a parameter to override a default from the environment,
		// but that is not currently supported.
		const mutableConfig = Configuration as Mutable<typeof Configuration>;

		let result: CollectedData;

		// It is critically import to restore this value after the test to avoid messing up unrelated tests,
		// so we do that in a finally block to ensure it happens even if the test fails.
		mutableConfig.isInPerformanceTestingMode = true;
		try {
			result = await collectDurationData({
				maxBenchmarkDurationSeconds: 0,
				minBatchCount: 2,
				minBatchDurationSeconds: 0,
				startPhase: Phase.CollectData,
				benchmarkFnCustom: async (state) => {
					assert(state.recordBatch(1.0));
					assert(!state.recordBatch(2.0));
				},
			});
		} finally {
			mutableConfig.isInPerformanceTestingMode = before;
		}

		// The exact expected measurements here can be updated as needed, but be aware that when doing so,
		// anything which consumes the performance reports may be impacted, which can be a breaking change.
		assert.deepEqual(result, [
			{
				name: "Period",
				significance: "Primary",
				type: "SmallerIsBetter",
				units: "ns/op",
				value: 1500000000,
			},
			{
				name: "Batch Count",
				significance: "Diagnostic",
				units: "count",
				value: 2,
			},
			{
				name: "Iterations Per Batch",
				significance: "Diagnostic",
				units: "count",
				value: 1,
			},
			{
				name: "Margin of Error",
				type: "SmallerIsBetter",
				units: "ns",
				value: 6353000000,
			},
			{
				name: "Relative Margin of Error",
				type: "SmallerIsBetter",
				units: "%",
				value: 423.5333333333333,
			},
		]);
	});
});

const delay = async (milliseconds: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, milliseconds));

type Mutable<T> = {
	-readonly [P in keyof T]: T[P];
};
