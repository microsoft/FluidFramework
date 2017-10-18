import * as assert from "assert";
import { DeliRunner } from "../../deli/runner";
import { MessageFactory, TestCollection, TestKafka } from "../testUtils";

describe("Routerlicious", () => {
    describe("Deli", () => {
        describe("Runner", () => {
            const testId = "test";
            const testClientId = "quiet-rat";
            const testGroupId = "testGroup";
            const testReceiveTopic = "testReceiveTopic";
            const testCheckpointBatchSize = 10;
            const testCheckpointTimeIntervalMsec = 10000;
            const testMetricConfig = {};

            let testCollection: TestCollection;
            let receiveTopic: TestKafka;
            let sendTopic: TestKafka;
            let kafkaOffset: number;
            let runner: DeliRunner;
            let messageFactory: MessageFactory;

            beforeEach(() => {
                const testData = [{ _id: testId }];
                testCollection = new TestCollection(testData);
                receiveTopic = new TestKafka();
                sendTopic = new TestKafka();
                kafkaOffset = 0;

                const producer = sendTopic.createProducer();
                const consumer = receiveTopic.createConsumer();
                runner = new DeliRunner(
                    producer,
                    consumer,
                    testCollection,
                    testGroupId,
                    testReceiveTopic,
                    testCheckpointBatchSize,
                    testCheckpointTimeIntervalMsec,
                    testMetricConfig);

                messageFactory = new MessageFactory(testId, testClientId);
            });

            describe("#start()", () => {
                it("Should be able to stop after starting", async () => {
                    const startP = runner.start();
                    const stopP = runner.stop();
                    await Promise.all([startP, stopP]);
                });

                it("Should process incoming messages after starting", async () => {
                    const TestMessages = 100;

                    const started = runner.start();
                    const testProducer = receiveTopic.createProducer();

                    for (let i = 0; i < TestMessages; i++) {
                        const message = messageFactory.create();
                        testProducer.send(JSON.stringify(message), testId);
                    }
                    await runner.stop();

                    assert.equal(sendTopic.getRawMessages().length, TestMessages);

                    return started;
                });
            });
        });
    });
});
