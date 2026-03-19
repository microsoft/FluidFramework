/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	type BenchmarkArguments,
	type BenchmarkSyncArguments,
	type BenchmarkAsyncArguments,
	type BenchmarkOptions,
	validateBenchmarkArguments,
	type BenchmarkTimingOptions,
	type BenchmarkRunningOptions,
	type BenchmarkSyncFunction,
	type BenchmarkAsyncFunction,
	type OnBatch,
	type CustomBenchmark,
	type BenchmarkTimer,
	type CustomBenchmarkArguments,
} from "./configuration.js";
export { Phase, runBenchmark } from "./getDuration.js";
