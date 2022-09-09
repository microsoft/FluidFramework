/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
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
        for (let i = 1; i < MaxNodesInBlock * 4; i++) {
            const text = i.toString();
            insertText(
                mergeTree,
                mergeTree.getLength(UniversalSequenceNumber, localClientId),
                UniversalSequenceNumber,
                localClientId,
                UniversalSequenceNumber,
                text,
                undefined,
                undefined);
            initialText += text;
        }
    });

    describe("walkAllChildSegments", () => {
        it("visits only descendants", () => {
            for (let i = 0; i < mergeTree.root.childCount; i++) {
                const block = mergeTree.root.children[i];
                assert(!block.isLeaf(), "Expected multi-layer tree");
                walkAllChildSegments(block, (seg) => {
                    let current = seg.parent;
                    while (current !== block && current !== undefined) {
                        current = current.parent;
                    }
                    assert(current === block, "Expected all visited segments to be descendants");
                    return true;
                });
            }
        });
    });
});
