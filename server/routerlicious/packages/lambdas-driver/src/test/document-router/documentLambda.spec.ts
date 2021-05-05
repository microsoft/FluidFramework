/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    DefaultServiceConfiguration,
    IContextErrorData,
    IPartitionConfig,
    IPartitionLambda,
    IPartitionLambdaFactory,
    LambdaCloseType,
} from "@fluidframework/server-services-core";
import {
    KafkaMessageFactory,
    MessageFactory,
    TestContext,
} from "@fluidframework/server-test-utils";
import { strict as assert } from "assert";
import { DocumentLambdaFactory } from "../../document-router/lambdaFactory";
import { createTestModule, ITestLambdaModule } from "./testDocumentLambda";

describe("document-router", () => {
    describe("DocumentLambda", () => {
        let testModule: ITestLambdaModule;
        let factory: IPartitionLambdaFactory<IPartitionConfig>;
        let lambda: IPartitionLambda;
        let context: TestContext;
        let defaultMessageFactory: MessageFactory;
        let kafkaMessageFactory: KafkaMessageFactory;

        beforeEach(async () => {
            testModule = createTestModule();
            defaultMessageFactory = new MessageFactory("test", "test");
            kafkaMessageFactory = new KafkaMessageFactory();
            factory = new DocumentLambdaFactory(testModule.create(), DefaultServiceConfiguration.documentLambda);
            context = new TestContext();
            lambda = await factory.create({ leaderEpoch: 0 }, context);
        });

        afterEach(async () => {
            await lambda.close(LambdaCloseType.Stop);
            await factory.dispose();
        });

        describe(".handler()", () => {
            it("Should be able to process a document message from a single document", async () => {
                const message = defaultMessageFactory.createSequencedOperation();
                const kafkaMessage = kafkaMessageFactory.sequenceMessage(message, "test");
                lambda.handler(kafkaMessage);

                // Should have created a single factory that itself created a single lambda
                assert.equal(testModule.factories.length, 1);
                assert.equal(testModule.factories[0].lambdas.length, 1);
            });

            it("Should be able to process non-document messages", async () => {
                const totalMessages = 10;

                for (let i = 0; i < totalMessages; i++) {
                    const kafkaMessage = kafkaMessageFactory.sequenceMessage({}, "test");
                    lambda.handler(kafkaMessage);
                }

                await context.waitForOffset(kafkaMessageFactory.getHeadOffset("test"));
                assert.equal(context.offset, kafkaMessageFactory.getHeadOffset("test"));
            });

            it("Should be able to process a document message from multiple documents", async () => {
                const totalDocuments = 4;
                const messagesPerDocument = 10;

                const messageFactories: MessageFactory[] = [];
                for (let i = 0; i < totalDocuments; i++) {
                    messageFactories.push(new MessageFactory(`test${i}`, `client${i}`));
                }

                for (let i = 0; i < messagesPerDocument; i++) {
                    for (const messageFactory of messageFactories) {
                        const message = messageFactory.createSequencedOperation();
                        const kafkaMessage = kafkaMessageFactory.sequenceMessage(message, "test");
                        lambda.handler(kafkaMessage);
                    }
                }

                // Should have created a single factory that itself created a single lambda
                assert.equal(testModule.factories.length, 1);
                assert.equal(testModule.factories[0].lambdas.length, totalDocuments);

                // Want some ability to either close the stream or wait for a specific checkpoint
                await context.waitForOffset(kafkaMessageFactory.getHeadOffset("test"));
            });

            it("Should emit an error on lambda context error", async () => {
                const totalMessages = 10;

                for (let i = 0; i < totalMessages; i++) {
                    const message = defaultMessageFactory.create();
                    const kafkaMessage = kafkaMessageFactory.sequenceMessage(message, "test");
                    lambda.handler(kafkaMessage);
                }
                await context.waitForOffset(kafkaMessageFactory.getHeadOffset("test"));

                // Switch on the flag to fail future requests
                testModule.factories.forEach((testFactory) => testFactory.setFailHandlers(true));

                // And trigger a new message that will fail
                return new Promise<void>((resolve, reject) => {
                    context.on("error", (error, errorData: IContextErrorData) => {
                        assert.ok(error);
                        assert.ok(errorData.restart);
                        resolve();
                    });

                    // Send the message that should fail
                    const kafkaMessage = kafkaMessageFactory.sequenceMessage(defaultMessageFactory.create(), "test");
                    lambda.handler(kafkaMessage);
                });
            });

            it("Should skip future messages after lambda exception (in future will dead letter queue)", async () => {
                let contextErrored = false;

                context.on("error", () => {
                    contextErrored = true;
                });

                const totalMessages = 10;

                for (let i = 0; i < totalMessages; i++) {
                    const message = defaultMessageFactory.create();
                    const kafkaMessage = kafkaMessageFactory.sequenceMessage(message, "test");
                    lambda.handler(kafkaMessage);
                }
                await context.waitForOffset(kafkaMessageFactory.getHeadOffset("test"));

                // Switch on the flag to fail future requests
                testModule.factories.forEach((testFactory) => testFactory.setThrowExceptionInHandler(true));

                for (let i = 0; i < totalMessages; i++) {
                    const message = defaultMessageFactory.create();
                    const kafkaMessage = kafkaMessageFactory.sequenceMessage(message, "test");
                    lambda.handler(kafkaMessage);
                }
                await context.waitForOffset(kafkaMessageFactory.getHeadOffset("test"));
                assert.equal(testModule.factories[0].lambdas[0].handleCalls, totalMessages + 1);

                assert.ok(contextErrored);
            });

            it("Should emit an error on lambda creation exception", async () => {
                // And trigger a new message that will fail
                return new Promise<void>((resolve, reject) => {
                    testModule.factories[0].setFailCreateLambda(true);

                    context.on("error", (error, errorData: IContextErrorData) => {
                        assert.ok(error);
                        assert.ok(errorData.restart);
                        resolve();
                    });

                    const message = defaultMessageFactory.create();
                    const kafkaMessage = kafkaMessageFactory.sequenceMessage(message, "test");
                    lambda.handler(kafkaMessage);
                });
            });
        });
    });
});
