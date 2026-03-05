/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "../assert.js";
import type { Timer } from "../timer";
import type { Phase } from "./getDuration.js";

/**
 * @public
 * @input
 */
export type DurationBenchmark =
	| DurationBenchmarkSync
	| DurationBenchmarkAsync
	| DurationBenchmarkCustom;

/**
 * Arguments to benchmark a synchronous function
 * @public
 * @input
 */
export interface DurationBenchmarkSync extends HookArguments, BenchmarkTimingOptions, OnBatch {
	/**
	 * The (synchronous) function to benchmark.
	 */
	benchmarkFn: () => void;
}

/**
 * Configuration for benchmarking an asynchronous function.
 * @public
 * @input
 */
export interface DurationBenchmarkAsync extends HookArguments, BenchmarkTimingOptions, OnBatch {
	/**
	 * The asynchronous function to benchmark. The time measured includes all time spent until the returned promise is
	 * resolved. This includes the event loop or processing other events. For example, a test which calls `setTimeout`
	 * in the body will always take at least 4ms per operation due to timeout throttling:
	 * https://developer.mozilla.org/en-US/docs/Web/API/WindowOrWorkerGlobalScope/setTimeout#Minimum_delay_and_timeout_nesting
	 */
	benchmarkFnAsync: () => Promise<unknown>;
}

/**
 * @public
 * @sealed
 */
export interface BenchmarkTimer<T> {
	/** The number of times the operation should be run per batch. */
	readonly iterationsPerBatch: number;
	/** The timer to use for measuring elapsed time of a batch. */
	readonly timer: Timer<T>;
	/**
	 * Records the duration of a completed batch and advances internal state.
	 * @param duration - The elapsed time for the batch in seconds. Compute this using {@link Timer.toSeconds}.
	 * @returns `true` if another batch should be run, `false` if data collection is complete.
	 */
	recordBatch(duration: number): boolean;

	/**
	 * A helper utility which uses `timer` to time running `callback` `iterationsPerBatch` times and passes the result to recordBatch returning the result.
	 * @remarks
	 * This is implemented in terms of the other public APIs, and can be used in simple cases when no extra operations are required.
	 */
	timeBatch(callback: () => void): boolean;
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
	 * benchmarkFnCustom: async <T>(state: BenchmarkTimer<T>) => {
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
	 * benchmarkFnCustom: async <T>(state: BenchmarkTimer<T>) => {
	 * 	let running: boolean;
	 * 	do {
	 * 		running = state.timeBatch(() => {});
	 * 	} while (running);
	 * },
	 * ```
	 */
	benchmarkFnCustom<T>(state: BenchmarkTimer<T>): Promise<void>;
}

/**
 * Set of options that can be provided to a benchmark. These options generally align with the BenchmarkJS options type;
 * you can see more documentation {@link https://benchmarkjs.com/docs#options | here}.
 * @public
 * @input
 */
export interface BenchmarkTimingOptions {
	/**
	 * The max time in seconds to run the benchmark.
	 */
	maxBenchmarkDurationSeconds?: number;

	/**
	 * The minimum number of batches to measure.
	 * @remarks This takes precedence over {@link BenchmarkTimingOptions.maxBenchmarkDurationSeconds}.
	 */
	minBatchCount?: number;

	/**
	 * The minimum time in seconds to run an individual batch.
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
 * Optional hook to run before each batch of iterations.
 * @public
 * @input
 */
export interface OnBatch {
	/**
	 * Executes before the start of each batch. This has the same semantics as benchmarkjs's `onCycle`:
	 * https://benchmarkjs.com/docs/#options_onCycle
	 *
	 * @remarks
	 * Beware that batches run `benchmarkFn` more than once: a typical micro-benchmark might involve 10k
	 * iterations per batch.
	 *
	 * If you need this, consider using {@link DurationBenchmarkCustom} instead of {@link DurationBenchmarkSync} or {@link DurationBenchmarkAsync}.
	 * It offers much more control, and avoids the challenges of passing data between this callback and other parts of the benchmark.
	 */
	beforeEachBatch?: () => void;
}

/**
 * Convenience type for a hook function supported by `HookArguments`. Supports synchronous and asynchronous functions.
 * @public
 */
export type HookFunction = () => void | Promise<unknown>;

/**
 * Arguments that can be passed to `benchmark` for optional test setup/teardown.
 * Hooks--along with the benchmarked function--are run without additional error validation.
 * This means any exception thrown from either a hook or the benchmarked function will cause test failure,
 * and subsequent operations won't be run.
 * @remarks
 *
 * Be careful when writing non-pure benchmark functions!
 * This library is written with the assumption that each cycle it runs is an independent sample.
 * This can typically be achieved by using the `onCycle` hook to reset state, with some caveats.
 * For more details, read below.
 *
 * This library runs the benchmark function in two hierarchical groups: cycles and iterations.
 * One iteration consists of a single execution of `benchmarkFn`.
 * Since the time taken by a single iteration might be significantly smaller than the clock resolution, benchmark
 * dynamically decides to run a number of iterations per cycle.
 * After a warmup period, this number is fixed across cycles (i.e. if this library decides to run 10,000 iterations
 * per cycle, all statistical analysis will be performed on cycles which consist of 10,000 iterations)
 * This strategy also helps minimize noise from JITting code.
 *
 * Statistical analysis is performed at the cycle level: this library treats each cycle's timing information as a data
 * point taken from a normal distribution, and runs cycles until the root-mean error is below a threshold or its max
 * time has been reached.
 * The statistical analysis it uses is invalid if cycles aren't independent trials: consider the test
 * ```typescript
 * const myList = [];
 * benchmark({
 *     title: "insert at start of a list",
 *     benchmarkFn: () => {
 *         myList.unshift(0);
 *     }
 * });
 * ```
 *
 * If each cycle has 10k iterations, the first cycle will time how long it takes to repeatedly insert elements 0 through 10k
 * into the start of `myList`.
 * The second cycle will time how long it takes to repeatedly insert elements 10k through 20k at the start, and so on.
 * As inserting an element at the start of the list is O(list size), it's clear that cycles will take longer and longer.
 * We can use the `onCycle` hook to alleviate this problem:
 * ```typescript
 * let myList = [];
 * benchmark({
 *     title: "insert at start of a list",
 *     onCycle: () => {
 *         myList = [];
 *     }
 *     benchmarkFn: () => {
 *         myList.unshift(0);
 *     }
 * });
 * ```
 *
 * With this change, it's more reasonable to model each cycle as an independent event.
 *
 * Note that this approach is slightly misleading in the data it measures: if this library chooses a cycle size of 10k,
 * the time reported per iteration is really an average of the time taken to insert 10k elements at the start, and not
 * the average time to insert an element to the start of the empty list as the test body might suggest at a glance.
 *
 * @example
 *
 * ```typescript
 * let iterations = 0;
 * let cycles = 0;
 * benchmark({
 *     title: "my sample performance test"
 *     before: () => {
 *         console.log("setup goes here")
 *     },
 *     onCycle: () => {
 *         cycles++;
 *     },
 *     after: () => {
 *         console.log("iterations", iterations);
 *         console.log("cycles", cycles);
 *         console.log("teardown goes here")
 *     }
 *     benchmarkFn: () => {
 *         iterations++;
 *     }
 * });
 *
 * // Sample console output in correctness mode:
 * //
 * // setup goes here
 * // iterations 1
 * // cycles 1
 * // teardown goes here
 * //
 * // Sample console output in perf mode, if benchmark dynamically chose to run 40 cycles of 14k iterations each:
 * //
 * // setup goes here
 * // iterations 560,000
 * // cycles 40
 * // teardown goes here
 * ```
 *
 * @public
 * @input
 */
export interface HookArguments {
	/**
	 * Executes once, before the test body it's declared for.
	 *
	 * @remarks
	 * This does *not* execute on each iteration or cycle.
	 */
	before?: HookFunction | undefined;
	/**
	 * Executes once, after the test body it's declared for.
	 *
	 * @remarks
	 * This does *not* execute on each iteration or cycle.
	 */
	after?: HookFunction | undefined;
}

/**
 * Validates arguments to `benchmark`.
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
 * Validates arguments to `benchmark`.
 */
export function benchmarkArgumentsIsCustom(
	args: DurationBenchmark,
): args is DurationBenchmarkCustom {
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
