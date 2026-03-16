/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Test } from "mocha";

import { isInPerformanceTestingMode, qualifiedTitle, TestType } from "../Configuration";

import { Phase, runBenchmark } from "../durationBenchmarking/index.js";
import type { BenchmarkArguments } from "../durationBenchmarking/index.js";

import { supportParentProcess } from "./runner";

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
