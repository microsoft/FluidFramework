/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BenchmarkType, benchmarkDuration, benchmarkIt } from "@fluid-tools/benchmark";

import { MergeTree } from "../mergeTree.js";
import { MergeTreeDeltaType } from "../ops.js";
import { TextSegment } from "../textSegment.js";

function constructTree(numOfSegments: number): MergeTree {
	const mergeTree = new MergeTree();
	for (let i = 0; i < numOfSegments; i++) {
		mergeTree.insertSegments(
			0,
			[TextSegment.make("a")],
			mergeTree.localPerspective,
			{ seq: i, clientId: 0 },
			{ op: { type: MergeTreeDeltaType.INSERT } },
		);
	}
	return mergeTree;
}

const TREE_SIZE: number = 7500;

describe("MergeTree insertion", () => {
	benchmarkIt({
		type: BenchmarkType.Measurement,
		title: "insert into empty tree",
		...benchmarkDuration({
			benchmarkFn: () => {
				const emptyTree = new MergeTree();
				emptyTree.insertSegments(
					0,
					[TextSegment.make("a")],
					emptyTree.localPerspective,
					{ seq: 0, clientId: 0 },
					{ op: { type: MergeTreeDeltaType.INSERT } },
				);
			},
		}),
	});

	benchmarkIt({
		type: BenchmarkType.Measurement,
		title: "insert at start of large tree",
		...benchmarkDuration({
			benchmarkFnCustom: async (state) => {
				let startTree = constructTree(TREE_SIZE);
				let keepRunning: boolean;
				do {
					startTree = constructTree(TREE_SIZE);
					keepRunning = state.timeBatch(() => {
						for (let i = TREE_SIZE; i < TREE_SIZE + 25; i++) {
							startTree.insertSegments(
								0,
								[TextSegment.make("a")],
								startTree.localPerspective,
								{ seq: i + 1, clientId: 0 },
								{ op: { type: MergeTreeDeltaType.INSERT } },
							);
						}
					});
				} while (keepRunning);
			},
		}),
	});

	benchmarkIt({
		type: BenchmarkType.Measurement,
		title: "insert at middle of large tree",
		...benchmarkDuration({
			benchmarkFnCustom: async (state) => {
				let middleTree = constructTree(TREE_SIZE);
				let keepRunning: boolean;
				do {
					middleTree = constructTree(TREE_SIZE);
					keepRunning = state.timeBatch(() => {
						for (let i = TREE_SIZE; i < TREE_SIZE + 25; i++) {
							middleTree.insertSegments(
								TREE_SIZE / 2,
								[TextSegment.make("a")],
								middleTree.localPerspective,
								{ seq: i + 1, clientId: 0 },
								{ op: { type: MergeTreeDeltaType.INSERT } },
							);
						}
					});
				} while (keepRunning);
			},
		}),
	});

	benchmarkIt({
		type: BenchmarkType.Measurement,
		title: "insert at end of large tree",
		...benchmarkDuration({
			benchmarkFnCustom: async (state) => {
				let endTree = constructTree(TREE_SIZE);
				let keepRunning: boolean;
				do {
					endTree = constructTree(TREE_SIZE);
					keepRunning = state.timeBatch(() => {
						for (let i = TREE_SIZE; i < TREE_SIZE + 25; i++) {
							endTree.insertSegments(
								i,
								[TextSegment.make("a")],
								endTree.localPerspective,
								{ seq: i + 1, clientId: 0 },
								{ op: { type: MergeTreeDeltaType.INSERT } },
							);
						}
					});
				} while (keepRunning);
			},
		}),
	});
});
