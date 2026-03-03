/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	type BenchmarkSyncArguments,
	type BenchmarkAsyncArguments,
	validateBenchmarkArguments,
	type BenchmarkTimingOptions,
	type DurationBenchmark,
	type BenchmarkSyncFunction,
	type BenchmarkAsyncFunction,
	type OnBatch,
	type CustomBenchmark,
	type BenchmarkTimer,
	type CustomBenchmarkArguments,
	type DurationBenchmarkOptions,
} from "./configuration.js";
export { Phase, benchmarkDuration, collectDurationData } from "./getDuration.js";
