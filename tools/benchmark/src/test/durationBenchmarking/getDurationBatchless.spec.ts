/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { TestType } from "../../Configuration.js";
import {
	BatchlessBenchmarkState,
	benchmarkDurationBatchless,
} from "../../durationBenchmarking/getDurationBatchless.js";
import { BenchmarkState, Phase } from "../../durationBenchmarking/getDuration.js";
import { timer } from "../../timer.js";
import { benchmarkIt } from "../../mocha/benchmarkIt.js";

describe("getDurationBatchless", () => {
	benchmarkIt({
		title: "BenchmarkDurationBatchless demonstration",
		...benchmarkDurationBatchless({
			benchmarkFn: async (state) => {
				let running: boolean;
				do {
					// Per-iteration setup (not timed)
					running = state.time(() => {
						// Work to time goes here.
					});
					// Per-iteration teardown (not timed)
				} while (running);
			},
		}),
	});

	it("benchmarkDurationBatchless has testType ExecutionTime", () => {
		const bench = benchmarkDurationBatchless({
			benchmarkFn: async (state) => {
				while (state.time(() => {}));
			},
		});
		assert.equal(bench.testType, TestType.ExecutionTime);
	});

	it("benchmarkDurationBatchless throws when benchmarkFn never calls state.time()", async () => {
		const bench = benchmarkDurationBatchless({
			benchmarkFn: async () => {
				// Intentionally never calls state.time() — simulates a user mistake.
			},
		});
		await assert.rejects(async () => bench.run(timer), /Data collection is not complete/);
	});

	it("benchmarkDurationBatchless sync invokes callback exactly once per time() call", async () => {
		let callbackCalls = 0;
		let timeCalls = 0;
		const bench = benchmarkDurationBatchless({
			maxBenchmarkDurationSeconds: 0.1,
			minSampleCount: 1,
			benchmarkFn: async (state) => {
				let running: boolean;
				do {
					timeCalls++;
					running = state.time(() => {
						callbackCalls++;
					});
				} while (running);
			},
		});
		await bench.run(timer);
		assert.equal(callbackCalls, timeCalls);
	});

	describe("BatchlessBenchmarkState", () => {
		function makeState(minBatchDurationSeconds: number): BenchmarkState<unknown> {
			return new BenchmarkState(timer, {
				maxBenchmarkDurationSeconds: 0.1,
				minBatchCount: 2,
				minBatchDurationSeconds,
				startPhase: Phase.CollectData,
			});
		}

		it("throws when minBatchDurationSeconds is non-zero", () => {
			assert.throws(() => new BatchlessBenchmarkState(makeState(0.01)));
		});

		it("time invokes callback exactly once per call", () => {
			const batchless = new BatchlessBenchmarkState(makeState(0));
			let count = 0;
			const result = batchless.time(() => {
				count++;
			});
			assert.equal(count, 1);
			assert(typeof result === "boolean");
		});

		it("timeAsync invokes callback exactly once per call", async () => {
			const batchless = new BatchlessBenchmarkState(makeState(0));
			let count = 0;
			const result = await batchless.timeAsync(async () => {
				count++;
			});
			assert.equal(count, 1);
			assert(typeof result === "boolean");
		});

		it("computeData throws when time() has not yet returned false", () => {
			// minBatchCount: 2, so the first time() returns true (more samples needed)
			const innerState = makeState(0);
			const batchless = new BatchlessBenchmarkState(innerState);
			const keepGoing = batchless.time(() => {});
			assert.equal(keepGoing, true, "Expected first time() to return true");
			assert.throws(() => innerState.computeData(), /Data collection is not complete/);
		});
	});
});
