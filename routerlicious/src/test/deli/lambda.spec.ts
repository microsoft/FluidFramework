import * as assert from "assert";
import * as _ from "lodash";
import * as nconf from "nconf";
import * as agent from "../../agent";
import * as core from "../../core";
import { ClientSequenceTimeout, DeliLambdaFactory } from "../../deli/lambdaFactory";
import { IPartitionLambda } from "../../kafka-service/lambdas";
import * as utils from "../../utils";
import { KafkaMessageFactory, MessageFactory, TestContext, TestDbFactory, TestKafka } from "../testUtils";

describe("Routerlicious", () => {
    describe("Deli", () => {
        describe("Lambda", () => {
            const testId = "test";
            const testClientId = "quiet-rat";
            const testData = [{ _id: testId, sequenceNumber: 0, logOffset: undefined }];

            let testCollection: core.ICollection<any>;
            let testKafka: TestKafka;
            let testProducer: utils.kafkaProducer.IProducer;
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

            beforeEach(async () => {
                const dbFactory = new TestDbFactory(_.cloneDeep({ documents: testData }));
                const mongoManager = new utils.MongoManager(dbFactory);
                const database = await mongoManager.getDatabase();
                testCollection = database.collection("documents");

                testKafka =  new TestKafka();
                testProducer = testKafka.createProducer();
                messageFactory = new MessageFactory(testId, testClientId);
                kafkaMessageFactory = new KafkaMessageFactory();
                factory = new DeliLambdaFactory(mongoManager, testCollection, testProducer);

                testContext = new TestContext();
                const config = (new nconf.Provider({})).defaults({ documentId: testId }).use("memory");
                lambda = await factory.create(config, testContext);
            });

            afterEach(async () => {
                await factory.dispose();
            });

            describe(".handler", () => {
                it("Should be able to ticket an incoming message", async () => {
                    const message = messageFactory.create();
                    await lambda.handler(kafkaMessageFactory.sequenceMessage(message, testId));
                    await quiesce();

                    const sent = testKafka.getRawMessages();
                    assert.equal(1, sent.length);
                    const sequencedMessage = JSON.parse(sent[0].value.toString()) as core.ISequencedOperationMessage;
                    assert.equal(sequencedMessage.documentId, testId);
                    assert.equal(sequencedMessage.type, core.SequencedOperationType);
                    assert.equal(sequencedMessage.operation.clientId, testClientId);
                    assert.equal(
                        sequencedMessage.operation.clientSequenceNumber,
                        message.operation.clientSequenceNumber);
                    assert.equal(sequencedMessage.operation.sequenceNumber, 1);
                });

                it("Should ticket new clients connecting above msn but less than existing clients", async () => {
                    const secondMessageFactory = new MessageFactory(testId, "test2");

                    // Have test client create some existing messages
                    await lambda.handler(kafkaMessageFactory.sequenceMessage(messageFactory.create(10, 2000), testId));
                    await lambda.handler(kafkaMessageFactory.sequenceMessage(messageFactory.create(20, 2100), testId));
                    await quiesce();
                    assert.equal(testKafka.getLastMessage().operation.minimumSequenceNumber, 10);

                    // And then have a new client go under the latest working set msn but above the published msn
                    await lambda.handler(
                        kafkaMessageFactory.sequenceMessage(secondMessageFactory.create(15, 2200),
                        testId));
                    await lambda.handler(kafkaMessageFactory.sequenceMessage(messageFactory.create(22, 2400), testId));
                    await quiesce();
                    assert.equal(testKafka.getLastMessage().operation.minimumSequenceNumber, 10);
                });

                it("Should timeout idle clients", async () => {
                    const secondMessageFactory = new MessageFactory(testId, "test2");
                    await lambda.handler(kafkaMessageFactory.sequenceMessage(messageFactory.create(10, 0), testId));
                    await lambda.handler(
                        kafkaMessageFactory.sequenceMessage(secondMessageFactory.create(20, 10),
                        testId));
                    await quiesce();
                    assert.equal(testKafka.getLastMessage().operation.minimumSequenceNumber, 10);

                    await lambda.handler(
                        kafkaMessageFactory.sequenceMessage(secondMessageFactory.create(20, ClientSequenceTimeout),
                        testId));
                    await lambda.handler(kafkaMessageFactory.sequenceMessage(
                            secondMessageFactory.create(
                                20,
                                ClientSequenceTimeout + agent.constants.MinSequenceNumberWindow),
                            testId));
                    await quiesce();
                    assert.equal(testKafka.getLastMessage().operation.minimumSequenceNumber, 20);
                });

                it("Should remove clients after a disconnect", async () => {
                    const secondMessageFactory = new MessageFactory(testId, "test2");

                    let timeOffset = 0;

                    // Create some starter messages
                    await lambda.handler(
                        kafkaMessageFactory.sequenceMessage(messageFactory.createJoin(timeOffset),
                        testId));
                    await quiesce();
                    assert.equal(testKafka.getLastMessage().operation.minimumSequenceNumber, 0);
                    timeOffset += 1;
                    await lambda.handler(
                        kafkaMessageFactory.sequenceMessage(secondMessageFactory.createJoin(timeOffset),
                        testId));
                    await quiesce();
                    timeOffset += 1;
                    await lambda.handler(
                        kafkaMessageFactory.sequenceMessage(messageFactory.create(10, timeOffset),
                        testId));
                    await quiesce();
                    timeOffset += agent.constants.MinSequenceNumberWindow;
                    await lambda.handler(
                        kafkaMessageFactory.sequenceMessage(secondMessageFactory.create(15, timeOffset),
                        testId));
                    await quiesce();
                    assert.equal(testKafka.getLastMessage().operation.minimumSequenceNumber, 10);

                    // Have the first client leave and the second message queue a message to
                    // force the MSN window to move
                    timeOffset += 1;
                    await lambda.handler(
                        kafkaMessageFactory.sequenceMessage(messageFactory.createLeave(timeOffset),
                        testId));
                    await quiesce();
                    timeOffset += agent.constants.MinSequenceNumberWindow;
                    await lambda.handler(
                        kafkaMessageFactory.sequenceMessage(secondMessageFactory.create(20, timeOffset),
                        testId));
                    await quiesce();
                    assert.equal(testKafka.getLastMessage().operation.minimumSequenceNumber, 15);

                    // And then have the second client leave
                    timeOffset += agent.constants.MinSequenceNumberWindow;
                    await lambda.handler(
                        kafkaMessageFactory.sequenceMessage(secondMessageFactory.createLeave(timeOffset),
                        testId));
                    await quiesce();
                    assert.equal(testKafka.getLastMessage().operation.minimumSequenceNumber, 20);

                    // Add in a third client to check that both clients are gone
                    const thirdMessageFactory = new MessageFactory(testId, "test3");
                    timeOffset += 1;
                    await lambda.handler(
                        kafkaMessageFactory.sequenceMessage(thirdMessageFactory.create(30, timeOffset),
                        testId));
                    await quiesce();
                    timeOffset += agent.constants.MinSequenceNumberWindow;
                    await lambda.handler(
                        kafkaMessageFactory.sequenceMessage(thirdMessageFactory.create(31, timeOffset),
                        testId));
                    await quiesce();
                    assert.equal(testKafka.getLastMessage().operation.minimumSequenceNumber, 30);
                });
            });
        });
    });
});
