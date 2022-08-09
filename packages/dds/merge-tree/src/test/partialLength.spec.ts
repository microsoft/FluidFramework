/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { MergeTree } from "../mergeTree";
import { MergeTreeDeltaType } from "../ops";
import { PartialSequenceLengths } from "../partialLengths";
import { TextSegment } from "../textSegment";
import { insertText } from "./testUtils";

describe("partial lengths", () => {
    let mergeTree: MergeTree;
    const localClientId = 17;
    const remoteClientId = 18;

    function getPartialLengths(
        clientId: number,
        seq: number,
        mergeBlock = mergeTree.root,
    ) {
        const partialLen = mergeBlock.partialLengths?.getPartialLength(
            seq,
            clientId,
        );

        let actualLen = 0;

        mergeTree.walkAllSegments(mergeBlock, (segment) => {
            if (
                segment.isLeaf()
                && !(segment.removedSeq !== undefined && segment.removedSeq >= seq)
                && segment.localRemovedSeq === undefined
            ) {
                actualLen += segment.cachedLength;
            }
            return true;
        });

        return {
            partialLen,
            actualLen,
        };
    }

    function validatePartialLengths(
        clientId: number,
        seq: number,
        expectedLen?: number,
        mergeBlock = mergeTree.root,
    ): void {
        const { partialLen, actualLen } = getPartialLengths(clientId, seq, mergeBlock);

        assert.equal(partialLen, actualLen);

        if (expectedLen !== undefined) {
            assert.equal(partialLen, expectedLen);
        }
    }

    beforeEach(() => {
        PartialSequenceLengths.options.verify = true;
        mergeTree = new MergeTree();
        mergeTree.insertSegments(
            0,
            [TextSegment.make("hello world!")],
            0,
            localClientId,
            0,
            undefined);

        mergeTree.startCollaboration(
            localClientId,
            /* minSeq: */ 0,
            /* currentSeq: */ 0);
    });

    it("passes with no additional ops", () => {
        validatePartialLengths(localClientId, 0, 12);
    });

    describe("a single inserted element", () => {
        it("includes length of local insert for local view", () => {
            insertText(
                mergeTree,
                0,
                0,
                localClientId,
                1,
                "more ",
                undefined,
                { op: { type: MergeTreeDeltaType.INSERT } },
            );

            validatePartialLengths(localClientId, 0, 17);
        });
        it("includes length of local insert for remote view", () => {
            insertText(
                mergeTree,
                0,
                0,
                localClientId,
                1,
                "more ",
                undefined,
                { op: { type: MergeTreeDeltaType.INSERT } },
            );

            validatePartialLengths(remoteClientId, 1, 17);
        });
        it("includes length of remote insert for local view", () => {
            insertText(
                mergeTree,
                0,
                0,
                remoteClientId,
                1,
                "more ",
                undefined,
                { op: { type: MergeTreeDeltaType.INSERT } },
            );

            validatePartialLengths(localClientId, 1, 17);
        });
        it("includes length of remote insert for remote view", () => {
            insertText(
                mergeTree,
                0,
                0,
                remoteClientId,
                1,
                "more ",
                undefined,
                { op: { type: MergeTreeDeltaType.INSERT } },
            );

            validatePartialLengths(remoteClientId, 0, 17);
        });
    });

    describe("a single removed segment", () => {
        it("includes result of local delete for local view", () => {
            mergeTree.markRangeRemoved(
                0,
                12,
                0,
                localClientId,
                1,
                false,
                undefined as any);

            validatePartialLengths(localClientId, 0, 0);
        });
        it("includes result of local delete for remote view", () => {
            mergeTree.markRangeRemoved(
                0,
                12,
                0,
                localClientId,
                1,
                false,
                undefined as any);

            validatePartialLengths(remoteClientId, 1, 0);
        });
        it("includes result of remote delete for local view", () => {
            mergeTree.markRangeRemoved(
                0,
                12,
                0,
                remoteClientId,
                1,
                false,
                undefined as any);

            validatePartialLengths(localClientId, 1, 0);
        });
        it("includes result of remote delete for remote view", () => {
            mergeTree.markRangeRemoved(
                0,
                12,
                0,
                remoteClientId,
                1,
                false,
                undefined as any);

            validatePartialLengths(remoteClientId, 0, 0);
        });
    });

    describe("aggregation", () => {
        it("includes lengths from multiple permutations in single tree", () => {
            mergeTree.insertSegments(
                0,
                [TextSegment.make("1")],
                0,
                localClientId,
                1,
                undefined,
            );
            mergeTree.insertSegments(
                0,
                [TextSegment.make("2")],
                1,
                remoteClientId,
                2,
                undefined,
            );
            mergeTree.insertSegments(
                0,
                [TextSegment.make("3")],
                2,
                localClientId,
                3,
                undefined,
            );
            mergeTree.insertSegments(
                0,
                [TextSegment.make("4")],
                3,
                remoteClientId,
                4,
                undefined,
            );

            validatePartialLengths(localClientId, 4, 16);
            validatePartialLengths(remoteClientId, 4, 16);
        });
    });
});
