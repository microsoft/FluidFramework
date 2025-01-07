/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { LocalClientId, UniversalSequenceNumber } from "../constants.js";
import { MergeTree } from "../mergeTree.js";
import { walkAllChildSegments } from "../mergeTreeNodeWalk.js";
import { MergeBlock, MaxNodesInBlock } from "../mergeTreeNodes.js";
import { TextSegment } from "../textSegment.js";

import { insertText } from "./testUtils.js";

const localClientId = 17;

describe("MergeTree walks", () => {
	let mergeTree: MergeTree;
	beforeEach(() => {
		let initialText = "0";
		mergeTree = new MergeTree();
		mergeTree.insertSegments(
			0,
			[TextSegment.make(initialText)],
			UniversalSequenceNumber,
			LocalClientId,
			UniversalSequenceNumber,
			undefined,
		);
		for (let i = 1; i < MaxNodesInBlock * MaxNodesInBlock; i++) {
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
	});

	describe("walkAllChildSegments", () => {
		function* getAllDescendantBlocks(block: MergeBlock): Iterable<MergeBlock> {
			yield block;
			for (let i = 0; i < block.childCount; i++) {
				const child = block.children[i];
				if (!child.isLeaf()) {
					yield* getAllDescendantBlocks(child);
				}
			}
		}

		it("visits only descendants", () => {
			for (const block of getAllDescendantBlocks(mergeTree.root)) {
				let walkedAnySegments = false;
				walkAllChildSegments(block, (seg) => {
					walkedAnySegments = true;
					let current: MergeBlock | undefined = seg.parent;
					while (current !== block && current !== undefined) {
						current = current.parent;
					}
					assert(current === block, "Expected all visited segments to be descendants");
					return true;
				});
				assert(walkedAnySegments, "Walk should have hit segments");
			}
		});
	});
});
