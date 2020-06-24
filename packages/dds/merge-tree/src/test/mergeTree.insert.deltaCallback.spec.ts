/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { MergeTree, MergeTreeDeltaType, MergeTreeMaintenanceType, ReferenceType, TextSegment } from "../";
import { LocalClientId, UnassignedSequenceNumber, UniversalSequenceNumber } from "../constants";
import { countOperations, insertMarker, insertText } from "./testUtils";

describe("MergeTree", () => {
    let mergeTree: MergeTree;
    const localClientId = 17;
    let currentSequenceNumber: number;
    const branchId = 0;
    beforeEach(() => {
        mergeTree = new MergeTree();
        mergeTree.insertSegments(
            0,
            [TextSegment.make("hello world!")],
            UniversalSequenceNumber,
            LocalClientId,
            UniversalSequenceNumber,
            undefined);

        currentSequenceNumber = 0;
        mergeTree.startCollaboration(
            localClientId,
            /* minSeq: */ currentSequenceNumber,
            /* currentSeq: */ currentSequenceNumber,
            branchId);
    });

    describe("insertText", () => {
        it("Insert starting text", () => {
            let eventCalled: number = 0;

            mergeTree.mergeTreeDeltaCallback =
                (opArgs, deltaArgs) => {
                    eventCalled++;
                };

            insertText(
                mergeTree,
                0,
                currentSequenceNumber,
                localClientId,
                UnassignedSequenceNumber,
                "more ",
                undefined,
                { op: { type: MergeTreeDeltaType.INSERT } });

            assert.equal(eventCalled, 1);
        });

        it("Insert ending text", () => {
            const textLength = mergeTree.getLength(currentSequenceNumber, localClientId);
            let eventCalled: number = 0;

            mergeTree.mergeTreeDeltaCallback =
                (opArgs, deltaArgs) => {
                    eventCalled++;
                };

            insertText(
                mergeTree,
                textLength,
                currentSequenceNumber,
                localClientId,
                UnassignedSequenceNumber,
                "more ",
                undefined,
                { op: { type: MergeTreeDeltaType.INSERT } });

            assert.equal(eventCalled, 1);
        });

        it("Insert middle text", () => {
            const count = countOperations(mergeTree);

            insertText(
                mergeTree,
                4,
                currentSequenceNumber,
                localClientId,
                UnassignedSequenceNumber,
                "more ",
                undefined,
                { op: { type: MergeTreeDeltaType.INSERT } });

            assert.deepStrictEqual(count, {
                [MergeTreeDeltaType.INSERT]: 1,
                [MergeTreeMaintenanceType.SPLIT]: 1,
            });
        });

        it("Insert text remote", () => {
            const remoteClientId: number = 35;
            let remoteSequenceNumber = currentSequenceNumber;

            const count = countOperations(mergeTree);

            insertText(
                mergeTree,
                0,
                currentSequenceNumber,
                remoteClientId,
                ++remoteSequenceNumber,
                "more ",
                undefined,
                { op: { type: MergeTreeDeltaType.INSERT } });

            assert.deepStrictEqual(count, {
                [MergeTreeDeltaType.INSERT]: 1,
            });
        });
    });
    describe("insertMarker", () => {
        it("Insert marker", () => {
            const count = countOperations(mergeTree);

            insertMarker(
                mergeTree,
                4,
                currentSequenceNumber,
                localClientId,
                UnassignedSequenceNumber,
                ReferenceType.Simple,
                undefined,
                { op: { type: MergeTreeDeltaType.INSERT } });

            assert.deepStrictEqual(count, {
                [MergeTreeDeltaType.INSERT]: 1,
                [MergeTreeMaintenanceType.SPLIT]: 1,
            });
        });
    });
});
