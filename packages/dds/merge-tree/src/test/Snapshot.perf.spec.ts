/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { benchmarkDuration, benchmarkIt } from "@fluid-tools/benchmark";
import type { ISummaryTree } from "@fluidframework/driver-definitions";

import { TestString, loadSnapshot } from "./snapshot.utils.js";

describe("MergeTree snapshots", () => {
	for (const summarySize of [10, 50, 100, 500, 1000, 5000, 10_000]) {
		const test = benchmarkIt({
			title: `load snapshot with ${summarySize} segments`,
			category: "snapshot loading",
			...benchmarkDuration({
				benchmarkFnCustom: async (state) => {
					const str = new TestString("id", {});
					for (let i = 0; i < summarySize; i++) {
						str.append("a", false);
					}
					str.applyPendingOps();
					const summary: ISummaryTree = str.getSummary();
					await state.timeAllBatchesAsync(async () => {
						await loadSnapshot(summary);
					});
				},
			}),
		});

		if (summarySize > 5000) {
			const currentTimeout = test.timeout();
			// Default value of 2 seconds causes failure around P95 for large snapshot sizes.
			test.timeout(currentTimeout === 0 ? 0 : Math.max(5000, currentTimeout));
		}
	}
});
