/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { benchmarkDuration } from "../../durationBenchmarking/getDuration.js";
import { benchmarkIt } from "../../mocha/index.js";
import { ValueType, type CollectedData } from "../../ResultTypes.js";

describe("benchmarkIt", () => {
	benchmarkIt({
		title: "benchmarkIt test",
		run: (): CollectedData => [
			{
				name: "the data",
				value: 1,
				units: "numbers",
				type: ValueType.SmallerIsBetter,
			},
		],
	});

	benchmarkIt({
		title: "benchmarkDuration test",
		...benchmarkDuration({
			minBatchDurationSeconds: 0,
			minBatchCount: 1,
			maxBenchmarkDurationSeconds: 0,
			benchmarkFn: () => {
				// no-op
			},
		}),
	});
});
