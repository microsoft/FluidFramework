/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { MessageType } from "@fluidframework/protocol-definitions";
import {
    DefaultServiceConfiguration,
    ICollection,
    IPartitionLambda,
    IProducer,
    ISequencedOperationMessage,
    LambdaCloseType,
    MongoManager,
    NackOperationType,
    SequencedOperationType,
} from "@fluidframework/server-services-core";
import {
    KafkaMessageFactory,
    MessageFactory,
    TestContext,
    TestDbFactory,
    TestKafka,
    TestTenantManager,
} from "@fluidframework/server-test-utils";
import { strict as assert } from "assert";
import * as _ from "lodash";
import { DeliLambdaFactory } from "../../deli/lambdaFactory";

const MinSequenceNumberWindow = 2000;

describe("Routerlicious", () => {
    describe("Deli", () => {
        describe("Lambda", () => {
            const testTenantId = "test";
            const testId = "test";
            const testClientId = "quiet-rat";
            const testData = [{ documentId: testId, tenantId: testTenantId, sequenceNumber: 0, logOffset: undefined }];

            let testCollection: ICollection<any>;
            let testTenantManager: TestTenantManager;
            let testKafka: TestKafka;
            let testForwardProducer: IProducer;
            let testReverseProducer: IProducer;
            let testContext: TestContext;
            let factory: DeliLambdaFactory;
            let lambda: IPartitionLambda;

            let messageFactory: MessageFactory;
            let kafkaMessageFactory: KafkaMessageFactory;

            /**
             * Waits for the system to quiesce
             */
            async function quiesce(): Promise<void> {
                await testContext.waitForOffset(kafkaMessageFactory.getHeadOffset(testId));
            }

            async function testNack(
                start: number,
                firstClientOpType: MessageType,
                firstClientRefSeq: number,
                secondClientOpType: MessageType,
                secondClientRefSeq: number,
                nackClientFactory: MessageFactory): Promise<number> {
                // Create the first client and send a message
                await lambda.handler(kafkaMessageFactory.sequenceMessage(messageFactory.createJoin(start), testId));
                await lambda.handler(kafkaMessageFactory.sequenceMessage(messageFactory.create(firstClientOpType, firstClientRefSeq, start), testId));

                // Create a second client and have it join
                start += MinSequenceNumberWindow;
                await lambda.handler(kafkaMessageFactory.sequenceMessage(nackClientFactory.createJoin(start), testId));
                await lambda.handler(kafkaMessageFactory.sequenceMessage(nackClientFactory.create(secondClientOpType, secondClientRefSeq, start), testId));
                await quiesce();

                return start;
            }

            beforeEach(async () => {
                const dbFactory = new TestDbFactory(_.cloneDeep({ documents: testData }));
                const mongoManager = new MongoManager(dbFactory);
                const database = await mongoManager.getDatabase();
                testCollection = database.collection("documents");

                testKafka = new TestKafka();
                testTenantManager = new TestTenantManager();
                testForwardProducer = testKafka.createProducer();
                testReverseProducer = testKafka.createProducer();
                messageFactory = new MessageFactory(testId, testClientId);
                kafkaMessageFactory = new KafkaMessageFactory("test", 1, false);
                factory = new DeliLambdaFactory(
                    mongoManager,
                    testCollection,
                    testTenantManager,
                    testForwardProducer,
                    testReverseProducer,
                    DefaultServiceConfiguration);

                testContext = new TestContext();
                lambda = await factory.create({ documentId: testId, tenantId: testTenantId, leaderEpoch: 0 }, testContext);
            });

            afterEach(async () => {
                lambda.close(LambdaCloseType.Stop);
                await factory.dispose();
            });

            describe(".handler", () => {
                it("Should nack a client that has not sent a join", async () => {
                    await lambda.handler(kafkaMessageFactory.sequenceMessage(messageFactory.create(MessageType.Operation, 10, 2000), testId));
                    await quiesce();

                    const lastMessage = testKafka.getLastMessage();
                    assert.equal(lastMessage.type, NackOperationType);
                });

                it("Should nack a client that sends an operation under the min sequence number", async () => {
                    const nackClientFactory = new MessageFactory(testId, "test2");
                    await testNack(0, MessageType.Operation, 10, MessageType.Operation, 5, nackClientFactory);
                    const lastMessage = testKafka.getLastMessage();
                    assert.equal(lastMessage.type, NackOperationType);
                });

                it("Should nack a client that sends a no-op under the min sequence number", async () => {
                    const nackClientFactory = new MessageFactory(testId, "test2");
                    await testNack(0, MessageType.Operation, 10, MessageType.NoOp, 5, nackClientFactory);
                    const lastMessage = testKafka.getLastMessage();
                    assert.equal(lastMessage.type, NackOperationType);
                });

                it("Should not nack a client that sends an operation with -1 as reference sequence number", async () => {
                    const nackClientFactory = new MessageFactory(testId, "test2");
                    await testNack(0, MessageType.Operation, 10, MessageType.Operation, -1, nackClientFactory);
                    const lastMessage = testKafka.getLastMessage();
                    assert.equal(lastMessage.type, SequencedOperationType);
                    // Reference sequence number of the new message should be equal to sequence number.
                    assert.equal(lastMessage.operation.sequenceNumber, lastMessage.operation.referenceSequenceNumber);
                });

                it("Should not nack a client that sends a no-op with -1 as reference sequence number", async () => {
                    const nackClientFactory = new MessageFactory(testId, "test2");
                    await testNack(0, MessageType.Operation, 10, MessageType.NoOp, -1, nackClientFactory);
                    const lastMessage = testKafka.getLastMessage();
                    assert.equal(lastMessage.type, SequencedOperationType);
                });

                it("Should nack all future messages from a nacked client", async () => {
                    const nackClientFactory = new MessageFactory(testId, "test2");
                    const time = await testNack(0, MessageType.Operation, 10, MessageType.Operation, 5, nackClientFactory);

                    // Then send a new message - above the MSN - that should also be nacked
                    await lambda.handler(kafkaMessageFactory.sequenceMessage(
                        nackClientFactory.create(MessageType.Operation, 15, time), testId));
                    await quiesce();

                    const lastMessage = testKafka.getLastMessage();
                    assert.equal(lastMessage.type, NackOperationType);
                });

                it("Should be able to ticket an incoming message", async () => {
                    const join = messageFactory.createJoin();
                    const message = messageFactory.create();
                    await lambda.handler(kafkaMessageFactory.sequenceMessage(join, testId));
                    await lambda.handler(kafkaMessageFactory.sequenceMessage(message, testId));
                    await quiesce();

                    const sent = testKafka.getRawMessages();
                    assert.equal(2, sent.length);
                    const sequencedMessage = sent[1].value as ISequencedOperationMessage;
                    assert.equal(sequencedMessage.documentId, testId);
                    assert.equal(sequencedMessage.type, SequencedOperationType);
                    assert.equal(sequencedMessage.operation.clientId, testClientId);
                    assert.equal(
                        sequencedMessage.operation.clientSequenceNumber,
                        message.operation.clientSequenceNumber);
                    assert.equal(sequencedMessage.operation.sequenceNumber, 2);
                });

                it("Should ticket new clients connecting above msn", async () => {
                    const secondMessageFactory = new MessageFactory(testId, "test2");

                    // Have test client create some existing messages
                    await lambda.handler(kafkaMessageFactory.sequenceMessage(messageFactory.createJoin(), testId));
                    await lambda.handler(kafkaMessageFactory.sequenceMessage(messageFactory.create(MessageType.Operation, 10, 2000), testId));
                    await lambda.handler(kafkaMessageFactory.sequenceMessage(messageFactory.create(MessageType.Operation, 20, 2100), testId));
                    await quiesce();
                    assert.equal(testKafka.getLastMessage().operation.minimumSequenceNumber, 20);

                    // And then have a new client go under the latest working set msn but above the published msn
                    await lambda.handler(
                        kafkaMessageFactory.sequenceMessage(secondMessageFactory.createJoin(2200), testId));
                    await lambda.handler(
                        kafkaMessageFactory.sequenceMessage(secondMessageFactory.create(MessageType.Operation, 25, 2200), testId));
                    await lambda.handler(kafkaMessageFactory.sequenceMessage(messageFactory.create(MessageType.Operation, 22, 2400), testId));
                    await quiesce();
                    assert.equal(testKafka.getLastMessage().operation.minimumSequenceNumber, 22);
                });

                it("Should timeout idle clients", async () => {
                    const secondMessageFactory = new MessageFactory(testId, "test2");
                    await lambda.handler(kafkaMessageFactory.sequenceMessage(messageFactory.createJoin(0), testId));
                    await lambda.handler(kafkaMessageFactory.sequenceMessage(messageFactory.create(MessageType.Operation, 10, 1), testId));
                    await lambda.handler(
                        kafkaMessageFactory.sequenceMessage(secondMessageFactory.createJoin(2), testId));
                    await lambda.handler(
                        kafkaMessageFactory.sequenceMessage(secondMessageFactory.create(MessageType.Operation, 20, 10),
                            testId));
                    await quiesce();
                    assert.equal(testKafka.getLastMessage().operation.minimumSequenceNumber, 10);

                    await lambda.handler(
                        kafkaMessageFactory.sequenceMessage(secondMessageFactory.create(MessageType.Operation, 20, 1 + DefaultServiceConfiguration.deli.clientTimeout),
                            testId));
                    await lambda.handler(kafkaMessageFactory.sequenceMessage(
                        secondMessageFactory.create(
                            MessageType.Operation,
                            20,
                            DefaultServiceConfiguration.deli.clientTimeout + 2 * MinSequenceNumberWindow),
                        testId));
                    await quiesce();
                    // assert.equal(testKafka.getLastMessage().operation.minimumSequenceNumber, 20);
                });

                it("Should remove clients after a disconnect", async () => {
                    const secondMessageFactory = new MessageFactory(testId, "test2");

                    let timeOffset = 0;

                    // Create some starter messages
                    await lambda.handler(
                        kafkaMessageFactory.sequenceMessage(messageFactory.createJoin(timeOffset), testId));
                    await quiesce();
                    assert.equal(testKafka.getLastMessage().operation.minimumSequenceNumber, 0);
                    timeOffset += 1;
                    await lambda.handler(
                        kafkaMessageFactory.sequenceMessage(secondMessageFactory.createJoin(timeOffset), testId));
                    await quiesce();
                    timeOffset += 1;
                    await lambda.handler(
                        kafkaMessageFactory.sequenceMessage(messageFactory.create(MessageType.Operation, 1, timeOffset), testId));
                    await quiesce();
                    timeOffset += MinSequenceNumberWindow;
                    await lambda.handler(
                        kafkaMessageFactory.sequenceMessage(secondMessageFactory.create(MessageType.Operation, 2, timeOffset), testId));
                    await quiesce();
                    assert.equal(testKafka.getLastMessage().operation.minimumSequenceNumber, 1);

                    // Have the first client leave and the second message queue a message to
                    // force the MSN window to move
                    timeOffset += 1;
                    await lambda.handler(
                        kafkaMessageFactory.sequenceMessage(messageFactory.createLeave(timeOffset), testId));
                    await quiesce();
                    timeOffset += MinSequenceNumberWindow;
                    await lambda.handler(
                        kafkaMessageFactory.sequenceMessage(secondMessageFactory.create(MessageType.Operation, 4, timeOffset), testId));
                    await quiesce();
                    assert.equal(testKafka.getLastMessage().operation.minimumSequenceNumber, 4);

                    // And then have the second client leave
                    timeOffset += MinSequenceNumberWindow;
                    await lambda.handler(
                        kafkaMessageFactory.sequenceMessage(secondMessageFactory.createLeave(timeOffset), testId));
                    await quiesce();
                    assert.equal(testKafka.getLastMessage().operation.minimumSequenceNumber, 7);

                    // Add in a third client to check that both clients are gone
                    const thirdMessageFactory = new MessageFactory(testId, "test3");
                    timeOffset += 1;
                    await lambda.handler(
                        kafkaMessageFactory.sequenceMessage(thirdMessageFactory.createJoin(timeOffset), testId));
                    await quiesce();
                    timeOffset += MinSequenceNumberWindow;
                    await lambda.handler(
                        kafkaMessageFactory.sequenceMessage(thirdMessageFactory.create(MessageType.Operation, 7, timeOffset), testId));
                    await quiesce();
                    assert.equal(testKafka.getLastMessage().operation.minimumSequenceNumber, 7);
                });
            });
        });
    });
});
