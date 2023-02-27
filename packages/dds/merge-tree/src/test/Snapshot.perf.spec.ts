/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { benchmark, BenchmarkType } from "@fluid-tools/benchmark";
import { loadSnapshot, TestString } from "./snapshot.utils";

describe("snapshot perf", () => {
	let summary;

	for (const summarySize of [10, 100, 1000, 5000]) {
		benchmark({
			type: BenchmarkType.Measurement,
			title: `load snapshot with ${summarySize} segments`,
			category: "snapshot loading",
			before: () => {
				const str = new TestString("id", {});
				for (let i = 0; i < summarySize; i++) {
					str.append("a", false);
				}
				summary = str.getSummary();
			},
			benchmarkFn: async () => {
				await loadSnapshot(summary);
			},
			after: () => {
				summary = undefined;
			},
		});
	}
});
