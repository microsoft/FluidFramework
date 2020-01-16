/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { EventEmitter } from "events";
import { ITelemetryLogger } from "@microsoft/fluid-common-definitions";
import { DebugLogger } from "@microsoft/fluid-core-utils";
import {
    IClient,
    IDocumentMessage,
    IProcessMessageResult,
    MessageType,
    ISequencedDocumentMessage,
} from "@microsoft/fluid-protocol-definitions";
import { MockDocumentDeltaConnection, MockDocumentService } from "@microsoft/fluid-test-loader-utils";
import { SinonFakeTimers, useFakeTimers } from "sinon";
import { DeltaManager } from "../deltaManager";

describe("Loader", () => {
    describe("Container Loader", () => {
        describe("Delta Manager", () => {
            let clock: SinonFakeTimers;
            let deltaManager: DeltaManager;
            let logger: ITelemetryLogger;
            let deltaConnection: MockDocumentDeltaConnection;
            let emitter: EventEmitter;
            let seq: number;
            let intendedResult: IProcessMessageResult;
            const docId = "docId";
            const submitEvent = "test-submit";

            async function startDeltaManager() {
                await deltaManager.connect();
                deltaManager.inbound.resume();
                deltaManager.outbound.resume();
                deltaManager.inboundSignal.resume();
                deltaManager.updateQuorumJoin();
            }

            function emitSequentialOp(type: MessageType = MessageType.Operation) {
                deltaConnection.emitOp(docId, [{
                    minimumSequenceNumber: 0,
                    sequenceNumber: seq++,
                    type,
                }]);
            }

            before(() => {
                clock = useFakeTimers();
            });

            beforeEach(() => {
                seq = 1;
                logger = DebugLogger.create("fluid:testDeltaManager");
                emitter = new EventEmitter();
                intendedResult = {};

                deltaConnection = new MockDocumentDeltaConnection(
                    "test",
                    (messages) => emitter.emit(submitEvent, messages),
                );
                const service = new MockDocumentService(
                    undefined,
                    () => deltaConnection,
                );
                const client: Partial<IClient> = { mode: "write", details: { capabilities: { interactive: true } } };

                deltaManager = new DeltaManager(
                    service,
                    client as IClient,
                    logger,
                    false,
                );
                deltaManager.attachOpHandler(0, 0, {
                    process: (message) => intendedResult,
                    processSignal() {},
                }, true);
            });

            afterEach(() => {
                clock.reset();
            });

            after(() => {
                clock.restore();
            });

            describe("Update Minimum Sequence Number", () => {
                const expectedTimeout = 100;

                // helper function asserting that there is exactly one well-formed no-op
                function assertOneValidNoOp(messages: IDocumentMessage[], immediate: boolean = false) {
                    assert.strictEqual(1, messages.length);
                    assert.strictEqual(MessageType.NoOp, messages[0].type);
                    assert.strictEqual(immediate ? "" : null, JSON.parse(messages[0].contents as string));
                }

                it("Should update after timeout with single op", async () => {
                    let runCount = 0;
                    await startDeltaManager();
                    emitter.on(submitEvent, (messages: IDocumentMessage[]) => {
                        assertOneValidNoOp(messages);
                        runCount++;
                    });

                    emitSequentialOp();
                    clock.tick(expectedTimeout - 1);
                    assert.strictEqual(runCount, 0);

                    clock.tick(1);
                    assert.strictEqual(runCount, 1);
                });

                it("Should update after first timeout with successive ops", async () => {
                    const numberOfSuccessiveOps = 10;
                    assert(expectedTimeout > numberOfSuccessiveOps + 1);
                    let runCount = 0;

                    await startDeltaManager();
                    emitter.on(submitEvent, (messages: IDocumentMessage[]) => {
                        assertOneValidNoOp(messages);
                        runCount++;
                    });

                    // initial op
                    emitSequentialOp();

                    for (let i = 0; i < numberOfSuccessiveOps; i++) {
                        clock.tick(1);
                        emitSequentialOp();
                    }
                    // should not run until timeout
                    clock.tick(expectedTimeout - numberOfSuccessiveOps - 1);
                    assert.strictEqual(runCount, 0);

                    // should run after timeout
                    clock.tick(1);
                    assert.strictEqual(runCount, 1);

                    // should not run again (make sure no additional timeouts created)
                    clock.tick(expectedTimeout);
                    assert.strictEqual(runCount, 1);
                });

                it("Should not update when receiving no-ops", async () => {
                    await startDeltaManager();
                    emitter.on(submitEvent, (messages: IDocumentMessage[]) => {
                        assertOneValidNoOp(messages);
                        assert.fail("Should not send no-op.");
                    });

                    emitSequentialOp(MessageType.NoOp);
                    clock.tick(expectedTimeout);
                });

                it("Should immediately update with immediate content", async () => {
                    intendedResult = { immediateNoOp: true };
                    let runCount = 0;
                    await startDeltaManager();

                    emitter.on(submitEvent, (messages: IDocumentMessage[]) => {
                        assertOneValidNoOp(messages, true);
                        runCount++;
                    });

                    emitSequentialOp(MessageType.NoOp);
                    assert.strictEqual(runCount, 1);
                });

                it("Should not update if op submitted during timeout", async () => {
                    const ignoreContent = "ignoreThisMessage";
                    let canIgnore = true;
                    await startDeltaManager();

                    emitter.on(submitEvent, (messages: IDocumentMessage[]) => {
                        // we can ignore our own op
                        if (
                            messages
                            && messages.length === 1
                            && messages[0].type === MessageType.Operation
                            && messages[0].contents
                            && JSON.parse(messages[0].contents as string) === ignoreContent
                            && canIgnore
                        ) {
                            canIgnore = false;
                            return;
                        }
                        assert.fail("Should not send no-op.");
                    });

                    emitSequentialOp();
                    clock.tick(expectedTimeout - 1);
                    deltaManager.submit(MessageType.Operation, ignoreContent);
                    clock.tick(1);

                    // make extra sure
                    clock.tick(expectedTimeout);
                });
            });

            describe("Batch message processing", () => {
                // Helper function to generate the specified number of incoming op messages.
                function generateIncomingOps(clientId: string, length: number): Partial<ISequencedDocumentMessage>[]{
                    const ops: Partial<ISequencedDocumentMessage>[] = [];
                    for (let i = 0; i < length; i++) {
                        const op = {
                            clientId,
                            minimumSequenceNumber: 0,
                            sequenceNumber: seq++,
                            type: MessageType.Operation,
                        };
                        ops.push(op);
                    }
                    return ops;
                }

                // Helper function to submit the specified number of messages as a batch.
                function submitBatchOps(length: number) {
                    for (let i = 0; i < length; i++) {
                        deltaManager.submit(MessageType.Operation, {}, true);
                    }
                }

                // Helper function assserting that an incoming batch is well-formed.
                function assertValidIncomingBatch(
                    clientId: string,
                    messages: ISequencedDocumentMessage[],
                    length: number,
                    verifyEndOfBatch: boolean = true) {
                    assert.strictEqual(length, messages.length);

                    // Verify that first message has batch begin "{ batch: true }" metadata.
                    assert.notStrictEqual(undefined, messages[0].metadata);
                    assert.strictEqual(true, messages[0].metadata.batch);

                    if (verifyEndOfBatch) {
                        // Verify that first message has bacth end "{ batch: false }" metadata.
                        assert.notStrictEqual(undefined, messages[messages.length - 1].metadata);
                        assert.strictEqual(false, messages[messages.length - 1].metadata.batch);
                    }

                    // Verify that all the messages in the batch are from the same client.
                    for (let i = 0; i < length; i++) {
                        assert.strictEqual(clientId, messages[i]. clientId);
                    }
                }

                // helper function assserting that an outgoing batch is well-formed.
                function assertValidOutgoingBatch(messages: IDocumentMessage[], length: number) {
                    assert.strictEqual(length, messages.length);

                    // Verify that first message has the batch begin "{ batch: true }" metadata.
                    assert.notStrictEqual(undefined, messages[0].metadata);
                    assert.strictEqual(true, messages[0].metadata.batch);

                    // Verify that first message has the batch end "{ batch: false }" metadata.
                    assert.notStrictEqual(undefined, messages[messages.length - 1].metadata);
                    assert.strictEqual(false, messages[messages.length - 1].metadata.batch);

                    // Verify that none of the other messages in the batch have batch metadata.
                    for (let i = 1; i < length - 1; i++) {
                        const batchMetadata = messages[i].metadata ? messages[i].metadata.batch : undefined;
                        assert.strictEqual(undefined, batchMetadata);
                    }
                }

                it("Incoming messages arriving together should be processed together", async () => {
                    const length = 500;
                    const clientId = "test-client";
                    await startDeltaManager();

                    deltaManager.inbound.on("op", (messages: ISequencedDocumentMessage[]) => {
                        assertValidIncomingBatch(clientId, messages, length);
                    });

                    let ops: Partial<ISequencedDocumentMessage>[] = [];
                    ops = generateIncomingOps(clientId, length);
                    // Add batch metadata to indicate the beginning and end of a batch.
                    ops[0].metadata = { batch: true };
                    ops[length - 1].metadata = { batch: false };

                    deltaConnection.emitOp(docId, ops);
                });

                it("Incoming messages arriving in parts should be processed together", async () => {
                    const length = 500;
                    const part1 = 1;
                    const part2 = 100;
                    const part3 = length - part1 - part2;
                    const clientId = "test-client";
                    await startDeltaManager();

                    deltaManager.inbound.on("op", (messages: ISequencedDocumentMessage[]) => {
                        assertValidIncomingBatch(clientId, messages, length);
                    });

                    let ops: Partial<ISequencedDocumentMessage>[] = [];
                    ops = generateIncomingOps(clientId, part1);
                    ops[0].metadata = { batch: true };
                    deltaConnection.emitOp(docId, ops);

                    ops = generateIncomingOps(clientId, part2);
                    deltaConnection.emitOp(docId, ops);

                    ops = generateIncomingOps(clientId, part3);
                    ops[part3 - 1].metadata = { batch: false };

                    deltaConnection.emitOp(docId, ops);
                });

                it("Incoming messages without end of batch should be processed together as a batch", async () => {
                    const length = 500;
                    const clientId = "test-client-1";
                    await startDeltaManager();

                    deltaManager.inbound.on("op", (messages: ISequencedDocumentMessage[]) => {
                        assertValidIncomingBatch(clientId, messages, length, false);
                        // Remove the listener once we receive the batch. We will receive another
                        // "op" event for the other client (test-client-2) which is not a batch
                        // and we don't want to validate it.
                        deltaManager.inbound.removeAllListeners("op");
                    });

                    let ops: Partial<ISequencedDocumentMessage>[] = [];
                    ops = generateIncomingOps(clientId, length);
                    // Only add batch begin metadata.
                    ops[0].metadata = { batch: true };
                    deltaConnection.emitOp(docId, ops);

                    // Send an op from another client so that the batch sent before is processed.
                    ops = generateIncomingOps("test-client-2", 1);
                    deltaConnection.emitOp(docId, ops);
                });

                it("Incoming messages with a nested batch begin should ignore the inner batch begin", async () => {
                    const length = 1000;
                    const part1 = 200;
                    const part2 = length - part1;
                    const clientId = "test-client";
                    await startDeltaManager();

                    deltaManager.inbound.on("op", (messages: ISequencedDocumentMessage[]) => {
                        assertValidIncomingBatch(clientId, messages, length);
                    });

                    let ops: Partial<ISequencedDocumentMessage>[] = [];
                    ops = generateIncomingOps(clientId, part1);
                    ops[0].metadata = { batch: true };
                    deltaConnection.emitOp(docId, ops);

                    ops = generateIncomingOps(clientId, part2);
                    // Add batch begin metadata again. This should just be ignored and this op should be treated
                    // like a regular op that is part of the batch.
                    ops[0].metadata = { batch: true };
                    ops[part2 - 1].metadata = { batch: false };
                    deltaConnection.emitOp(docId, ops);
                });

                it("Outgoing batch messages should be sent together", async () => {
                    const length = 500;
                    await startDeltaManager();

                    emitter.on(submitEvent, (messages: IDocumentMessage[]) => {
                        assertValidOutgoingBatch(messages, length);
                    });

                    // This test emulates orderSequentially() in ContainerRuntime. It submits the ops in the batch
                    // with |batch| as true and then calls flush.
                    submitBatchOps(length);
                    deltaManager.flush();
                });

                it("Outgoing batch messages (followed by a non-batch message) should be sent together", async () => {
                    const length = 500;
                    await startDeltaManager();

                    emitter.on(submitEvent, (messages: IDocumentMessage[]) => {
                        assertValidOutgoingBatch(messages, length);
                        // Remove the listener once we submit the batch. We will receive another submit for the
                        // non-batch op and we don't want to validate that.
                        emitter.removeAllListeners(submitEvent);
                    });

                    // Don't call flush as orderSequentially() in ContainerRuntime does. Instend send another op with
                    // |batch| as false which should trigger a flush for the batch.
                    submitBatchOps(length);
                    deltaManager.submit(MessageType.Operation, {}, false);
                });
            });
        });
    });
});
