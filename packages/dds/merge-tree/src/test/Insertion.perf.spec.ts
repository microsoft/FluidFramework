/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { benchmark, BenchmarkType } from "@fluid-tools/benchmark";
import { MergeTree } from "../mergeTree";
import { MergeTreeDeltaType } from "../ops";
import { insertText } from "./testUtils";

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

describe("insertion perf", () => {
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

	let startTree = constructTree(1000);
	benchmark({
		type: BenchmarkType.Measurement,
		title: "insert at start of large tree",
		benchmarkFn: () => {
			insertText({
				mergeTree: startTree,
				pos: 0,
				refSeq: 1000,
				clientId: 0,
				seq: 1001,
				text: "a",
				props: undefined,
				opArgs: { op: { type: MergeTreeDeltaType.INSERT } },
			});
		},
		onCycle: () => {
			startTree = constructTree(1000);
		},
	});

	let middleTree = constructTree(1000);
	benchmark({
		type: BenchmarkType.Measurement,
		title: "insert at middle of large tree",
		benchmarkFn: () => {
			insertText({
				mergeTree: middleTree,
				pos: 500,
				refSeq: 1000,
				clientId: 0,
				seq: 1001,
				text: "a",
				props: undefined,
				opArgs: { op: { type: MergeTreeDeltaType.INSERT } },
			});
		},
		onCycle: () => {
			middleTree = constructTree(1000);
		},
	});

	let endTree = constructTree(1000);
	benchmark({
		type: BenchmarkType.Measurement,
		title: "insert at end of large tree",
		benchmarkFn: async () => {
			insertText({
				mergeTree: endTree,
				pos: 1000,
				refSeq: 1000,
				clientId: 0,
				seq: 1001,
				text: "a",
				props: undefined,
				opArgs: { op: { type: MergeTreeDeltaType.INSERT } },
			});
		},
		onCycle: () => {
			endTree = constructTree(1000);
		},
	});
});
