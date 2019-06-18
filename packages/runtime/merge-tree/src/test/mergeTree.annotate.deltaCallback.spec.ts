/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import {
    MergeTree,
    UnassignedSequenceNumber,
} from "..";
import { LocalClientId, UniversalSequenceNumber } from "../mergeTree";
import { TextSegment } from "../textSegment";
import { insertText } from "./testUtils";

describe("MergeTree", () => {
    let mergeTree: MergeTree;
    const localClientId = 17;
    let currentSequenceNumber: number;
    const branchId = 0;
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
                4,
                6,
                {
                    foo: "bar",
                },
                undefined,
                currentSequenceNumber,
                localClientId,
                UnassignedSequenceNumber,
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
                3,
                8,
                {
                    foo: "bar",
                },
                undefined,
                currentSequenceNumber,
                localClientId,
                UnassignedSequenceNumber,
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
                3,
                8,
                {
                    foo: "bar",
                },
                undefined,
                currentSequenceNumber,
                localClientId,
                UnassignedSequenceNumber,
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
                3,
                8,
                {
                    foo: "bar",
                },
                undefined,
                currentSequenceNumber,
                localClientId,
                UnassignedSequenceNumber,
                undefined);

            assert.equal(eventCalled, 1);
        });
    });
});
