/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type * as v8 from "node:v8";

import { assert } from "chai";
import { Test } from "mocha";

import {
	isInPerformanceTestingMode,
	MochaExclusiveOptions,
	HookFunction,
	BenchmarkType,
	TestType,
	qualifiedTitle,
	type Titled,
	type BenchmarkDescription,
} from "../Configuration";
import { isResultError, type BenchmarkResult, type Stats } from "../ResultTypes";
import { getArrayStatistics, prettyNumber } from "../RunnerUtilities";
import { timer } from "../timer";

import { supportParentProcess } from "./runner";

// TODO:
// Much of the logic and interfaces here were duplicated from the runtime benchmark code.
// This code should be either updated and/or deduplicated to reflect the major refactoring and improvements done to the runtime benchmark code.
// TODO:
// The majority of this code is not mocha specific and should be factored into a place where it can be used by tests not using mocha.
// TODO:
// IMemoryTestObject provides a rather unintuitive way to measure memory used by some destructure.
// Data data to measure needs to be allocated in either `run` or `afterIteration` (there is no reason to separate those as the tooling does nothing between),
// then freed in `beforeIteration`.
// Having methods like "allocate" and "free" would make more sense.
// TODO:
// Leaks from one iteration not cleaned up before the next should be an error not silently ignored via subtracting them out
// since the statistics assume samples are independent and that can't be true if each sample leaks memory.
// Alternatively a mode to measure tests that work this way could be added via a separate API and characterize the grow of memory over iterations.

/**
 * @public
 */
export interface IMemoryTestObject extends MemoryTestObjectProps {
	/**
	 * The method with code to profile.
	 * It will be called for each iteration of the test.
	 * Expects an async function for maximum compatibility.
	 * Wrap synchronous code in a Promise/async-function if necessary.
	 */
	run(): Promise<unknown>;

	/**
	 * Method to execute before each call to run().
	 * It executes right before garbage collection is triggered, prior to taking the "before" memory measurements.
	 * If you need to perform per-iteration setup that should not be included in the baseline "before" memory
	 * measurement, do it here.
	 */
	beforeIteration?: HookFunction;

	/**
	 * Method to execute after each call to run().
	 * It runs after the code to be profiled but before garbage collection is triggered, prior to taking the "after"
	 * memory measurements.
	 * If you need to cleanup things that shouldn't be considered part of the memory usage in the "after" measurement,
	 * clean them up here so they can be garbage collected before the measurement is taken.
	 */
	afterIteration?: HookFunction;

	/**
	 * Method to execute *once* before all iterations of the test (i.e. before any calls to run()).
	 */
	before?: HookFunction;

	/**
	 * Method to execute *once* after all iterations of the test (i.e. after all calls to run()).
	 */
	after?: HookFunction;
}

/**
 * @public
 */
export interface MemoryTestObjectProps extends MochaExclusiveOptions, Titled, BenchmarkDescription {
	/**
	 * The max time in seconds to run the benchmark.
	 * This is not a guaranteed immediate stop time.
	 * Elapsed time gets checked between iterations of the test that is being benchmarked.
	 * Defaults to 30 seconds.
	 */
	maxBenchmarkDurationSeconds?: number;

	/**
	 * The min sample count to reach.
	 * Defaults to 50.
	 *
	 * @remarks This takes precedence over {@link MemoryTestObjectProps.maxBenchmarkDurationSeconds}.
	 */
	minSampleCount?: number;

	/**
	 * The benchmark will iterate the test as many times as necessary to try to get the absolute value of
	 * the relative margin of error below this number.
	 * Specify as an integer (e.g. 5 means RME below 5%).
	 * Defaults to 2.5.
	 *
	 * @remarks {@link MemoryTestObjectProps.maxBenchmarkDurationSeconds} takes precedence over this, since a
	 * benchmark with a very high measurement variance might never get a low enough RME.
	 */
	maxRelativeMarginOfError?: number;

	/**
	 * Percentage of samples (0.1 - 1) to use for calculating the statistics.
	 * Defaults to 0.95.
	 * Use a lower number to drop the highest/lowest measurements.
	 */
	samplePercentageToUse?: number;
}

/**
 * Contains the samples of all memory-related measurements we track for a given benchmark (a test which was
 * potentially iterated several times). Each property is an array and all should be the same length, which
 * is the number of iterations done during the benchmark.
 * @public
 */
export interface MemoryTestData {
	/**
	 * Memory usage in bytes.
	 */
	memoryUsage: NodeJS.MemoryUsage[];

	/**
	 * Heap info.
	 */
	heap: v8.HeapInfo[];

	/**
	 * Heap space info.
	 */
	heapSpace: v8.HeapSpaceInfo[][];
}

/**
 * Contains the samples of all memory-related measurements before and after a benchmark.
 * @public
 */
export interface MemorySampleData {
	/**
	 * Memory usage before the test.
	 */
	before: MemoryTestData;

	/**
	 * Memory usage after the test.
	 */
	after: MemoryTestData;
}

/**
 * This is wrapper for Mocha's 'it()' function, that runs a memory benchmark.
 *
 * Here is how this benchmarking works at a high-level:
 *
 * ```
 *  For each benchmark
 *      Run testObject.before().
 *      Run these methods multiple times and measure results:
 *          testObject.beforeIteration()
 *          testObject.run()
 *          testObject.afterIteration()
 *      Iterate until testObject.minSampleCount has been reached, and one of
 *        these two things is also true: RME is lower than maxRelativeMarginOfError,
 *        or we've iterated for longer than testObject.maxBenchmarkDurationSeconds.
 *      Run testObject.after().
 * ```
 *
 * Optional setup and teardown functions for the whole benchmark can be provided via
 * {@link IMemoryTestObject.before} and {@link IMemoryTestObject.after}.
 * Each of them will run only once, before/after all the iterations/samples.
 *
 * * Optional setup and teardown functions for each iteration of the benchmark can be provided via
 * {@link IMemoryTestObject.beforeIteration} and {@link IMemoryTestObject.afterIteration}.
 * These will run before/after every iteration of the test code.
 *
 * Tests created with this function get tagged with '\@MemoryUsage', so mocha's --grep/--fgrep
 * options can be used to only run this type of tests by fitering on that value.
 *
 * @public
 */
export function benchmarkMemory(testObject: IMemoryTestObject): Test {
	const args: Required<MemoryTestObjectProps> = {
		maxBenchmarkDurationSeconds: testObject.maxBenchmarkDurationSeconds ?? 30,
		minSampleCount: testObject.minSampleCount ?? 50,
		maxRelativeMarginOfError: testObject.maxRelativeMarginOfError ?? 2.5,
		only: testObject.only ?? false,
		title: testObject.title,
		type: testObject.type ?? BenchmarkType.Measurement,
		samplePercentageToUse: testObject.samplePercentageToUse ?? 0.95,
		category: testObject.category ?? "",
	};

	return supportParentProcess({
		title: qualifiedTitle({ ...testObject, testType: TestType.MemoryUsage }),
		only: args.only,
		run: async () => {
			let runs = 0;
			let benchmarkStats: BenchmarkResult = {
				elapsedSeconds: 0,
				customData: {},
			};

			// If not in perfMode, just run the test normally
			if (!isInPerformanceTestingMode) {
				await testObject.before?.();
				await testObject.beforeIteration?.();
				await testObject.run?.();
				await testObject.afterIteration?.();
				await testObject.after?.();
				return benchmarkStats;
			}

			await testObject.before?.();

			const sample: MemorySampleData = {
				before: {
					memoryUsage: [],
					heap: [],
					heapSpace: [],
				},
				after: {
					memoryUsage: [],
					heap: [],
					heapSpace: [],
				},
			};
			// Do this import only if isInPerformanceTestingMode so correctness mode can work on a non-v8 runtime like the a browser.
			const v8 = await import("node:v8");
			assert(global.gc !== undefined, "gc not exposed");

			const startTime = timer.now();
			try {
				let heapUsedStats: Stats = {
					marginOfError: Number.NaN,
					marginOfErrorPercent: Number.NaN,
					standardErrorOfMean: Number.NaN,
					standardDeviation: Number.NaN,
					arithmeticMean: Number.NaN,
					samples: [],
					variance: Number.NaN,
				};

				do {
					await testObject.beforeIteration?.();
					global.gc();
					sample.before.memoryUsage.push(process.memoryUsage());
					sample.before.heap.push(v8.getHeapStatistics());
					sample.before.heapSpace.push(v8.getHeapSpaceStatistics());

					global.gc();
					await testObject.run();

					await testObject.afterIteration?.();

					global.gc();

					sample.after.memoryUsage.push(process.memoryUsage());
					sample.after.heap.push(v8.getHeapStatistics());

					sample.after.heapSpace.push(v8.getHeapSpaceStatistics());

					runs++;

					const heapUsedArray: number[] = [];
					for (let i = 0; i < sample.before.memoryUsage.length; i++) {
						heapUsedArray.push(
							sample.after.memoryUsage[i].heapUsed -
								sample.before.memoryUsage[i].heapUsed,
						);
					}
					heapUsedStats = getArrayStatistics(heapUsedArray, args.samplePercentageToUse);

					// Break if max elapsed time passed, only if we've reached the min sample count
					if (
						runs >= args.minSampleCount &&
						timer.toSeconds(startTime, timer.now()) > args.maxBenchmarkDurationSeconds
					) {
						break;
					}
				} while (
					runs < args.minSampleCount ||
					heapUsedStats.marginOfErrorPercent > args.maxRelativeMarginOfError
				);

				benchmarkStats.customData["Heap Used Avg"] = {
					rawValue: heapUsedStats.arithmeticMean,
					formattedValue: prettyNumber(heapUsedStats.arithmeticMean, 2),
				};

				benchmarkStats.customData["Heap Used StdDev"] = {
					rawValue: heapUsedStats.standardDeviation,
					formattedValue: prettyNumber(heapUsedStats.standardDeviation, 2),
				};

				benchmarkStats.customData["Margin of Error"] = {
					rawValue: heapUsedStats.marginOfError,
					formattedValue: `±${prettyNumber(heapUsedStats.marginOfError, 2)}`,
				};

				benchmarkStats.customData["Relative Margin of Error"] = {
					rawValue: heapUsedStats.marginOfErrorPercent,
					formattedValue: `±${prettyNumber(heapUsedStats.marginOfErrorPercent, 2)}`,
				};

				benchmarkStats.customData.Iterations = {
					rawValue: runs,
					formattedValue: prettyNumber(runs, 0),
				};
			} catch (error) {
				// TODO: This results in the mocha test passing when it should fail. Fix this.
				benchmarkStats = {
					error: (error as Error).message,
				};
			} finally {
				// It's not perfect, since we don't compute it *immediately* after we stop running tests but it's good enough.
				if (!isResultError(benchmarkStats)) {
					benchmarkStats.elapsedSeconds = timer.toSeconds(startTime, timer.now());
				}
			}

			return benchmarkStats;
		},
	});
}
