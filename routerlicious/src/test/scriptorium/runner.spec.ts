import * as assert from "assert";
import { ScriptoriumRunner } from "../../scriptorium/runner";
import { MessageFactory, TestCollection, TestKafka, TestPublisher } from "../testUtils";

describe("Routerlicious", () => {
    describe("Scriptorium", () => {
        describe("Runner", () => {
            let runner: ScriptoriumRunner;
            let deltasTopic: TestKafka;
            let testCollection: TestCollection;
            let testPublisher: TestPublisher;
            let messageFactory: MessageFactory;
            const groupId = "test";
            const topic = "test";
            const testDocumentId = "test";
            const testClientId = "test";

            beforeEach(() => {
                deltasTopic = new TestKafka();
                testCollection = new TestCollection([]);
                const consumer = deltasTopic.createConsumer();
                const checkpointBatchSize = 100;
                const checkpointTimeIntervalMsec = 10;
                testPublisher = new TestPublisher();
                messageFactory = new MessageFactory(testDocumentId, testClientId);

                runner = new ScriptoriumRunner(
                    consumer,
                    testCollection,
                    testPublisher,
                    groupId,
                    topic,
                    checkpointTimeIntervalMsec,
                    checkpointBatchSize);
            });

            describe(".start()", () => {
                it("Should be able to stop after starting", async () => {
                    runner.start();
                    await runner.stop();
                });

                it("Should store incoming messages to database", async () => {
                    runner.start();

                    const producer = deltasTopic.createProducer();
                    const numMessages = 10;
                    for (let i = 0; i < numMessages; i++) {
                        const message = messageFactory.createSequencedOperation();
                        await producer.send(JSON.stringify(message), testDocumentId);
                    }
                    await runner.stop();

                    assert.equal(numMessages, testCollection.collection.length);
                });

                it("Should broadcast incoming messages", async () => {
                    runner.start();

                    const producer = deltasTopic.createProducer();
                    const numMessages = 10;
                    for (let i = 0; i < numMessages; i++) {
                        const message = messageFactory.createSequencedOperation();
                        await producer.send(JSON.stringify(message), testDocumentId);
                    }
                    await runner.stop();

                    assert.equal(
                        numMessages,
                        testPublisher.to(testDocumentId).events[0].args[1].length);
                });
            });
        });
    });
});
