/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import testUtils from "@microsoft/fluid-server-test-utils";
import { CheckpointContext, ICheckpointParams } from "../../deli/checkpointContext";

describe("Routerlicious", () => {
    describe("Deli", () => {
        describe("CheckpointContext", () => {
            const testId = "test";
            const testTenant = "test";
            let testCheckpointContext: CheckpointContext;
            let testCollection: testUtils.TestCollection;
            let testContext: testUtils.TestContext;

            function createCheckpoint(logOffset: number, sequenceNumber: number): ICheckpointParams {
                return {
                    branchMap: null,
                    clients: null,
                    durableSequenceNumber: 0,
                    epoch: 0,
                    logOffset,
                    sequenceNumber,
                    term: 1,
                    queuedMessage: {
                        offset: logOffset,
                        partition: 1,
                        topic: "topic",
                        value: "",
                    },
                };
            }

            beforeEach(() => {
                testContext = new testUtils.TestContext();
                testCollection = new testUtils.TestCollection([{ documentId: testId, tenantId: testTenant }]);
                testCheckpointContext = new CheckpointContext(testTenant, testId, testCollection, testContext);
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
