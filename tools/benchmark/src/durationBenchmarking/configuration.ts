/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "../assert.js";
import type { BenchmarkDescription, HookArguments } from "../Configuration.js";
import type { Timer } from "../timer";
import type { Phase } from "./getDuration.js";

/**
 * @public
 */
export type CustomBenchmarkArguments = CustomBenchmark & BenchmarkDescription;

/**
 * @public
 */
export type DurationBenchmark =
	| BenchmarkSyncArguments
	| BenchmarkAsyncArguments
	| CustomBenchmarkArguments;

export type BenchmarkRunningOptionsSync = BenchmarkSyncArguments & BenchmarkTimingOptions & OnBatch;

export type BenchmarkRunningOptionsAsync = BenchmarkAsyncArguments &
	BenchmarkTimingOptions &
	OnBatch;

/**
 * Arguments to benchmark a synchronous function
 * @public
 */
export interface BenchmarkSyncArguments extends BenchmarkSyncFunction, DurationBenchmarkOptions {}

/**
 * Arguments to benchmark a synchronous function
 * @public
 */
export interface BenchmarkSyncFunction extends DurationBenchmarkOptions {
	/**
	 * The (synchronous) function to benchmark.
	 */
	benchmarkFn: () => void;
}

/**
 * Configuration for benchmarking an asynchronous function.
 * @public
 */
export interface BenchmarkAsyncArguments extends BenchmarkAsyncFunction, DurationBenchmarkOptions {}

/**
 * An asynchronous function to benchmark.
 * @public
 */
export interface BenchmarkAsyncFunction extends DurationBenchmarkOptions {
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
	readonly iterationsPerBatch: number;
	readonly timer: Timer<T>;
	recordBatch(duration: number): boolean;

	/**
	 * A helper utility which uses `timer` to time running `callback` `iterationsPerBatch` times and passes the result to recordBatch returning the result.
	 * @remarks
	 * This is implemented in terms of the other public APIs, and can be used in simple cases when no extra operations are required.
	 */
	timeBatch(callback: () => void): boolean;
}

/**
 * @public
 */
export interface CustomBenchmark extends BenchmarkTimingOptions {
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

	startPhase?: Phase;
}

/**
 * Set of options that can be provided to a benchmark. These options generally align with the BenchmarkJS options type;
 * you can see more documentation {@link https://benchmarkjs.com/docs#options | here}.
 * @public
 */
export interface OnBatch {
	/**
	 * Executes before the start of each batch. This has the same semantics as benchmarkjs's `onCycle`:
	 * https://benchmarkjs.com/docs/#options_onCycle
	 *
	 * @remarks
	 * Beware that batches run `benchmarkFn` more than once: a typical micro-benchmark might involve 10k
	 * iterations per batch.
	 */
	beforeEachBatch?: () => void;
}

/**
 * Set of options that can be provided to a benchmark. These options generally align with the BenchmarkJS options type;
 * you can see more documentation {@link https://benchmarkjs.com/docs#options | here}.
 * @public
 */
export interface DurationBenchmarkOptions extends HookArguments, BenchmarkTimingOptions, OnBatch {}

/**
 * Validates arguments to `benchmark`.
 * @public
 */
export function validateBenchmarkArguments(
	args: BenchmarkSyncArguments | BenchmarkAsyncArguments,
):
	| { isAsync: true; benchmarkFn: () => Promise<unknown> }
	| { isAsync: false; benchmarkFn: () => void } {
	const intersection = args as BenchmarkSyncArguments & BenchmarkAsyncArguments;
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
 * @public
 */
export function benchmarkArgumentsIsCustom(
	args: DurationBenchmark,
): args is CustomBenchmarkArguments {
	const intersection = args as Partial<BenchmarkSyncArguments> &
		Partial<BenchmarkAsyncArguments> &
		Partial<CustomBenchmarkArguments>;

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
