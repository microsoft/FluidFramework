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

    function validatePartialLengths(
        clientId: number,
        seq: number,
        expectedLen?: number,
    ): void {
        const partialLen = mergeTree.root.partialLengths?.getPartialLength(
            seq,
            clientId,
        );

        let len = 0;

        mergeTree.walkAllSegments(mergeTree.root, (segment) => {
            if (segment.isLeaf() && !segment.removedClientIds?.length) {
                len += segment.cachedLength;
            }
            return true;
        });

        assert.equal(partialLen, len);

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
        validatePartialLengths(localClientId, 0);
    });

    describe("insert", () => {
        it("local insert, local view", () => {
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

            validatePartialLengths(localClientId, 0);
        });
        it("local insert, remote view", () => {
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

            validatePartialLengths(remoteClientId, 1);
        });
        it("remote insert, local view", () => {
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

            validatePartialLengths(localClientId, 1);
        });
        it("remote insert, remote view", () => {
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

            validatePartialLengths(remoteClientId, 0);
        });
    });

    describe("delete", () => {
        it("local delete, local view", () => {
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
        it("local delete, remote view", () => {
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
        it("remote delete, local view", () => {
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
        it("remote delete, remote view", () => {
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
});
