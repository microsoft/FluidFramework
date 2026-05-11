/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "../assert.js";
import type { Timer } from "../timer.js";
import type { Phase } from "./getDuration.js";

/**
 * A benchmark for measuring the duration of an operation.
 * @remarks
 * Provide to {@link benchmarkDuration} or {@link collectDurationData}.
 * @public
 * @input
 */
export type DurationBenchmark =
	| DurationBenchmarkSync
	| DurationBenchmarkAsync
	| DurationBenchmarkCustom;

/**
 * Configuration for benchmarking a synchronous function.
 * @public
 * @input
 */
export interface DurationBenchmarkSync extends BenchmarkTimingOptions {
	/**
	 * The (synchronous) function to benchmark.
	 */
	readonly benchmarkFn: () => void;
}

/**
 * Configuration for benchmarking an asynchronous function.
 * @public
 * @input
 */
export interface DurationBenchmarkAsync extends BenchmarkTimingOptions {
	/**
	 * The asynchronous function to benchmark. The time measured includes all time spent until the returned promise is
	 * resolved. This includes the event loop or processing other events. For example, a test which calls `setTimeout`
	 * in the body will always take at least 4ms per operation due to timeout throttling:
	 * https://developer.mozilla.org/en-US/docs/Web/API/WindowOrWorkerGlobalScope/setTimeout#Minimum_delay_and_timeout_nesting
	 */
	readonly benchmarkFnAsync: () => Promise<unknown>;
}

/**
 * Timer for reporting batch durations in {@link DurationBenchmarkCustom}.
 * @public
 * @sealed
 */
export interface BatchedDurationTimer<T> {
	/** The number of times the operation should be run per batch. */
	readonly iterationsPerBatch: number;
	/** The timer to use for measuring elapsed time of a batch. */
	readonly timer: Timer<T>;
	/**
	 * Records the duration of running {@link BatchedDurationTimer.iterationsPerBatch} iterations and advances internal state.
	 * @param duration - The elapsed time for the batch in seconds. Compute this using {@link Timer.toSeconds}.
	 * @returns `true` if another batch should be run, `false` if data collection is complete.
	 * @remarks
	 * When possible, prefer higher level functions like {@link BatchedDurationTimer.timeBatch}
	 * or {@link BatchedDurationTimer.timeAllBatches} which handle timing and batch management for you.
	 * @example
	 * ```typescript
	 * benchmarkFnCustom: async (state) => {
	 * 	let duration: number;
	 * 	do {
	 * 		// Per-batch setup (not timed)
	 * 		const before = state.timer.now();
	 * 		for (let i = 0; i < state.iterationsPerBatch; i++) {
	 * 			// operation
	 * 		}
	 * 		const after = state.timer.now();
	 * 		duration = state.timer.toSeconds(before, after);
	 * 	} while (state.recordBatch(duration));
	 * },
	 * ```
	 */
	recordBatch(duration: number): boolean;

	/**
	 * Convenience method: times `callback` running `iterationsPerBatch` times, records the batch, and returns the result of {@link BatchedDurationTimer.recordBatch}.
	 * @remarks
	 * Use this when no per-batch setup or teardown is needed outside the measured callback.
	 * Implemented in terms of the other public APIs on this interface.
	 * @example
	 * ```typescript
	 * benchmarkFnCustom: async (state) => {
	 * 	let running: boolean;
	 * 	do {
	 * 		// Per-batch setup (not timed)
	 * 		running = state.timeBatch(() => { /* operation *\/ });
	 * 		// Per-batch teardown (not timed)
	 * 	} while (running);
	 * },
	 * ```
	 */
	timeBatch(callback: () => void): boolean;

	/**
	 * Async variant of {@link BatchedDurationTimer.timeBatch}: times `callback` running `iterationsPerBatch` times, records the batch, and returns the result of {@link BatchedDurationTimer.recordBatch}.
	 * @remarks
	 * Use this when no per-batch setup or teardown is needed outside the measured async callback.
	 * Implemented in terms of the other public APIs on this interface.
	 * @example
	 * ```typescript
	 * benchmarkFnCustom: async (state) => {
	 * 	let running: boolean;
	 * 	do {
	 * 		// Per-batch setup (not timed)
	 * 		running = await state.timeBatchAsync(async () => { /* operation *\/ });
	 * 		// Per-batch teardown (not timed)
	 * 	} while (running);
	 * },
	 * ```
	 */
	timeBatchAsync(callback: () => Promise<unknown>): Promise<boolean>;

	/**
	 * Convenience method: runs {@link BatchedDurationTimer.timeBatch} in a loop until data collection is complete.
	 * @remarks
	 * Use this when no per-batch setup or teardown is needed outside the measured callback.
	 * Implemented in terms of the other public APIs on this interface.
	 * @example
	 * ```typescript
	 * benchmarkFnCustom: async (state) => {
	 * 	// One time setup (not timed)
	 * 	state.timeAllBatches(() => { /* operation *\/ });
	 * 	// One time teardown (not timed)
	 * },
	 * ```
	 */
	timeAllBatches(callback: () => void): void;

	/**
	 * Async variant of {@link BatchedDurationTimer.timeAllBatches}: runs {@link BatchedDurationTimer.timeBatchAsync} in a loop until data collection is complete.
	 * @remarks
	 * Use this when no per-batch setup or teardown is needed outside the measured async callback.
	 * Implemented in terms of the other public APIs on this interface.
	 * @example
	 * ```typescript
	 * benchmarkFnCustom: async (state) => {
	 * 	// One time setup (not timed)
	 * 	await state.timeAllBatchesAsync(async () => { /* operation *\/ });
	 * 	// One time teardown (not timed)
	 * },
	 * ```
	 */
	timeAllBatchesAsync(callback: () => Promise<unknown>): Promise<void>;
}

/**
 * The most flexible option from {@link DurationBenchmark}.
 * Allows manual control over the benchmarking process, including timing and batch management.
 * @public
 * @input
 */
export interface DurationBenchmarkCustom extends BenchmarkTimingOptions {
	/**
	 * Use `state` to measure and report the performance of batches.
	 * @example
	 * ```typescript
	 * benchmarkFnCustom: async (state) => {
	 * 	let duration: number;
	 * 	do {
	 * 		let counter = state.iterationsPerBatch;
	 * 		const before = state.timer.now();
	 * 		while (counter--) {
	 * 			// Do the thing
	 * 		}
	 * 		const after = state.timer.now();
	 * 		duration = state.timer.toSeconds(before, after);
	 * 		// Collect data
	 * 	} while (state.recordBatch(duration));
	 * },
	 * ```
	 *
	 * @example
	 * ```typescript
	 * benchmarkFnCustom: async (state) => {
	 * 	let running: boolean;
	 * 	do {
	 * 		running = state.timeBatch(() => {});
	 * 	} while (running);
	 * },
	 * ```
	 */
	benchmarkFnCustom<T>(state: BatchedDurationTimer<T>): Promise<void>;
}

/**
 * Timing options for a duration benchmark.
 * @remarks
 * These options control how many batches are collected and how long the benchmark runs.
 *
 * A **batch** is a timed group of `iterationsPerBatch` operations
 * (typically consecutive calls to `benchmarkFn` or `benchmarkFnAsync`).
 * Batching is necessary for fast operations whose individual execution time is shorter than
 * the timer resolution: by running many iterations in one timed block and dividing the runtime,
 * an accurate per-operation time can be obtained.
 *
 * The framework runs a warmup batch, then grows `iterationsPerBatch` until each batch meets
 * `minBatchDurationSeconds`, then collects data batches.
 * Data collection stops once at least `minBatchCount` batches have been collected and either:
 * - The relative margin of error of the arithmetic mean based on collected batches is below 1%.
 * - The total elapsed time exceeds `maxBenchmarkDurationSeconds`.
 *
 * For benchmarks of impure functions (where successive calls produce different results),
 * use {@link DurationBenchmarkCustom} to perform any necessary per-batch reset
 * inside `benchmarkFnCustom` without it being included in the measured time.
 * @public
 * @input
 */
export interface BenchmarkTimingOptions {
	/**
	 * Maximum total time in seconds to spend collecting data batches.
	 * @remarks
	 * Data collection stops once this limit is reached, even if the margin of error is still above 1%.
	 * {@link BenchmarkTimingOptions.minBatchCount} takes precedence: at least that many batches are always collected.
	 */
	maxBenchmarkDurationSeconds?: number;

	/**
	 * Minimum number of data batches to collect before stopping.
	 * @remarks
	 * Takes precedence over {@link BenchmarkTimingOptions.maxBenchmarkDurationSeconds}:
	 * collection continues until this count is reached regardless of elapsed time.
	 */
	minBatchCount?: number;

	/**
	 * Minimum duration in seconds for each batch.
	 * @remarks
	 * During the batch-size adjustment phase, `iterationsPerBatch` is doubled until a single batch
	 * meets this threshold, ensuring each timed sample is long enough to be meaningful relative to
	 * the timer resolution.
	 */
	minBatchDurationSeconds?: number;

	/**
	 * The {@link Phase} to start the benchmark in.
	 * Defaults to {@link Phase.WarmUp}.
	 * @remarks
	 * Setting this to {@link Phase.CollectData} skips warmup and batch-size adjustment.
	 * This is mainly useful for the timing of very slow operations (which don't need batching to get accurate timing)
	 * to save time by skipping warmup and using all iterations for data collection.
	 */
	startPhase?: Phase;
}

/**
 * Validates a `DurationBenchmarkSync | DurationBenchmarkAsync` and determines if it is async.
 */
export function validateBenchmarkArguments(
	args: DurationBenchmarkSync | DurationBenchmarkAsync,
):
	| { isAsync: true; benchmarkFn: () => Promise<unknown> }
	| { isAsync: false; benchmarkFn: () => void } {
	const intersection = args as DurationBenchmarkSync & DurationBenchmarkAsync;
	const isSync = intersection.benchmarkFn !== undefined;
	const isAsync = intersection.benchmarkFnAsync !== undefined;
	assert(
		isSync !== isAsync,
		"Exactly one of `benchmarkFn` and `benchmarkFnAsync` should be defined.",
	);
	if (isSync) {
		return { isAsync: false, benchmarkFn: intersection.benchmarkFn };
	}

	return { isAsync: true, benchmarkFn: intersection.benchmarkFnAsync };
}

/**
 * Returns true if `args` is a {@link DurationBenchmarkCustom}.
 */
export function isCustomBenchmark(args: DurationBenchmark): args is DurationBenchmarkCustom {
	const intersection = args as Partial<DurationBenchmarkSync> &
		Partial<DurationBenchmarkAsync> &
		Partial<DurationBenchmarkCustom>;

	const isSync = intersection.benchmarkFn !== undefined;
	const isAsync = intersection.benchmarkFnAsync !== undefined;
	const isCustom = intersection.benchmarkFnCustom !== undefined;
	assert(
		// eslint-disable-next-line unicorn/prefer-native-coercion-functions
		[isSync, isAsync, isCustom].filter((x) => x).length === 1,
		"Exactly one of `benchmarkFn`, `benchmarkFnAsync` or `benchmarkFnCustom` should be defined.",
	);
	return isCustom;
}
