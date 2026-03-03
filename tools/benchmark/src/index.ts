/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Benchmarking tools.
 *
 * @packageDocumentation
 */

/**
 * This file represents the public API. Consumers of this library will not see exported modules unless
 * they are enumerated here.  Removing / editing existing exports here will often indicate a breaking
 * change, so please be cognizant of changes made here.
 */

export {
	BenchmarkType,
	type MochaExclusiveOptions,
	type HookFunction,
	type HookArguments,
	isInPerformanceTestingMode,
	qualifiedTitle,
	type Titled,
	type BenchmarkDescription,
	TestType,
} from "./Configuration";
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
	Phase,
	runBenchmark,
} from "./durationBenchmarking/index";
export {
	benchmark,
	benchmarkMemory,
	benchmarkCustom,
	type IMemoryTestObject,
	type MemoryTestObjectProps,
	type CustomBenchmarkOptions,
	type IMeasurementReporter,
} from "./mocha";
export { prettyNumber, geometricMean } from "./RunnerUtilities";
export { BenchmarkReporter } from "./Reporter";
export {
	type BenchmarkData,
	type BenchmarkError,
	type BenchmarkResult,
	type CustomData,
	isResultError,
} from "./ResultTypes";
export type { Stats } from "./sampling";
export type { Timer } from "./timer";
