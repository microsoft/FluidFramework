import * as assert from "assert";
import {
    MergeTree,
    UnassignedSequenceNumber,
} from "..";
import { insertText } from "./testUtils";

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

    describe("annotateRange", () => {
        it("Event on annotation", () => {
            let eventCalled: number = 0;

            mergeTree.mergeTreeDeltaCallback =
                (opArgs, deltaArgs) => {
                    eventCalled++;
                };

            mergeTree.annotateRange(
                {
                    foo: "bar",
                },
                4,
                6,
                currentSequenceNumber,
                localClientId,
                UnassignedSequenceNumber,
                undefined,
                undefined);

            assert.equal(eventCalled, 1);
        });

        it("Annotate over local insertion", () => {
            let eventCalled: number = 0;

            insertText(
                mergeTree,
                4,
                localClientId,
                currentSequenceNumber,
                UnassignedSequenceNumber,
                "a",
                undefined,
                undefined);

            mergeTree.mergeTreeDeltaCallback =
                (opArgs, deltaArgs) => {
                    eventCalled++;
                };

            mergeTree.annotateRange(
                {
                    foo: "bar",
                },
                3,
                8,
                currentSequenceNumber,
                localClientId,
                UnassignedSequenceNumber,
                undefined,
                undefined);

            assert.equal(eventCalled, 1);
        });

        it("Annotate over remote insertion", () => {
            let eventCalled: number = 0;
            const remoteClientId: number = 35;
            let remoteSequenceNumber = currentSequenceNumber;

            insertText(
                mergeTree,
                4,
                remoteClientId,
                remoteSequenceNumber,
                ++remoteSequenceNumber,
                "a",
                undefined,
                undefined);

            mergeTree.mergeTreeDeltaCallback =
                (opArgs, deltaArgs) => {
                    eventCalled++;
                };

            mergeTree.annotateRange(
                {
                    foo: "bar",
                },
                3,
                8,
                currentSequenceNumber,
                localClientId,
                UnassignedSequenceNumber,
                undefined,
                undefined);

            assert.equal(eventCalled, 1);
        });

        it("Annotate over remote deletion", () => {
            let eventCalled: number = 0;
            const remoteClientId: number = 35;
            let remoteSequenceNumber = currentSequenceNumber;

            mergeTree.markRangeRemoved(
                4,
                6,
                remoteClientId,
                remoteSequenceNumber,
                ++remoteSequenceNumber,
                false,
                undefined);

            mergeTree.mergeTreeDeltaCallback =
                (opArgs, deltaArgs) => {
                    eventCalled++;
                };

            mergeTree.annotateRange(
                {
                    foo: "bar",
                },
                3,
                8,
                currentSequenceNumber,
                localClientId,
                UnassignedSequenceNumber,
                undefined,
                undefined);

            assert.equal(eventCalled, 1);
        });
    });
});
