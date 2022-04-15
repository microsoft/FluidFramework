/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DefaultServiceConfiguration, IPartitionLambda } from "@fluidframework/server-services-core";
import {
    IEvent,
    KafkaMessageFactory,
    MessageFactory,
    TestContext,
    TestPublisher,
} from "@fluidframework/server-test-utils";
import { strict as assert } from "assert";
import { BroadcasterLambda } from "../../broadcaster/lambda";

describe("Routerlicious", () => {
    describe("Broadcaster", () => {
        describe("Lambda", () => {
            const testTenantId = "test";
            const testDocumentId = "test";
            const testClientId = "test";

            let testPublisher: TestPublisher;
            let testContext: TestContext;
            let messageFactory: MessageFactory;
            let kafkaMessageFactory: KafkaMessageFactory;
            let lambda: IPartitionLambda;

            beforeEach(() => {
                messageFactory = new MessageFactory(testDocumentId, testClientId, testTenantId);
                kafkaMessageFactory = new KafkaMessageFactory();

                testPublisher = new TestPublisher();
                testContext = new TestContext();
                lambda = new BroadcasterLambda(testPublisher, testContext, DefaultServiceConfiguration, undefined);
            });

            function countOps(events: IEvent[]) {
                let count = 0;
                for (const event of events) {
                    count += event.args[1].length;
                }

                return count;
            }

            describe(".handler()", () => {
                it("Should broadcast incoming messages", async () => {
                    const numMessages = 10;
                    for (let i = 0; i < numMessages; i++) {
                        const message = messageFactory.createSequencedOperation();
                        lambda.handler(kafkaMessageFactory.sequenceMessage(message, testDocumentId));
                    }
                    await testContext.waitForOffset(kafkaMessageFactory.getHeadOffset(testDocumentId));

                    console.log(kafkaMessageFactory.getHeadOffset(testDocumentId));
                    assert.equal(
                        numMessages,
                        countOps(testPublisher.to(`${testTenantId}/${testDocumentId}`).getEvents("op")));
                });
            });
        });
    });
});
