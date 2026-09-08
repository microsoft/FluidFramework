/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	isInPerformanceTestingMode,
	TestType,
	type BenchmarkDescription,
	type BenchmarkFunction,
} from "../Configuration.js";
import { assertProperUse } from "../assert.js";
import { stripUndefined } from "../benchmarkAuthoringUtilities.js";
import { ValueType, type CollectedData } from "../reportTypes.js";
import { getArrayStatistics } from "../sampling.js";
import { type Timer, timer as defaultTimer, timerWithResolution } from "../timer.js";
import {
	isCustomBenchmark,
	validateBenchmarkArguments,
	type DurationBenchmark,
	type BatchedDurationTimer,
	type BenchmarkTimingOptions,
	type DurationBenchmarkSync,
	type DurationBenchmarkAsync,
} from "./configuration.js";

/**
 * @public
 */
export enum Phase {
	WarmUp,
	AdjustIterationPerBatch,
	CollectData,
}

/**
 * The minimum recommended benchmark duration in seconds.
 *
 * Benchmarks should run for at least this long to keep the percent uncertainty
 * of the measurement below 1%. The value is derived from the selected {@link timer}'s
 * resolution: it is half the timer resolution divided by the desired uncertainty
 * (1%), but never less than 50 ms to guard against abnormally fast timers.
 *
 * @remarks
 * This approach is based on the method used by Benchmark.js.
 * See http://spiff.rit.edu/classes/phys273/uncert/uncert.html for the underlying theory.
 */
const defaultMinimumTime = Math.max(timerWithResolution.resolution / 2 / 0.01, 0.05);

export const defaultTimingOptions: Required<BenchmarkTimingOptions> = {
	maxBenchmarkDurationSeconds: 5,
	minBatchCount: 5,
	minBatchDurationSeconds: defaultMinimumTime,
	startPhase: Phase.WarmUp,
};

/**
 * Default timing options for correctness-only test runs (i.e., without `--perfMode`).
 */
export const correctnessTestTimingOptions: Required<BenchmarkTimingOptions> = {
	maxBenchmarkDurationSeconds: 0,
	minBatchCount: 1,
	minBatchDurationSeconds: 0,
	startPhase: Phase.CollectData,
};

/**
 * Runs a duration benchmark and returns the collected timing measurements.
 * @remarks
 * When not in performance testing mode (i.e. without `--perfMode`), runs only a single iteration
 * and returns inaccurate data. Use {@link isInPerformanceTestingMode} to check the current mode.
 *
 * If using this inside a {@link BenchmarkFunction}, consider using {@link benchmarkDuration} instead,
 * or manually tagging the associated {@link BenchmarkDescription.testType} as {@link TestType.ExecutionTime}.
 * @public
 */
export async function collectDurationData(args: DurationBenchmark): Promise<CollectedData> {
	const timingArgs: BenchmarkTimingOptions = isInPerformanceTestingMode
		? args
		: correctnessTestTimingOptions;

	if (isCustomBenchmark(args)) {
		const state = new BenchmarkState(defaultTimer, timingArgs);
		await args.benchmarkFnCustom(state);
		return state.computeData();
	}

	const options = {
		...defaultTimingOptions,
		...stripUndefined(args),
		...timingArgs,
	};
	const { isAsync, benchmarkFn } = validateBenchmarkArguments(args);

	let data: CollectedData;
	// eslint-disable-next-line unicorn/prefer-ternary
	if (isAsync) {
		data = await runBenchmarkAsync({
			...options,
			benchmarkFnAsync: benchmarkFn,
		});
	} else {
		data = runBenchmarkSync({ ...options, benchmarkFn });
	}
	return data;
}

export class BenchmarkState<T> implements BatchedDurationTimer<T> {
	/**
	 * Duration for each batch, in seconds.
	 */
	private readonly samples: number[];
	public readonly options: Readonly<Required<BenchmarkTimingOptions>>;
	private readonly startTime: T;
	private phase: Phase;
	private collectionComplete = false;
	public iterationsPerBatch: number;
	public constructor(
		public readonly timer: Timer<T>,
		options: BenchmarkTimingOptions,
	) {
		this.startTime = timer.now();
		this.samples = [];
		this.options = {
			...defaultTimingOptions,
			...stripUndefined(options),
		};
		this.phase = this.options.startPhase;

		if (this.options.minBatchCount < 1) {
			throw new Error("Invalid minBatchCount: must be at least 1");
		}
		this.iterationsPerBatch = 1;
		tryRunGarbageCollection();
	}

	public recordBatch(duration: number): boolean {
		assertProperUse(
			!this.collectionComplete,
			"recordBatch() called after data collection is already complete.",
		);
		let keepGoing: boolean;
		switch (this.phase) {
			case Phase.WarmUp: {
				this.phase = Phase.AdjustIterationPerBatch;
				keepGoing = true;
				break;
			}
			case Phase.AdjustIterationPerBatch: {
				if (this.growBatchSize(duration)) {
					keepGoing = true;
				} else {
					this.phase = Phase.CollectData;
					// Since batch is big enough, include it in data collection.
					keepGoing = this.addSample(duration);
				}
				break;
			}
			default: {
				keepGoing = this.addSample(duration);
				break;
			}
		}
		if (!keepGoing) {
			this.collectionComplete = true;
		}
		return keepGoing;
	}

	/**
	 * Returns true if `iterationsPerBatch` should be increased further.
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

		// Stop collecting if sample count is extreme, to avoid running out of memory.
		if (this.samples.length > 1_000_000) {
			// Test failed to converge after many samples.
			// TODO: produce some warning or error state in this case (and probably the case for hitting max time as well).
			return false;
		}

		return true;
	}

	public computeData(): CollectedData {
		assertProperUse(
			this.collectionComplete,
			"Data collection is not complete. Either call a batch recording method (e.g. recordBatch(), timeBatch()) in a loop until it returns false, or use a method that records all batches at once (e.g. timeAllBatches(), timeAllBatchesAsync()).",
		);
		const stats = getArrayStatistics(this.samples.map((v) => v / this.iterationsPerBatch));
		const data: CollectedData = [
			{
				name: "Period",
				value: 1e9 * stats.arithmeticMean,
				units: "ns/op",
				type: ValueType.SmallerIsBetter,
				significance: "Primary",
			},
			{
				name: "Batch Count",
				value: this.samples.length,
				units: "count",
				significance: "Diagnostic",
			},
			{
				name: "Iterations Per Batch",
				value: this.iterationsPerBatch,
				units: "count",
				significance: "Diagnostic",
			},
			{
				name: "Margin of Error",
				value: stats.marginOfError * 1e9,
				units: "ns",
				type: ValueType.SmallerIsBetter,
			},
			{
				name: "Relative Margin of Error",
				value: stats.marginOfErrorPercent,
				units: "%",
				type: ValueType.SmallerIsBetter,
			},
		];
		return data;
	}

	public timeBatch(callback: () => void): boolean {
		let i = this.iterationsPerBatch;
		const before = this.timer.now();
		while (i--) {
			callback();
		}
		const after = this.timer.now();
		return this.recordBatch(this.timer.toSeconds(before, after));
	}

	public async timeBatchAsync(callback: () => Promise<unknown>): Promise<boolean> {
		let i = this.iterationsPerBatch;
		const before = this.timer.now();
		while (i--) {
			await callback();
		}
		const after = this.timer.now();
		return this.recordBatch(this.timer.toSeconds(before, after));
	}

	public timeAllBatches(callback: () => void): void {
		while (this.timeBatch(callback));
	}

	public async timeAllBatchesAsync(callback: () => Promise<unknown>): Promise<void> {
		while (await this.timeBatchAsync(callback));
	}
}

/**
 * Runs a synchronous duration benchmark and returns the collected timing measurements.
 * @remarks
 * A more limited, synchronous, version of {@link collectDurationData}.
 * @public
 */
export function runBenchmarkSync(args: DurationBenchmarkSync): CollectedData {
	const state = new BenchmarkState(defaultTimer, args);
	state.timeAllBatches(args.benchmarkFn);
	return state.computeData();
}

/**
 * Runs an asynchronous duration benchmark and returns the collected timing measurements.
 */
export async function runBenchmarkAsync(args: DurationBenchmarkAsync): Promise<CollectedData> {
	const state = new BenchmarkState(defaultTimer, args);
	await state.timeAllBatchesAsync(args.benchmarkFnAsync);
	return state.computeData();
}

/**
 * Run a garbage collection, if possible.
 *
 * @remarks
 * Used before the test to help reduce noise from previous allocations
 * (e.g., from previous tests or startup).
 */
function tryRunGarbageCollection(): void {
	global?.gc?.();
}

/**
 * Configures a benchmark that uses {@link collectDurationData}
 * to measure duration and returns the results in a format suitable for reporting via {@link benchmarkIt}.
 * @public
 */
export function benchmarkDuration(
	args: DurationBenchmark,
): BenchmarkDescription & BenchmarkFunction {
	return {
		testType: TestType.ExecutionTime,
		run: () => collectDurationData(args),
	};
}
