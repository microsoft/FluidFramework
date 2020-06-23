/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { KafkaMessageFactory, TestConsumer, TestKafka } from "@fluidframework/server-test-utils";
import assert from "assert";
import { Provider } from "nconf";
import { Partition } from "../../kafka-service/partition";
import { TestPartitionLambdaFactory } from "./testPartitionLambdaFactory";

/**
 * Helper function to wrap partition close testing
 */
function verifyClose(
    partition: Partition,
    expectedError: string | boolean = true,
    expectedRestart: boolean = true): Promise<void> {

    return new Promise<void>((resolve, reject) => {
        partition.on("error", (error, restart) => {
            // Clients can either send an explicit value for the error or a boolean indicating whether
            // or not there should have been an error
            if (typeof (expectedError) === "boolean") {
                assert(expectedError ? error : !error);
            } else {
                assert.equal(error, expectedError);
            }

            assert.equal(restart, expectedRestart);
            resolve();
        });
    });
}

describe("kafka-service", () => {
    describe("Partition", () => {
        let testConsumer: TestConsumer;
        let testConfig: Provider;
        let kafkaMessageFactory: KafkaMessageFactory;
        let testFactory: TestPartitionLambdaFactory;

        beforeEach(() => {
            const testKafka = new TestKafka();
            testConsumer = testKafka.createConsumer();
            testConfig = (new Provider({})).defaults({}).use("memory");
            testFactory = new TestPartitionLambdaFactory();
            kafkaMessageFactory = new KafkaMessageFactory();
        });

        describe(".stop", () => {
            it("Should stop message processing", async () => {
                const testPartition = new Partition(0, 0, testFactory, testConsumer, testConfig);
                await testPartition.drain();
                testPartition.close();
            });

            it("Should process all pending messages prior to stopping", async () => {
                const testPartition = new Partition(0, 0, testFactory, testConsumer, testConfig);
                const messageCount = 10;
                for (let i = 0; i < messageCount; i++) {
                    testPartition.process(kafkaMessageFactory.sequenceMessage({}, "test"));
                }
                await testPartition.drain();
                testPartition.close();

                assert.equal(messageCount, testFactory.handleCount);
            });

            it("Should emit an error event with restart true if cannot create lambda", async () => {
                testFactory.setFailCreate(true);
                return new Promise<void>((resolve, reject) => {
                    const testPartition = new Partition(0, 0, testFactory, testConsumer, testConfig);
                    testPartition.on("error", (error, restart) => {
                        assert(error);
                        assert(restart);
                        resolve();
                    });
                });
            });

            it("Should emit the close event with restart true if handler throws", async () => {
                testFactory.setThrowHandler(true);
                const testPartition = new Partition(0, 0, testFactory, testConsumer, testConfig);
                const verifyP = verifyClose(testPartition);

                // Send a message to trigger the failure
                testPartition.process(kafkaMessageFactory.sequenceMessage({}, "test"));

                await verifyP;
            });

            it("Should emit the close event when the lambda closes the context", async () => {
                const closeError = "Test close";
                const closeRestart = true;

                const testPartition = new Partition(0, 0, testFactory, testConsumer, testConfig);
                const verifyP = verifyClose(testPartition, closeError, closeRestart);

                // Send off a sequence of messages
                const messageCount = 10;
                for (let i = 0; i < messageCount; i++) {
                    testPartition.process(kafkaMessageFactory.sequenceMessage({}, "test"));
                }
                // And then signal to close the lambda
                testFactory.closeLambdas(closeError, closeRestart);

                await verifyP;
            });

            it("Should emit the close event after a checkpoint write failure", async () => {
                testConsumer.setFailOnCommit(true);
                const testPartition = new Partition(0, 0, testFactory, testConsumer, testConfig);
                const verifyP = verifyClose(testPartition);

                testPartition.process(kafkaMessageFactory.sequenceMessage({}, "test"));

                await verifyP;
            });
        });
    });
});
