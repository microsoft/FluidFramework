/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { EventEmitter } from "events";
import { DebugLogger, MockLogger } from "@fluidframework/telemetry-utils";
import {
    ISequencedDocumentMessage,
    MessageType,
} from "@fluidframework/protocol-definitions";
import { IContainerContext } from "@fluidframework/container-definitions";
import { MockDeltaManager, MockQuorum } from "@fluidframework/test-runtime-utils";
import { ContainerRuntime, ScheduleManager } from "../containerRuntime";

describe("Runtime", () => {
    describe("Container Runtime", () => {
        describe("ContainerRuntime", () => {
            describe("orderSequentially", () => {
                let containerRuntime: ContainerRuntime;
                const mockContext: Partial<IContainerContext> = {
                    deltaManager: new MockDeltaManager(),
                    quorum: new MockQuorum(),
                    logger: new MockLogger(),
                };

                beforeEach(async () => {
                    containerRuntime = await ContainerRuntime.load(
                        mockContext as IContainerContext,
                        [],
                        undefined, // requestHandler
                        {
                            summaryOptions: {
                                generateSummaries: false,
                            },
                        },
                    );
                });

                it("Can't call flush() inside orderSequentially's callback", () => {
                    assert.throws(() => containerRuntime.orderSequentially(() => containerRuntime.flush()));
                });

                it("Can't call flush() inside orderSequentially's callback when nested", () => {
                    assert.throws(
                        () => containerRuntime.orderSequentially(
                            () => containerRuntime.orderSequentially(
                                () => containerRuntime.orderSequentially(
                                    () => containerRuntime.flush()))));
                });
            });
        });
        describe("ScheduleManager", () => {
            describe("Batch processing events", () => {
                let batchBegin: number = 0;
                let batchEnd: number = 0;
                let seqNumber: number = 0;
                let emitter: EventEmitter;
                let deltaManager: MockDeltaManager;
                let scheduleManager: ScheduleManager;

                beforeEach(() => {
                    emitter = new EventEmitter();
                    deltaManager = new MockDeltaManager();
                    deltaManager.inbound.processCallback = (message: ISequencedDocumentMessage) => {
                        scheduleManager.beforeOpProcessing(message);
                        scheduleManager.afterOpProcessing(undefined, message);
                    };
                    scheduleManager = new ScheduleManager(
                        deltaManager,
                        emitter,
                        DebugLogger.create("fluid:testScheduleManager"),
                    );

                    emitter.on("batchBegin", () => {
                        // When we receive a "batchBegin" event, we should not have any outstanding
                        // events, i.e., batchBegin and batchEnd should be equal.
                        assert.strictEqual(batchBegin, batchEnd, "Received batchBegin before previous batchEnd");
                        batchBegin++;
                    });

                    emitter.on("batchEnd", () => {
                        batchEnd++;
                        // Every "batchEnd" event should correspond to a "batchBegin" event, i.e.,
                        // batchBegin and batchEnd should be equal.
                        assert.strictEqual(batchBegin, batchEnd, "Received batchEnd without corresponding batchBegin");
                    });
                });

                afterEach(() => {
                    batchBegin = 0;
                    batchEnd = 0;
                    seqNumber = 0;
                });

                function processOp(message: Partial<ISequencedDocumentMessage>) {
                    seqNumber++;
                    message.sequenceNumber = seqNumber;
                    deltaManager.inbound.push(message as ISequencedDocumentMessage);
                }

                it("Single non-batch message", () => {
                    const clientId: string = "test-client";
                    const message: Partial<ISequencedDocumentMessage> = {
                        clientId,
                        type: MessageType.Operation,
                    };

                    // Send a non-batch message.
                    processOp(message);

                    assert.strictEqual(deltaManager.inbound.length, 0, "Did not process all ops");
                    assert.strictEqual(1, batchBegin, "Did not receive correct batchBegin events");
                    assert.strictEqual(1, batchEnd, "Did not receive correct batchEnd events");
                });

                it("Multiple non-batch messages", () => {
                    const clientId: string = "test-client";
                    const message: Partial<ISequencedDocumentMessage> = {
                        clientId,
                        type: MessageType.Operation,
                    };

                    // Sent 5 non-batch messages.
                    processOp(message);
                    processOp(message);
                    processOp(message);
                    processOp(message);
                    processOp(message);

                    assert.strictEqual(deltaManager.inbound.length, 0, "Did not process all ops");
                    assert.strictEqual(5, batchBegin, "Did not receive correct batchBegin events");
                    assert.strictEqual(5, batchEnd, "Did not receive correct batchEnd events");
                });

                it("Message with non batch-related metadata", () => {
                    const clientId: string = "test-client";
                    const message: Partial<ISequencedDocumentMessage> = {
                        clientId,
                        type: MessageType.Operation,
                        metadata: { foo: 1 },
                    };

                    processOp(message);

                    // We should have a "batchBegin" and a "batchEnd" event for the batch.
                    assert.strictEqual(deltaManager.inbound.length, 0, "Did not process all ops");
                    assert.strictEqual(1, batchBegin, "Did not receive correct batchBegin event for the batch");
                    assert.strictEqual(1, batchEnd, "Did not receive correct batchEnd event for the batch");
                });

                it("Messages in a single batch", () => {
                    const clientId: string = "test-client";
                    const batchBeginMessage: Partial<ISequencedDocumentMessage> = {
                        clientId,
                        type: MessageType.Operation,
                        metadata: { batch: true },
                    };

                    const batchMessage: Partial<ISequencedDocumentMessage> = {
                        clientId,
                        type: MessageType.Operation,
                    };

                    const batchEndMessage: Partial<ISequencedDocumentMessage> = {
                        clientId,
                        type: MessageType.Operation,
                        metadata: { batch: false },
                    };

                    // Send a batch with 4 messages.
                    processOp(batchBeginMessage);
                    processOp(batchMessage);
                    processOp(batchMessage);

                    assert.strictEqual(deltaManager.inbound.length, 3, "Some of partial batch ops were processed yet");

                    processOp(batchEndMessage);

                    // We should have only received one "batchBegin" and one "batchEnd" event for the batch.
                    assert.strictEqual(deltaManager.inbound.length, 0, "Did not process all ops");
                    assert.strictEqual(1, batchBegin, "Did not receive correct batchBegin event for the batch");
                    assert.strictEqual(1, batchEnd, "Did not receive correct batchEnd event for the batch");
                });

                function testWrongBatches() {
                    const clientId1: string = "test-client-1";
                    const clientId2: string = "test-client-2";

                    const batchBeginMessage: Partial<ISequencedDocumentMessage> = {
                        clientId: clientId1,
                        type: MessageType.Operation,
                        metadata: { batch: true },
                    };

                    const batchMessage: Partial<ISequencedDocumentMessage> = {
                        clientId: clientId1,
                        type: MessageType.Operation,
                    };

                    const messagesToFail: Partial<ISequencedDocumentMessage>[] = [
                        // System op from same client
                        {
                            clientId: clientId1,
                            type: MessageType.NoOp,
                        },

                        // Batch messages interleaved with a batch begin message from same client
                        batchBeginMessage,

                        // Send a message from another client. This should result in a a violation!
                        {
                            clientId: clientId2,
                            type: MessageType.Operation,
                        },

                        // Send a message from another client with non batch-related metadata. This should result
                        // in a "batchEnd" event for the previous batch since the client id changes. Also, we
                        // should get a "batchBegin" and a "batchEnd" event for the new client.
                        {
                            clientId: clientId2,
                            type: MessageType.Operation,
                            metadata: { foo: 1 },
                        },

                        // Send a batch from another client. This should result in a "batchEnd" event for the
                        // previous batch since the client id changes. Also, we should get one "batchBegin" and
                        // one "batchEnd" event for the batch from the new client.
                        {
                            clientId: clientId2,
                            type: MessageType.Operation,
                            metadata: { batch: true },
                        },
                    ];

                    let counter = 0;
                    for (const messageToFail of messagesToFail) {
                        counter++;
                        it(`Partial batch messages, case ${counter}`, () => {
                            // Send a batch with 3 messages from first client but don't send batch end message.
                            processOp(batchBeginMessage);
                            processOp(batchMessage);
                            processOp(batchMessage);

                            assert.strictEqual(deltaManager.inbound.length, 3,
                                "Some of partial batch ops were processed yet");

                            assert.throws(() => processOp(messageToFail));

                            assert.strictEqual(deltaManager.inbound.length, 4, "Some of batch ops were processed");
                            assert.strictEqual(0, batchBegin, "Did not receive correct batchBegin event for the batch");
                            assert.strictEqual(0, batchEnd, "Did not receive correct batchBegin event for the batch");
                        });
                    }
                }

                testWrongBatches();
            });
        });
    });
});
