import * as assert from "assert";
import * as core from "../../core";
import { TakeANumber } from "../../deli/takeANumber";
import * as utils from "../../utils";
import { MessageFactory, TestCollection, TestKafka } from "../utils";

describe("Routerlicious", () => {
    describe("Deli", () => {
        describe("TakeANumber", () => {
            const testId = "test";
            const testClientId = "quiet-rat";
            const testData: {[key: string]: any} = {};

            let testCollection: TestCollection;
            let testKafka: TestKafka;
            let testProducer: utils.kafkaProducer.IProducer;
            let kafkaOffset: number;
            let messageFactory: MessageFactory;
            let ticketer: TakeANumber;

            function wrapMessage(message: any) {
                return {
                    offset: kafkaOffset++,
                    value: Buffer.from(JSON.stringify(message)),
                };
            }

            beforeEach(() => {
                testCollection = new TestCollection(testData);
                testKafka =  new TestKafka();
                testProducer = testKafka.createProducer();
                kafkaOffset = 0;
                testData[testId] = {};
                ticketer = new TakeANumber(testId, testCollection, testProducer);
                messageFactory = new MessageFactory(testId, testClientId);
            });

            describe("#ticket", () => {
                it("Should ticket an incoming message", async () => {
                    const message = messageFactory.create();
                    await ticketer.ticket(wrapMessage(message));

                    const sent = testKafka.getMessages();
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
            });

            describe("#getOffset", () => {
                it("Should retrive the current offset", async () => {
                    for (let i = 0; i < 100; i++) {
                        const message = messageFactory.create();
                        await ticketer.ticket(wrapMessage(message));
                    }

                    assert.equal(ticketer.getOffset(), kafkaOffset - 1);
                });
            });

            describe("#checkpoint", () => {
                it("Should checkpoint the document state", async () => {
                    for (let i = 0; i < 100; i++) {
                        const message = messageFactory.create();
                        await ticketer.ticket(wrapMessage(message));
                    }

                    await ticketer.checkpoint();

                    const document = await testCollection.findOne(testId);
                    assert.equal(document.logOffset, kafkaOffset - 1);

                    const sent = testKafka.getMessages();
                    const sequencedMessage =
                        JSON.parse(sent[sent.length - 1].value.toString()) as core.ISequencedOperationMessage;
                    assert.equal(document.sequenceNumber, sequencedMessage.operation.sequenceNumber);
                });
            });
        });
    });
});
