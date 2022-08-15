/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { UnassignedSequenceNumber } from "../constants";
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
            // this condition does not account for un-acked changes
            if (
                segment.isLeaf()
                && !(segment.removedSeq !== undefined && segment.removedSeq >= seq)
                && segment.localRemovedSeq === undefined
                && (segment.seq === undefined || segment.seq <= seq)
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
        expectedValues?: [{ seq: number; len: number; }],
        mergeBlock = mergeTree.root,
    ): void {
        for (let i = mergeTree.collabWindow.minSeq + 1; i <= mergeTree.collabWindow.currentSeq; i++) {
            const { partialLen, actualLen } = getPartialLengths(clientId, i, mergeBlock);

            assert.equal(partialLen, actualLen);
        }

        if (!expectedValues) {
            return;
        }

        for (const { seq, len } of expectedValues) {
            const { partialLen, actualLen } = getPartialLengths(clientId, seq, mergeBlock);

            assert.equal(partialLen, len);
            assert.equal(actualLen, len);
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

    afterEach(() => {
        PartialSequenceLengths.options.verify = false;
    });

    it("passes with no additional ops", () => {
        validatePartialLengths(localClientId, [{ seq: 0, len: 12 }]);
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

            validatePartialLengths(localClientId, [{ seq: 1, len: 17 }]);
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

            validatePartialLengths(remoteClientId, [{ seq: 1, len: 17 }]);
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

            validatePartialLengths(localClientId, [{ seq: 1, len: 17 }]);
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

            validatePartialLengths(remoteClientId, [{ seq: 1, len: 17 }]);
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

            validatePartialLengths(localClientId, [{ seq: 0, len: 0 }]);
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

            validatePartialLengths(remoteClientId, [{ seq: 1, len: 0 }]);
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

            validatePartialLengths(localClientId, [{ seq: 1, len: 0 }]);
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

            validatePartialLengths(remoteClientId, [{ seq: 0, len: 0 }]);
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

            validatePartialLengths(localClientId, [{ seq: 4, len: 16 }]);
            validatePartialLengths(remoteClientId, [{ seq: 4, len: 16 }]);
        });

        it("is correct for different heights", () => {
            for (let i = 0; i < 100; i++) {
                insertText(
                    mergeTree,
                    0,
                    i,
                    localClientId,
                    i + 1,
                    "a",
                    undefined,
                    { op: { type: MergeTreeDeltaType.INSERT } },
                );

                validatePartialLengths(localClientId, [{ seq: i + 1, len: i + 13 }]);
                validatePartialLengths(remoteClientId, [{ seq: i + 1, len: i + 13 }]);
            }

            validatePartialLengths(localClientId, [{ seq: 100, len: 112 }]);
            validatePartialLengths(remoteClientId, [{ seq: 100, len: 112 }]);
        });
    });

    describe("concurrent, overlapping deletes", () => {
        it("concurrent remote changes are visible to local", () => {
            mergeTree.markRangeRemoved(
                0,
                10,
                0,
                remoteClientId,
                1,
                false,
                undefined as any,
            );
            mergeTree.markRangeRemoved(
                0,
                10,
                0,
                remoteClientId + 1,
                2,
                false,
                undefined as any,
            );

            validatePartialLengths(localClientId, [{ seq: 1, len: 2 }]);
        });
        it("concurrent local and remote changes are visible", () => {
            mergeTree.markRangeRemoved(
                0,
                10,
                0,
                localClientId,
                1,
                false,
                undefined as any,
            );
            mergeTree.markRangeRemoved(
                0,
                10,
                0,
                remoteClientId,
                2,
                false,
                undefined as any,
            );

            validatePartialLengths(localClientId, [{ seq: 0, len: 2 }]);
            validatePartialLengths(remoteClientId, [{ seq: 0, len: 2 }]);
        });
        it("concurrent remote and unsequenced local changes are visible", () => {
            mergeTree.markRangeRemoved(
                0,
                10,
                0,
                localClientId,
                UnassignedSequenceNumber,
                false,
                undefined as any,
            );
            mergeTree.markRangeRemoved(
                0,
                10,
                0,
                remoteClientId,
                2,
                false,
                undefined as any,
            );

            validatePartialLengths(localClientId, [{ seq: 0, len: 2 }]);
            validatePartialLengths(remoteClientId, [{ seq: 0, len: 2 }]);
        });
    });
});
