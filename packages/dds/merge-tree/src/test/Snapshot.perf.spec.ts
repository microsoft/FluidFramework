/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BenchmarkType, benchmark } from "@fluid-tools/benchmark";
import type { ISummaryTree } from "@fluidframework/driver-definitions";

import { TestString, loadSnapshot } from "./snapshot.utils.js";

describe("MergeTree snapshots", () => {
	let summary: ISummaryTree | undefined;

	for (const summarySize of [10, 50, 100, 500, 1000, 5000, 10_000]) {
		const test = benchmark({
			type: BenchmarkType.Measurement,
			title: `load snapshot with ${summarySize} segments`,
			category: "snapshot loading",
			before: () => {
				const str = new TestString("id", {});
				for (let i = 0; i < summarySize; i++) {
					str.append("a", false);
				}

				str.applyPendingOps();
				summary = str.getSummary();
			},
			benchmarkFnAsync: async () => {
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				await loadSnapshot(summary!);
			},
			after: () => {
				summary = undefined;
			},
		});

		if (summarySize > 5000) {
			const currentTimeout = test.timeout();
			// Default value of 2 seconds causes failure around P95 for large snapshot sizes.
			test.timeout(currentTimeout === 0 ? 0 : Math.max(5000, currentTimeout));
		}
	}
});
