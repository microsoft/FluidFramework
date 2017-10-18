import * as assert from "assert";
import { ITrace } from "../../api";
import * as core from "../../core";
import { ClientSequenceTimeout, TakeANumber } from "../../deli/takeANumber";
import * as shared from "../../shared";
import * as utils from "../../utils";
import { MessageFactory, TestCollection, TestKafka } from "../testUtils";

describe("Routerlicious", () => {
    describe("Deli", () => {
        describe("TakeANumber", () => {
            const testId = "test";
            const testClientId = "quiet-rat";
            const testData = [{ _id: testId }];
            const testTrace: ITrace = null;

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
                ticketer = new TakeANumber(testId, testCollection, testProducer);
                messageFactory = new MessageFactory(testId, testClientId);
            });

            describe("#ticket", () => {
                it("Should ticket an incoming message", async () => {
                    const message = messageFactory.create();
                    await ticketer.ticket(wrapMessage(message), testTrace);

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
                    await ticketer.ticket(wrapMessage(messageFactory.create(10, 2000)), testTrace);
                    await ticketer.ticket(wrapMessage(messageFactory.create(20, 2100)), testTrace);
                    assert.equal(testKafka.getLastMessage().operation.minimumSequenceNumber, 10);

                    // And then have a new client go under the latest working set msn but above the published msn
                    await ticketer.ticket(wrapMessage(secondMessageFactory.create(15, 2200)), testTrace);
                    await ticketer.ticket(wrapMessage(messageFactory.create(22, 2400)), testTrace);
                    assert.equal(testKafka.getLastMessage().operation.minimumSequenceNumber, 10);
                });

                it("Should remove clients after a disconnect", async () => {
                    const secondMessageFactory = new MessageFactory(testId, "test2");

                    let timeOffset = 0;

                    // Create some starter messages
                    await ticketer.ticket(wrapMessage(messageFactory.createJoin(timeOffset)), testTrace);
                    assert.equal(testKafka.getLastMessage().operation.minimumSequenceNumber, 0);
                    timeOffset += 1;
                    await ticketer.ticket(wrapMessage(secondMessageFactory.createJoin(timeOffset)), testTrace);
                    timeOffset += 1;
                    await ticketer.ticket(wrapMessage(messageFactory.create(10, timeOffset)), testTrace);
                    timeOffset += shared.constants.MinSequenceNumberWindow;
                    await ticketer.ticket(wrapMessage(secondMessageFactory.create(15, timeOffset)), testTrace);
                    assert.equal(testKafka.getLastMessage().operation.minimumSequenceNumber, 10);

                    // Have the first client leave and the second message queue a message to
                    // force the MSN window to move
                    timeOffset += 1;
                    await ticketer.ticket(wrapMessage(messageFactory.createLeave(timeOffset)), testTrace);
                    timeOffset += shared.constants.MinSequenceNumberWindow;
                    await ticketer.ticket(wrapMessage(secondMessageFactory.create(20, timeOffset)), testTrace);
                    assert.equal(testKafka.getLastMessage().operation.minimumSequenceNumber, 15);

                    // And then have the second client leave
                    timeOffset += shared.constants.MinSequenceNumberWindow;
                    await ticketer.ticket(wrapMessage(secondMessageFactory.createLeave(timeOffset)), testTrace);
                    assert.equal(testKafka.getLastMessage().operation.minimumSequenceNumber, 20);

                    // Add in a third client to check that both clients are gone
                    const thirdMessageFactory = new MessageFactory(testId, "test3");
                    timeOffset += 1;
                    await ticketer.ticket(wrapMessage(thirdMessageFactory.create(30, timeOffset)), testTrace);
                    timeOffset += shared.constants.MinSequenceNumberWindow;
                    await ticketer.ticket(wrapMessage(thirdMessageFactory.create(31, timeOffset)), testTrace);
                    assert.equal(testKafka.getLastMessage().operation.minimumSequenceNumber, 30);
                });

                it("Should timeout idle clients", async () => {
                    const secondMessageFactory = new MessageFactory(testId, "test2");
                    await ticketer.ticket(wrapMessage(messageFactory.create(10, 0)), testTrace);
                    await ticketer.ticket(wrapMessage(secondMessageFactory.create(20, 10)), testTrace);
                    assert.equal(testKafka.getLastMessage().operation.minimumSequenceNumber, 10);
                    // tslint:disable-next-line:max-line-length
                    await ticketer.ticket(wrapMessage(secondMessageFactory.create(20, ClientSequenceTimeout)), testTrace);
                    await ticketer.ticket(wrapMessage(
                        secondMessageFactory.create(
                            20,
                            ClientSequenceTimeout + shared.constants.MinSequenceNumberWindow)), testTrace);
                    assert.equal(testKafka.getLastMessage().operation.minimumSequenceNumber, 20);
                });
            });

            describe("#getOffset", () => {
                it("Should retrive the current offset", async () => {
                    for (let i = 0; i < 100; i++) {
                        const message = messageFactory.create();
                        await ticketer.ticket(wrapMessage(message), testTrace);
                    }

                    assert.equal(ticketer.getOffset(), kafkaOffset - 1);
                });
            });

            describe("#checkpoint", () => {
                it("Should checkpoint the document state", async () => {
                    for (let i = 0; i < 100; i++) {
                        const message = messageFactory.create();
                        await ticketer.ticket(wrapMessage(message), testTrace);
                    }

                    await ticketer.checkpoint();

                    const document = await testCollection.findOne(testId);
                    assert.equal(document.logOffset, kafkaOffset - 1);

                    const sent = testKafka.getRawMessages();
                    const sequencedMessage =
                        JSON.parse(sent[sent.length - 1].value.toString()) as core.ISequencedOperationMessage;
                    assert.equal(document.sequenceNumber, sequencedMessage.operation.sequenceNumber);
                });
            });
        });
    });
});
