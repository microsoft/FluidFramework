/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export type {
	DurationBenchmarkSync,
	DurationBenchmarkAsync,
	BenchmarkTimingOptions,
	DurationBenchmark,
	OnBatch,
	BenchmarkTimer,
	DurationBenchmarkCustom,
	HookFunction,
	HookArguments,
} from "./configuration.js";
export { Phase, benchmarkDuration, collectDurationData } from "./getDuration.js";
