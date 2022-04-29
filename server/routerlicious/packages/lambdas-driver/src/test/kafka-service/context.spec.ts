/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContextErrorData } from "@fluidframework/server-services-core";
import { DebugLogger, TestConsumer, TestKafka } from "@fluidframework/server-test-utils";
import { strict as assert } from "assert";
import { CheckpointManager } from "../../kafka-service/checkpointManager";
import { Context } from "../../kafka-service/context";

describe("kafka-service", () => {
    describe("Context", () => {
        let testConsumer: TestConsumer;
        let testContext: Context;
        let checkpointManager: CheckpointManager;

        beforeEach(() => {
            const testKafka = new TestKafka();
            testConsumer = testKafka.createConsumer();
            checkpointManager = new CheckpointManager(0, testConsumer);
            testContext = new Context(checkpointManager, DebugLogger.create("fluid-server:TestContext"));
        });

        describe(".checkpoint", () => {
            it("Should be able to checkpoint at a given offset", async () => {
                testContext.checkpoint(TestKafka.createdQueuedMessage(10));
                testContext.checkpoint(TestKafka.createdQueuedMessage(30));
                await testConsumer.waitForOffset(30);
            });
        });

        describe(".error", () => {
            it("Should emit an error event", async () => {
                const testError = null;
                const testRestart = true;

                const errorP = testContext.addListener("error", (error, errorData: IContextErrorData) => {
                    assert.equal(error, testError);
                    assert.equal(errorData.restart, testRestart);
                });
                testContext.error(testError, { restart: testRestart });

                await errorP;
            });
        });
    });
});
