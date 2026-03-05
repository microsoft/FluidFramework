/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Test } from "mocha";

import { benchmarkDuration } from "./durationBenchmarking/index.js";
import type { DurationBenchmark } from "./durationBenchmarking/index.js";

import { benchmarkIt } from "./mocha/index.js";
import type { BenchmarkDescription, MochaExclusiveOptions, Titled } from "./Configuration.js";

/**
 * Legacy API for running a performance benchmark.
 *
 * @deprecated Use {@link benchmarkIt} and {@link benchmarkDuration}.
 * @public
 */
export function benchmark(
	args: Titled & DurationBenchmark & BenchmarkDescription & MochaExclusiveOptions,
): Test {
	return benchmarkIt({ ...args, ...benchmarkDuration(args) });
}

/**
 * Legacy API for running a performance benchmark.
 *
 * @deprecated Use {@link benchmarkIt}.
 * @public
 */
export const benchmarkCustom = benchmarkIt;
