/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "../assert.js";
import { TestType, type BenchmarkDescription, type BenchmarkFunction } from "../Configuration.js";
import { BenchmarkState, collectDurationData, type Phase } from "./getDuration.js";

/**
 * Timer for reporting per-iteration durations in {@link benchmarkDurationBatchless}.
 * @remarks
 * Each call to {@link BatchlessDurationTimer.time} or {@link BatchlessDurationTimer.timeAsync}
 * times exactly one invocation of the provided callback and records it as a sample.
 * The return value signals whether data collection is still ongoing.
 * @public
 * @sealed
 */
export interface BatchlessDurationTimer {
	/**
	 * Times a single invocation of `callback`, records the duration as a sample, and returns
	 * `true` if more samples should be collected or `false` when data collection is complete.
	 * @remarks
	 * Interleave per-iteration setup/teardown around this call:
	 * ```typescript
	 * let running: boolean;
	 * do {
	 * 	// Per-iteration setup (not timed)
	 * 	running = state.time(() => { /* operation *\/ });
	 * 	// Per-iteration teardown (not timed)
	 * } while (running);
	 * ```
	 */
	time(callback: () => void): boolean;

	/**
	 * Async variant of {@link BatchlessDurationTimer.time}: times a single invocation of the
	 * async `callback`, records the duration as a sample, and returns `true` if more samples
	 * should be collected or `false` when data collection is complete.
	 * @remarks
	 * Interleave per-iteration setup/teardown around this call:
	 * ```typescript
	 * let running: boolean;
	 * do {
	 * 	// Per-iteration setup (not timed)
	 * 	running = await state.timeAsync(async () => { /* operation *\/ });
	 * 	// Per-iteration teardown (not timed)
	 * } while (running);
	 * ```
	 */
	timeAsync(callback: () => Promise<unknown>): Promise<boolean>;
}

/**
 * Implementation of {@link BatchlessDurationTimer} that wraps a {@link BenchmarkState} configured
 * with `minBatchDurationSeconds === 0`, ensuring each `time`/`timeAsync` call runs the callback
 * exactly once and records that single execution as a sample.
 */
export class BatchlessBenchmarkState<T> implements BatchlessDurationTimer {
	public constructor(private inner: BenchmarkState<T>) {
		assert(
			inner.options.minBatchDurationSeconds === 0,
			"BatchlessBenchmarkState requires minBatchDurationSeconds to be 0",
		);
	}

	public time(callback: () => void): boolean {
		return this.inner.timeBatch(callback);
	}

	public async timeAsync(callback: () => Promise<unknown>): Promise<boolean> {
		return await this.inner.timeBatchAsync(callback);
	}
}

/**
 * Arguments for {@link benchmarkDurationBatchless}.
 * @public
 * @input
 */
export interface DurationBenchmarkBatchless {
	/**
	 * The benchmark function.
	 * @remarks
	 * Interleave per-iteration setup/teardown around the `time` or `timeAsync` call:
	 * ```typescript
	 * benchmarkFn: async (state) => {
	 * 	let running: boolean;
	 * 	do {
	 * 		// Per-iteration setup (not timed)
	 * 		running = state.time(() => { /* operation *\/ });
	 * 		// Per-iteration teardown (not timed)
	 * 	} while (running);
	 * },
	 * ```
	 */
	readonly benchmarkFn: (state: BatchlessDurationTimer) => void | Promise<void>;
	/**
	 * See {@link BenchmarkTimingOptions.maxBenchmarkDurationSeconds}.
	 */
	maxBenchmarkDurationSeconds?: number;
	/**
	 * Minimum number of samples (iterations) to collect.
	 * See {@link BenchmarkTimingOptions.minBatchCount}.
	 */
	minSampleCount?: number;
	/**
	 * See {@link BenchmarkTimingOptions.startPhase}.
	 */
	startPhase?: Phase.CollectData | Phase.WarmUp;
}

/**
 * Variant of {@link benchmarkDuration} for when non-trivial setup and/or teardown is needed per iteration, so batching is not possible.
 * @remarks
 * Prefer using {@link benchmarkDuration} with batching when possible, as it will provide more accurate and stable measurements.
 * Use this batchless version only when necessary due to setup/teardown requirements.
 * This will result in significantly higher noise and measurement bias in the data, which is worse the shorter the operation being timed takes.
 * @public
 */
export function benchmarkDurationBatchless(
	args: DurationBenchmarkBatchless,
): BenchmarkDescription & BenchmarkFunction {
	return {
		testType: TestType.ExecutionTime,
		run: () =>
			collectDurationData({
				maxBenchmarkDurationSeconds: args.maxBenchmarkDurationSeconds,
				minBatchCount: args.minSampleCount,
				minBatchDurationSeconds: 0,
				startPhase: args.startPhase,
				benchmarkFnCustom: async (state) => {
					assert(
						state instanceof BenchmarkState,
						"Expected state to be an instance of BenchmarkState",
					);
					await args.benchmarkFn(
						new BatchlessBenchmarkState(state as BenchmarkState<unknown>),
					);
				},
			}),
	};
}
