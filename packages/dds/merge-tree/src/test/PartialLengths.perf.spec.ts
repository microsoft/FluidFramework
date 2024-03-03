/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { benchmark, BenchmarkType } from "@fluid-tools/benchmark";
import { MergeTreeDeltaType } from "../ops.js";
import { MergeTree } from "../mergeTree.js";
import { insertText, markRangeRemoved } from "./testUtils.js";

describe("MergeTree partial lengths", () => {
	const originalIncrementalUpdate: boolean = MergeTree.options.incrementalUpdate;

	for (const incremental of [true, false]) {
		benchmark({
			type: BenchmarkType.Measurement,
			title: `incremental updates = ${incremental}`,
			category: "partial lengths",
			before: () => {
				MergeTree.options.incrementalUpdate = incremental;
			},
			benchmarkFn: () => {
				const mergeTree = new MergeTree();

				let i = 1;
				for (; i < 1001; i++) {
					insertText({
						mergeTree,
						pos: 0,
						refSeq: i,
						clientId: 0,
						seq: i,
						text: "a",
						props: undefined,
						opArgs: { op: { type: MergeTreeDeltaType.INSERT } },
					});
				}

				for (; i < 2001; i++) {
					markRangeRemoved({
						mergeTree,
						start: i - 1001,
						end: i - 1000,
						refSeq: i,
						clientId: 0,
						seq: i,
						opArgs: { op: { type: MergeTreeDeltaType.REMOVE } },
						overwrite: false,
					});
				}

				for (; i < 3001; i++) {
					insertText({
						mergeTree,
						pos: 0,
						refSeq: i,
						clientId: 0,
						seq: i,
						text: "a",
						props: undefined,
						opArgs: { op: { type: MergeTreeDeltaType.INSERT } },
					});
				}
			},
			after: () => {
				MergeTree.options.incrementalUpdate = originalIncrementalUpdate;
			},
		});
	}
});
