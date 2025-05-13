/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type * as v8 from "node:v8";

import { assert } from "chai";
import chalk from "chalk";
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

/**
 * This is a flag to enable/disable error throwing for memory regression tests.
 * Disabling this will allow running the tests in CI without failing the build, but still get a warning.
 * Set to 1 to enable error throwing in memory regression tests.
 */
const ENABLE_MEM_REGRESSION = process.env.ENABLE_MEM_REGRESSION === "1";

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
	readonly maxBenchmarkDurationSeconds?: number;

	/**
	 * The min sample count to reach.
	 * Defaults to 50.
	 *
	 * @remarks This takes precedence over {@link MemoryTestObjectProps.maxBenchmarkDurationSeconds}.
	 */
	readonly minSampleCount?: number;

	/**
	 * The benchmark will iterate the test as many times as necessary to try to get the absolute value of
	 * the relative margin of error below this number.
	 * Specify as an integer (e.g. 5 means RME below 5%).
	 * Defaults to 2.5.
	 *
	 * @remarks {@link MemoryTestObjectProps.maxBenchmarkDurationSeconds} takes precedence over this, since a
	 * benchmark with a very high measurement variance might never get a low enough RME.
	 */
	readonly maxRelativeMarginOfError?: number;

	/**
	 * Percentage of samples (0.1 - 1) to use for calculating the statistics.
	 * Defaults to 0.95.
	 * Use a lower number to drop the highest/lowest measurements.
	 */
	readonly samplePercentageToUse?: number;

	/**
	 * The baseline memory usage to compare against for the test, which is used to determine if the test regressed.
	 * If not specified, the test will not be compared against a baseline and will only be run to measure the memory usage.
	 * @remarks
	 * Has no effect if `allowedDeviationBytes` is not specified. If `ENABLE_MEM_REGRESSION=1` in the environment, a test whose memory usage falls outside `baselineMemoryUsage +/- allowedDeviationBytes` will be marked as failed.
	 * Otherwise a warning is printed to the conso
	 */
	readonly baselineMemoryUsage?: number;

	/**
	 * The allowed deviation from the `baselineMemoryUsage`, measured in bytes.
	 * @remarks
	 * Has no effect if `baselineMemoryUsage` is not specified. If `ENABLE_MEM_REGRESSION=1` in the environment, a test whose memory usage falls outside `baselineMemoryUsage +/- allowedDeviationBytes` will be marked as failed.
	 * Otherwise a warning is printed to the console.
	 * */
	readonly allowedDeviationBytes?: number;
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
 * Validates the values passed in for memory regression tests.
 * @param baselineMemoryUsage - baseline memory usage to compare against for the test, which is used to determine if the test regressed.
 * @param allowedDeviationBytes - allowed deviation from the `baselineMemoryUsage`, measured in bytes.
 * @throws Error if baselineMemoryUsage XOR allowedDeviationBytes are set or if either is negative.
 */
function validateMemoryBaselineValues(
	baselineMemoryUsage?: number,
	allowedDeviationBytes?: number,
): void {
	const onlyOneIsSet =
		(baselineMemoryUsage === undefined) !== (allowedDeviationBytes === undefined);
	if (onlyOneIsSet) {
		throw new Error("Both baselineMemoryUsage and allowedDeviationBytes must be defined");
	}

	if (baselineMemoryUsage !== undefined && baselineMemoryUsage < 0) {
		throw new Error("baselineMemoryUsage must be a positive number.");
	}

	if (allowedDeviationBytes !== undefined && allowedDeviationBytes < 0) {
		throw new Error("allowedDeviationBytes must be a positive number.");
	}
}

/**
 * Reports a memory issue. Throws an error if `ENABLE_MEM_REGRESSION` is set to 1, otherwise
 * prints a warning to the console.
 * @param message - The message to report.
 */
function reportMemoryIssue(message: string): void {
	if (ENABLE_MEM_REGRESSION) {
		throw new Error(message);
	} else {
		// We use this over console.log so warnings are printed evn when test infra suppresses console output.
		process.stdout.write(chalk.yellow(message));
	}
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
	// Setting to -1 to indicate that baselineMemoryUsage or allowedDeviationBytes variables are not set.
	validateMemoryBaselineValues(testObject.baselineMemoryUsage, testObject.allowedDeviationBytes);
	const baselineMemoryUsage = testObject.baselineMemoryUsage ?? -1;
	const allowedDeviationBytes = testObject.allowedDeviationBytes ?? -1;

	const args: Required<MemoryTestObjectProps> = {
		maxBenchmarkDurationSeconds: testObject.maxBenchmarkDurationSeconds ?? 30,
		minSampleCount: testObject.minSampleCount ?? 50,
		maxRelativeMarginOfError: testObject.maxRelativeMarginOfError ?? 2.5,
		only: testObject.only ?? false,
		title: testObject.title,
		baselineMemoryUsage,
		type: testObject.type ?? BenchmarkType.Measurement,
		samplePercentageToUse: testObject.samplePercentageToUse ?? 0.95,
		category: testObject.category ?? "",
		allowedDeviationBytes,
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

			await testObject.before?.();

			// This code is easier to read with the short branch of the if first
			// eslint-disable-next-line unicorn/no-negated-condition
			if (!isInPerformanceTestingMode) {
				// If not in perfMode, just run the test as a correctness test with one iteration and no data collection.
				await testObject.beforeIteration?.();
				await testObject.run?.();
				await testObject.afterIteration?.();
			} else {
				// If in perfMode, collect and report data with many iterations

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
						heapUsedStats = getArrayStatistics(
							heapUsedArray,
							args.samplePercentageToUse,
						);

						// Break if max elapsed time passed, only if we've reached the min sample count
						if (
							runs >= args.minSampleCount &&
							timer.toSeconds(startTime, timer.now()) >
								args.maxBenchmarkDurationSeconds
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

					if (baselineMemoryUsage >= 0 && allowedDeviationBytes >= 0) {
						// Compare the average heap used to the baseline memory usage
						const avgHeapUsed = heapUsedStats.arithmeticMean;
						const lowerBound = baselineMemoryUsage - args.allowedDeviationBytes;
						const upperBound = baselineMemoryUsage + args.allowedDeviationBytes;
						// Throw errors on regressions/improvements if `ENABLE_MEM_REGRESSION` is set and a warning otherwise.
						// This allows us to run the tests in CI without failing the build, but still get a warning.
						if (avgHeapUsed > upperBound) {
							const message = `Memory Regression detected for test '${
								testObject.title
							}': Used '${avgHeapUsed.toPrecision(6)}' bytes, with baseline'${
								args.baselineMemoryUsage
							}' and tolerance of '${allowedDeviationBytes}' bytes.\n`;
							reportMemoryIssue(message);
						}
						if (avgHeapUsed < lowerBound) {
							const message = `Possible memory improvement detected for test '${
								testObject.title
							}'. Used '${avgHeapUsed.toPrecision(6)}' bytes with baseline '${
								args.baselineMemoryUsage
							}' and tolerance of '${allowedDeviationBytes}' bytes. Consider updating the baseline.\n`;
							reportMemoryIssue(message);
						}
					}
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
			}

			await testObject.after?.();
			return benchmarkStats;
		},
	});
}
