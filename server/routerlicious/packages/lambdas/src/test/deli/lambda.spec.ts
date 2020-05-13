/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ICollection,
    IPartitionLambda,
    IProducer,
    ISequencedOperationMessage,
    MongoManager,
    NackOperationType,
    SequencedOperationType,
} from "@microsoft/fluid-server-services-core";
import {
    KafkaMessageFactory,
    MessageFactory,
    TestContext,
    TestDbFactory,
    TestKafka,
    TestTenantManager,
} from "@microsoft/fluid-server-test-utils";
import assert from "assert";
import * as _ from "lodash";
import * as nconf from "nconf";
import { ClientSequenceTimeout, DeliLambdaFactory } from "../../deli/lambdaFactory";

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

            async function forceNack(start: number, nackClientFactory: MessageFactory): Promise<number> {
                // Create the first client and send a message
                await lambda.handler(kafkaMessageFactory.sequenceMessage(messageFactory.createJoin(start), testId));
                await lambda.handler(kafkaMessageFactory.sequenceMessage(messageFactory.create(10, start), testId));

                // Create a second client and have it join
                start += MinSequenceNumberWindow;
                await lambda.handler(kafkaMessageFactory.sequenceMessage(nackClientFactory.createJoin(start), testId));
                await lambda.handler(kafkaMessageFactory.sequenceMessage(nackClientFactory.create(5, start), testId));
                await quiesce();

                return start;
            }

            beforeEach(async () => {
                const dbFactory = new TestDbFactory(_.cloneDeep({ documents: testData }));
                const mongoManager = new MongoManager(dbFactory);
                const database = await mongoManager.getDatabase();
                testCollection = database.collection("documents");

                testKafka =  new TestKafka();
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
                    testReverseProducer);

                testContext = new TestContext();
                const config = (new nconf.Provider({})).defaults({ documentId: testId, tenantId: testTenantId })
                    .use("memory");
                lambda = await factory.create(config, testContext);
            });

            afterEach(async () => {
                lambda.close();
                await factory.dispose();
            });

            describe(".handler", () => {
                it("Should nack a client that has not sent a join", async () => {
                    await lambda.handler(kafkaMessageFactory.sequenceMessage(messageFactory.create(10, 2000), testId));
                    await quiesce();

                    const lastMessage = testKafka.getLastMessage();
                    assert.equal(lastMessage.type, NackOperationType);
                });

                it("Should nack a client that sends a message under the min sequence number", async () => {
                    const nackClientFactory = new MessageFactory(testId, "test2");
                    await forceNack(0, nackClientFactory);
                    const lastMessage = testKafka.getLastMessage();
                    assert.equal(lastMessage.type, NackOperationType);
                });

                it("Should nack all future messages from a nacked client", async () => {
                    const nackClientFactory = new MessageFactory(testId, "test2");
                    const time = await forceNack(0, nackClientFactory);

                    // Then send a new message - above the MSN - that should also be nacked
                    await lambda.handler(kafkaMessageFactory.sequenceMessage(
                        nackClientFactory.create(15, time), testId));
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
                    await lambda.handler(kafkaMessageFactory.sequenceMessage(messageFactory.create(10, 2000), testId));
                    await lambda.handler(kafkaMessageFactory.sequenceMessage(messageFactory.create(20, 2100), testId));
                    await quiesce();
                    assert.equal(testKafka.getLastMessage().operation.minimumSequenceNumber, 20);

                    // And then have a new client go under the latest working set msn but above the published msn
                    await lambda.handler(
                        kafkaMessageFactory.sequenceMessage(secondMessageFactory.createJoin(2200), testId));
                    await lambda.handler(
                        kafkaMessageFactory.sequenceMessage(secondMessageFactory.create(25, 2200), testId));
                    await lambda.handler(kafkaMessageFactory.sequenceMessage(messageFactory.create(22, 2400), testId));
                    await quiesce();
                    assert.equal(testKafka.getLastMessage().operation.minimumSequenceNumber, 22);
                });

                it("Should timeout idle clients", async () => {
                    const secondMessageFactory = new MessageFactory(testId, "test2");
                    await lambda.handler(kafkaMessageFactory.sequenceMessage(messageFactory.createJoin(0), testId));
                    await lambda.handler(kafkaMessageFactory.sequenceMessage(messageFactory.create(10, 1), testId));
                    await lambda.handler(
                        kafkaMessageFactory.sequenceMessage(secondMessageFactory.createJoin(2), testId));
                    await lambda.handler(
                        kafkaMessageFactory.sequenceMessage(secondMessageFactory.create(20, 10),
                        testId));
                    await quiesce();
                    assert.equal(testKafka.getLastMessage().operation.minimumSequenceNumber, 10);

                    await lambda.handler(
                        kafkaMessageFactory.sequenceMessage(secondMessageFactory.create(20, 1 + ClientSequenceTimeout),
                        testId));
                    await lambda.handler(kafkaMessageFactory.sequenceMessage(
                            secondMessageFactory.create(
                                20,
                                ClientSequenceTimeout + 2 * MinSequenceNumberWindow),
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
                        kafkaMessageFactory.sequenceMessage(messageFactory.create(1, timeOffset), testId));
                    await quiesce();
                    timeOffset += MinSequenceNumberWindow;
                    await lambda.handler(
                        kafkaMessageFactory.sequenceMessage(secondMessageFactory.create(2, timeOffset), testId));
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
                        kafkaMessageFactory.sequenceMessage(secondMessageFactory.create(4, timeOffset), testId));
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
                        kafkaMessageFactory.sequenceMessage(thirdMessageFactory.create(7, timeOffset), testId));
                    await quiesce();
                    assert.equal(testKafka.getLastMessage().operation.minimumSequenceNumber, 7);
                });
            });
        });
    });
});
