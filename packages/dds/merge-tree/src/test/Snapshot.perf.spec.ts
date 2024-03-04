/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { benchmark, BenchmarkType } from "@fluid-tools/benchmark";
import { loadSnapshot, TestString } from "./snapshot.utils.js";

describe("MergeTree snapshots", () => {
	let summary;

	for (const summarySize of [10, 50, 100, 500, 1000, 5_000, 10_000]) {
		benchmark({
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
				await loadSnapshot(summary);
			},
			after: () => {
				summary = undefined;
			},
		});
	}
});
