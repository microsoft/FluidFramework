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
    HookArguments,
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
    stats: Benchmark.Stats | undefined;
    aborted: boolean;
    error?: Error;
}

export interface MemoryTestArguments extends MochaExclusiveOptions, HookArguments{
    /**
	 * The title of the benchmark. This will show up in the output file, well as the mocha reporter.
	 */
	title: string;

	/**
	 * The function to benchmark. Expects an async function for maximum compatibility. Wrap synchronous
     * code in a Promise/async-function if necessary.
	 */
	benchmarkFn: () => Promise<unknown>;

    /**
	 * The max time in seconds to run the benchmark. This is not a guaranteed immediate stop time.
     * Elapsed time gets checked between iterations of the test that is being benchmarked. Defaults
     * to 10 seconds.
	 */
	maxBenchmarkDurationSeconds?: number;

	/**
	 * The min sample count to reach. Defaults to 5.
	 *
     * @remarks This takes precedence over {@link MemoryTestArguments.maxBenchmarkDurationSeconds}.
	 */
	minSampleCount?: number;

    /**
     * The benchmark will iterate the test as many times as necessary to try to get the absolute value of
     * the relative margin of error below this number. Specify as an integer (e.g. 5 means RME below 5%).
     * Defaults to 2.5.
     *
     * @remarks {@link MemoryTestArguments.maxBenchmarkDurationSeconds} takes precedence over this, since a
     * benchmark with a very high measurement variance might never get a low enough RME.
     */
    maxRelativeMarginOfError?: number;

    /**
	 * The kind of benchmark.
	 */
	type?: BenchmarkType;

    /**
     * Percentage of samples (0.1 - 1) to use for calculating the statistics. Defaults to 1.
     */
    samplePercentageToUse?: number;

    /**
	 * A free-form field to add a category to the test. This gets added to an internal version of the test name
     * with an '\@' prepended to it, so it can be leveraged in combination with mocha's --grep/--fgrep options to
     * only execute specific tests.
	 */
	category?: string;
}

/**
 * This is wrapper for Mocha's `it` function, that runs a memory benchmark.
 *
 * Here is how this benchmarking works:
 *	For each benchmark
 *		// Run args.benchmarkFn  multiple times and measure results.
 *		Iterate until args.minSampleCount has been reached, and one of
 *      these two things is also true: RME is lower than maxRelativeMarginOfError,
 *      or we've iterated for longer than args.maxBenchmarkDurationSeconds.
 *			args.benchmarkFn()
 *
 * Optionally, setup and teardown functions for the whole benchmark can be provided via the
 * `before` and `after` options. Each of them will run only once, before/after all the
 * iterations/samples.
 *
 * Tests created with this function get tagged with '\@MemoryUsage', so mocha's --grep/--fgrep
 * options can be used to only run this type of tests by fitering on that value.
 *
 * @alpha The specifics of how this function works and what its output means are still subject
 * to change.
 */
 export function benchmarkMemory(args: MemoryTestArguments): Test {
    const options: Required<MemoryTestArguments> = {
        maxBenchmarkDurationSeconds: args.maxBenchmarkDurationSeconds ?? 10,
        minSampleCount: args.minSampleCount ?? 5,
        maxRelativeMarginOfError: args.maxRelativeMarginOfError ?? 2.5,
        only: args.only ?? false,
        before: args.before ?? (() => {}),
        after: args.after ?? (() => {}),
        title: args.title,
        benchmarkFn: args.benchmarkFn,
        type: args.type ?? BenchmarkType.Measurement,
        samplePercentageToUse: args.samplePercentageToUse ?? 1,
        category: args.category ?? "",
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
            await options.before();
            await options.benchmarkFn();
            await options.after();
            return Promise.resolve();
        }

        await options.before();
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
            stats: undefined,
            aborted: false,
        };

        try {
            const startTime = performance.now();
            let heapUsedStats: Benchmark.Stats | undefined;
            do {
                global.gc();
                benchmarkStats.samples.before.memoryUsage.push(process.memoryUsage());
                benchmarkStats.samples.before.heap.push(v8.getHeapStatistics());
                benchmarkStats.samples.before.heapSpace.push(v8.getHeapSpaceStatistics());

                global.gc();
                await options.benchmarkFn();

                benchmarkStats.samples.after.memoryUsage.push(process.memoryUsage());
                benchmarkStats.samples.after.heap.push(v8.getHeapStatistics());
                benchmarkStats.samples.after.heapSpace.push(v8.getHeapSpaceStatistics());

                benchmarkStats.runs++;

                // Break if max elapsed time passed, only if we've reached the min sample count
                if (benchmarkStats.runs >= options.minSampleCount &&
                    (performance.now() - startTime) / 1000 > options.maxBenchmarkDurationSeconds) {
                    break;
                }

                const heapUsedArray: number[] = [];
                for (let i = 0; i < benchmarkStats.samples.before.memoryUsage.length; i++) {
                    heapUsedArray.push(benchmarkStats.samples.after.memoryUsage[i].heapUsed
                                        - benchmarkStats.samples.before.memoryUsage[i].heapUsed);
                }
                heapUsedStats = getArrayStatistics(heapUsedArray, options.samplePercentageToUse);
            } while (benchmarkStats.runs < options.minSampleCount
                || heapUsedStats.rme > options.maxRelativeMarginOfError);

            benchmarkStats.stats = heapUsedStats;
        } catch (error) {
            benchmarkStats.aborted = true;
            benchmarkStats.error = error as Error;
        }

        test.emit("benchmark end", benchmarkStats);
        await options.after();

        return Promise.resolve();
    });
    return test;
}
