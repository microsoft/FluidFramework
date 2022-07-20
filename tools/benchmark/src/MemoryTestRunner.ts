import * as v8 from "v8";
import { performance } from "perf_hooks";
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

export interface BeforeAfter<T> {
    before: T;
    after: T;
}

export interface MemoryTestStats {
    runs: number;
    memoryUsageStats: BeforeAfter<NodeJS.MemoryUsage>[];
    heapStats: BeforeAfter<v8.HeapInfo>[];
    heapSpaceStats: BeforeAfter<v8.HeapSpaceInfo[]>[];
    aborted: boolean;
    error?: Error;
}

export function benchmarkMemory(args: BenchmarkArguments): Test {
    const options: Required<BenchmarkOptions> = {
        maxBenchmarkDurationSeconds: args.maxBenchmarkDurationSeconds ?? 5,
        minSampleCount: args.minSampleCount ?? 5,
        minSampleDurationSeconds: args.minSampleDurationSeconds ?? 0,
        type: args.type ?? BenchmarkType.Measurement,
        only: args.only ?? false,
        before: args.before ?? (() => {}),
        after: args.after ?? (() => {}),
    };
    const { benchmarkFn: argsBenchmarkFn } = validateBenchmarkArguments(args);
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

        // If not in perfMode, just run the test normally
        if (!isInPerformanceTestingMode) {
            await options.before();
            await argsBenchmarkFn();
            await options.after();
            return Promise.resolve();
        }

        await options.before();
        const memoryTestStats: MemoryTestStats = {
            runs: 0,
            memoryUsageStats: [],
            heapStats: [],
            heapSpaceStats: [],
            aborted: false,
        };

        try {
            const startTime = performance.now();
            do {
                global.gc();
                const memoryUsageStats: BeforeAfter<NodeJS.MemoryUsage> = {
                    before: process.memoryUsage(),
                    after: undefined as unknown as NodeJS.MemoryUsage,
                };
                const heapStats: BeforeAfter<v8.HeapInfo> = {
                    before: v8.getHeapStatistics(),
                    after: undefined as unknown as v8.HeapInfo,
                };
                const heapSpaceStats: BeforeAfter<v8.HeapSpaceInfo[]> = {
                    before: v8.getHeapSpaceStatistics(),
                    after: undefined as unknown as v8.HeapSpaceInfo[],
                };
                global.gc();

                await argsBenchmarkFn();

                memoryUsageStats.after = process.memoryUsage();
                heapStats.after = v8.getHeapStatistics();
                heapSpaceStats.after = v8.getHeapSpaceStatistics();

                memoryTestStats.runs++;
                memoryTestStats.memoryUsageStats.push(memoryUsageStats);
                memoryTestStats.heapStats.push(heapStats);
                memoryTestStats.heapSpaceStats.push(heapSpaceStats);
                if ((performance.now() - startTime) / 1000 > (args.maxBenchmarkDurationSeconds ?? 60)) {
                    break;
                }
            } while (memoryTestStats.runs < (args.minSampleCount ?? 5));
        } catch (error) {
            memoryTestStats.aborted = true;
            memoryTestStats.error = error as Error;
        }

        test.emit("benchmark end", memoryTestStats);
        await options.after();

        return Promise.resolve();
    });
    return test;
}
