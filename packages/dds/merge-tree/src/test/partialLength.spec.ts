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
import { insertSegments, insertText, markRangeRemoved } from "./testUtils";

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
        insertSegments({
            mergeTree,
            pos: 0,
            segments: [TextSegment.make("hello world!")],
            refSeq: 0,
            clientId: localClientId,
            seq: 0,
            opArgs: undefined,
        });

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
            insertText({
                mergeTree,
                pos: 0,
                refSeq: 0,
                clientId: localClientId,
                seq: 1,
                text: "more ",
                props: undefined,
                opArgs: { op: { type: MergeTreeDeltaType.INSERT } },
            });

            validatePartialLengths(localClientId, [{ seq: 1, len: 17 }]);
        });
        it("includes length of local insert for remote view", () => {
            insertText({
                mergeTree,
                pos: 0,
                refSeq: 0,
                clientId: localClientId,
                seq: 1,
                text: "more ",
                props: undefined,
                opArgs: { op: { type: MergeTreeDeltaType.INSERT } },
            });

            validatePartialLengths(remoteClientId, [{ seq: 1, len: 17 }]);
        });
        it("includes length of remote insert for local view", () => {
            insertText({
                mergeTree,
                pos: 0,
                refSeq: 0,
                clientId: remoteClientId,
                seq: 1,
                text: "more ",
                props: undefined,
                opArgs: { op: { type: MergeTreeDeltaType.INSERT } },
            });

            validatePartialLengths(localClientId, [{ seq: 1, len: 17 }]);
        });
        it("includes length of remote insert for remote view", () => {
            insertText({
                mergeTree,
                pos: 0,
                refSeq: 0,
                clientId: remoteClientId,
                seq: 1,
                text: "more ",
                props: undefined,
                opArgs: { op: { type: MergeTreeDeltaType.INSERT } },
            });

            validatePartialLengths(remoteClientId, [{ seq: 1, len: 17 }]);
        });
    });

    describe("a single removed segment", () => {
        it("includes result of local delete for local view", () => {
            markRangeRemoved({
                mergeTree,
                start: 0,
                end: 12,
                refSeq: 0,
                clientId: localClientId,
                seq: 1,
                overwrite: false,
                opArgs: undefined as any,
            });

            validatePartialLengths(localClientId, [{ seq: 0, len: 0 }]);
        });
        it("includes result of local delete for remote view", () => {
            markRangeRemoved({
                mergeTree,
                start: 0,
                end: 12,
                refSeq: 0,
                clientId: localClientId,
                seq: 1,
                overwrite: false,
                opArgs: undefined as any,
            });

            validatePartialLengths(remoteClientId, [{ seq: 1, len: 0 }]);
        });
        it("includes result of remote delete for local view", () => {
            markRangeRemoved({
                mergeTree,
                start: 0,
                end: 12,
                refSeq: 0,
                clientId: remoteClientId,
                seq: 1,
                overwrite: false,
                opArgs: undefined as any,
            });

            validatePartialLengths(localClientId, [{ seq: 1, len: 0 }]);
        });
        it("includes result of remote delete for remote view", () => {
            markRangeRemoved({
                mergeTree,
                start: 0,
                end: 12,
                refSeq: 0,
                clientId: remoteClientId,
                seq: 1,
                overwrite: false,
                opArgs: undefined as any,
            });

            validatePartialLengths(remoteClientId, [{ seq: 0, len: 0 }]);
        });
    });

    describe("aggregation", () => {
        it("includes lengths from multiple permutations in single tree", () => {
            insertSegments({
                mergeTree,
                pos: 0,
                segments: [TextSegment.make("1")],
                refSeq: 0,
                clientId: localClientId,
                seq: 1,
                opArgs: undefined,
            });
            insertSegments({
                mergeTree,
                pos: 0,
                segments: [TextSegment.make("2")],
                refSeq: 1,
                clientId: remoteClientId,
                seq: 2,
                opArgs: undefined,
            });
            insertSegments({
                mergeTree,
                pos: 0,
                segments: [TextSegment.make("3")],
                refSeq: 2,
                clientId: localClientId,
                seq: 3,
                opArgs: undefined,
            });
            insertSegments({
                mergeTree,
                pos: 0,
                segments: [TextSegment.make("4")],
                refSeq: 3,
                clientId: remoteClientId,
                seq: 4,
                opArgs: undefined,
            });

            validatePartialLengths(localClientId, [{ seq: 4, len: 16 }]);
            validatePartialLengths(remoteClientId, [{ seq: 4, len: 16 }]);
        });

        it("is correct for different heights", () => {
            for (let i = 0; i < 100; i++) {
                insertText({
                    mergeTree,
                    pos: 0,
                    refSeq: i,
                    clientId: localClientId,
                    seq: i + 1,
                    text: "a",
                    props: undefined,
                    opArgs: { op: { type: MergeTreeDeltaType.INSERT } },
                });

                validatePartialLengths(localClientId, [{ seq: i + 1, len: i + 13 }]);
                validatePartialLengths(remoteClientId, [{ seq: i + 1, len: i + 13 }]);
            }

            validatePartialLengths(localClientId, [{ seq: 100, len: 112 }]);
            validatePartialLengths(remoteClientId, [{ seq: 100, len: 112 }]);
        });
    });

    describe("concurrent, overlapping deletes", () => {
        it("concurrent remote changes are visible to local", () => {
            markRangeRemoved({
                mergeTree,
                start: 0,
                end: 10,
                refSeq: 0,
                clientId: remoteClientId,
                seq: 1,
                overwrite: false,
                opArgs: undefined as any,
            });
            markRangeRemoved({
                mergeTree,
                start: 0,
                end: 10,
                refSeq: 0,
                clientId: remoteClientId + 1,
                seq: 2,
                overwrite: false,
                opArgs: undefined as any,
            });

            validatePartialLengths(localClientId, [{ seq: 1, len: 2 }]);
        });
        it("concurrent local and remote changes are visible", () => {
            markRangeRemoved({
                mergeTree,
                start: 0,
                end: 10,
                refSeq: 0,
                clientId: localClientId,
                seq: 1,
                overwrite: false,
                opArgs: undefined as any,
            });
            markRangeRemoved({
                mergeTree,
                start: 0,
                end: 10,
                refSeq: 0,
                clientId: remoteClientId,
                seq: 2,
                overwrite: false,
                opArgs: undefined as any,
            });

            validatePartialLengths(localClientId, [{ seq: 0, len: 2 }]);
            validatePartialLengths(remoteClientId, [{ seq: 0, len: 2 }]);
        });
        it("concurrent remote and unsequenced local changes are visible", () => {
            markRangeRemoved({
                mergeTree,
                start: 0,
                end: 10,
                refSeq: 0,
                clientId: localClientId,
                seq: UnassignedSequenceNumber,
                overwrite: false,
                opArgs: undefined as any,
            });
            markRangeRemoved({
                mergeTree,
                start: 0,
                end: 10,
                refSeq: 0,
                clientId: remoteClientId,
                seq: 2,
                overwrite: false,
                opArgs: undefined as any,
            });

            validatePartialLengths(localClientId, [{ seq: 0, len: 2 }]);
            validatePartialLengths(remoteClientId, [{ seq: 0, len: 2 }]);
        });
    });
});
