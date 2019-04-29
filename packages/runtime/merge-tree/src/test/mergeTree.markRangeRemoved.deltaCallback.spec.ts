import * as assert from "assert";
import {
    MergeTree,
    UnassignedSequenceNumber,
} from "..";

describe("MergeTree", () => {
    let mergeTree: MergeTree;
    const localClientId = 17;
    let currentSequenceNumber: number;
    const branchId = 0;
    beforeEach(() => {
        mergeTree = new MergeTree("hello world!");
        currentSequenceNumber = 0;
        mergeTree.startCollaboration(
            localClientId,
            currentSequenceNumber,
            branchId);
    });

    describe("markRangeRemoved", () => {
        it("Event on Removal", () => {
            let eventCalled: number = 0;

            mergeTree.mergeTreeDeltaCallback =
                (opArgs, deltaArgs) => {
                    eventCalled++;
                };

            mergeTree.markRangeRemoved(
                4,
                6,
                currentSequenceNumber,
                localClientId,
                UnassignedSequenceNumber,
                false,
                undefined);

            assert.equal(eventCalled, 1);
        });

        it("Remote Before Local", () => {
            let eventCalled: number = 0;

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

            mergeTree.mergeTreeDeltaCallback =
                (opArgs, deltaArgs) => {
                    eventCalled++;
                };

            mergeTree.markRangeRemoved(
                3,
                5,
                currentSequenceNumber,
                localClientId,
                UnassignedSequenceNumber,
                false,
                undefined);

            assert.equal(eventCalled, 1);
        });

        it("Local Before Remote", () => {
            let eventCalled: number = 0;
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

            mergeTree.mergeTreeDeltaCallback =
                (opArgs, deltaArgs) => {
                    eventCalled++;
                };

            mergeTree.markRangeRemoved(
                3,
                5,
                remoteSequenceNumber,
                remoteClientId,
                ++remoteSequenceNumber,
                false,
                undefined);

            assert.equal(eventCalled, 1);
        });
    });
});
