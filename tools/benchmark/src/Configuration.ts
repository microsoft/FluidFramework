/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "chai";

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
export type BenchmarkArguments = BenchmarkSyncArguments | BenchmarkAsyncArguments;

/**
 * Arguments to benchmark a synchronous function
 * @public
 */
export interface BenchmarkSyncArguments extends BenchmarkOptions {
	/**
	 * The title of the benchmark. This will show up in the output file, well as the mocha reporter.
	 */
	title: string;

	/**
	 * The (synchronous) function to benchmark.
	 */
	benchmarkFn: () => void;
}

/**
 * Arguments to benchmark a callback-based asynchronous function
 * @public
 */
export interface BenchmarkAsyncArguments extends BenchmarkOptions {
	/**
	 * The title of the benchmark. This will show up in the output file, well as the mocha reporter.
	 */
	title: string;

    /* eslint-disable max-len */

	/**
	 * The asynchronous function to benchmark. The time measured includes all time spent until the returned promise is
     * resolved. This includes the event loop or processing other events. For example, a test which calls `setTimeout`
     * in the body will always take at least 4ms per operation due to timeout throttling:
	 * https://developer.mozilla.org/en-US/docs/Web/API/WindowOrWorkerGlobalScope/setTimeout#Minimum_delay_and_timeout_nesting
	 */
	benchmarkFnAsync: () => Promise<unknown>;

    /* eslint-enable max-len */
}

/**
 * Set of options that can be provided to a benchmark. These options generally align with the BenchmarkJS options type;
 * you can see more documentation {@link https://benchmarkjs.com/docs#options | here}.
 * @public
 */
export interface BenchmarkOptions extends MochaExclusiveOptions, HookArguments {
	/**
	 * The max time in seconds to run the benchmark.
	 */
	maxBenchmarkDurationSeconds?: number;

	/**
	 * The min sample count to reach.
	 * @remarks This takes precedence over {@link BenchmarkOptions.maxBenchmarkDurationSeconds}.
	 */
	minSampleCount?: number;

	/**
	 * The minimum time in seconds to run an individual sample.
	 */
	minSampleDurationSeconds?: number;

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
 * Arguments that can be passed to `benchmark` for optional test setup/teardown. Hooks execute once per test body
 * (*not* on each cycle or sample). Hooks--along with the benchmarked function--are run without additional error
 * validation. This means any exception thrown from either a hook or the benchmarked function will cause test
 * failure, and subsequent operations won't be run.
 * @public
 */
export interface HookArguments {
	before?: HookFunction;
	after?: HookFunction;
}

/**
 * Validates arguments to `benchmark`.
 * @public
 */
export function validateBenchmarkArguments(
	args: BenchmarkArguments,
): { isAsync: true; benchmarkFn: () => Promise<unknown>; } | { isAsync: false; benchmarkFn: () => void; } {
	const intersection = args as BenchmarkSyncArguments & BenchmarkAsyncArguments;
	const isSync = intersection.benchmarkFn !== undefined;
	const isAsync = intersection.benchmarkFnAsync !== undefined;
	assert(isSync !== isAsync, "Exactly one of `benchmarkFn` and `benchmarkFnAsync` should be defined.");
	if (isSync) {
		return { isAsync: false, benchmarkFn: intersection.benchmarkFn };
	}

	return { isAsync: true, benchmarkFn: intersection.benchmarkFnAsync };
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
export const isParentProcess = process.argv.includes("--parentProcess");

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
