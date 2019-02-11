import * as assert from "assert";
import {
    MergeTree,
    ReferenceType,
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

    describe("insertText", () => {
        it("Insert starting text", () => {
            let eventCalled: number = 0;

            mergeTree.mergeTreeDeltaCallback =
                (opArgs, deltaArgs) => {
                    eventCalled++;
                };

            mergeTree.insertText(
                0,
                currentSequenceNumber,
                localClientId,
                UnassignedSequenceNumber,
                "more ",
                undefined,
                undefined);

            assert.equal(eventCalled, 1);
        });

        it("Insert ending text", () => {
            const textLength = mergeTree.getLength(currentSequenceNumber, localClientId);
            let eventCalled: number = 0;

            mergeTree.mergeTreeDeltaCallback =
                (opArgs, deltaArgs) => {
                    eventCalled++;
                };

            mergeTree.insertText(
                textLength,
                currentSequenceNumber,
                localClientId,
                UnassignedSequenceNumber,
                "more ",
                undefined,
                undefined);

            assert.equal(eventCalled, 1);
        });

        it("Insert middle text", () => {
            let eventCalled: number = 0;

            mergeTree.mergeTreeDeltaCallback =
                (opArgs, deltaArgs) => {
                    eventCalled++;
                };

            mergeTree.insertText(
                4,
                currentSequenceNumber,
                localClientId,
                UnassignedSequenceNumber,
                "more ",
                undefined,
                undefined);

            assert.equal(eventCalled, 1);
        });

        it("Insert text remote", () => {
            let eventCalled: number = 0;
            const remoteClientId: number = 35;
            let remoteSequenceNumber = currentSequenceNumber;

            mergeTree.mergeTreeDeltaCallback =
                (opArgs, deltaArgs) => {
                    eventCalled++;
                };

            mergeTree.insertText(
                0,
                currentSequenceNumber,
                remoteClientId,
                ++remoteSequenceNumber,
                "more ",
                undefined,
                undefined);

            assert.equal(eventCalled, 1);
        });
    });
    describe("insertMarker", () => {
        it("Insert marker", () => {
            let eventCalled: number = 0;

            mergeTree.mergeTreeDeltaCallback =
                (opArgs, deltaArgs) => {
                    eventCalled++;
                };

            mergeTree.insertMarker(
                4,
                currentSequenceNumber,
                localClientId,
                UnassignedSequenceNumber,
                ReferenceType.Simple,
                undefined,
                undefined);

            assert.equal(eventCalled, 1);
        });
    });
});
