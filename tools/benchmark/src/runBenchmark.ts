/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "chai";
import { Benchmark, Options } from "./benchmark";
import {
	validateBenchmarkArguments,
	BenchmarkTimingOptions,
	BenchmarkRunningOptions,
	BenchmarkRunningOptionsSync,
} from "./Configuration";
import { BenchmarkData } from "./Reporter";

const defaults: Required<BenchmarkTimingOptions> = {
	maxBenchmarkDurationSeconds: 5,
	minSampleCount: 5,
	minSampleDurationSeconds: 0,
};

/**
 * Run a performance benchmark and return its results.
 *
 * Here is how benchmarking works:
 *
 * ```
 *  For each benchmark
 *      For each sampled run
 *          // Run fn once to check for errors
 *          fn()
 *          // Run fn multiple times and measure results.
 *          for each Benchmark.count
 *              fn()
 * ```
 *
 * For the first few sampled runs, the benchmarking library is in an analysis phase. It uses these sample runs to
 * determine an iteration number that his at most 1% statistical uncertainty. It does this by incrementally increasing
 * the iterations until it hits a low uncertainty point.
 *
 * Optionally, setup and teardown functions can be provided via the `before` and `after` options.
 *
 * @public
 */
export async function runBenchmark(args: BenchmarkRunningOptions): Promise<BenchmarkData> {
	const options = {
		...defaults,
		...args,
	};
	const { isAsync, benchmarkFn: argsBenchmarkFn } = validateBenchmarkArguments(args);

	await options.before?.();

	const benchmarkFunction: (deferred: { resolve: Mocha.Done }) => void | Promise<unknown> =
		isAsync
			? async (deferred: { resolve: Mocha.Done }) => {
					// We have to do a little translation because the Benchmark library expects callback-based asynchronicity.
					await argsBenchmarkFn();
					deferred.resolve();
			  }
			: argsBenchmarkFn;

	return new Promise<BenchmarkData>((resolve) => {
		const benchmarkOptions: Options = {
			maxTime: options.maxBenchmarkDurationSeconds,
			minSamples: options.minSampleCount,
			minTime: options.minSampleDurationSeconds,
			defer: isAsync,
			onCycle: options.onCycle,
			onComplete: async () => {
				const stats: BenchmarkData = {
					aborted: benchmarkInstance.aborted,
					count: benchmarkInstance.count,
					cycles: benchmarkInstance.cycles,
					error: benchmarkInstance.error,
					hz: benchmarkInstance.hz,
					stats: benchmarkInstance.stats,
					times: benchmarkInstance.times,
				};
				await options.after?.();
				resolve(stats);
			},
			fn: benchmarkFunction,
		};

		const benchmarkInstance = new Benchmark(benchmarkOptions);
		// Run a garbage collection, if possible, before the test.
		// This helps noise from allocations before the test (ex: from previous tests or startup) from
		// impacting the test.
		global?.gc?.();
		benchmarkInstance.run();
	});
}

/**
 * Run a performance benchmark and return its results.
 *
 * Here is how benchmarking works:
 *
 * ```
 *  For each benchmark
 *      For each sampled run
 *          // Run fn once to check for errors
 *          fn()
 *          // Run fn multiple times and measure results.
 *          for each Benchmark.count
 *              fn()
 * ```
 *
 * For the first few sampled runs, the benchmarking library is in an analysis phase. It uses these sample runs to
 * determine an iteration number that his at most 1% statistical uncertainty. It does this by incrementally increasing
 * the iterations until it hits a low uncertainty point.
 *
 * Optionally, setup and teardown functions can be provided via the `before` and `after` options.
 *
 * @public
 */
export function runBenchmarkSync(args: BenchmarkRunningOptionsSync): BenchmarkData {
	const options = {
		...defaults,
		...args,
	};

	let stats: BenchmarkData | undefined;
	const benchmarkOptions: Options = {
		maxTime: options.maxBenchmarkDurationSeconds,
		minSamples: options.minSampleCount,
		minTime: options.minSampleDurationSeconds,
		onCycle: options.onCycle,
		onComplete: async () => {
			stats = {
				aborted: benchmarkInstance.aborted,
				count: benchmarkInstance.count,
				cycles: benchmarkInstance.cycles,
				error: benchmarkInstance.error,
				hz: benchmarkInstance.hz,
				stats: benchmarkInstance.stats,
				times: benchmarkInstance.times,
			};
		},
		fn: args.benchmarkFn,
	};

	const benchmarkInstance = new Benchmark(benchmarkOptions);
	// Run a garbage collection, if possible, before the test.
	// This helps noise from allocations before the test (ex: from previous tests or startup) from
	// impacting the test.
	global?.gc?.();
	benchmarkInstance.run();
	assert(stats !== undefined);
	return stats;
}
