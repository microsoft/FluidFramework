/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BenchmarkType, benchmark } from "@fluid-tools/benchmark";

import { MergeTree } from "../mergeTree.js";
import { MergeTreeDeltaType } from "../ops.js";
import { PriorPerspective } from "../perspective.js";
import type { OperationStamp } from "../stamps.js";
import { TextSegment } from "../textSegment.js";

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

				const clientId = 0;
				let i = 1;
				for (; i < 1001; i++) {
					const stamp: OperationStamp = {
						seq: i,
						clientId,
					};
					mergeTree.insertSegments(
						0,
						[TextSegment.make("a")],
						new PriorPerspective(i, clientId),
						stamp,
						{
							op: { type: MergeTreeDeltaType.INSERT },
						},
					);
				}

				for (; i < 2001; i++) {
					const stamp: OperationStamp = {
						seq: i,
						clientId,
					};
					mergeTree.markRangeRemoved(
						i - 1001,
						i - 1000,
						new PriorPerspective(i, clientId),
						stamp,
						{
							op: { type: MergeTreeDeltaType.REMOVE },
						},
					);
				}

				for (; i < 3001; i++) {
					const stamp: OperationStamp = {
						seq: i,
						clientId,
					};
					mergeTree.insertSegments(
						0,
						[TextSegment.make("a")],
						new PriorPerspective(i, clientId),
						stamp,
						{
							op: { type: MergeTreeDeltaType.INSERT },
						},
					);
				}
			},
			after: () => {
				MergeTree.options.incrementalUpdate = originalIncrementalUpdate;
			},
		});
	}
});
