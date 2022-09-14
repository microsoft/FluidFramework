/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UnassignedSequenceNumber } from "../constants";
import { MergeTree } from "../mergeTree";
import { MergeTreeDeltaType } from "../ops";
import { PartialSequenceLengths } from "../partialLengths";
import { TextSegment } from "../textSegment";
import { insertText, validatePartialLengths } from "./testUtils";

describe("partial lengths", () => {
    let mergeTree: MergeTree;
    const localClientId = 17;
    const remoteClientId = 18;
    const refSeq = 0;

    beforeEach(() => {
        PartialSequenceLengths.options.verify = true;
        mergeTree = new MergeTree();
        mergeTree.insertSegments(
            0,
            [TextSegment.make("hello world!")],
            refSeq,
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
        validatePartialLengths(localClientId, mergeTree, [{ seq: refSeq, len: 12 }]);
    });

    describe("a single inserted element", () => {
        it("includes length of local insert for local view", () => {
            insertText(
                mergeTree,
                0,
                refSeq,
                localClientId,
                refSeq + 1,
                "more ",
                undefined,
                { op: { type: MergeTreeDeltaType.INSERT } },
            );

            validatePartialLengths(localClientId, mergeTree, [{ seq: 1, len: 17 }]);
        });
        it("includes length of local insert for remote view", () => {
            insertText(
                mergeTree,
                0,
                refSeq,
                localClientId,
                refSeq + 1,
                "more ",
                undefined,
                { op: { type: MergeTreeDeltaType.INSERT } },
            );

            validatePartialLengths(remoteClientId, mergeTree, [{ seq: 1, len: 17 }]);
        });
        it("includes length of remote insert for local view", () => {
            insertText(
                mergeTree,
                0,
                refSeq,
                remoteClientId,
                refSeq + 1,
                "more ",
                undefined,
                { op: { type: MergeTreeDeltaType.INSERT } },
            );

            validatePartialLengths(localClientId, mergeTree, [{ seq: 1, len: 17 }]);
        });
        it("includes length of remote insert for remote view", () => {
            insertText(
                mergeTree,
                0,
                refSeq,
                remoteClientId,
                refSeq + 1,
                "more ",
                undefined,
                { op: { type: MergeTreeDeltaType.INSERT } },
            );

            validatePartialLengths(remoteClientId, mergeTree, [{ seq: 1, len: 17 }]);
        });
    });

    describe("a single removed segment", () => {
        it("includes result of local delete for local view", () => {
            mergeTree.markRangeRemoved(
                0,
                12,
                refSeq,
                localClientId,
                refSeq + 1,
                false,
                undefined as any);

            validatePartialLengths(localClientId, mergeTree, [{ seq: 1, len: 0 }]);
        });
        it("includes result of local delete for remote view", () => {
            mergeTree.markRangeRemoved(
                0,
                12,
                refSeq,
                localClientId,
                refSeq + 1,
                false,
                undefined as any);

            validatePartialLengths(remoteClientId, mergeTree, [{ seq: 1, len: 0 }]);
        });
        it("includes result of remote delete for local view", () => {
            mergeTree.markRangeRemoved(
                0,
                12,
                refSeq,
                remoteClientId,
                refSeq + 1,
                false,
                undefined as any);

            validatePartialLengths(localClientId, mergeTree, [{ seq: 1, len: 0 }]);
        });
        it("includes result of remote delete for remote view", () => {
            mergeTree.markRangeRemoved(
                0,
                12,
                refSeq,
                remoteClientId,
                refSeq + 1,
                false,
                undefined as any);

            validatePartialLengths(remoteClientId, mergeTree, [{ seq: 1, len: 0 }]);
        });
    });

    describe("aggregation", () => {
        it("includes lengths from multiple permutations in single tree", () => {
            mergeTree.insertSegments(
                0,
                [TextSegment.make("1")],
                refSeq,
                localClientId,
                refSeq + 1,
                undefined,
            );
            mergeTree.insertSegments(
                0,
                [TextSegment.make("2")],
                refSeq + 1,
                remoteClientId,
                refSeq + 2,
                undefined,
            );
            mergeTree.insertSegments(
                0,
                [TextSegment.make("3")],
                refSeq + 2,
                localClientId,
                refSeq + 3,
                undefined,
            );
            mergeTree.insertSegments(
                0,
                [TextSegment.make("4")],
                refSeq + 3,
                remoteClientId,
                refSeq + 4,
                undefined,
            );

            validatePartialLengths(localClientId, mergeTree, [{ seq: 4, len: 16 }]);
            validatePartialLengths(remoteClientId, mergeTree, [{ seq: 4, len: 16 }]);
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

                validatePartialLengths(localClientId, mergeTree, [{ seq: i + 1, len: i + 13 }]);
                validatePartialLengths(remoteClientId, mergeTree, [{ seq: i + 1, len: i + 13 }]);
            }

            validatePartialLengths(localClientId, mergeTree, [{ seq: 100, len: 112 }]);
            validatePartialLengths(remoteClientId, mergeTree, [{ seq: 100, len: 112 }]);
        });
    });

    describe("concurrent, overlapping deletes", () => {
        it("concurrent remote changes are visible to local", () => {
            mergeTree.markRangeRemoved(
                0,
                10,
                refSeq,
                remoteClientId,
                refSeq + 1,
                false,
                undefined as any,
            );
            mergeTree.markRangeRemoved(
                0,
                10,
                refSeq,
                remoteClientId + 1,
                refSeq + 2,
                false,
                undefined as any,
            );

            validatePartialLengths(localClientId, mergeTree, [{ seq: 1, len: 2 }]);
        });
        it("concurrent local and remote changes are visible", () => {
            mergeTree.markRangeRemoved(
                0,
                10,
                refSeq,
                localClientId,
                refSeq + 1,
                false,
                undefined as any,
            );
            mergeTree.markRangeRemoved(
                0,
                10,
                refSeq,
                remoteClientId,
                refSeq + 2,
                false,
                undefined as any,
            );

            validatePartialLengths(localClientId, mergeTree, [{ seq: 1, len: 2 }]);
            validatePartialLengths(remoteClientId, mergeTree, [{ seq: 1, len: 2 }]);
        });
        it("concurrent remote and unsequenced local changes are visible", () => {
            mergeTree.markRangeRemoved(
                0,
                10,
                refSeq,
                localClientId,
                UnassignedSequenceNumber,
                false,
                undefined as any,
            );
            mergeTree.markRangeRemoved(
                0,
                10,
                refSeq,
                remoteClientId,
                refSeq + 1,
                false,
                undefined as any,
            );

            validatePartialLengths(localClientId, mergeTree, [{ seq: 1, len: 2 }]);
            validatePartialLengths(remoteClientId, mergeTree, [{ seq: 1, len: 2 }]);
        });
    });
});
