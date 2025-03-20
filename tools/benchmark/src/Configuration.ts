/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "chai";

import { Phase } from "./runBenchmark";
import { Timer } from "./timer";

/**
 * Kinds of benchmarks.
 *
 * Example: if you have two tests on the same scenario,
 * one with and one without a feature so you can see the actual cost of that feature,
 * the test with the feature enabled should be Measurement, but the baseline you compare it to should be Perspective.
 *
 * When comparing two versions looking for changes: run `Measurement` tests.
 *
 * When looking a a single version (ex: current master) and looking for places to optimize:
 * run `Measurement` and `Perspective` tests.
 *
 * When looking into a specific issue (either with performance or the performance tests):
 * use `.only` to restrict to the relevant tests and run all tests (`Perspective`, `Measurement` and `Diagnostic`).
 *
 * @public
 */
export enum BenchmarkType {
	/**
	 * Tests which exist to be compared to other tests to reason about cost/overhead of features.
	 */
	Perspective,

	/**
	 * Tests that measure the actual performance of features.
	 * These tests are the ones that should be optimized for to improve actual user experience, and thus
	 * should be used to compare across versions to look for regressions and improvements.
	 */
	Measurement,

	/**
	 * Tests that provide extra details which typically aren't useful unless looking into some specific area.
	 *
	 * Diagnostic tests can be used for tests whose results are useful for manually determining that other tests are
	 * measuring what they claim accurately.
	 *
	 * Diagnostic tests can also be used when a particular feature/area has enough Measurement tests to detect changes,
	 * but some extra tests would be helpful for understanding the changes when they occur. Extra tests,
	 * either Measurement or Perspective which are worth keeping to help with investigations, but are not worth running
	 * generally, can be marked as Diagnostic to enable skipping them unless they are specifically needed.
	 */
	Diagnostic,

	/**
	 * Tests which verify correctness of the `benchmark` helper library. Generally not useful for any other scenario.
	 */
	OwnCorrectness,
}

/**
 * @public
 */
export enum TestType {
	/**
	 * Tests that measure execution time
	 */
	ExecutionTime,

	/**
	 * Tests that measure memory usage
	 */
	MemoryUsage,
}

/**
 * Names of all BenchmarkTypes.
 */
export const benchmarkTypes: string[] = [];

for (const type of Object.values(BenchmarkType)) {
	if (typeof type === "string") {
		benchmarkTypes.push(type);
	}
}

/**
 * Names of all TestTypes.
 */
export const testTypes: string[] = [];

for (const type of Object.values(TestType)) {
	if (typeof type === "string") {
		testTypes.push(type);
	}
}

/**
 * Arguments to `benchmark`
 * @public
 */
export type BenchmarkArguments = Titled &
	(BenchmarkSyncArguments | BenchmarkAsyncArguments | CustomBenchmarkArguments);

/**
 * @public
 */
export type CustomBenchmarkArguments = MochaExclusiveOptions &
	CustomBenchmark &
	BenchmarkDescription;

/**
 * @public
 */
export type BenchmarkRunningOptions =
	| BenchmarkSyncArguments
	| BenchmarkAsyncArguments
	| CustomBenchmarkArguments;

export type BenchmarkRunningOptionsSync = BenchmarkSyncArguments & BenchmarkTimingOptions & OnBatch;

export type BenchmarkRunningOptionsAsync = BenchmarkAsyncArguments &
	BenchmarkTimingOptions &
	OnBatch;

/**
 * Object with a "title".
 * @public
 */
export interface Titled {
	/**
	 * The title of the benchmark. This will show up in the output file, well as the mocha reporter.
	 */
	title: string;
}

/**
 * Arguments to benchmark a synchronous function
 * @public
 */
export interface BenchmarkSyncArguments extends BenchmarkSyncFunction, BenchmarkOptions {}

/**
 * Arguments to benchmark a synchronous function
 * @public
 */
export interface BenchmarkSyncFunction extends BenchmarkOptions {
	/**
	 * The (synchronous) function to benchmark.
	 */
	benchmarkFn: () => void;
}

/**
 * Configuration for benchmarking an asynchronous function.
 * @public
 */
export interface BenchmarkAsyncArguments extends BenchmarkAsyncFunction, BenchmarkOptions {}

/**
 * An asynchronous function to benchmark.
 * @public
 */
export interface BenchmarkAsyncFunction extends BenchmarkOptions {
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
export interface BenchmarkOptions
	extends MochaExclusiveOptions,
		HookArguments,
		BenchmarkTimingOptions,
		OnBatch,
		BenchmarkDescription {}

/**
 * Set of options to describe a benchmark.
 * @public
 */
export interface BenchmarkDescription {
	/**
	 * The kind of benchmark.
	 */
	type?: BenchmarkType;

	/**
	 * A free-form field to add a category to the test. This gets added to an internal version of the test name
	 * with an '\@' prepended to it, so it can be leveraged in combination with mocha's --grep/--fgrep options to
	 * only execute specific tests.
	 */
	category?: string;
}

/**
 * Interface representing the intent to support mocha `only`-type functionality. Mocha test utilities which take in
 * an options object extending this interface should use the corresponding `it.only` or `describe.only` variants
 * @public
 */
export interface MochaExclusiveOptions {
	/**
	 * When true, `mocha`-provided functions should use their `.only` counterparts (so as to aid individual test runs)
	 */
	only?: boolean;
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
 * @public
 */
export interface HookArguments {
	/**
	 * Executes once, before the test body it's declared for.
	 *
	 * @remarks This does *not* execute on each iteration or cycle.
	 */
	before?: HookFunction | undefined;
	/**
	 * Executes once, after the test body it's declared for.
	 *
	 * @remarks This does *not* execute on each iteration or cycle.
	 */
	after?: HookFunction | undefined;
}

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
	args: BenchmarkRunningOptions,
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

/**
 * Tags and formats the provided Title from the supplied {@link BenchmarkDescription} to create a
 * tagged and formatted Title for the Reporter.
 *
 * @param args - See {@link BenchmarkDescription} and {@link Titled}
 * @returns A formatted tagged title from the supplied `BenchmarkDescription`.
 *
 * @public
 */
export function qualifiedTitle(
	args: BenchmarkDescription & Titled & { testType?: TestType | undefined },
): string {
	const benchmarkTypeTag =
		BenchmarkType[args.type ?? BenchmarkType.Measurement] ??
		assert.fail("Invalid BenchmarkType");
	const tags = [performanceTestSuiteTag, `@${benchmarkTypeTag}`];
	if (args.testType !== undefined) {
		const testTypeTag =
			TestType[args.testType] ?? assert.fail(`Invalid TestType: ${args.testType}`);
		tags.push(`@${testTypeTag}`);
	}

	let qualifiedTitle = `${tags.join(" ")} ${args.title}`;

	if (args.category !== "" && args.category !== undefined) {
		qualifiedTitle = `${qualifiedTitle} ${userCategoriesSplitter} @${args.category}`;
	}
	return qualifiedTitle;
}

/**
 * Determines if we are in a mode where we actually want to run benchmarks and output data.
 *
 * When not in performanceTestingMode, performance tests should be run as correctness tests, and should be
 * adjusted to run quickly (ex: smaller iteration counts or data sizes).
 * @public
 */
export const isInPerformanceTestingMode = process.argv.includes("--perfMode");

/**
 * If specified, the current process should not have performance tests run directly within it.
 * Instead child process will be created to run each test.
 * This has some overhead, but can reduce noise and cross test effects
 * (ex: tests performing very differently based on which tests ran before them due to different jitting).
 * This does not (and can not) remove all causes for effects of earlier tests on later ones.
 * Ex: cpu temperature will still be an issue, and thus running with fixed CPU clock speeds is still recommend
 * for more precise data.
 */
export const isParentProcess: boolean = process.argv.includes("--parentProcess");

/**
 * --childProcess should only be used to indicate that a test run with parentProcess is running,
 * and the current process is a child process which it spawned to run a particular test.
 * This can be used to adjust how test results are reported such that the parent process can aggregate them correctly.
 */
export const isChildProcess = process.argv.includes("--childProcess");

/**
 * Performance test suites are tagged with this to allow filtering to only performance tests.
 */
export const performanceTestSuiteTag = "@Benchmark";

/**
 * When a consumer specifies a category for a test, we append this value to the test name followed by the
 * user-specified category. This is so we can then strip that information from the name safely, before
 * writing the test name in reporters.
 */
export const userCategoriesSplitter = ":ff-cat:";

/**
 * Reporter output location
 */
export interface ReporterOptions {
	reportDir?: string;
}
