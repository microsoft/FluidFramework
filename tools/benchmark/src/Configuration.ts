/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail } from "./assert.js";
import type { CollectedData } from "./ResultTypes.js";
import type { Timer } from "./timer.js";

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
export const benchmarkTypes: readonly string[] = Object.values(BenchmarkType).filter(
	(v): v is string => typeof v === "string",
);

/**
 * Names of all TestTypes.
 */
export const testTypes: readonly string[] = Object.values(TestType).filter(
	(v): v is string => typeof v === "string",
);

/**
 * Object with a "title".
 * @public
 * @input
 */
export interface Titled {
	/**
	 * The title of the benchmark. This will show up in the output file, as well as the mocha reporter.
	 */
	readonly title: string;
}

/**
 * Set of options to describe a benchmark.
 * @public
 * @input
 */
export interface BenchmarkDescription {
	/**
	 * The kind of benchmark.
	 */
	readonly type?: BenchmarkType;

	/**
	 * A free-form field to add a category to the test. This gets added to an internal version of the test name
	 * with an '\@' prepended to it, so it can be leveraged in combination with mocha's --grep/--fgrep options to
	 * only execute specific tests.
	 */
	readonly category?: string;
}

/**
 * Options to configure a benchmark that reports custom measurements.
 *
 * @public
 * @input
 */
export interface BenchmarkFunction {
	/**
	 * Runs the benchmark.
	 */
	readonly run: <TimeStamp>(timer: Timer<TimeStamp>) => CollectedData | Promise<CollectedData>;
}

/**
 * Interface representing the intent to support mocha `only`-type functionality. Mocha test utilities which take in
 * an options object extending this interface should use the corresponding `it.only` or `describe.only` variants
 * @public
 * @input
 */
export interface MochaExclusiveOptions {
	/**
	 * When true, `mocha`-provided functions should use their `.only` counterparts (so as to aid individual test runs)
	 */
	readonly only?: boolean;
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
		BenchmarkType[args.type ?? BenchmarkType.Measurement] ?? fail("Invalid BenchmarkType");
	const tags = [performanceTestSuiteTag, `@${benchmarkTypeTag}`];
	if (args.testType !== undefined) {
		const testTypeTag = TestType[args.testType] ?? fail(`Invalid TestType: ${args.testType}`);
		tags.push(`@${testTypeTag}`);
	}

	let title = `${tags.join(" ")} ${args.title}`;

	if (args.category !== "" && args.category !== undefined) {
		title = `${title} ${userCategoriesSplitter} @${args.category}`;
	}
	return title;
}

/**
 * Determines if we are in a mode where we actually want to run benchmarks and output data.
 * @remarks
 * When not in performanceTestingMode, performance tests should be run as correctness tests, and should be
 * adjusted to run quickly (ex: smaller iteration counts or data sizes).
 *
 * Use the `--perfMode` flag to enable.
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
	readonly reportFile?: string;
}

/**
 * Options to configure a benchmark test.
 * @remarks
 * See {@link benchmarkIt}.
 * @public
 * @input
 */
export interface BenchmarkOptions
	extends Titled,
		BenchmarkDescription,
		MochaExclusiveOptions,
		BenchmarkFunction {}
