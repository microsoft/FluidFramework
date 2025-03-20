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
	BenchmarkArguments,
	BenchmarkSyncArguments,
	BenchmarkAsyncArguments,
	BenchmarkOptions,
	MochaExclusiveOptions,
	HookFunction,
	HookArguments,
	isInPerformanceTestingMode,
	validateBenchmarkArguments,
	qualifiedTitle,
	Titled,
	BenchmarkTimingOptions,
	BenchmarkRunningOptions,
	BenchmarkSyncFunction,
	BenchmarkAsyncFunction,
	OnBatch,
	BenchmarkDescription,
	CustomBenchmark,
	BenchmarkTimer,
	CustomBenchmarkArguments,
	TestType,
} from "./Configuration";
export {
	benchmark,
	benchmarkMemory,
	benchmarkCustom,
	IMemoryTestObject,
	MemoryTestObjectProps,
	CustomBenchmarkOptions,
	IMeasurementReporter,
} from "./mocha";
export { prettyNumber, geometricMean } from "./RunnerUtilities";
export { BenchmarkReporter } from "./Reporter";
export { Phase, runBenchmark } from "./runBenchmark";
export {
	BenchmarkData,
	BenchmarkError,
	BenchmarkResult,
	Stats,
	CustomData,
	isResultError,
} from "./ResultTypes";
export { Timer } from "./timer";
