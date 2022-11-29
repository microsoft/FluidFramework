/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as v8 from "v8";
import { performance } from "perf_hooks";
import { assert } from "chai";
import { Test } from "mocha";
import Benchmark from "benchmark";
import {
    isParentProcess,
    isInPerformanceTestingMode,
    performanceTestSuiteTag,
    MochaExclusiveOptions,
    HookFunction,
    BenchmarkType,
    userCategoriesSplitter,
    TestType,
} from "./Configuration";
import { getArrayStatistics } from "./ReporterUtilities";

/**
 * Contains the samples of all memory-related measurements we track for a given benchmark (a test which was
 * potentially iterated several times). Each property is an array and all should be the same length, which
 * is the number of iterations done during the benchmark.
 */
export interface MemoryTestData {
    memoryUsage: NodeJS.MemoryUsage[];
    heap: v8.HeapInfo[];
    heapSpace: v8.HeapSpaceInfo[][];
}

/**
 * Contains the full results for a benchmark (a test which was potentially iterated several times).
 * 'samples' contains the raw 'before' and 'after' measurements instead of calculated deltas
 * for flexibility, at the cost of more memory and bigger output.
 */
export interface MemoryBenchmarkStats {
    runs: number;
    samples: { before: MemoryTestData; after: MemoryTestData; };
    stats: Benchmark.Stats;
    aborted: boolean;
    error?: Error;
}

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

export interface MemoryTestObjectProps extends MochaExclusiveOptions {
    /**
     * If true, this benchmark will create a Mocha test function with 'it.only()'
     * instead of just 'it()'.
     */
    only?: boolean;

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
     * The kind of benchmark.
     */
    type?: BenchmarkType;

    /**
     * The title of the benchmark.
     * This will show up in the output file, as well as the mocha reporter.
     */
    title: string;

    /**
     * Percentage of samples (0.1 - 1) to use for calculating the statistics.
     * Defaults to 0.95.
     * Use a lower number to drop the highest/lowest measurements.
     */
    samplePercentageToUse?: number;

    /**
     * A free-form field to add a category to the test.
     * This gets added to an internal version of the test name with an '\@' prepended to it, so it can be leveraged
     * in combination with mocha's --grep/--fgrep options to only execute specific tests.
     */
    category?: string;
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
 */

export function benchmarkMemory(testObject: IMemoryTestObject): Test {
    const options: Required<MemoryTestObjectProps> = {
        maxBenchmarkDurationSeconds: testObject.maxBenchmarkDurationSeconds ?? 30,
        minSampleCount: testObject.minSampleCount ?? 50,
        maxRelativeMarginOfError: testObject.maxRelativeMarginOfError ?? 2.5,
        only: testObject.only ?? false,
        title: testObject.title,
        type: testObject.type ?? BenchmarkType.Measurement,
        samplePercentageToUse: testObject.samplePercentageToUse ?? 0.95,
        category: testObject.category ?? "",
    };

    const benchmarkTypeTag = BenchmarkType[options.type];
    const testTypeTag = TestType[TestType.MemoryUsage];
    options.title = `${performanceTestSuiteTag} @${benchmarkTypeTag} @${testTypeTag} ${options.title}`;
    if (options.category !== "") {
        options.title = `${options.title} ${userCategoriesSplitter} @${options.category}`;
    }

    const itFunction = options.only ? it.only : it;
    const test = itFunction(options.title, async () => {
        if (isParentProcess) {
            // Instead of running the benchmark in this process, create a new process.
            // See {@link isParentProcess} for why.
            // Launch new process, with:
            // - mocha filter to run only this test.
            // - --parentProcess flag removed.
            // - --childProcess flag added (so data will be returned via stdout as json)

            // Pull the command (Node.js most likely) out of the first argument since spawnSync takes it separately.
            const command = process.argv0 ?? assert.fail("there must be a command");

            const childArgs = [...process.execArgv, ...process.argv.slice(1)];

            const processFlagIndex = childArgs.indexOf("--parentProcess");
            childArgs[processFlagIndex] = "--childProcess";

            // Replace any existing arguments for test filters so the child process only runs the current
            // test. Note that even if using a mocha config file, when mocha spawns a node process all flags
            // and settings from the file are passed explicitly to that command invocation and thus appear here.
            // This also means there's no issue if the config file uses the grep argument (which would be
            // mutually exclusive with the fgrep we add here), because it is removed.
            for (const flag of ["--grep", "--fgrep"]) {
                const flagIndex = childArgs.indexOf(flag);
                if (flagIndex > 0) {
                    // Remove the flag, and the argument after it (all these flags take one argument)
                    childArgs.splice(flagIndex, 2);
                }
            }
            childArgs.push("--fgrep", test.fullTitle());

            // Remove arguments for debugging if they're present; in order to debug child processes we need
            // to specify a new debugger port for each.
            let inspectArgIndex: number = -1;
            while ((inspectArgIndex = childArgs.findIndex((x) => x.match(/^(--inspect|--debug).*/))) >= 0) {
                childArgs.splice(inspectArgIndex, 1);
            }

            // Do this import only if isParentProcess to enable running in the web as long as isParentProcess is false.
            const childProcess = await import("child_process");
            const result = childProcess.spawnSync(command, childArgs,
                {
                    encoding: "utf8",
                    maxBuffer: 1024 * 1024, /* 1024 * 1024 is the default value, here for ease of adjustment */
                });

            if (result.error) {
                const failureMessage = result.error.message.includes("ENOBUFS")
                    ? "Child process tried to write too much data to stdout (too many iterations?). " +
                    "The maxBuffer option might need to be tweaked."
                    : `Child process reported an error: ${result.error.message}`;
                assert.fail(failureMessage);
            }

            if (result.stderr !== "") {
                assert.fail(`Child process logged errors: ${result.stderr}`);
            }

            // Find the json blob in the child's output.
            const output =
                result.stdout.split("\n").find((s) => s.startsWith("{")) ??
                assert.fail(`child process must output a json blob. Got:\n${result.stdout}`);

            test.emit("benchmark end", JSON.parse(output));
            return;
        }

        // If not in perfMode, just run the test normally
        if (!isInPerformanceTestingMode) {
            await testObject.before?.();
            await testObject.beforeIteration?.();
            await testObject.run?.();
            await testObject.afterIteration?.();
            await testObject.after?.();
            return Promise.resolve();
        }

        await testObject.before?.();
        const benchmarkStats: MemoryBenchmarkStats = {
            runs: 0,
            samples: {
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
            },
            stats: {
                moe: NaN,
                rme: NaN,
                sem: NaN,
                deviation: NaN,
                mean: NaN,
                sample: [],
                variance: NaN,
            },
            aborted: false,
        };

        try {
            const startTime = performance.now();
            let heapUsedStats: Benchmark.Stats = {
                moe: NaN,
                rme: NaN,
                sem: NaN,
                deviation: NaN,
                mean: NaN,
                sample: [],
                variance: NaN,
            };
            do {
                await testObject.beforeIteration?.();

                global.gc();
                benchmarkStats.samples.before.memoryUsage.push(process.memoryUsage());
                benchmarkStats.samples.before.heap.push(v8.getHeapStatistics());
                benchmarkStats.samples.before.heapSpace.push(v8.getHeapSpaceStatistics());

                global.gc();
                await testObject.run();

                await testObject.afterIteration?.();

                global.gc();
                benchmarkStats.samples.after.memoryUsage.push(process.memoryUsage());
                benchmarkStats.samples.after.heap.push(v8.getHeapStatistics());
                benchmarkStats.samples.after.heapSpace.push(v8.getHeapSpaceStatistics());

                benchmarkStats.runs++;

                const heapUsedArray: number[] = [];
                for (let i = 0; i < benchmarkStats.samples.before.memoryUsage.length; i++) {
                    heapUsedArray.push(benchmarkStats.samples.after.memoryUsage[i].heapUsed
                        - benchmarkStats.samples.before.memoryUsage[i].heapUsed);
                }
                heapUsedStats = getArrayStatistics(heapUsedArray, options.samplePercentageToUse);

                // Break if max elapsed time passed, only if we've reached the min sample count
                if (benchmarkStats.runs >= options.minSampleCount &&
                    (performance.now() - startTime) / 1000 > options.maxBenchmarkDurationSeconds) {
                    break;
                }
            } while (benchmarkStats.runs < options.minSampleCount
                || heapUsedStats.rme > options.maxRelativeMarginOfError);

            benchmarkStats.stats = heapUsedStats;
        } catch (error) {
            benchmarkStats.aborted = true;
            benchmarkStats.error = error as Error;
        }

        test.emit("benchmark end", benchmarkStats);
        await testObject.after?.();

        return Promise.resolve();
    });
    return test;
}
