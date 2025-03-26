/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BenchmarkType, benchmark } from "@fluid-tools/benchmark";

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
	benchmark({
		type: BenchmarkType.Measurement,
		title: "insert into empty tree",
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
	});

	let startTree = constructTree(TREE_SIZE);
	benchmark({
		type: BenchmarkType.Measurement,
		title: "insert at start of large tree",
		benchmarkFn: () => {
			for (let i = TREE_SIZE; i < TREE_SIZE + 25; i++) {
				startTree.insertSegments(
					0,
					[TextSegment.make("a")],
					startTree.localPerspective,
					{ seq: i + 1, clientId: 0 },
					{ op: { type: MergeTreeDeltaType.INSERT } },
				);
			}
		},
		beforeEachBatch: () => {
			startTree = constructTree(TREE_SIZE);
		},
	});

	let middleTree = constructTree(TREE_SIZE);
	benchmark({
		type: BenchmarkType.Measurement,
		title: "insert at middle of large tree",
		benchmarkFn: () => {
			for (let i = TREE_SIZE; i < TREE_SIZE + 25; i++) {
				middleTree.insertSegments(
					TREE_SIZE / 2,
					[TextSegment.make("a")],
					middleTree.localPerspective,
					{ seq: i + 1, clientId: 0 },
					{ op: { type: MergeTreeDeltaType.INSERT } },
				);
			}
		},
		beforeEachBatch: () => {
			middleTree = constructTree(TREE_SIZE);
		},
	});

	let endTree = constructTree(TREE_SIZE);
	benchmark({
		type: BenchmarkType.Measurement,
		title: "insert at end of large tree",
		benchmarkFn: () => {
			for (let i = TREE_SIZE; i < TREE_SIZE + 25; i++) {
				endTree.insertSegments(
					i,
					[TextSegment.make("a")],
					endTree.localPerspective,
					{ seq: i + 1, clientId: 0 },
					{ op: { type: MergeTreeDeltaType.INSERT } },
				);
			}
		},
		beforeEachBatch: () => {
			endTree = constructTree(TREE_SIZE);
		},
	});
});
