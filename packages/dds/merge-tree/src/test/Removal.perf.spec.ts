/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { benchmarkDuration, benchmarkIt } from "@fluid-tools/benchmark";

import { MergeTreeDeltaType } from "../ops.js";
import { PriorPerspective } from "../perspective.js";
import {
	type MergeTreeDeltaRevertible,
	appendToMergeTreeDeltaRevertibles,
} from "../revertibles.js";

import { TestString, loadSnapshot } from "./snapshot.utils.js";

describe("MergeTree remove", () => {
	benchmarkIt({
		// baseline summary benchmark to compare to other remove tests. such a
		// comparison should give a (rough) sense of overhead caused by summary
		// loading
		title: "baseline summary load",
		category: "remove",
		...benchmarkDuration({
			benchmarkFnCustom: async (state) => {
				const str = new TestString("id", {});
				for (let i = 0; i < 1000; i++) {
					str.append("a", false);
				}
				str.applyPendingOps();
				const summary = str.getSummary();
				await state.timeAllBatchesAsync(async () => {
					await loadSnapshot(summary);
				});
			},
		}),
	});

	benchmarkIt({
		title: "remove large range of large tree",
		category: "remove",
		...benchmarkDuration({
			benchmarkFnCustom: async (state) => {
				const str = new TestString("id", {});
				for (let i = 0; i < 1000; i++) {
					str.append("a", false);
				}
				str.applyPendingOps();
				const summary = str.getSummary();
				await state.timeAllBatchesAsync(async () => {
					const loadedStr = await loadSnapshot(summary);

					const refSeq = 1000;
					const clientId = 0;
					loadedStr.mergeTree.markRangeRemoved(
						0,
						1000,
						new PriorPerspective(refSeq, clientId),
						{ seq: 1001, clientId },
						{ op: { type: MergeTreeDeltaType.REMOVE } },
					);
				});
			},
		}),
	});

	for (const length of [10, 100, 1000]) {
		benchmarkIt({
			title: `remove range of length ${length} from large tree with undo-redo`,
			category: "remove",
			...benchmarkDuration({
				benchmarkFnCustom: async (state) => {
					const str = new TestString("id", {});
					for (let i = 0; i < length / 2; i++) {
						str.append("a", true);
						str.appendMarker(true);
					}
					str.applyPendingOps();
					const summary = str.getSummary();
					await state.timeAllBatchesAsync(async () => {
						const loadedStr = await loadSnapshot(summary);

						const revertibles: MergeTreeDeltaRevertible[] = [];
						loadedStr.on("delta", (_op, delta) => {
							appendToMergeTreeDeltaRevertibles(delta, revertibles);
						});

						const op = loadedStr.removeRangeLocal(0, length - 1);
						loadedStr.applyMsg(
							loadedStr.makeOpMessage(
								op,
								/* seq */ length + 1,
								/* refSeq */ length,
								loadedStr.longClientId,
								/* minSeq */ length,
							),
						);
					});
				},
			}),
		});
	}

	benchmarkIt({
		title: "remove start of large tree",
		category: "remove",
		...benchmarkDuration({
			benchmarkFnCustom: async (state) => {
				const str = new TestString("id", {});
				for (let i = 0; i < 1000; i++) {
					str.append("a", false);
				}
				str.applyPendingOps();
				const summary = str.getSummary();
				await state.timeAllBatchesAsync(async () => {
					const loadedStr = await loadSnapshot(summary);

					const refSeq = 1000;
					const clientId = 0;
					loadedStr.mergeTree.markRangeRemoved(
						0,
						1,
						new PriorPerspective(refSeq, clientId),
						{ seq: 1001, clientId },
						{ op: { type: MergeTreeDeltaType.REMOVE } },
					);
				});
			},
		}),
	});

	benchmarkIt({
		title: "remove middle of large tree",
		category: "remove",
		...benchmarkDuration({
			benchmarkFnCustom: async (state) => {
				const str = new TestString("id", {});
				for (let i = 0; i < 1000; i++) {
					str.append("a", false);
				}
				str.applyPendingOps();
				const summary = str.getSummary();
				await state.timeAllBatchesAsync(async () => {
					const loadedStr = await loadSnapshot(summary);

					const refSeq = 1000;
					const clientId = 0;
					loadedStr.mergeTree.markRangeRemoved(
						499,
						501,
						new PriorPerspective(refSeq, clientId),
						{ seq: 1001, clientId },
						{ op: { type: MergeTreeDeltaType.REMOVE } },
					);
				});
			},
		}),
	});

	benchmarkIt({
		title: "remove end of large tree",
		category: "remove",
		...benchmarkDuration({
			benchmarkFnCustom: async (state) => {
				const str = new TestString("id", {});
				for (let i = 0; i < 1000; i++) {
					str.append("a", false);
				}
				str.applyPendingOps();
				const summary = str.getSummary();
				await state.timeAllBatchesAsync(async () => {
					const loadedStr = await loadSnapshot(summary);

					const refSeq = 1000;
					const clientId = 0;
					loadedStr.mergeTree.markRangeRemoved(
						999,
						1000,
						new PriorPerspective(refSeq, clientId),
						{ seq: 1001, clientId },
						{ op: { type: MergeTreeDeltaType.REMOVE } },
					);
				});
			},
		}),
	});
});
