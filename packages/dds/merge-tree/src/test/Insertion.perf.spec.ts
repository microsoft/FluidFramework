/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { benchmark, BenchmarkType } from "@fluid-tools/benchmark";
import { MergeTree } from "../mergeTree";
import { MergeTreeDeltaType } from "../ops";
import { loadSnapshot, TestString } from "./snapshot.utils";
import { insertText } from "./testUtils";

describe("insertion perf", () => {
	let summary;

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

	benchmark({
		type: BenchmarkType.Measurement,
		title: "insert at start of large tree",
		before: () => {
			const str = new TestString("id", {});
			for (let i = 0; i < 1000; i++) {
				str.append("a", false);
			}

			summary = str.getSummary();
		},
		benchmarkFn: async () => {
			const str = await loadSnapshot(summary);

			insertText({
				mergeTree: str.mergeTree,
				pos: 0,
				refSeq: 1000,
				clientId: 0,
				seq: 1001,
				text: "a",
				props: undefined,
				opArgs: { op: { type: MergeTreeDeltaType.INSERT } },
			});
		},
	});

	benchmark({
		type: BenchmarkType.Measurement,
		title: "insert at middle of large tree",
		before: () => {
			const str = new TestString("id", {});
			for (let i = 0; i < 1000; i++) {
				str.append("a", false);
			}

			summary = str.getSummary();
		},
		benchmarkFn: async () => {
			const str = await loadSnapshot(summary);

			insertText({
				mergeTree: str.mergeTree,
				pos: 1000,
				refSeq: 1000,
				clientId: 0,
				seq: 1001,
				text: "a",
				props: undefined,
				opArgs: { op: { type: MergeTreeDeltaType.INSERT } },
			});
		},
	});

	benchmark({
		type: BenchmarkType.Measurement,
		title: "insert at end of large tree",
		before: () => {
			const str = new TestString("id", {});
			for (let i = 0; i < 1000; i++) {
				str.append("a", false);
			}

			summary = str.getSummary();
		},
		benchmarkFn: async () => {
			const str = await loadSnapshot(summary);

			insertText({
				mergeTree: str.mergeTree,
				pos: 1000,
				refSeq: 1000,
				clientId: 0,
				seq: 1001,
				text: "a",
				props: undefined,
				opArgs: { op: { type: MergeTreeDeltaType.INSERT } },
			});
		},
	});
});
