/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";
import { benchmark } from "../Runner";
import { BenchmarkType, isParentProcess } from "../Configuration";
import { Benchmark, Options } from "../benchmark";
import { runBenchmark, runBenchmarkAsync, runBenchmarkSync } from "../runBenchmark";

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
				expect(beforeHasBeenCalled).to.equal(
					true,
					"before should be called before test body",
				);
				expect(afterHasBeenCalled).to.equal(
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
				expect(afterHasBeenCalled).to.equal(
					true,
					"after should be called after test execution",
				);
			}
		});
	});

	it("do a benchmark", () => {
		const benchmarkOptions: Options = {
			maxTime: 0.01,
			minSamples: 1,
			minTime: 0,
			defer: false,
			fn: () => {
				// This is a benchmark.
			},
		};

		const benchmarkInstance = new Benchmark(benchmarkOptions);
		benchmarkInstance.run();
	});

	it("do a benchmark async", async () => {
		const benchmarkOptions: Options = {
			maxTime: 0.01,
			minSamples: 1,
			minTime: 0,
			defer: true,
			fn: async (deferred: { resolve: Mocha.Done }) => {
				// We have to do a little translation because the Benchmark library expects callback-based
				// asynchronicity.
				await delay(0);
				deferred.resolve();
			},
		};

		await new Promise<void>((resolve) => {
			const benchmarkInstance = new Benchmark(benchmarkOptions);
			// benchmarkInstance.on("start end", () => global?.gc?.());
			// benchmarkInstance.on("cycle", options.onCycle);
			benchmarkInstance.on("complete", async () => {
				resolve();
			});
			benchmarkInstance.run();
		});
	});

	it("runBenchmark sync", async () => {
		await runBenchmark({
			maxBenchmarkDurationSeconds: 0.1,
			minSampleCount: 1,
			minSampleDurationSeconds: 0,
			benchmarkFn: () => {
				// This is a benchmark.
			},
		});
	});

	it("runBenchmark sync2", async () => {
		runBenchmarkSync({
			maxBenchmarkDurationSeconds: 0.1,
			minSampleCount: 1,
			minSampleDurationSeconds: 0,
			benchmarkFn: () => {
				// This is a benchmark.
			},
		});
	});

	it("do a benchmark async", async () => {
		await runBenchmark({
			maxBenchmarkDurationSeconds: 0.1,
			minSampleCount: 1,
			minSampleDurationSeconds: 0,
			benchmarkFnAsync: async () => {
				// This is a benchmark.
				await delay(0);
			},
		});
	});

	it("do a benchmark async2", async () => {
		await runBenchmarkAsync({
			maxBenchmarkDurationSeconds: 0.1,
			minSampleCount: 1,
			minSampleDurationSeconds: 0,
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
