/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    IMergeBlock,
    MaxNodesInBlock,
} from "../mergeTreeNodes";
import {
    TextSegment,
} from "../textSegment";
import { LocalClientId, UniversalSequenceNumber } from "../constants";
import { MergeTree } from "../mergeTree";
import { walkAllChildSegments } from "../mergeTreeNodeWalk";
import { insertText } from "./testUtils";

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
            undefined);
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
        function* getAllDescendantBlocks(block: IMergeBlock): Iterable<IMergeBlock> {
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
                    let current = seg.parent;
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
