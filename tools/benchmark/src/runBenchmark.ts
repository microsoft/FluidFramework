/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	validateBenchmarkArguments,
	BenchmarkRunningOptions,
	BenchmarkRunningOptionsSync,
	BenchmarkRunningOptionsAsync,
} from "./Configuration";
import { getArrayStatistics } from "./ReporterUtilities";

/**
 * Subset of Benchmark type which is output data.
 * Json compatible.
 * @public
 */
export interface BenchmarkData {
	aborted: boolean;

	/**
	 * Iterations per cycle
	 */
	readonly iterationPerCycle: number;

	/**
	 * Number of batches of `count` iterations.
	 */
	readonly cycles: number;

	/**
	 * Stats about runtime, in seconds.
	 */
	readonly stats: Stats;

	/**
	 * Time it took to run the benchmark in seconds.
	 */
	readonly elapsedSeconds: number;
}

/**
 * @public
 */
export interface Stats {
	readonly marginOfError: number;
	readonly relatedMarginOfError: number;
	readonly standardErrorOfMean: number;
	readonly standardDeviation: number;
	readonly arithmeticMean: number;
	readonly samples: readonly number[];
	readonly variance: number;
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
	const timeStamp = timer.now();

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
	const before = timer.now();
	while (i--) {
		f();
	}
	const after = timer.now();
	onCycle?.(0);
	return timer.toSeconds(before, after);
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
	const timeStamp = timer.now();

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
	const before = timer.now();
	while (i--) {
		await f();
	}
	const after = timer.now();
	onCycle?.(0);
	return timer.toSeconds(before, after);
}

function computeData(samples: number[], count: number, timeStamp: unknown): BenchmarkData {
	const now = timer.now();
	const stats: Stats = getArrayStatistics(samples.map((v) => v / count));
	const data: BenchmarkData = {
		elapsedSeconds: timer.toSeconds(timeStamp, now),
		aborted: false,
		cycles: samples.length,
		stats,
		iterationPerCycle: count,
	};
	return data;
}

interface Timer<T = unknown> {
	now(): T;
	toSeconds(before: T, after: T): number;
}

const timers: Timer[] = [];

{
	const nodeTimer = globalThis.process?.hrtime;
	if (nodeTimer !== undefined) {
		const timer: Timer<bigint> = {
			now: () => nodeTimer.bigint(),
			toSeconds: (before: bigint, after: bigint) => Number(after - before) / 1e9,
		};
		timers.push(timer);
	}

	const performance = globalThis.performance;
	if (performance !== undefined) {
		const timer: Timer<DOMHighResTimeStamp> = {
			now: () => performance.now(),
			toSeconds: (before, after) => (after - before) / 1e3,
		};
		timers.push(timer);
	}
}

if (timers.length === 0) {
	throw new Error("Unable to find a working timer.");
}

const timersWithResolution = timers.map((timer) => ({
	timer,
	resolution: getResolution(timer),
}));

// Pick timer with highest resolution.
timersWithResolution.sort((a, b) => a.resolution - b.resolution);
const timer = timersWithResolution[0].timer;

// Approach based on Benchmark.js:
// Resolve time span required to achieve a percent uncertainty of at most 1%.
// For more information see http://spiff.rit.edu/classes/phys273/uncert/uncert.html.
const defaultMinTime = Math.max(timersWithResolution[0].resolution / 2 / 0.01, 0.05);

export const defaults = {
	maxBenchmarkDurationSeconds: 5,
	minSampleCount: 5,
	minSampleDurationSeconds: defaultMinTime,
} as const;

/**
 * Gets the current timer's minimum resolution in seconds.
 *
 * This may be longer than the actual minimum resolution for high resolution timers,
 * and instead amounts the overhead of how long measuring takes.
 * Either way, this is a conservative estimate of timer resolution.
 */
function getResolution(t: Timer): number {
	let after;
	let count = 30;
	const sample: number[] = [];

	// Get average smallest measurable time.
	while (count--) {
		const before = t.now();
		do {
			after = t.now();
		} while (before === after);
		const delta = t.toSeconds(before, after);
		if (delta <= 0) {
			throw new Error("invalid timer");
		}
		sample.push(delta);
	}

	return getArrayStatistics(sample, 0.8).arithmeticMean;
}
