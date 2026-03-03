/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	type DurationBenchmarkSync,
	type DurationBenchmarkAsync,
	type BenchmarkTimingOptions,
	type DurationBenchmark,
	type OnBatch,
	type BenchmarkTimer,
	type DurationBenchmarkCustom,
} from "./configuration.js";
export { Phase, benchmarkDuration, collectDurationData } from "./getDuration.js";
