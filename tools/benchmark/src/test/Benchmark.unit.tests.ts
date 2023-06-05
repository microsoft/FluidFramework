/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { benchmark } from "..";
import { BenchmarkType, isParentProcess, BenchmarkTimer } from "../Configuration";
import { Phase, runBenchmark, runBenchmarkAsync, runBenchmarkSync } from "../runBenchmark";

describe("`benchmark` function", () => {
	describe("uses `before` and `after`", () => {
		let beforeHasBeenCalled = false;
		let afterHasBeenCalled = false;
		benchmark({
			title: "test",
			before: async () =>
				delay(1).then(() => {
					beforeHasBeenCalled = true;
				}),
			benchmarkFn: () => {
				assert.equal(beforeHasBeenCalled, true, "before should be called before test body");
				assert.equal(
					afterHasBeenCalled,
					false,
					"after should not be called during test execution",
				);
			},
			after: async () =>
				delay(1).then(() => {
					afterHasBeenCalled = true;
				}),
			type: BenchmarkType.OwnCorrectness,
		});

		afterEach(() => {
			if (!isParentProcess) {
				// If running with separate processes,
				// this check must only be done in the child process (it will fail in the parent process)
				assert.equal(
					afterHasBeenCalled,
					true,
					"after should be called after test execution",
				);
			}
		});
	});

	it("runBenchmark sync", async () => {
		await runBenchmark({
			maxBenchmarkDurationSeconds: 0.1,
			minBatchCount: 1,
			minBatchDurationSeconds: 0,
			benchmarkFn: () => {
				// This is a benchmark.
			},
		});
	});

	it("runBenchmarkSync", async () => {
		runBenchmarkSync({
			maxBenchmarkDurationSeconds: 0.1,
			minBatchCount: 1,
			minBatchDurationSeconds: 0,
			benchmarkFn: () => {
				// This is a benchmark.
			},
		});
	});

	it("runBenchmark async", async () => {
		await runBenchmark({
			maxBenchmarkDurationSeconds: 0.1,
			minBatchCount: 1,
			minBatchDurationSeconds: 0,
			benchmarkFnAsync: async () => {
				// This is a benchmark.
				await delay(0);
			},
		});
	});

	it("runBenchmarkAsync", async () => {
		await runBenchmarkAsync({
			maxBenchmarkDurationSeconds: 0.1,
			minBatchCount: 1,
			minBatchDurationSeconds: 0,
			benchmarkFnAsync: async () => {
				// This is a benchmark.
				await delay(0);
			},
		});
	});

	function doLoop(upperLimit: number): void {
		let i = 0;
		while (i < upperLimit) {
			i += 1;
		}
	}

	benchmark({
		title: `minimal`,
		benchmarkFn: () => 0,
		type: BenchmarkType.OwnCorrectness,
	});

	benchmark({
		title: `async`,
		benchmarkFn: async () => nextTick(() => 0),
		type: BenchmarkType.OwnCorrectness,
	});

	for (const loopSize of [1e6]) {
		benchmark({
			title: `while loop with ${loopSize} iterations`,
			benchmarkFn: () => doLoop(loopSize),
			type: BenchmarkType.OwnCorrectness,
		});

		benchmark({
			title: `async-initialized while loop with ${loopSize} iterations`,
			benchmarkFnAsync: async () => nextTick(() => doLoop(loopSize)),
			type: BenchmarkType.OwnCorrectness,
		});
	}

	// This pattern is roughly what the non-custom `benchmark` does.
	// It minimizes per iteration over head by timing the whole batch as a single unit.
	// This is important for timing operations which are very fast relative to measurement overhead and clock precision.
	// Since measurement overhead and clock precision are not the same on all systems, this approach is necessary to be robustly portable.
	benchmark({
		title: "Custom Benchmark",
		benchmarkFnCustom: async <T>(state: BenchmarkTimer<T>) => {
			let duration: number;
			do {
				let counter = state.iterationsPerBatch;
				const before = state.timer.now();
				while (counter--) {
					// Do the thing
				}
				const after = state.timer.now();
				duration = state.timer.toSeconds(before, after);
				// Collect data
			} while (state.recordBatch(duration));
		},
		type: BenchmarkType.OwnCorrectness,
	});

	// This pattern allows for cleanup to happen after each iteration that is not included in the reported time.
	// It incurs per iteration over head by timing each individual iteration.
	// This can lead to accuracy issues, biasing the results upward due to the overhead.
	// Additionally it can have precision issues if the iteration time is not much larger than the timer precision.
	// Since timing overhead and precision vary on different systems, this approach to measurement may work well on some setups, and poorly on others.
	// A good practice is to compare any tests that work this way to a version of the test which is empty (measuring a no-op, like below) and only
	// use the data if the test is much slower than the no-op case.
	// For NodeJS on linux, times over a microsecond should be mostly ok on modern CPUs.
	benchmark({
		title: "Custom Batch Size 1 Benchmark",
		benchmarkFnCustom: async <T>(state: BenchmarkTimer<T>) => {
			let duration: number;
			do {
				// Since this setup one collects data from one iteration, assert that this is what is expected.
				assert.equal(state.iterationsPerBatch, 1);

				// Setup ...
				const before = state.timer.now();
				// Do the thing
				const after = state.timer.now();
				// Cleanup ...
				duration = state.timer.toSeconds(before, after);

				// Collect data
			} while (state.recordBatch(duration));
		},
		type: BenchmarkType.OwnCorrectness,
		minBatchDurationSeconds: 0,
	});

	// This patterns is only suitable for very slow benchmarks which don't need any averaging or warmup runs.
	// Typically this only makes sense for benchmarks which have a runtime on the order of seconds as they have to be long enough
	// to amortize GC.
	// As this only does a single run, no estimate of variance or error will be available.
	benchmark({
		title: "One Iteration Custom Benchmark",
		benchmarkFnCustom: async <T>(state: BenchmarkTimer<T>) => {
			assert.equal(state.iterationsPerBatch, 1);
			const before = state.timer.now();
			// Do the thing
			const after = state.timer.now();
			const duration = state.timer.toSeconds(before, after);
			assert(!state.recordBatch(duration));
		},
		type: BenchmarkType.OwnCorrectness,
		minBatchDurationSeconds: 0,
		minBatchCount: 1,
		maxBenchmarkDurationSeconds: 0,
		startPhase: Phase.CollectData,
	});
});

const dummyPromise = Promise.resolve();

/**
 * Execute a call back on the next possible cycle
 * @param callback - a callback that will get execute in the promise next cycle
 * @returns A promise for completion of the callback
 */
const nextTick = async (callback: () => void): Promise<void> => dummyPromise.then(callback);

/**
 * Waits for the provided duration in milliseconds. See
 * {@link https://javascript.info/settimeout-setinterval | setTimeout}.
 */
const delay = async (milliseconds: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, milliseconds));
