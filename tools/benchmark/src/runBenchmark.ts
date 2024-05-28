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
	benchmarkArgumentsIsCustom,
	BenchmarkTimer,
} from "./Configuration";
import { Stats, getArrayStatistics } from "./ReporterUtilities";
import { Timer, defaultMinimumTime, timer } from "./timer";

/**
 * @public
 */
export enum Phase {
	WarmUp,
	AdjustIterationPerBatch,
	CollectData,
}

export const defaultTimingOptions: Required<BenchmarkTimingOptions> = {
	maxBenchmarkDurationSeconds: 5,
	minBatchCount: 5,
	minBatchDurationSeconds: defaultMinimumTime,
	startPhase: Phase.WarmUp,
};

/**
 * Result of successfully running a benchmark.
 * @public
 */
export interface BenchmarkData {
	/**
	 * Iterations per batch.
	 */
	readonly iterationsPerBatch: number;

	/**
	 * Number of batches, each with `iterationsPerBatch` iterations.
	 */
	readonly numberOfBatches: number;

	/**
	 * Stats about runtime, in seconds.
	 * This is already scaled to be per iteration and not per batch.
	 */
	readonly stats: Stats;

	/**
	 * Time it took to run the benchmark in seconds.
	 */
	readonly elapsedSeconds: number;
}

/**
 * Result of trying to run a benchmark.
 * @public
 */
export type BenchmarkResult = BenchmarkError | BenchmarkData;

/**
 * Use for readonly view of Json compatible data.
 *
 * Note that this does not robustly forbid non json comparable data via type checking,
 * but instead mostly restricts access to it.
 *
 * @public
 */
export type JsonCompatible =
	| string
	| number
	| boolean
	| readonly JsonCompatible[]
	| { readonly [P in string]: JsonCompatible | undefined };

export type Results = { readonly [P in string]: JsonCompatible | undefined };

/**
 * Provides type narrowing when the provided result is a {@link BenchmarkError}.
 * @public
 */
export function isResultError(result: BenchmarkResult): result is BenchmarkError {
	return (result as Partial<BenchmarkError>).error !== undefined;
}

/**
 * Result of failing to run a benchmark.
 * @public
 */
export interface BenchmarkError {
	error: string;
}

/**
 * Runs the benchmark.
 * @public
 */
export async function runBenchmark(args: BenchmarkRunningOptions): Promise<BenchmarkData> {
	if (benchmarkArgumentsIsCustom(args)) {
		const state = new BenchmarkState(timer, args);
		await args.benchmarkFnCustom(state);
		return state.computeData();
	}

	const options = {
		...defaultTimingOptions,
		...args,
	};
	const { isAsync, benchmarkFn: argsBenchmarkFn } = validateBenchmarkArguments(args);

	await options.before?.();

	let data: BenchmarkData;
	// eslint-disable-next-line unicorn/prefer-ternary
	if (isAsync) {
		data = await runBenchmarkAsync({
			...options,
			benchmarkFnAsync: argsBenchmarkFn,
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

class BenchmarkState<T> implements BenchmarkTimer<T> {
	/**
	 * Duration for each batch, in seconds.
	 */
	private readonly samples: number[];
	private readonly options: Readonly<Required<BenchmarkTimingOptions>>;
	private readonly startTime: T;
	private phase: Phase;
	public iterationsPerBatch: number;
	public constructor(
		public readonly timer: Timer<T>,
		options: BenchmarkTimingOptions,
	) {
		this.startTime = timer.now();
		this.samples = [];
		this.options = {
			...defaultTimingOptions,
			...options,
		};
		this.phase = this.options.startPhase;

		if (this.options.minBatchCount < 1) {
			throw new Error("Invalid minSampleCount");
		}
		this.iterationsPerBatch = 1;
		tryRunGarbageCollection();
	}

	public recordBatch(duration: number): boolean {
		switch (this.phase) {
			case Phase.WarmUp: {
				this.phase = Phase.AdjustIterationPerBatch;
				return true;
			}
			case Phase.AdjustIterationPerBatch: {
				if (!this.growBatchSize(duration)) {
					this.phase = Phase.CollectData;
					// Since batch is big enough, include it in data collection.
					return this.addSample(duration);
				}
				return true;
			}
			default: {
				return this.addSample(duration);
			}
		}
	}

	/**
	 * Returns true if IterationPerBatch should be grown more.
	 */
	private growBatchSize(duration: number): boolean {
		if (duration < this.options.minBatchDurationSeconds) {
			// TODO: consider using Benchmark.js's algorithm for this.
			this.iterationsPerBatch *= 2;
			return true;
		}
		return false;
	}

	/**
	 * Returns true if more samples should be collected.
	 */
	private addSample(duration: number): boolean {
		this.samples.push(duration);
		if (this.samples.length < this.options.minBatchCount) {
			return true;
		}
		const soFar = this.timer.toSeconds(this.startTime, this.timer.now());
		if (soFar > this.options.maxBenchmarkDurationSeconds) {
			return false;
		}

		const stats = getArrayStatistics(this.samples);
		if (stats.marginOfErrorPercent < 1) {
			// Already below 1% margin of error.
			// Note that this margin of error computation doesn't account for low frequency noise (noise spanning a time scale longer than this test so far)
			// which can be caused by many factors like CPU frequency changes due to limited boost time or thermals.
			// It also does not handle long tail distributions well (for example if one in 10000 iterations contains a GC and you want to include that in the mean).
			return false;
		}

		// Exit if way too many samples to avoid out of memory.
		if (this.samples.length > 1_000_000) {
			// Test failed to converge after many samples.
			// TODO: produce some warning or error state in this case (and probably the case for hitting max time as well).
			return false;
		}

		return true;
	}

	public computeData(): BenchmarkData {
		const now = this.timer.now();
		const stats: Stats = getArrayStatistics(
			this.samples.map((v) => v / this.iterationsPerBatch),
		);
		const data: BenchmarkData = {
			elapsedSeconds: this.timer.toSeconds(this.startTime, now),
			numberOfBatches: this.samples.length,
			stats,
			iterationsPerBatch: this.iterationsPerBatch,
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
	while (
		state.recordBatch(doBatch(state.iterationsPerBatch, args.benchmarkFn, args.beforeEachBatch))
	) {
		// No-op
	}
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
	while (
		state.recordBatch(
			await doBatchAsync(
				state.iterationsPerBatch,
				args.benchmarkFnAsync,
				args.beforeEachBatch,
			),
		)
	) {
		// No-op
	}
	return state.computeData();
}

/**
 * Returns time to run `f` `iterationCount` times in seconds.
 */
function doBatch(
	iterationCount: number,
	f: () => void,
	beforeEachBatch: undefined | (() => void),
): number {
	beforeEachBatch?.();
	let i = iterationCount;
	const before = timer.now();
	while (i--) {
		f();
	}
	const after = timer.now();
	return timer.toSeconds(before, after);
}

/**
 * Returns time to run `f` `iterationCount` times in seconds.
 */
async function doBatchAsync(
	iterationCount: number,
	f: () => Promise<unknown>,
	beforeEachBatch: undefined | (() => void),
): Promise<number> {
	beforeEachBatch?.();
	let i = iterationCount;
	const before = timer.now();
	while (i--) {
		await f();
	}
	const after = timer.now();
	return timer.toSeconds(before, after);
}
