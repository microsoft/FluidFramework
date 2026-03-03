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
	type BenchmarkFunction,
	type BenchmarkOptions,
} from "./Configuration";
export {
	type DurationBenchmarkSync,
	type DurationBenchmarkAsync,
	type DurationBenchmark,
	type BenchmarkTimingOptions,
	type OnBatch,
	type BenchmarkTimer,
	type DurationBenchmarkCustom,
	Phase,
	collectDurationData,
	benchmarkDuration,
} from "./durationBenchmarking/index";
export { benchmarkIt } from "./mocha";
export { BenchmarkReporter } from "./Reporter";
export {
	type BenchmarkData,
	type BenchmarkError,
	type BenchmarkResult,
	isResultError,
	CollectedData,
	Measurement,
	ValueType,
} from "./ResultTypes";
export type { Stats } from "./sampling";
export type { Timer } from "./timer";

export {
	MemoryUseBenchmark,
	MemoryUseCallbacks,
	benchmarkMemoryUse,
	collectMemoryUseData,
} from "./memoryBenchmarking/index.js";

export { benchmark, benchmarkCustom } from "./legacy.js";
