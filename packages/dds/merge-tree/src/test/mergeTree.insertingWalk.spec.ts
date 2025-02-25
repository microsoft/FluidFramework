/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { strict as assert } from "node:assert";

import { MergeTreeTextHelper } from "../MergeTreeTextHelper.js";
import {
	LocalClientId,
	UnassignedSequenceNumber,
	UniversalSequenceNumber,
} from "../constants.js";
import { MergeTree } from "../mergeTree.js";
import { walkAllChildSegments } from "../mergeTreeNodeWalk.js";
import { MergeBlock, MaxNodesInBlock, segmentIsRemoved } from "../mergeTreeNodes.js";
import { TextSegment } from "../textSegment.js";

import {
	insertSegments,
	insertText,
	markRangeRemoved,
	nodeOrdinalsHaveIntegrity,
} from "./testUtils.js";

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
			insertSegments({
				mergeTree,
				pos: 0,
				segments: [TextSegment.make(initialText)],
				refSeq: UniversalSequenceNumber,
				clientId: LocalClientId,
				seq: UniversalSequenceNumber,
				opArgs: undefined,
			});
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
			insertSegments({
				mergeTree,
				pos: 0,
				segments: [TextSegment.make(initialText)],
				refSeq: UniversalSequenceNumber,
				clientId: LocalClientId,
				seq: UniversalSequenceNumber,
				opArgs: undefined,
			});
			for (let i = 1; i < MaxNodesInBlock - 1; i++) {
				const text = i.toString();
				insertText({
					mergeTree,
					pos: mergeTree.getLength(UniversalSequenceNumber, localClientId),
					refSeq: UniversalSequenceNumber,
					clientId: localClientId,
					seq: UniversalSequenceNumber,
					text,
					props: undefined,
					opArgs: undefined,
				});
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
			insertSegments({
				mergeTree,
				pos: 0,
				segments: [TextSegment.make(initialText)],
				refSeq: UniversalSequenceNumber,
				clientId: LocalClientId,
				seq: UniversalSequenceNumber,
				opArgs: undefined,
			});
			for (let i = 1; i < MaxNodesInBlock * 4; i++) {
				const text = i.toString();
				insertText({
					mergeTree,
					pos: mergeTree.getLength(UniversalSequenceNumber, localClientId),
					refSeq: UniversalSequenceNumber,
					clientId: localClientId,
					seq: UniversalSequenceNumber,
					text,
					props: undefined,
					opArgs: undefined,
				});
				initialText += text;
			}

			const remove = Math.round(initialText.length / 4);
			// remove from start
			mergeTree.markRangeRemoved(
				0,
				remove,
				UniversalSequenceNumber,
				localClientId,
				UniversalSequenceNumber,
				undefined as never,
			);
			initialText = initialText.slice(Math.max(0, remove));

			// remove from end
			mergeTree.markRangeRemoved(
				initialText.length - remove,
				initialText.length,
				UniversalSequenceNumber,
				localClientId,
				UniversalSequenceNumber,
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
					insertText({
						mergeTree: testData.mergeTree,
						pos: 0,
						refSeq: testData.refSeq,
						clientId: localClientId,
						seq: UnassignedSequenceNumber,
						text: "a",
						props: undefined,
						opArgs: undefined,
					});

					assert.equal(
						testData.mergeTree.getLength(testData.refSeq, localClientId),
						testData.initialText.length + 1,
					);
					const currentValue = testData.textHelper.getText(testData.refSeq, localClientId);
					assert.equal(currentValue.length, testData.initialText.length + 1);
					assert.equal(currentValue, `a${testData.initialText}`);
				});

				it("at end", () => {
					insertText({
						mergeTree: testData.mergeTree,
						pos: testData.initialText.length,
						refSeq: testData.refSeq,
						clientId: localClientId,
						seq: UnassignedSequenceNumber,
						text: "a",
						props: undefined,
						opArgs: undefined,
					});

					assert.equal(
						testData.mergeTree.getLength(testData.refSeq, localClientId),
						testData.initialText.length + 1,
					);
					const currentValue = testData.textHelper.getText(testData.refSeq, localClientId);
					assert.equal(currentValue.length, testData.initialText.length + 1);
					assert.equal(currentValue, `${testData.initialText}a`);
				});

				it("in middle", () => {
					insertText({
						mergeTree: testData.mergeTree,
						pos: testData.middle,
						refSeq: testData.refSeq,
						clientId: localClientId,
						seq: UnassignedSequenceNumber,
						text: "a",
						props: undefined,
						opArgs: undefined,
					});

					assert.equal(
						testData.mergeTree.getLength(testData.refSeq, localClientId),
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
		mergeTree.startCollaboration(localClientId, 0, seq);
		insertSegments({
			mergeTree,
			pos: 0,
			segments: [TextSegment.make(initialText)],
			refSeq: UniversalSequenceNumber,
			clientId: localClientId,
			seq: UniversalSequenceNumber,
			opArgs: undefined,
		});
		for (let i = 1; i < MaxNodesInBlock; i++) {
			const text = String.fromCodePoint(i + 64);
			insertText({
				mergeTree,
				pos: 0,
				refSeq: UniversalSequenceNumber,
				clientId: localClientId,
				seq: UnassignedSequenceNumber,
				text,
				props: undefined,
				opArgs: undefined,
			});
			initialText += text;
		}

		const textHelper = new MergeTreeTextHelper(mergeTree);

		assert.equal(mergeTree.root.childCount, 2);
		assert.equal(textHelper.getText(0, localClientId), "GFEDCBA0");
		// Remove "DCBA"
		markRangeRemoved({
			mergeTree,
			start: 3,
			end: 7,
			refSeq: UniversalSequenceNumber,
			clientId: localClientId,
			seq: UnassignedSequenceNumber,
			overwrite: false,
			opArgs: undefined as never,
		});
		assert.equal(textHelper.getText(0, localClientId), "GFE0");
		// Simulate another client inserting concurrently with the above operations. Because
		// all segments but the 0 are unacked, this insert should place the segment directly
		// before the 0. Prior to this regression test, an issue with `rightExcursion` in the
		// merge conflict logic instead caused the segment to be placed before the removed segments.
		insertText({
			mergeTree,
			pos: 0,
			refSeq: UniversalSequenceNumber,
			clientId: localClientId + 1,
			seq: ++seq,
			text: "x",
		});

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
});
