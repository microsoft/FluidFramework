/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { TestConsumer, TestKafka } from "@prague/test-utils";
import * as assert from "assert";
import { CheckpointManager } from "../../kafka-service/checkpointManager";

describe("kafka-service", () => {
    describe("CheckpointManager", () => {
        const testPartition = 0;
        let checkpointManager: CheckpointManager;
        let testConsumer: TestConsumer;

        beforeEach(() => {
            const testKafka = new TestKafka();
            testConsumer = testKafka.createConsumer();
            checkpointManager = new CheckpointManager(testPartition, testConsumer);
        });

        describe(".checkpoint", () => {
            /**
             * Helper function that invokes a checkpoint assuming it will fail
             */
            async function verifyCheckpointError(offset: number) {
                await checkpointManager.checkpoint(offset).then(
                    () => {
                        assert.ok(false, "Should have resulted in rejection");
                    },
                    (error) => {
                        assert.ok(true);
                    });
            }

            it("Should be able to checkpoint at the desired position", async () => {
                checkpointManager.checkpoint(10);
                await testConsumer.waitForOffset(10);
            });

            it("Should be able to checkpoint at multiple offsets", async () => {
                checkpointManager.checkpoint(10);
                checkpointManager.checkpoint(20);
                checkpointManager.checkpoint(30);
                await testConsumer.waitForOffset(30);
            });

            it("Should resolve to error on commit error", async () => {
                await checkpointManager.checkpoint(10);
                testConsumer.setFailOnCommit(true);
                await verifyCheckpointError(20);
            });

            it("Should always return an error once an error has occurred", async () => {
                await checkpointManager.checkpoint(10);
                testConsumer.setFailOnCommit(true);
                // Purposefully don't await the first call so we can queue a second checkpoint that also
                // will be marked as failed
                verifyCheckpointError(20);
                await verifyCheckpointError(30);
                await verifyCheckpointError(40);
            });
        });

        describe(".flush", () => {
            it("Should flush all pending offset writes", async () => {
                checkpointManager.checkpoint(10);
                checkpointManager.checkpoint(20);
                checkpointManager.checkpoint(30);
                await checkpointManager.flush();
                assert.equal(30, testConsumer.getOffset());
            });
        });
    });
});
