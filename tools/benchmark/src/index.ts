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
 * This file represents the public API. Consumers of this package will not see exported modules unless
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
} from "./Configuration";
export { benchmark } from "./Runner";
export { benchmarkMemory, MemoryTestArguments } from "./MemoryTestRunner";
export { prettyNumber, geometricMean } from "./ReporterUtilities";
export { BenchmarkReporter, BenchmarkData } from "./Reporter";
