/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	BenchmarkType,
	TestType,
	benchmarkIt,
	collectDurationData,
} from "@fluid-tools/benchmark";
import type { ISummaryTree } from "@fluidframework/driver-definitions";

import { TestString, loadSnapshot } from "./snapshot.utils.js";

describe("MergeTree snapshots", () => {
	for (const summarySize of [10, 50, 100, 500, 1000, 5000, 10_000]) {
		const test = benchmarkIt({
			type: BenchmarkType.Measurement,
			testType: TestType.ExecutionTime,
			title: `load snapshot with ${summarySize} segments`,
			category: "snapshot loading",
			run: async () => {
				const str = new TestString("id", {});
				for (let i = 0; i < summarySize; i++) {
					str.append("a", false);
				}
				str.applyPendingOps();
				const summary: ISummaryTree = str.getSummary();
				const result = await collectDurationData({
					benchmarkFnAsync: async () => {
						await loadSnapshot(summary);
					},
				});
				return result;
			},
		});

		if (summarySize > 5000) {
			const currentTimeout = test.timeout();
			// Default value of 2 seconds causes failure around P95 for large snapshot sizes.
			test.timeout(currentTimeout === 0 ? 0 : Math.max(5000, currentTimeout));
		}
	}
});
