/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import Benchmark from "benchmark";
import { assert } from "chai";
import { Test } from "mocha";
import {
    BenchmarkType,
    BenchmarkArguments,
    BenchmarkOptions,
    validateBenchmarkArguments,
    isParentProcess,
    isInPerformanceTestingMode,
    performanceTestSuiteTag,
    userCategoriesSplitter,
    TestType,
} from "./Configuration";
import { BenchmarkData } from "./Reporter";

/**
 * This is wrapper for Mocha's it function that runs a performance benchmark.
 *
 * Here is how benchmarking works:
 *
 * ```
 *  For each benchmark
 *      For each sampled run
 *          // Run fn once to check for errors
 *          fn()
 *          // Run fn multiple times and measure results.
 *          for each Benchmark.count
 *              fn()
 * ```
 *
 * For the first few sampled runs, the benchmarking library is in an analysis phase. It uses these sample runs to
 * determine an iteration number that his at most 1% statistical uncertainty. It does this by incrementally increasing
 * the iterations until it hits a low uncertainty point.
 *
 * Optionally, setup and teardown functions can be provided via the `before` and `after` options.
 *
 * Tests created with this function get tagged with '\@ExecutionTime', so mocha's --grep/--fgrep
 * options can be used to only run this type of tests by fitering on that value.
 *
 * @public
 */
export function benchmark(args: BenchmarkArguments): Test {
    const options: Required<BenchmarkOptions> = {
        maxBenchmarkDurationSeconds: args.maxBenchmarkDurationSeconds ?? 5,
        minSampleCount: args.minSampleCount ?? 5,
        minSampleDurationSeconds: args.minSampleDurationSeconds ?? 0,
        type: args.type ?? BenchmarkType.Measurement,
        only: args.only ?? false,
        before: args.before ?? (() => {}),
        after: args.after ?? (() => {}),
        category: args.category ?? "",
    };
    const { isAsync, benchmarkFn: argsBenchmarkFn } = validateBenchmarkArguments(args);
    const benchmarkTypeTag = BenchmarkType[options.type];
    const testTypeTag = TestType[TestType.ExecutionTime];
    let qualifiedTitle = `${performanceTestSuiteTag} @${benchmarkTypeTag} @${testTypeTag} ${args.title}`;

    if (options.category !== "") {
        qualifiedTitle = `${qualifiedTitle} ${userCategoriesSplitter} @${options.category}`;
    }

    const itFunction = options.only ? it.only : it;
    const test = itFunction(qualifiedTitle, async () => {
        if (isParentProcess) {
            // Instead of running the benchmark in this process, create a new process.
            // See {@link isParentProcess} for why.
            // Launch new process, with:
            // - mocha filter to run only this test.
            // - --parentProcess flag removed.
            // - --childProcess flag added (so data will be returned via stdout as json)

            // Pull the command (Node.js most likely) out of the first argument since spawnSync takes it separately.
            const command = process.argv0 ?? assert.fail("there must be a command");

            // We expect all node-specific flags to be present in execArgv so they can be passed to the child process.
            // At some point mocha was processing the expose-gc flag itself and not passing it here, unless explicitly
            // put in mocha's --node-option flag.
            const childArgs = [...process.execArgv, ...process.argv.slice(1)];
            const processFlagIndex = childArgs.indexOf("--parentProcess");
            childArgs[processFlagIndex] = "--childProcess";

            // Remove arguments for any existing test filters.
            for (const flag of ["--grep", "--fgrep"]) {
                const flagIndex = childArgs.indexOf(flag);
                if (flagIndex > 0) {
                    // Remove the flag, and the argument after it (all these flags take one argument)
                    childArgs.splice(flagIndex, 2);
                }
            }

            // Add test filter so child process only run the current test.
            childArgs.push("--fgrep", test.fullTitle());

            // Remove arguments for debugging if they're present; in order to debug child processes we need
            // to specify a new debugger port for each, or they'll fail to start. Doable, but leaving it out
            // of scope for now.
            let inspectArgIndex: number = -1;
            while ((inspectArgIndex = childArgs.findIndex((x) => x.match(/^(--inspect|--debug).*/))) >= 0) {
                childArgs.splice(inspectArgIndex, 1);
            }

            // Do this import only if isParentProcess to enable running in the web as long as isParentProcess is false.
            const childProcess = await import("child_process");
            const result = childProcess.spawnSync(command, childArgs, { encoding: "utf8" });

            if (result.error) {
                assert.fail(`Child process reported an error: ${result.error.message}`);
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

        // Create and run a benchmark if we are in perfMode, else run the passed in function normally
        if (isInPerformanceTestingMode) {
            await options.before();

            const benchmarkOptions: Benchmark.Options = {
                maxTime: options.maxBenchmarkDurationSeconds,
                minSamples: options.minSampleCount,
                minTime: options.minSampleDurationSeconds,
                defer: isAsync,
            };

            const benchmarkFunction: (deferred: { resolve: Mocha.Done; }) => void | Promise<unknown> = isAsync
                ? async (deferred: { resolve: Mocha.Done; }) => {
                    // We have to do a little translation because the Benchmark library expects callback-based
                    // asynchronicity.
                    await argsBenchmarkFn();
                    deferred.resolve();
                }
                : argsBenchmarkFn;

            await new Promise<void>((resolve) => {
                const benchmarkInstance = new Benchmark(args.title, benchmarkFunction, benchmarkOptions);
                // Run a garbage collection, if possible, before the test.
                // This helps noise from allocations before the test (ex: from previous tests or startup) from
                // impacting the test.
                benchmarkInstance.on("start end", () => global?.gc?.());
                benchmarkInstance.on("complete", async () => {
                    const stats: BenchmarkData = {
                        aborted: benchmarkInstance.aborted,
                        count: benchmarkInstance.count,
                        cycles: benchmarkInstance.cycles,
                        error: benchmarkInstance.error,
                        hz: benchmarkInstance.hz,
                        stats: benchmarkInstance.stats,
                        times: benchmarkInstance.times,
                    };

                    test.emit("benchmark end", stats);

                    await options.after();
                    resolve();
                });
                benchmarkInstance.run();
            });
            return;
        }

        await options.before();
        await argsBenchmarkFn();
        await options.after();
        await Promise.resolve();
    });
    return test;
}
