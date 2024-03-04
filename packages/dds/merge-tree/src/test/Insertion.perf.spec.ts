/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { benchmark, BenchmarkType } from "@fluid-tools/benchmark";
import { MergeTree } from "../mergeTree.js";
import { MergeTreeDeltaType } from "../ops.js";
import { insertText } from "./testUtils.js";

function constructTree(numOfSegments: number): MergeTree {
	const mergeTree = new MergeTree();
	for (let i = 0; i < numOfSegments; i++) {
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
	return mergeTree;
}

const TREE_SIZE: number = 7_500;

describe("MergeTree insertion", () => {
	benchmark({
		type: BenchmarkType.Measurement,
		title: "insert into empty tree",
		benchmarkFn: () => {
			const emptyTree = new MergeTree();
			insertText({
				mergeTree: emptyTree,
				pos: 0,
				refSeq: 0,
				clientId: 0,
				seq: 0,
				text: "a",
				props: undefined,
				opArgs: { op: { type: MergeTreeDeltaType.INSERT } },
			});
		},
	});

	let startTree = constructTree(TREE_SIZE);
	benchmark({
		type: BenchmarkType.Measurement,
		title: "insert at start of large tree",
		benchmarkFn: () => {
			for (let i = TREE_SIZE; i < TREE_SIZE + 25; i++) {
				insertText({
					mergeTree: startTree,
					pos: 0,
					refSeq: i,
					clientId: 0,
					seq: i + 1,
					text: "a",
					props: undefined,
					opArgs: { op: { type: MergeTreeDeltaType.INSERT } },
				});
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
				insertText({
					mergeTree: middleTree,
					pos: TREE_SIZE / 2,
					refSeq: i,
					clientId: 0,
					seq: i + 1,
					text: "a",
					props: undefined,
					opArgs: { op: { type: MergeTreeDeltaType.INSERT } },
				});
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
				insertText({
					mergeTree: endTree,
					pos: i,
					refSeq: i,
					clientId: 0,
					seq: i + 1,
					text: "a",
					props: undefined,
					opArgs: { op: { type: MergeTreeDeltaType.INSERT } },
				});
			}
		},
		beforeEachBatch: () => {
			endTree = constructTree(TREE_SIZE);
		},
	});
});
