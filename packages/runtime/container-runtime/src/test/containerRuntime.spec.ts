/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { EventEmitter } from "events";
import { DebugLogger } from "@fluidframework/telemetry-utils";
import {
    IDocumentMessage,
    ISequencedDocumentMessage,
    MessageType,
} from "@fluidframework/protocol-definitions";
import { IContainerContext, IDeltaManager } from "@fluidframework/container-definitions";
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
                let emitter: EventEmitter;
                let deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;
                let scheduleManager: ScheduleManager;

                beforeEach(() => {
                    emitter = new EventEmitter();
                    deltaManager = new MockDeltaManager();
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
                });

                it("Single non-batch message", () => {
                    const clientId: string = "test-client";
                    const message: Partial<ISequencedDocumentMessage> = {
                        clientId,
                        sequenceNumber: 0,
                        type: MessageType.Operation,
                    };

                    // Send a non-batch message.
                    scheduleManager.beginOperation(message as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, message as ISequencedDocumentMessage);

                    assert.strictEqual(1, batchBegin, "Did not receive correct batchBegin events");
                    assert.strictEqual(1, batchEnd, "Did not receive correct batchEnd events");
                });

                it("Multiple non-batch messages", () => {
                    const clientId: string = "test-client";
                    const message: Partial<ISequencedDocumentMessage> = {
                        clientId,
                        sequenceNumber: 0,
                        type: MessageType.Operation,
                    };

                    // Sent 5 non-batch messages.
                    scheduleManager.beginOperation(message as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, message as ISequencedDocumentMessage);

                    scheduleManager.beginOperation(message as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, message as ISequencedDocumentMessage);

                    scheduleManager.beginOperation(message as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, message as ISequencedDocumentMessage);

                    scheduleManager.beginOperation(message as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, message as ISequencedDocumentMessage);

                    scheduleManager.beginOperation(message as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, message as ISequencedDocumentMessage);

                    assert.strictEqual(5, batchBegin, "Did not receive correct batchBegin events");
                    assert.strictEqual(5, batchEnd, "Did not receive correct batchEnd events");
                });

                it("Message with non batch-related metadata", () => {
                    const clientId: string = "test-client";
                    const message: Partial<ISequencedDocumentMessage> = {
                        clientId,
                        sequenceNumber: 0,
                        type: MessageType.Operation,
                        metadata: { foo: 1 },
                    };

                    scheduleManager.beginOperation(message as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, message as ISequencedDocumentMessage);

                    // We should have a "batchBegin" and a "batchEnd" event for the batch.
                    assert.strictEqual(1, batchBegin, "Did not receive correct batchBegin event for the batch");
                    assert.strictEqual(1, batchEnd, "Did not receive correct batchEnd event for the batch");
                });

                it("Messages in a single batch", () => {
                    const clientId: string = "test-client";
                    const batchBeginMessage: Partial<ISequencedDocumentMessage> = {
                        clientId,
                        sequenceNumber: 0,
                        type: MessageType.Operation,
                        metadata: { batch: true },
                    };

                    const batchMessage: Partial<ISequencedDocumentMessage> = {
                        clientId,
                        sequenceNumber: 0,
                        type: MessageType.Operation,
                    };

                    const batchEndMessage: Partial<ISequencedDocumentMessage> = {
                        clientId,
                        sequenceNumber: 0,
                        type: MessageType.Operation,
                        metadata: { batch: false },
                    };

                    // Send a batch with 4 messages.
                    scheduleManager.beginOperation(batchBeginMessage as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, batchBeginMessage as ISequencedDocumentMessage);

                    scheduleManager.beginOperation(batchMessage as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, batchMessage as ISequencedDocumentMessage);

                    scheduleManager.beginOperation(batchMessage as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, batchMessage as ISequencedDocumentMessage);

                    scheduleManager.beginOperation(batchEndMessage as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, batchEndMessage as ISequencedDocumentMessage);

                    // We should have only received one "batchBegin" and one "batchEnd" event for the batch.
                    assert.strictEqual(1, batchBegin, "Did not receive correct batchBegin event for the batch");
                    assert.strictEqual(1, batchEnd, "Did not receive correct batchEnd event for the batch");
                });

                it("Partial batch messages followed by a non-batch message from another client", () => {
                    const clientId1: string = "test-client-1";
                    const clientId2: string = "test-client-2";
                    const batchBeginMessage: Partial<ISequencedDocumentMessage> = {
                        clientId: clientId1,
                        sequenceNumber: 0,
                        type: MessageType.Operation,
                        metadata: { batch: true },
                    };

                    const batchMessage: Partial<ISequencedDocumentMessage> = {
                        clientId: clientId1,
                        sequenceNumber: 0,
                        type: MessageType.Operation,
                    };

                    // Send a batch with 3 messages from first client but don't send batch end message.
                    scheduleManager.beginOperation(batchBeginMessage as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, batchBeginMessage as ISequencedDocumentMessage);

                    scheduleManager.beginOperation(batchMessage as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, batchMessage as ISequencedDocumentMessage);

                    scheduleManager.beginOperation(batchMessage as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, batchMessage as ISequencedDocumentMessage);

                    // Send a message from another client. This should result in a "batchEnd" event for the
                    // previous batch since the client id changes. Also, we should get a "batchBegin" and
                    // a "batchEnd" event for the new client.
                    const client2Message: Partial<ISequencedDocumentMessage> = {
                        clientId: clientId2,
                        sequenceNumber: 0,
                        type: MessageType.Operation,
                    };

                    scheduleManager.beginOperation(client2Message as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, client2Message as ISequencedDocumentMessage);

                    // We should have received two sets of "batchBegin" and "batchEnd" events.
                    assert.strictEqual(2, batchBegin, "Did not receive correct batchBegin event for the batch");
                    assert.strictEqual(2, batchEnd, "Did not receive correct batchBegin event for the batch");
                });

                it("Partial batch messages followed by non batch-related metadata message from another client", () => {
                    const clientId1: string = "test-client-1";
                    const clientId2: string = "test-client-2";
                    const batchBeginMessage: Partial<ISequencedDocumentMessage> = {
                        clientId: clientId1,
                        sequenceNumber: 0,
                        type: MessageType.Operation,
                        metadata: { batch: true },
                    };

                    const batchMessage: Partial<ISequencedDocumentMessage> = {
                        clientId: clientId1,
                        sequenceNumber: 0,
                        type: MessageType.Operation,
                    };

                    // Send a batch with 3 messages from first client but don't send batch end message.
                    scheduleManager.beginOperation(batchBeginMessage as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, batchBeginMessage as ISequencedDocumentMessage);

                    scheduleManager.beginOperation(batchMessage as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, batchMessage as ISequencedDocumentMessage);

                    scheduleManager.beginOperation(batchMessage as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, batchMessage as ISequencedDocumentMessage);

                    // Send a message from another client with non batch-related metadata. This should result
                    // in a "batchEnd" event for the previous batch since the client id changes. Also, we
                    // should get a "batchBegin" and a "batchEnd" event for the new client.
                    const client2Message: Partial<ISequencedDocumentMessage> = {
                        clientId: clientId2,
                        sequenceNumber: 0,
                        type: MessageType.Operation,
                        metadata: { foo: 1 },
                    };

                    scheduleManager.beginOperation(client2Message as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, client2Message as ISequencedDocumentMessage);

                    // We should have received two sets of "batchBegin" and "batchEnd" events.
                    assert.strictEqual(2, batchBegin, "Did not receive correct batchBegin event for the batch");
                    assert.strictEqual(2, batchEnd, "Did not receive correct batchBegin event for the batch");
                });

                it("Partial batch messages followed by batch messages from another client", () => {
                    const clientId1: string = "test-client-1";
                    const clientId2: string = "test-client-2";
                    const client1batchBeginMessage: Partial<ISequencedDocumentMessage> = {
                        clientId: clientId1,
                        sequenceNumber: 0,
                        type: MessageType.Operation,
                        metadata: { batch: true },
                    };

                    const client1batchMessage: Partial<ISequencedDocumentMessage> = {
                        clientId: clientId1,
                        sequenceNumber: 0,
                        type: MessageType.Operation,
                    };

                    // Send a batch with 3 messages from first client but don't send batch end message.
                    scheduleManager.beginOperation(client1batchBeginMessage as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, client1batchBeginMessage as ISequencedDocumentMessage);

                    scheduleManager.beginOperation(client1batchMessage as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, client1batchMessage as ISequencedDocumentMessage);

                    scheduleManager.beginOperation(client1batchMessage as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, client1batchMessage as ISequencedDocumentMessage);

                    // Send a batch from another client. This should result in a "batchEnd" event for the
                    // previous batch since the client id changes. Also, we should get one "batchBegin" and
                    // one "batchEnd" event for the batch from the new client.
                    const client2batchBeginMessage: Partial<ISequencedDocumentMessage> = {
                        clientId: clientId2,
                        sequenceNumber: 0,
                        type: MessageType.Operation,
                        metadata: { batch: true },
                    };

                    const client2batchMessage: Partial<ISequencedDocumentMessage> = {
                        clientId: clientId2,
                        sequenceNumber: 0,
                        type: MessageType.Operation,
                    };

                    const client2batchEndMessage: Partial<ISequencedDocumentMessage> = {
                        clientId: clientId2,
                        sequenceNumber: 0,
                        type: MessageType.Operation,
                        metadata: { batch: false },
                    };

                    scheduleManager.beginOperation(client2batchBeginMessage as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, client2batchBeginMessage as ISequencedDocumentMessage);

                    scheduleManager.beginOperation(client2batchMessage as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, client2batchMessage as ISequencedDocumentMessage);

                    scheduleManager.beginOperation(client2batchEndMessage as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, client2batchEndMessage as ISequencedDocumentMessage);

                    // We should have received two sets of "batchBegin" and one "batchEnd" events.
                    assert.strictEqual(2, batchBegin, "Did not receive correct batchBegin event for the batches");
                    assert.strictEqual(2, batchEnd, "Did not receive correct batchBegin event for the batches");
                });

                it("Batch messages interleaved with a batch begin message from same client", () => {
                    const clientId: string = "test-client";
                    const batchBeginMessage: Partial<ISequencedDocumentMessage> = {
                        clientId,
                        sequenceNumber: 0,
                        type: MessageType.Operation,
                        metadata: { batch: true },
                    };

                    const batchMessage: Partial<ISequencedDocumentMessage> = {
                        clientId,
                        sequenceNumber: 0,
                        type: MessageType.Operation,
                    };

                    const batchEndMessage: Partial<ISequencedDocumentMessage> = {
                        clientId,
                        sequenceNumber: 0,
                        type: MessageType.Operation,
                        metadata: { batch: false },
                    };

                    // Send a batch with an interleaved batch begin message.
                    scheduleManager.beginOperation(batchBeginMessage as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, batchBeginMessage as ISequencedDocumentMessage);

                    scheduleManager.beginOperation(batchMessage as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, batchMessage as ISequencedDocumentMessage);

                    scheduleManager.beginOperation(batchMessage as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, batchMessage as ISequencedDocumentMessage);

                    // The interleaved batch begin message. We should not get a "batchBegin" event for this.
                    scheduleManager.beginOperation(batchBeginMessage as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, batchBeginMessage as ISequencedDocumentMessage);

                    scheduleManager.beginOperation(batchEndMessage as ISequencedDocumentMessage);
                    scheduleManager.endOperation(undefined, batchEndMessage as ISequencedDocumentMessage);

                    // We should have only received one "batchBegin" and one "batchEnd" for the batch.
                    assert.strictEqual(1, batchBegin, "Did not receive correct batchBegin event for the batch");
                    assert.strictEqual(1, batchEnd, "Did not receive correct batchEnd event for the batch");
                });
            });
        });
    });
});
