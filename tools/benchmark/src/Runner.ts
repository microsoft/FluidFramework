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
} from "./Configuration";
import { BenchmarkData } from "./Reporter";

/**
 * This is wrapper for Mocha's it function that runs a performance benchmark.
 *
 * Here is how benchmarking works:
 *	For each benchmark
 *		For each sampled run
 *			// Run fn once to check for errors
 *			fn()
 *			// Run fn multiple times and measure results.
 *			for each Benchmark.count
 *				fn()
 *
 * For the first few sampled runs, the benchmarking library is in an analysis phase. It uses these sample runs to
 * determine an iteration number that his at most 1% statistical uncertainty. It does this by incrementally increasing
 * the iterations until it hits a low uncertainty point.
 *
 * Optionally, setup and teardown functions can be provided via the `before` and `after` options.
 * @public
 */
export function benchmark(args: BenchmarkArguments): Test {
    const defaults: Required<BenchmarkOptions> = {
        maxBenchmarkDurationSeconds: 5,
        minSampleCount: 5,
        minSampleDurationSeconds: 0,
        type: BenchmarkType.Measurement,
        only: false,
        before: () => {},
        after: () => {},
    };
    const options: Required<BenchmarkOptions> = Object.assign(defaults, args);
    const { isAsync, benchmarkFn: argsBenchmarkFn } = validateBenchmarkArguments(args);
    const beforeBenchmark = options.before ?? options.before;
    const afterBenchmark = options.after ?? options.after;
    const typeTag = BenchmarkType[options.type];
    const qualifiedTitle = `${performanceTestSuiteTag} @${typeTag} ${args.title}`;

    const itFunction = options.only ? it.only : it;
    const test = itFunction(qualifiedTitle, async () => {
        if (isParentProcess) {
            // Instead of running the benchmark in this process, create a new process.
            // See {@link isParentProcess} for why.
            // Launch new process, with:
            // - mocha filter to run only this test.
            // - --parentProcess flag removed.
            // - --childProcess flag added (so data will be returned via stdout as json)

            const childArgs = [...process.argv];
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

            // Pull the command (Node.js most likely) out of the first argument since spawnSync takes it separately.
            const command = childArgs.shift() ?? assert.fail("there must be a command");

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
            await beforeBenchmark?.();

            const benchmarkOptions: Benchmark.Options = {
                maxTime: options.maxBenchmarkDurationSeconds,
                minSamples: options.minSampleCount,
                minTime: options.minSampleDurationSeconds,
                defer: isAsync,
            };

            let benchmarkFunction: (deferred: { resolve: Mocha.Done }) => void | Promise<unknown>;
            if (isAsync) {
                // We have to do a little translation because the Benchmark library expects callback-based
                // asynchronicity.
                benchmarkFunction = async (deferred: { resolve: Mocha.Done }) => {
                    await argsBenchmarkFn();
                    deferred.resolve();
                };
            } else {
                benchmarkFunction = argsBenchmarkFn;
            }

            await new Promise<void>((resolve) => {
                const benchmarkInstance = new Benchmark(args.title, benchmarkFunction, benchmarkOptions);
                // Run a garbage collection, if possible, before the test.
                // This helps noise from allocations before the test (ex: from previous tests or startup) from
                // impacting the test.
                // TODO: determine why --expose-gc is not working when `isChildProcess`.
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

                    await afterBenchmark?.();
                    resolve();
                });
                benchmarkInstance.run();
            });
            return;
        }

        await beforeBenchmark?.();
        await argsBenchmarkFn();
        await afterBenchmark?.();
        await Promise.resolve();
    });
    return test;
}
