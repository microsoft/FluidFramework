/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export type {
	DurationBenchmarkSync,
	DurationBenchmarkAsync,
	BenchmarkTimingOptions,
	DurationBenchmark,
	BenchmarkTimer,
	DurationBenchmarkCustom,
} from "./configuration.js";
export { Phase, benchmarkDuration, collectDurationData, runBenchmarkSync } from "./getDuration.js";
