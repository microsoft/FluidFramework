/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { defaultHash } from "@fluidframework/server-services-client";
import * as testUtils from "@fluidframework/server-test-utils";
import { CheckpointContext } from "../../deli/checkpointContext";
import {
    createDeliCheckpointManagerFromCollection,
    DeliCheckpointReason,
    ICheckpointParams,
} from "../../deli/checkpointManager";

describe("Routerlicious", () => {
    describe("Deli", () => {
        describe("CheckpointContext", () => {
            const testId = "test";
            const testTenant = "test";
            let testCheckpointContext: CheckpointContext;
            let testCollection: testUtils.TestCollection;
            let testContext: testUtils.TestContext;

            function createCheckpoint(logOffset: number, sequenceNumber: number): ICheckpointParams {
                const queuedMessage = {
                    offset: logOffset,
                    partition: 1,
                    topic: "topic",
                    value: "",
                };

                return {
                    reason: DeliCheckpointReason.EveryMessage,
                    deliState: {
                        clients: undefined,
                        durableSequenceNumber: 0,
                        epoch: 0,
                        expHash1: defaultHash,
                        logOffset,
                        sequenceNumber,
                        signalClientConnectionNumber: 0,
                        term: 1,
                        lastSentMSN: 0,
                        nackMessages: undefined,
                        successfullyStartedLambdas: [],
                    },
                    deliCheckpointMessage: queuedMessage,
                    kafkaCheckpointMessage: queuedMessage,
                };
            }

            beforeEach(() => {
                testContext = new testUtils.TestContext();
                testCollection = new testUtils.TestCollection([{ documentId: testId, tenantId: testTenant }]);

                const checkpointManager = createDeliCheckpointManagerFromCollection(testTenant, testId, testCollection);
                testCheckpointContext = new CheckpointContext(testTenant, testId, checkpointManager, testContext);
            });

            describe(".checkpoint", () => {
                it("Should be able to submit a new checkpoint", async () => {
                    testCheckpointContext.checkpoint(createCheckpoint(0, 0));
                    await testContext.waitForOffset(0);
                });

                it("Should be able to submit multiple checkpoints", async () => {
                    let i;
                    for (i = 0; i < 10; i++) {
                        testCheckpointContext.checkpoint(createCheckpoint(i, i));
                    }
                    await testContext.waitForOffset(i - 1);
                });
            });
        });
    });
});
