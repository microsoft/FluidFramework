/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { benchmark, BenchmarkType } from "@fluid-tools/benchmark";
import { MergeTreeDeltaType } from "../ops";
import { appendToMergeTreeDeltaRevertibles, MergeTreeDeltaRevertible } from "../revertibles";
import { markRangeRemoved } from "./testUtils";
import { loadSnapshot, TestString } from "./snapshot.utils";
import { createRevertDriver } from "./testClient";

describe("MergeTree remove", () => {
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

			str.applyPendingOps();
			summary = str.getSummary();
		},
		benchmarkFnAsync: async () => {
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

			str.applyPendingOps();
			summary = str.getSummary();
		},
		benchmarkFnAsync: async () => {
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

	for (const length of [10, 100, 1000]) {
		benchmark({
			type: BenchmarkType.Measurement,
			title: "remove large range of large tree with undo-redo",
			category: "remove",
			before: () => {
				const str = new TestString("id", {});
				for (let i = 0; i < length / 2; i++) {
					str.append("a", true);
					str.appendMarker(true);
				}

				str.applyPendingOps();
				summary = str.getSummary();
			},
			benchmarkFnAsync: async () => {
				const str = await loadSnapshot(summary);
				const driver = createRevertDriver(str);

				const revertibles: MergeTreeDeltaRevertible[] = [];
				str.on("delta", (_op, delta) => {
					appendToMergeTreeDeltaRevertibles(driver, delta, revertibles);
				});

				const op = str.removeRangeLocal(0, length - 1);
				str.applyMsg(
					str.makeOpMessage(
						op,
						/* seq */ length + 1,
						/* refSeq */ length,
						str.longClientId,
						/* minSeq */ length,
					),
				);
			},
		});
	}

	benchmark({
		type: BenchmarkType.Measurement,
		title: "remove start of large tree",
		category: "remove",
		before: () => {
			const str = new TestString("id", {});
			for (let i = 0; i < 1000; i++) {
				str.append("a", false);
			}

			str.applyPendingOps();
			summary = str.getSummary();
		},
		benchmarkFnAsync: async () => {
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

			str.applyPendingOps();
			summary = str.getSummary();
		},
		benchmarkFnAsync: async () => {
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

			str.applyPendingOps();
			summary = str.getSummary();
		},
		benchmarkFnAsync: async () => {
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
