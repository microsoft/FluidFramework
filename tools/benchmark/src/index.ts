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
	isInPerformanceTestingMode,
	qualifiedTitle,
	type Titled,
	type BenchmarkDescription,
	TestType,
	type BenchmarkFunction,
	type BenchmarkOptions,
} from "./Configuration.js";
export {
	type DurationBenchmarkSync,
	type DurationBenchmarkAsync,
	type DurationBenchmark,
	type BenchmarkTimingOptions,
	type OnBatch,
	type HookFunction,
	type HookArguments,
	type BenchmarkTimer,
	type DurationBenchmarkCustom,
	Phase,
	collectDurationData,
	runBenchmarkSync,
	benchmarkDuration,
} from "./durationBenchmarking/index.js";
export { benchmarkIt } from "./mocha/index.js";
export { BenchmarkReporter, ReportEntry, type ReportSuite, type ReportArray } from "./Reporter.js";
export {
	type BenchmarkData,
	type BenchmarkError,
	type BenchmarkResult,
	CollectedData,
	PrimaryMeasurement,
	Measurement,
	ValueType,
} from "./ResultTypes.js";
export { timer, type Timer } from "./timer.js";
export { captureResults } from "./ResultUtilities.js";

export {
	MemoryUseBenchmark,
	MemoryUseCallbacks,
	benchmarkMemoryUse,
	collectMemoryUseData,
} from "./memoryBenchmarking/index.js";

export { benchmark, benchmarkCustom } from "./legacy.js";
