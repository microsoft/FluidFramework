/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	validateBenchmarkArguments,
	BenchmarkRunningOptions,
	BenchmarkRunningOptionsSync,
	BenchmarkRunningOptionsAsync,
	BenchmarkTimingOptions,
} from "./Configuration";
import { Stats, getArrayStatistics } from "./ReporterUtilities";
import { Timer, defaultMinTime, timer } from "./timer";

export const defaults: Required<BenchmarkTimingOptions> = {
	maxBenchmarkDurationSeconds: 5,
	minSampleCount: 5,
	minSampleDurationSeconds: defaultMinTime,
};

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

enum Mode {
	WarmUp,
	AdjustCount,
	CollectData,
}

class BenchmarkState<T> {
	private readonly samples: number[];
	private readonly options: Readonly<Required<BenchmarkTimingOptions>>;
	private readonly startTime: T;
	private mode: Mode = Mode.WarmUp;
	public count: number;
	public constructor(public readonly timer: Timer<T>, options: BenchmarkTimingOptions) {
		this.startTime = timer.now();
		this.samples = [];
		this.options = {
			...defaults,
			...options,
		};

		if (this.options.minSampleCount < 1) {
			throw new Error("Invalid minSampleCount");
		}
		this.count = this.options.minSampleCount;
		tryRunGarbageCollection();
	}

	public batch(sample: number): boolean {
		switch (this.mode) {
			case Mode.WarmUp: {
				this.mode = Mode.AdjustCount;
				return true;
			}
			case Mode.AdjustCount: {
				if (!this.growCount(sample)) {
					this.mode = Mode.CollectData;
				}
				return true;
			}
			default: {
				return this.addSample(sample);
			}
		}
	}

	/**
	 * Returns true if count should be grown more.
	 */
	private growCount(sample: number): boolean {
		if (sample < this.options.minSampleDurationSeconds) {
			// TODO: consider using Benchmark.js's algorithm for this.
			this.count *= 2;
			return true;
		}
		return false;
	}

	/**
	 * Returns true if more samples should be collected.
	 */
	private addSample(sample: number): boolean {
		this.samples.push(sample);
		if (this.samples.length < this.options.minSampleCount) {
			return true;
		}
		const soFar = this.timer.toSeconds(this.startTime, this.timer.now());
		if (soFar > this.options.maxBenchmarkDurationSeconds) {
			return false;
		}

		const stats = getArrayStatistics(this.samples);
		if (stats.marginOfErrorPercent < 1.0) {
			// Already below 1% margin of error.
			// Note that this margin of error computation doesn't account for low frequency noise (noise spanning a time scale longer than this test so far)
			// which can be caused by many factors like CPU frequency changes due to limited boost time or thermals.
			// It also does not handle long tail distributions well (for example if one in 10000 iterations contains a GC and you want to include that in the mean).
			return false;
		}

		// Exit if way too many samples to avoid out of memory.
		if (this.samples.length > 1000000) {
			// Test failed to converge after many samples.
			// TODO: produce some warning or error state in this case (and probably the case for hitting max time as well).
			return false;
		}

		return true;
	}

	public computeData(): BenchmarkData {
		const now = this.timer.now();
		const stats: Stats = getArrayStatistics(this.samples.map((v) => v / this.count));
		const data: BenchmarkData = {
			elapsedSeconds: this.timer.toSeconds(this.startTime, now),
			aborted: false,
			cycles: this.samples.length,
			stats,
			iterationPerCycle: this.count,
		};
		return data;
	}
}

/**
 * Run a performance benchmark and return its results.
 * @public
 */
export function runBenchmarkSync(args: BenchmarkRunningOptionsSync): BenchmarkData {
	const state = new BenchmarkState(timer, args);
	while (state.batch(doBatch(state.count, args.benchmarkFn, args.onCycle))) {}
	return state.computeData();
}

/**
 * Run a performance benchmark and return its results.
 * @public
 */
export async function runBenchmarkAsync(
	args: BenchmarkRunningOptionsAsync,
): Promise<BenchmarkData> {
	const state = new BenchmarkState(timer, args);
	while (state.batch(await doBatchAsync(state.count, args.benchmarkFnAsync, args.onCycle))) {}
	return state.computeData();
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
