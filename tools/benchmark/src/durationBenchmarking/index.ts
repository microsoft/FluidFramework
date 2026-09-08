/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export type {
	DurationBenchmarkSync,
	DurationBenchmarkAsync,
	BenchmarkTimingOptions,
	DurationBenchmark,
	BatchedDurationTimer,
	DurationBenchmarkCustom,
} from "./configuration.js";
export { Phase, benchmarkDuration, collectDurationData, runBenchmarkSync } from "./getDuration.js";
export {
	type BatchlessDurationTimer,
	type DurationBenchmarkBatchless,
	benchmarkDurationBatchless,
} from "./getDurationBatchless.js";
