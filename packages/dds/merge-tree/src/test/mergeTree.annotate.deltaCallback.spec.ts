/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { MergeTree } from "../mergeTree";
import { MergeTreeDeltaType } from "../ops";
import { MergeTreeMaintenanceType } from "../mergeTreeDeltaCallback";
import { LocalClientId, UnassignedSequenceNumber, UniversalSequenceNumber } from "../constants";
import { TextSegment } from "../textSegment";
import { countOperations, insertText } from "./testUtils";

describe("MergeTree", () => {
    let mergeTree: MergeTree;
    const localClientId = 17;
    let currentSequenceNumber: number;
    beforeEach(() => {
        mergeTree = new MergeTree();
        mergeTree.insertSegments(
            0,
            [TextSegment.make("hello world")],
            UniversalSequenceNumber,
            LocalClientId,
            UniversalSequenceNumber,
            undefined);

        currentSequenceNumber = 0;
        mergeTree.startCollaboration(
            localClientId,
            /* minSeq: */ currentSequenceNumber,
            /* currentSeq: */ currentSequenceNumber);
    });

    describe("annotateRange", () => {
        it("Event on annotation", () => {
            const count = countOperations(mergeTree);

            mergeTree.annotateRange(
                4,
                6,
                {
                    foo: "bar",
                },
                undefined,
                currentSequenceNumber,
                localClientId,
                UnassignedSequenceNumber,
                undefined as any);

            assert.deepStrictEqual(count, {
                [MergeTreeDeltaType.ANNOTATE]: 1,
                [MergeTreeMaintenanceType.SPLIT]: 2,
            });
        });

        it("No event on annotation of empty range", () => {
            const count = countOperations(mergeTree);
            mergeTree.annotateRange(
                3,
                3,
                {
                    foo: "bar",
                },
                undefined,
                currentSequenceNumber,
                localClientId,
                ++currentSequenceNumber,
                undefined as any);

            assert.deepStrictEqual(count, {
                [MergeTreeMaintenanceType.SPLIT]: 1,
            });
        });

        it("Annotate over local insertion", () => {
            insertText(
                mergeTree,
                4,
                currentSequenceNumber,
                localClientId,
                UnassignedSequenceNumber,
                "a",
                undefined,
                undefined);

            const count = countOperations(mergeTree);

            mergeTree.annotateRange(
                3,
                8,
                {
                    foo: "bar",
                },
                undefined,
                currentSequenceNumber,
                localClientId,
                UnassignedSequenceNumber,
                undefined as any);

            assert.deepStrictEqual(count, {
                [MergeTreeDeltaType.ANNOTATE]: 1,
                [MergeTreeMaintenanceType.SPLIT]: 2,
            });
        });

        it("Annotate over remote insertion", () => {
            const remoteClientId: number = 35;
            let remoteSequenceNumber = currentSequenceNumber;

            insertText(
                mergeTree,
                4,
                remoteSequenceNumber,
                remoteClientId,
                ++remoteSequenceNumber,
                "a",
                undefined,
                undefined);

            const count = countOperations(mergeTree);

            mergeTree.annotateRange(
                3,
                8,
                {
                    foo: "bar",
                },
                undefined,
                currentSequenceNumber,
                localClientId,
                UnassignedSequenceNumber,
                undefined as any);

            assert.deepStrictEqual(count, {
                [MergeTreeDeltaType.ANNOTATE]: 1,
                [MergeTreeMaintenanceType.SPLIT]: 2,
            });
        });

        it("Annotate over remote deletion", () => {
            const remoteClientId: number = 35;
            let remoteSequenceNumber = currentSequenceNumber;

            mergeTree.markRangeRemoved(
                4,
                6,
                remoteSequenceNumber,
                remoteClientId,
                ++remoteSequenceNumber,
                false,
                undefined as any);

            const count = countOperations(mergeTree);

            mergeTree.annotateRange(
                3,
                8,
                {
                    foo: "bar",
                },
                undefined,
                currentSequenceNumber,
                localClientId,
                UnassignedSequenceNumber,
                undefined as any);

            assert.deepStrictEqual(count, {
                [MergeTreeDeltaType.ANNOTATE]: 1,
                [MergeTreeMaintenanceType.SPLIT]: 2,
            });
        });

        it("Remote annotate within local deletion", () => {
            const remoteClientId: number = 35;
            let remoteSequenceNumber = currentSequenceNumber;

            mergeTree.markRangeRemoved(
                3,
                8,
                currentSequenceNumber,
                localClientId,
                UnassignedSequenceNumber,
                false,
                undefined as any);

            const count = countOperations(mergeTree);

            mergeTree.annotateRange(
                4,
                6,
                {
                    foo: "bar",
                },
                undefined,
                remoteSequenceNumber,
                remoteClientId,
                ++remoteSequenceNumber,
                undefined as any);

            assert.deepStrictEqual(count, {
                [MergeTreeDeltaType.ANNOTATE]: 1,
                [MergeTreeMaintenanceType.SPLIT]: 2,
            });
        });
    });
});
