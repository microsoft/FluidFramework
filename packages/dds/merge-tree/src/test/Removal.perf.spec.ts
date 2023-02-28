/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { benchmark, BenchmarkType } from "@fluid-tools/benchmark";
import { MergeTreeDeltaType } from "../ops";
import { markRangeRemoved } from "./testUtils";
import { loadSnapshot, TestString } from "./snapshot.utils";

describe("removal perf", () => {
	let summary;

	benchmark({
		type: BenchmarkType.Measurement,
		// baseline summary benchmark to compare to other remove tests. such a
		// comparison should give a (rough) sense of overhead caused by summary
		// loading
		title: "baseline summary load",
		category: "remove",
		before: () => {
			const str = new TestString("id", {});
			for (let i = 0; i < 1000; i++) {
				str.append("a", false);
			}

			summary = str.getSummary();
		},
		benchmarkFn: async () => {
			await loadSnapshot(summary);
		},
	});

	benchmark({
		type: BenchmarkType.Measurement,
		title: "remove large range of large tree",
		category: "remove",
		before: () => {
			const str = new TestString("id", {});
			for (let i = 0; i < 1000; i++) {
				str.append("a", false);
			}

			summary = str.getSummary();
		},
		benchmarkFn: async () => {
			const str = await loadSnapshot(summary);

			markRangeRemoved({
				mergeTree: str.mergeTree,
				start: 0,
				end: 1000,
				refSeq: 1000,
				clientId: 0,
				seq: 1001,
				opArgs: { op: { type: MergeTreeDeltaType.REMOVE } },
				overwrite: false,
			});
		},
	});

	benchmark({
		type: BenchmarkType.Measurement,
		title: "remove start of large tree",
		category: "remove",
		before: () => {
			const str = new TestString("id", {});
			for (let i = 0; i < 1000; i++) {
				str.append("a", false);
			}

			summary = str.getSummary();
		},
		benchmarkFn: async () => {
			const str = await loadSnapshot(summary);

			markRangeRemoved({
				mergeTree: str.mergeTree,
				start: 0,
				end: 1,
				refSeq: 1000,
				clientId: 0,
				seq: 1001,
				opArgs: { op: { type: MergeTreeDeltaType.REMOVE } },
				overwrite: false,
			});
		},
	});

	benchmark({
		type: BenchmarkType.Measurement,
		title: "remove middle of large tree",
		category: "remove",
		before: () => {
			const str = new TestString("id", {});
			for (let i = 0; i < 1000; i++) {
				str.append("a", false);
			}

			summary = str.getSummary();
		},
		benchmarkFn: async () => {
			const str = await loadSnapshot(summary);

			markRangeRemoved({
				mergeTree: str.mergeTree,
				start: 499,
				end: 501,
				refSeq: 1000,
				clientId: 0,
				seq: 1001,
				opArgs: { op: { type: MergeTreeDeltaType.REMOVE } },
				overwrite: false,
			});
		},
	});

	benchmark({
		type: BenchmarkType.Measurement,
		title: "remove end of large tree",
		category: "remove",
		before: () => {
			const str = new TestString("id", {});
			for (let i = 0; i < 1000; i++) {
				str.append("a", false);
			}

			summary = str.getSummary();
		},
		benchmarkFn: async () => {
			const str = await loadSnapshot(summary);

			markRangeRemoved({
				mergeTree: str.mergeTree,
				start: 999,
				end: 1000,
				refSeq: 1000,
				clientId: 0,
				seq: 1001,
				opArgs: { op: { type: MergeTreeDeltaType.REMOVE } },
				overwrite: false,
			});
		},
	});
});
