/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "chai";
import { Test } from "mocha";

import {
	BenchmarkArguments,
	isParentProcess,
	isInPerformanceTestingMode,
	Titled,
	MochaExclusiveOptions,
	qualifiedTitle,
	TestType,
} from "../Configuration";
import type { BenchmarkResult } from "../ResultTypes";
import { Phase, runBenchmark } from "../runBenchmark";

/**
 * This is wrapper for Mocha's it function that runs a performance benchmark.
 *
 * When not {@link isInPerformanceTestingMode}, runs one iteration as a normal Mocha test.
 * When run in performance testing mode, the test runs the function many times in batches.
 * First larger and larger batches are run to determine a good batch size to measure,
 * then many iterations of that batch size are timed.
 *
 * Optionally, setup and teardown functions can be provided via the `before` and `after` options.
 *
 * Tests created with this function get tagged with '\@ExecutionTime', so mocha's --grep/--fgrep
 * options can be used to only run this type of tests by filtering on that value.
 *
 * @public
 */
export function benchmark(args: BenchmarkArguments): Test {
	return supportParentProcess({
		title: qualifiedTitle({ ...args, testType: TestType.ExecutionTime }),
		only: args.only,
		run: async () => {
			const innerArgs = {
				...args,
			};
			// If not in perfMode, just use a single iteration.
			if (!isInPerformanceTestingMode) {
				innerArgs.startPhase = Phase.CollectData;
				innerArgs.minBatchDurationSeconds = 0;
				innerArgs.minBatchCount = 1;
				innerArgs.maxBenchmarkDurationSeconds = 0;
			}
			const stats = await runBenchmark(innerArgs);
			return stats;
		},
	});
}

/**
 * This is a wrapper for Mocha's it function that can run the body in a child process,
 * and write status from the run to the reporter.
 *
 * @public
 */
export function supportParentProcess<
	TArgs extends MochaExclusiveOptions & Titled & { run: () => Promise<BenchmarkResult> },
>(args: TArgs): Test {
	const itFunction = args.only === true ? it.only : it;
	const test = itFunction(args.title, async () => {
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
			while (
				(inspectArgIndex = childArgs.findIndex((x) => x.match(/^(--inspect|--debug).*/))) >=
				0
			) {
				childArgs.splice(inspectArgIndex, 1);
			}

			// Do this import only if isParentProcess to enable running in the web as long as isParentProcess is false.
			const childProcess = await import("node:child_process");
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

		const stats = await args.run();
		// Create and run a benchmark if we are in perfMode, else run the passed in function normally
		if (isInPerformanceTestingMode) {
			test.emit("benchmark end", stats);
		}
	});
	return test;
}
