/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { strict as assert } from "node:assert";

import { MergeTreeTextHelper } from "../MergeTreeTextHelper.js";
import { UniversalSequenceNumber } from "../constants.js";
import { MergeTree } from "../mergeTree.js";
import { walkAllChildSegments } from "../mergeTreeNodeWalk.js";
import { MergeBlock, MaxNodesInBlock, segmentIsRemoved } from "../mergeTreeNodes.js";
import { TextSegment } from "../textSegment.js";

import { makeRemoteClient, nodeOrdinalsHaveIntegrity } from "./testUtils.js";

interface ITestTreeFactory {
	readonly create: () => ITestData;
	readonly name: string;
}

interface ITestData {
	readonly mergeTree: MergeTree;
	readonly textHelper: MergeTreeTextHelper;
	readonly initialText: string;
	readonly middle: number;
	readonly refSeq: number;
}

const localClientId = 17;
const treeFactories: ITestTreeFactory[] = [
	{
		create: (): ITestData => {
			const initialText = "hello world";
			const mergeTree = new MergeTree();
			mergeTree.insertSegments(
				0,
				[TextSegment.make(initialText)],
				mergeTree.localPerspective,
				mergeTree.collabWindow.mintNextLocalOperationStamp(),
				undefined,
			);

			mergeTree.startCollaboration(
				localClientId,
				/* minSeq: */ UniversalSequenceNumber,
				/* currentSeq: */ UniversalSequenceNumber,
			);
			return {
				initialText,
				mergeTree,
				middle: Math.round(initialText.length / 2),
				refSeq: UniversalSequenceNumber,
				textHelper: new MergeTreeTextHelper(mergeTree),
			};
		},
		name: "single segment tree",
	},
	{
		create: (): ITestData => {
			let initialText = "0";
			const mergeTree = new MergeTree();
			mergeTree.insertSegments(
				0,
				[TextSegment.make(initialText)],
				mergeTree.localPerspective,
				mergeTree.collabWindow.mintNextLocalOperationStamp(),
				undefined,
			);
			for (let i = 1; i < MaxNodesInBlock - 1; i++) {
				const text = i.toString();
				mergeTree.insertSegments(
					mergeTree.getLength(mergeTree.localPerspective),
					[TextSegment.make(text)],
					mergeTree.localPerspective,
					mergeTree.collabWindow.mintNextLocalOperationStamp(),
					undefined,
				);
				initialText += text;
			}

			const textHelper = new MergeTreeTextHelper(mergeTree);
			assert.equal(textHelper.getText(UniversalSequenceNumber, localClientId), initialText);

			const nodes: MergeBlock[] = [mergeTree.root];
			while (nodes.length > 0) {
				const node = nodes.pop()!;
				assert.equal(node.childCount, MaxNodesInBlock - 1);
				const childrenBlocks = node.children
					.map((v) => v as MergeBlock)
					.filter((v) => v === undefined);
				nodes.push(...childrenBlocks);
			}

			mergeTree.startCollaboration(
				localClientId,
				/* minSeq: */ UniversalSequenceNumber,
				/* currentSeq: */ UniversalSequenceNumber,
			);
			return {
				initialText,
				mergeTree,
				middle: Math.round(MaxNodesInBlock / 2),
				refSeq: UniversalSequenceNumber,
				textHelper,
			};
		},
		name: "Full single layer tree",
	},
	{
		create: (): ITestData => {
			let initialText = "0";
			const mergeTree = new MergeTree();
			mergeTree.insertSegments(
				0,
				[TextSegment.make(initialText)],
				mergeTree.localPerspective,
				mergeTree.collabWindow.mintNextLocalOperationStamp(),
				undefined,
			);
			for (let i = 1; i < MaxNodesInBlock * 4; i++) {
				const text = i.toString();
				mergeTree.insertSegments(
					mergeTree.getLength(mergeTree.localPerspective),
					[TextSegment.make(text)],
					mergeTree.localPerspective,
					mergeTree.collabWindow.mintNextLocalOperationStamp(),
					undefined,
				);
				initialText += text;
			}

			const remove = Math.round(initialText.length / 4);
			// remove from start
			mergeTree.markRangeRemoved(
				0,
				remove,
				mergeTree.localPerspective,
				{ clientId: localClientId, seq: UniversalSequenceNumber },
				undefined as never,
			);
			initialText = initialText.slice(Math.max(0, remove));

			// remove from end
			mergeTree.markRangeRemoved(
				initialText.length - remove,
				initialText.length,
				mergeTree.localPerspective,
				{ clientId: localClientId, seq: UniversalSequenceNumber },
				undefined as never,
			);
			initialText = initialText.slice(0, Math.max(0, initialText.length - remove));

			mergeTree.startCollaboration(
				localClientId,
				/* minSeq: */ UniversalSequenceNumber,
				/* currentSeq: */ UniversalSequenceNumber,
			);

			return {
				initialText,
				mergeTree,
				middle: Math.round(initialText.length / 2),
				refSeq: UniversalSequenceNumber,
				textHelper: new MergeTreeTextHelper(mergeTree),
			};
		},
		name: "Tree with remove segments",
	},
];

describe("MergeTree.insertingWalk", () => {
	for (const tf of treeFactories) {
		describe(tf.name, () => {
			const treeFactory = tf;
			let testData: ITestData;
			beforeEach(() => {
				testData = treeFactory.create();
				assert(nodeOrdinalsHaveIntegrity(testData.mergeTree.root));
			});
			afterEach(() => {
				assert(nodeOrdinalsHaveIntegrity(testData.mergeTree.root));
			});
			describe("insertText", () => {
				it("at beginning", () => {
					testData.mergeTree.insertSegments(
						0,
						[TextSegment.make("a")],
						testData.mergeTree.localPerspective,
						testData.mergeTree.collabWindow.mintNextLocalOperationStamp(),
						undefined,
					);

					assert.equal(
						testData.mergeTree.getLength(testData.mergeTree.localPerspective),
						testData.initialText.length + 1,
					);
					const currentValue = testData.textHelper.getText(testData.refSeq, localClientId);
					assert.equal(currentValue.length, testData.initialText.length + 1);
					assert.equal(currentValue, `a${testData.initialText}`);
				});

				it("at end", () => {
					testData.mergeTree.insertSegments(
						testData.initialText.length,
						[TextSegment.make("a")],
						testData.mergeTree.localPerspective,
						testData.mergeTree.collabWindow.mintNextLocalOperationStamp(),
						undefined,
					);

					assert.equal(
						testData.mergeTree.getLength(testData.mergeTree.localPerspective),
						testData.initialText.length + 1,
					);
					const currentValue = testData.textHelper.getText(testData.refSeq, localClientId);
					assert.equal(currentValue.length, testData.initialText.length + 1);
					assert.equal(currentValue, `${testData.initialText}a`);
				});

				it("in middle", () => {
					testData.mergeTree.insertSegments(
						testData.middle,
						[TextSegment.make("a")],
						testData.mergeTree.localPerspective,
						testData.mergeTree.collabWindow.mintNextLocalOperationStamp(),
						undefined,
					);

					assert.equal(
						testData.mergeTree.getLength(testData.mergeTree.localPerspective),
						testData.initialText.length + 1,
					);
					const currentValue = testData.textHelper.getText(testData.refSeq, localClientId);
					assert.equal(currentValue.length, testData.initialText.length + 1);
					assert.equal(
						currentValue,
						`${testData.initialText.slice(0, Math.max(0, testData.middle))}` +
							"a" +
							`${testData.initialText.slice(Math.max(0, testData.middle))}`,
					);
				});
			});
		});
	}

	it("handles conflicts involving removed segments across block boundaries", () => {
		let initialText = "0";
		let seq = 0;
		const mergeTree = new MergeTree();
		mergeTree.insertSegments(
			0,
			[TextSegment.make(initialText)],
			mergeTree.localPerspective,
			mergeTree.collabWindow.mintNextLocalOperationStamp(),
			undefined,
		);
		mergeTree.startCollaboration(localClientId, 0, seq);
		for (let i = 1; i < MaxNodesInBlock; i++) {
			const text = String.fromCodePoint(i + 64);
			mergeTree.insertSegments(
				0,
				[TextSegment.make(text)],
				mergeTree.localPerspective,
				mergeTree.collabWindow.mintNextLocalOperationStamp(),
				undefined,
			);
			initialText += text;
		}

		const textHelper = new MergeTreeTextHelper(mergeTree);

		assert.equal(mergeTree.root.childCount, 2);
		assert.equal(textHelper.getText(0, localClientId), "GFEDCBA0");
		// Remove "DCBA"
		mergeTree.markRangeRemoved(
			3,
			7,
			mergeTree.localPerspective,
			mergeTree.collabWindow.mintNextLocalOperationStamp(),
			undefined as never,
		);
		assert.equal(textHelper.getText(0, localClientId), "GFE0");
		// Simulate another client inserting concurrently with the above operations. Because
		// all segments but the 0 are unacked, this insert should place the segment directly
		// before the 0. Prior to this regression test, an issue with `rightExcursion` in the
		// merge conflict logic instead caused the segment to be placed before the removed segments.
		const remoteClient = makeRemoteClient({ clientId: localClientId + 1 });
		mergeTree.insertSegments(
			0,
			[TextSegment.make("x")],
			remoteClient.perspectiveAt({ refSeq: 0 }),
			remoteClient.stampAt({ seq: ++seq }),
			undefined,
		);

		const segments: string[] = [];
		walkAllChildSegments(mergeTree.root, (seg) => {
			if (TextSegment.is(seg)) {
				if (segmentIsRemoved(seg)) {
					segments.push(`(${seg.text})`);
				} else {
					segments.push(seg.text);
				}
			}
			return true;
		});

		assert.deepStrictEqual(segments, ["G", "F", "E", "(D)", "(C)", "(B)", "(A)", "x", "0"]);
	});

	// Inserting walk previously unnecessarily called `blockUpdate` for blocks even when no segment changes happened (e.g.
	// we called `ensureIntervalBoundary` but there was already a segment boundary at the position we wanted to ensure had one).
	it("avoids calling blockUpdate excessively", () => {
		const seq = 1;
		const mergeTree = new MergeTree();
		mergeTree.startCollaboration(localClientId, 0, seq);
		for (const char of [..."hello world"]) {
			mergeTree.insertSegments(
				mergeTree.getLength(mergeTree.localPerspective),
				[TextSegment.make(char)],
				mergeTree.localPerspective,
				mergeTree.collabWindow.mintNextLocalOperationStamp(),
				undefined /* opArgs */,
			);
		}

		const originalBlockUpdate: (block: MergeBlock) => void =
			// eslint-disable-next-line @typescript-eslint/dot-notation
			(mergeTree["blockUpdate"] as (block: MergeBlock) => void).bind(mergeTree);
		const blockUpdateCallLog: string[] = [];
		// eslint-disable-next-line @typescript-eslint/dot-notation
		mergeTree["blockUpdate"] = (block: MergeBlock) => {
			// This is called in the middle of updating lots of merge-tree bookkeeping, so we don't want to do too much
			// advanced stuff here. However, walking the tree and concatenating all the text (ignoring other segment properties)
			// should be safe.
			let text = "";
			walkAllChildSegments(block, (seg) => {
				if (TextSegment.is(seg)) {
					text += seg.text;
				}
				return true;
			});

			blockUpdateCallLog.push(text);
			originalBlockUpdate(block);
		};

		mergeTree.insertSegments(
			0,
			[TextSegment.make("Ot")],
			mergeTree.localPerspective,
			mergeTree.collabWindow.mintNextLocalOperationStamp(),
			undefined /* opArgs */,
		);

		assert.deepEqual(blockUpdateCallLog, ["Othell", "Othello world"]);

		blockUpdateCallLog.length = 0;

		mergeTree.markRangeRemoved(
			0,
			"Othello world".length,
			mergeTree.localPerspective,
			mergeTree.collabWindow.mintNextLocalOperationStamp(),
			undefined as never,
		);

		// The log ignores presence of segments. The important thing is that we only have one entry per block here.
		assert.deepEqual(blockUpdateCallLog, ["Othell", "o world", "Othello world"]);
	});
});
