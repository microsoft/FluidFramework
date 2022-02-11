/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { EventEmitter } from "events";
import { createSandbox } from "sinon";
import { AttachState, IContainerContext, ICriticalContainerError } from "@fluidframework/container-definitions";
import { GenericError } from "@fluidframework/container-utils";
import {
    ISequencedDocumentMessage,
    MessageType,
} from "@fluidframework/protocol-definitions";
import { FlushMode } from "@fluidframework/runtime-definitions";
import { DebugLogger, MockLogger } from "@fluidframework/telemetry-utils";
import { MockDeltaManager, MockQuorum } from "@fluidframework/test-runtime-utils";
import { ContainerRuntime, ScheduleManager } from "../containerRuntime";

describe("Runtime", () => {
    describe("Container Runtime", () => {
        describe("orderSequentially", () =>
            [FlushMode.TurnBased, FlushMode.Immediate].forEach((flushMode: FlushMode) => {
                describe(`orderSequentially with flush mode: ${FlushMode[flushMode]}`, () => {
                    let containerRuntime: ContainerRuntime;
                    const containerErrors: ICriticalContainerError[] = [];
                    const getMockContext = ((): Partial<IContainerContext> => {
                        return {
                            deltaManager: new MockDeltaManager(),
                            quorum: new MockQuorum(),
                            logger: new MockLogger(),
                            clientDetails: { capabilities: { interactive: true } },
                            closeFn: (error?: ICriticalContainerError): void => {
                                if (error !== undefined) {
                                    containerErrors.push(error);
                                }
                            },
                            updateDirtyContainerState: (dirty: boolean) => {},
                        };
                    });

                    const getFirstContainerError = (): ICriticalContainerError => {
                        assert.ok(containerErrors.length > 0, "Container should have errors");
                        return containerErrors[0];
                    };

                    const expectedOrderSequentiallyErrorCode = "orderSequentiallyCallbackException";

                    beforeEach(async () => {
                        containerRuntime = await ContainerRuntime.load(
                            getMockContext() as IContainerContext,
                            [],
                            undefined, // requestHandler
                            {
                                summaryOptions: {
                                    disableSummaries: true,
                                },
                            },
                        );
                        containerRuntime.setFlushMode(flushMode);
                        containerErrors.length = 0;
                    });

                    it("Can't call flush() inside orderSequentially's callback", () => {
                        assert.throws(() => containerRuntime.orderSequentially(() => containerRuntime.flush()));

                        const error = getFirstContainerError();
                        assert.ok(error instanceof GenericError);
                        assert.strictEqual(error.fluidErrorCode, expectedOrderSequentiallyErrorCode);
                    });

                    it("Can't call flush() inside orderSequentially's callback when nested", () => {
                        assert.throws(
                            () => containerRuntime.orderSequentially(
                                () => containerRuntime.orderSequentially(
                                    () => containerRuntime.flush())));

                        const error = getFirstContainerError();
                        assert.ok(error instanceof GenericError);
                        assert.strictEqual(error.fluidErrorCode, expectedOrderSequentiallyErrorCode);
                    });

                    it("Can't call flush() inside orderSequentially's callback when nested ignoring exceptions", () => {
                        containerRuntime.orderSequentially(() => {
                            try {
                                containerRuntime.orderSequentially(() => containerRuntime.flush());
                            } catch (e) {
                                // ignore
                            }
                        });

                        const error = getFirstContainerError();
                        assert.ok(error instanceof GenericError);
                        assert.strictEqual(error.fluidErrorCode, expectedOrderSequentiallyErrorCode);
                    });

                    it("Errors propagate to the container", () => {
                        assert.throws(
                            () => containerRuntime.orderSequentially(
                                () => {
                                    throw new Error("Any");
                                }));

                        const error = getFirstContainerError();
                        assert.ok(error instanceof GenericError);
                        assert.strictEqual(error.fluidErrorCode, expectedOrderSequentiallyErrorCode);
                        assert.strictEqual(error.error.message, "Any");
                    });

                    it("Errors propagate to the container when nested", () => {
                        assert.throws(
                            () => containerRuntime.orderSequentially(
                                () => containerRuntime.orderSequentially(
                                    () => {
                                        throw new Error("Any");
                                    })));

                        const error = getFirstContainerError();
                        assert.ok(error instanceof GenericError);
                        assert.strictEqual(error.fluidErrorCode, expectedOrderSequentiallyErrorCode);
                        assert.strictEqual(error.error.message, "Any");
                    });
                });
            }));

        describe("Dirty flag", () => {
            const sandbox = createSandbox();
            const createMockContext =
                (attachState: AttachState, addPendingMsg: boolean): Partial<IContainerContext> => {
                const pendingMessage = {
                    type: "message",
                    content: {},
                };

                return {
                    deltaManager: new MockDeltaManager(),
                    quorum: new MockQuorum(),
                    logger: new MockLogger(),
                    clientDetails: { capabilities: { interactive: true } },
                    updateDirtyContainerState: (dirty: boolean) => {},
                    attachState,
                    pendingLocalState: addPendingMsg ? {pendingStates: [pendingMessage]} : undefined,
                };
            };

            it("should NOT be set to dirty if context is attached with no pending ops", async () => {
                const mockContext = createMockContext(AttachState.Attached, false);
                const updateDirtyStateStub = sandbox.stub(mockContext, "updateDirtyContainerState");
                await ContainerRuntime.load(
                    mockContext as IContainerContext,
                    [],
                    undefined,
                    {},
                );
                assert.deepStrictEqual(updateDirtyStateStub.calledOnce, true);
                assert.deepStrictEqual(updateDirtyStateStub.args, [[false]]);
            });

            it("should be set to dirty if context is attached with pending ops", async () => {
                const mockContext = createMockContext(AttachState.Attached, true);
                const updateDirtyStateStub = sandbox.stub(mockContext, "updateDirtyContainerState");
                await ContainerRuntime.load(
                    mockContext as IContainerContext,
                    [],
                    undefined,
                    {},
                );
                assert.deepStrictEqual(updateDirtyStateStub.calledOnce, true);
                assert.deepStrictEqual(updateDirtyStateStub.args, [[true]]);
            });

            it("should be set to dirty if context is attaching", async () => {
                const mockContext = createMockContext(AttachState.Attaching, false);
                const updateDirtyStateStub = sandbox.stub(mockContext, "updateDirtyContainerState");
                await ContainerRuntime.load(
                    mockContext as IContainerContext,
                    [],
                    undefined,
                    {},
                );
                assert.deepStrictEqual(updateDirtyStateStub.calledOnce, true);
                assert.deepStrictEqual(updateDirtyStateStub.args, [[true]]);
            });

            it("should be set to dirty if context is detached", async () => {
                const mockContext = createMockContext(AttachState.Detached, false);
                const updateDirtyStateStub = sandbox.stub(mockContext, "updateDirtyContainerState");
                await ContainerRuntime.load(
                    mockContext as IContainerContext,
                    [],
                    undefined,
                    {},
                );
                assert.deepStrictEqual(updateDirtyStateStub.calledOnce, true);
                assert.deepStrictEqual(updateDirtyStateStub.args, [[true]]);
            });
        });

        describe("ScheduleManager", () => {
            describe("Batch processing events", () => {
                let batchBegin: number = 0;
                let batchEnd: number = 0;
                let sequenceNumber: number = 0;
                let emitter: EventEmitter;
                let deltaManager: MockDeltaManager;
                let scheduleManager: ScheduleManager;

                beforeEach(() => {
                    emitter = new EventEmitter();
                    deltaManager = new MockDeltaManager();
                    deltaManager.inbound.processCallback = (message: ISequencedDocumentMessage) => {
                        scheduleManager.beforeOpProcessing(message);
                        scheduleManager.afterOpProcessing(undefined, message);
                        deltaManager.emit("op", message);
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
                    sequenceNumber = 0;
                });

                /**
                 * Pushes single op to the inbound queue. Adds proper sequence numbers to them
                 */
                function pushOp(partialMessage: Partial<ISequencedDocumentMessage>) {
                    sequenceNumber++;
                    const message = { ...partialMessage, sequenceNumber };
                    deltaManager.inbound.push(message as ISequencedDocumentMessage);
                }

                /**
                 * awaits until all ops that could be processed are processed.
                 */
                async function processOps() {
                    const inbound = deltaManager.inbound;
                    while (!inbound.paused && inbound.length > 0) {
                        await Promise.resolve();
                    }
                }

                it("Single non-batch message", async () => {
                    const clientId: string = "test-client";
                    const message: Partial<ISequencedDocumentMessage> = {
                        clientId,
                        type: MessageType.Operation,
                    };

                    // Send a non-batch message.
                    pushOp(message);

                    await processOps();

                    assert.strictEqual(deltaManager.inbound.length, 0, "Did not process all ops");
                    assert.strictEqual(1, batchBegin, "Did not receive correct batchBegin events");
                    assert.strictEqual(1, batchEnd, "Did not receive correct batchEnd events");
                });

                it("Multiple non-batch messages", async () => {
                    const clientId: string = "test-client";
                    const message: Partial<ISequencedDocumentMessage> = {
                        clientId,
                        type: MessageType.Operation,
                    };

                    // Sent 5 non-batch messages.
                    pushOp(message);
                    pushOp(message);
                    pushOp(message);
                    pushOp(message);
                    pushOp(message);

                    await processOps();

                    assert.strictEqual(deltaManager.inbound.length, 0, "Did not process all ops");
                    assert.strictEqual(5, batchBegin, "Did not receive correct batchBegin events");
                    assert.strictEqual(5, batchEnd, "Did not receive correct batchEnd events");
                });

                it("Message with non batch-related metadata", async () => {
                    const clientId: string = "test-client";
                    const message: Partial<ISequencedDocumentMessage> = {
                        clientId,
                        type: MessageType.Operation,
                        metadata: { foo: 1 },
                    };

                    pushOp(message);
                    await processOps();

                    // We should have a "batchBegin" and a "batchEnd" event for the batch.
                    assert.strictEqual(deltaManager.inbound.length, 0, "Did not process all ops");
                    assert.strictEqual(1, batchBegin, "Did not receive correct batchBegin event for the batch");
                    assert.strictEqual(1, batchEnd, "Did not receive correct batchEnd event for the batch");
                });

                it("Messages in a single batch", async () => {
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
                    pushOp(batchBeginMessage);
                    pushOp(batchMessage);
                    pushOp(batchMessage);

                    await processOps();
                    assert.strictEqual(deltaManager.inbound.length, 3, "Some of partial batch ops were processed");

                    pushOp(batchEndMessage);
                    await processOps();

                    // We should have only received one "batchBegin" and one "batchEnd" event for the batch.
                    assert.strictEqual(deltaManager.inbound.length, 0, "Did not process all ops");
                    assert.strictEqual(1, batchBegin, "Did not receive correct batchBegin event for the batch");
                    assert.strictEqual(1, batchEnd, "Did not receive correct batchEnd event for the batch");
                });

                it("two batches", async () => {
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

                    // Pause to not allow ops to be processed while we accumulated them.
                    await deltaManager.inbound.pause();

                    // Send a batch with 4 messages.
                    pushOp(batchBeginMessage);
                    pushOp(batchMessage);
                    pushOp(batchMessage);
                    pushOp(batchEndMessage);

                    // Add incomplete batch
                    pushOp(batchBeginMessage);
                    pushOp(batchMessage);
                    pushOp(batchMessage);

                    assert.strictEqual(deltaManager.inbound.length, 7, "none of the batched ops are processed yet");

                    void deltaManager.inbound.resume();
                    await processOps();

                    assert.strictEqual(deltaManager.inbound.length, 3,
                        "none of the second batch ops are processed yet");
                    assert.strictEqual(1, batchBegin, "Did not receive correct batchBegin event for the batch");
                    assert.strictEqual(1, batchEnd, "Did not receive correct batchEnd event for the batch");

                    // End the batch - all ops should be processed.
                    pushOp(batchEndMessage);
                    await processOps();

                    assert.strictEqual(deltaManager.inbound.length, 0, "processed all ops");
                    assert.strictEqual(2, batchBegin, "Did not receive correct batchBegin event for the batch");
                    assert.strictEqual(2, batchEnd, "Did not receive correct batchEnd event for the batch");
                });

                it("non-batched ops followed by batch", async () => {
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

                    // Pause to not allow ops to be processed while we accumulated them.
                    await deltaManager.inbound.pause();

                    // Send a batch with 2 messages.
                    pushOp(batchMessage);
                    pushOp(batchMessage);

                    // Add incomplete batch
                    pushOp(batchBeginMessage);
                    pushOp(batchMessage);
                    pushOp(batchMessage);

                    await processOps();

                    assert.strictEqual(deltaManager.inbound.length, 5, "none of the batched ops are processed yet");

                    void deltaManager.inbound.resume();
                    await processOps();

                    assert.strictEqual(deltaManager.inbound.length, 3,
                        "none of the second batch ops are processed yet");

                    // End the batch - all ops should be processed.
                    pushOp(batchEndMessage);
                    await processOps();

                    assert.strictEqual(deltaManager.inbound.length, 0, "processed all ops");
                    assert.strictEqual(3, batchBegin, "Did not receive correct batchBegin event for the batch");
                    assert.strictEqual(3, batchEnd, "Did not receive correct batchEnd event for the batch");
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
                        it(`Partial batch messages, case ${counter}`, async () => {
                            // Send a batch with 3 messages from first client but don't send batch end message.
                            pushOp(batchBeginMessage);
                            pushOp(batchMessage);
                            pushOp(batchMessage);

                            await processOps();
                            assert.strictEqual(deltaManager.inbound.length, 3,
                                "Some of partial batch ops were processed");

                            assert.throws(() => pushOp(messageToFail));

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
