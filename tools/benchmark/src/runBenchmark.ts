/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import _ from "lodash";
import {
	Benchmark,
	BenchmarkData,
	Options,
	defaultOptions,
	computeStats,
	Stats,
	timer,
} from "./benchmark";
import {
	validateBenchmarkArguments,
	BenchmarkRunningOptions,
	BenchmarkRunningOptionsSync,
	BenchmarkRunningOptionsAsync,
} from "./Configuration";

export const defaults = {
	maxBenchmarkDurationSeconds: defaultOptions.maxTime,
	minSampleCount: defaultOptions.minSamples,
	minSampleDurationSeconds: defaultOptions.minTime,
} as const;

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
export async function runBenchmarkLegacy(args: BenchmarkRunningOptions): Promise<BenchmarkData> {
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

export async function runBenchmark(args: BenchmarkRunningOptions): Promise<BenchmarkData> {
	const options = {
		...defaults,
		...args,
	};
	const { isAsync, benchmarkFn: argsBenchmarkFn } = validateBenchmarkArguments(args);

	await options.before?.();

	let data: BenchmarkData;
	// eslint-disable-next-line unicorn/prefer-ternary
	if (isAsync) {
		data = await runBenchmarkAsync({
			...options,
			benchmarkFnAsync: argsBenchmarkFn as any,
		});
	} else {
		data = runBenchmarkSync({ ...options, benchmarkFn: argsBenchmarkFn });
	}
	await options.after?.();
	return data;
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
	const timeStamp = +_.now();

	const options = {
		...defaults,
		...args,
	};

	// Run a garbage collection, if possible, before the test.
	// This helps noise from allocations before the test (ex: from previous tests or startup) from
	// impacting the test.
	global?.gc?.();

	let count = 1;

	while (
		doBatch(count, options.benchmarkFn, options.onCycle) < options.minSampleDurationSeconds
	) {
		count *= 2;
	}

	const samples: number[] = [];
	let totalTime = 0;
	while (
		samples.length < options.minSampleCount ||
		// TODO: exit before this if enough confidence is reached. (But what about low frequency noise?)
		totalTime < options.maxBenchmarkDurationSeconds
	) {
		const sample = doBatch(count, options.benchmarkFn, options.onCycle);
		totalTime += sample;
		samples.push(sample);
		// Exit if way too many samples to avoid out of memory.
		if (samples.length > 1000000) {
			break;
		}
	}
	return computeData(samples, count, timeStamp);
}

/**
 * Returns time to run `f` `count` times in seconds.
 */
function doBatch(
	count: number,
	f: () => void,
	onCycle: undefined | ((event: unknown) => void),
): number {
	let i = count;
	const n = timer.ns;
	const before: [number, number] = n();
	while (i--) {
		f();
	}
	const elapsed: [number, number] = n(before);
	onCycle?.(0);
	return elapsed[0] + elapsed[1] / 1e9;
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
export async function runBenchmarkAsync(
	args: BenchmarkRunningOptionsAsync,
): Promise<BenchmarkData> {
	const timeStamp = +_.now();

	const options = {
		...defaults,
		...args,
	};

	// Run a garbage collection, if possible, before the test.
	// This helps noise from allocations before the test (ex: from previous tests or startup) from
	// impacting the test.
	global?.gc?.();

	let count = 1;

	// TODO: use consider using benchmark's algorithm for this.
	while (
		(await doBatchAsync(count, options.benchmarkFnAsync, options.onCycle)) <
		options.minSampleDurationSeconds
	) {
		count *= 2;
	}

	const samples: number[] = [];
	let totalTime = 0;
	while (
		samples.length < options.minSampleCount ||
		// TODO: exit before this if enough confidence is reached. (But what about low frequency noise?)
		totalTime < options.maxBenchmarkDurationSeconds
	) {
		const sample = await doBatchAsync(count, options.benchmarkFnAsync, options.onCycle);
		totalTime += sample;
		samples.push(sample);
		// Exit if way too many samples to avoid out of memory.
		if (samples.length > 1000000) {
			break;
		}
	}
	return computeData(samples, count, timeStamp);
}

/**
 * Returns time to run `f` `count` times in seconds.
 */
async function doBatchAsync(
	count: number,
	f: () => Promise<unknown>,
	onCycle: undefined | ((event: unknown) => void),
): Promise<number> {
	let i = count;
	const n = timer.ns;
	const before: [number, number] = n();
	while (i--) {
		await f();
	}
	const elapsed: [number, number] = n(before);
	onCycle?.(0);
	return elapsed[0] + elapsed[1] / 1e9;
}

function computeData(samples: number[], count: number, timeStamp: number): BenchmarkData {
	const now = +_.now();
	const stats: Stats = computeStats(samples.map((v) => v / count));
	const data: BenchmarkData = {
		hz: 1 / stats.mean,
		times: {
			cycle: stats.mean * count,
			period: stats.mean,
			elapsed: (now - timeStamp) / 1e3,
			timeStamp,
		},
		aborted: false,
		cycles: samples.length,
		stats,
		count,
	};
	return data;
}
