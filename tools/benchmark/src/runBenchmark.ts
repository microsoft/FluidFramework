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
import { defaultMinTime, timer } from "./timer";

export const defaults = {
	maxBenchmarkDurationSeconds: 5,
	minSampleCount: 5,
	minSampleDurationSeconds: defaultMinTime,
} as const;

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
 * Run a garbage collection, if possible.
 *
 * @remarks
 * Used before the test to help reduce noise from previous allocations
 * (ex: from previous tests or startup).
 */
function tryRunGarbageCollection(): void {
	global?.gc?.();
}

/**
 * Run a performance benchmark and return its results.
 * @public
 */
export function runBenchmarkSync(args: BenchmarkRunningOptionsSync): BenchmarkData {
	const timeStamp = timer.now();

	const options = {
		...defaults,
		...args,
	};

	tryRunGarbageCollection();

	if (options.minSampleCount < 1) {
		throw new Error("Invalid minSampleCount");
	}
	let count = options.minSampleCount;

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

	tryRunGarbageCollection();

	if (options.minSampleCount < 1) {
		throw new Error("Invalid minSampleCount");
	}
	let count = options.minSampleCount;

	// TODO: use consider using Benchmark.js's algorithm for this.
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
