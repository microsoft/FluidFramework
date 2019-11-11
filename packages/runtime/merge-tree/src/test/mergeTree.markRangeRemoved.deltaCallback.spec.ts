/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { MergeTree, MergeTreeDeltaType, MergeTreeMaintenanceType, TextSegment } from "../";
import { LocalClientId, UnassignedSequenceNumber, UniversalSequenceNumber } from "../constants";
import { countOperations } from "./testUtils";

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

    describe("markRangeRemoved", () => {
        it("Event on Removal", () => {
            const count = countOperations(mergeTree);

            mergeTree.markRangeRemoved(
                4,
                6,
                currentSequenceNumber,
                localClientId,
                UnassignedSequenceNumber,
                false,
                undefined);

            assert.deepStrictEqual(count, {
                [MergeTreeDeltaType.REMOVE]: 1,
                [MergeTreeMaintenanceType.SPLIT]: 2,
            });
        });

        it("Remote Before Local", () => {
            const remoteClientId: number = 35;
            let remoteSequenceNumber = currentSequenceNumber;

            mergeTree.markRangeRemoved(
                4,
                6,
                remoteSequenceNumber,
                remoteClientId,
                ++remoteSequenceNumber,
                false,
                undefined);

            const count = countOperations(mergeTree);

            mergeTree.markRangeRemoved(
                3,
                5,
                currentSequenceNumber,
                localClientId,
                UnassignedSequenceNumber,
                false,
                undefined);

            assert.deepStrictEqual(count, {
                [MergeTreeDeltaType.REMOVE]: 1,
                [MergeTreeMaintenanceType.SPLIT]: 2,
            });
        });

        it("Local Before Remote", () => {
            const remoteClientId: number = 35;
            let remoteSequenceNumber = currentSequenceNumber;

            mergeTree.markRangeRemoved(
                4,
                6,
                currentSequenceNumber,
                localClientId,
                UnassignedSequenceNumber,
                false,
                undefined);

            const count = countOperations(mergeTree);

            mergeTree.markRangeRemoved(
                3,
                5,
                remoteSequenceNumber,
                remoteClientId,
                ++remoteSequenceNumber,
                false,
                undefined);

            assert.deepStrictEqual(count, {
                [MergeTreeDeltaType.REMOVE]: 1,
                [MergeTreeMaintenanceType.SPLIT]: 2,
            });
        });
    });
});
