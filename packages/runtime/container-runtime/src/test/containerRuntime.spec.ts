/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { EventEmitter } from "events";
import { createSandbox } from "sinon";
import {
    AttachState,
    ContainerErrorType,
    IContainerContext,
    ICriticalContainerError,
} from "@fluidframework/container-definitions";
import { GenericError, DataProcessingError } from "@fluidframework/container-utils";
import {
    ISequencedDocumentMessage,
    MessageType,
} from "@fluidframework/protocol-definitions";
import { FlushMode } from "@fluidframework/runtime-definitions";
import {
    ConfigTypes,
    DebugLogger,
    IConfigProviderBase,
    mixinMonitoringContext,
    MockLogger,
} from "@fluidframework/telemetry-utils";
import { MockDeltaManager, MockQuorumClients } from "@fluidframework/test-runtime-utils";
import { ContainerMessageType, ContainerRuntime, ScheduleManager } from "../containerRuntime";
import { PendingStateManager } from "../pendingStateManager";
import { DataStores } from "../dataStores";

describe("Runtime", () => {
    describe("Container Runtime", () => {
        describe("flushMode setting", () => {
            let containerRuntime: ContainerRuntime;
            const getMockContext = ((): Partial<IContainerContext> => {
                return {
                    deltaManager: new MockDeltaManager(),
                    quorum: new MockQuorumClients(),
                    taggedLogger: new MockLogger(),
                    clientDetails: { capabilities: { interactive: true } },
                    closeFn: (_error?: ICriticalContainerError): void => { },
                    updateDirtyContainerState: (_dirty: boolean) => { },
                };
            });

            it("Default flush mode", async () => {
                containerRuntime = await ContainerRuntime.load(
                    getMockContext() as IContainerContext,
                    [],
                    undefined, // requestHandler
                    {}, // runtimeOptions
                );

                assert.strictEqual(containerRuntime.flushMode, FlushMode.TurnBased);
            });

            it("Override default flush mode using options", async () => {
                containerRuntime = await ContainerRuntime.load(
                    getMockContext() as IContainerContext,
                    [],
                    undefined, // requestHandler
                    {
                        flushMode: FlushMode.Immediate,
                    },
                );

                assert.strictEqual(containerRuntime.flushMode, FlushMode.Immediate);
            });
        });

        describe("orderSequentially", () =>
            [FlushMode.TurnBased, FlushMode.Immediate].forEach((flushMode: FlushMode) => {
                describe(`orderSequentially with flush mode: ${FlushMode[flushMode]}`, () => {
                    let containerRuntime: ContainerRuntime;
                    const containerErrors: ICriticalContainerError[] = [];
                    const getMockContext = ((): Partial<IContainerContext> => {
                        return {
                            deltaManager: new MockDeltaManager(),
                            quorum: new MockQuorumClients(),
                            taggedLogger: new MockLogger(),
                            clientDetails: { capabilities: { interactive: true } },
                            closeFn: (error?: ICriticalContainerError): void => {
                                if (error !== undefined) {
                                    containerErrors.push(error);
                                }
                            },
                            updateDirtyContainerState: (_dirty: boolean) => { },
                        };
                    });

                    const getFirstContainerError = (): ICriticalContainerError => {
                        assert.ok(containerErrors.length > 0, "Container should have errors");
                        return containerErrors[0];
                    };

                    const expectedOrderSequentiallyErrorMessage = "orderSequentially callback exception";

                    beforeEach(async () => {
                        containerRuntime = await ContainerRuntime.load(
                            getMockContext() as IContainerContext,
                            [],
                            undefined, // requestHandler
                            {
                                summaryOptions: {
                                    summaryConfigOverrides: {
                                        state: "disabled",
                                    },
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
                        assert.strictEqual(error.message, expectedOrderSequentiallyErrorMessage);
                    });

                    it("Can't call flush() inside orderSequentially's callback when nested", () => {
                        assert.throws(
                            () => containerRuntime.orderSequentially(
                                () => containerRuntime.orderSequentially(
                                    () => containerRuntime.flush())));

                        const error = getFirstContainerError();
                        assert.ok(error instanceof GenericError);
                        assert.strictEqual(error.message, expectedOrderSequentiallyErrorMessage);
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
                        assert.strictEqual(error.message, expectedOrderSequentiallyErrorMessage);
                    });

                    it("Errors propagate to the container", () => {
                        assert.throws(
                            () => containerRuntime.orderSequentially(
                                () => {
                                    throw new Error("Any");
                                }));

                        const error = getFirstContainerError();
                        assert.ok(error instanceof GenericError);
                        assert.strictEqual(error.message, expectedOrderSequentiallyErrorMessage);
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
                        assert.strictEqual(error.message, expectedOrderSequentiallyErrorMessage);
                        assert.strictEqual(error.error.message, "Any");
                    });
                });
            }));

            describe("orderSequentially with rollback", () =>
            [FlushMode.TurnBased, FlushMode.Immediate].forEach((flushMode: FlushMode) => {
                describe(`orderSequentially with flush mode: ${FlushMode[flushMode]}`, () => {
                    let containerRuntime: ContainerRuntime;
                    const containerErrors: ICriticalContainerError[] = [];

                    const configProvider = ((settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
                        getRawConfig: (name: string): ConfigTypes => settings[name],
                    }));

                    const getMockContext = ((): Partial<IContainerContext> => {
                        return {
                            deltaManager: new MockDeltaManager(),
                            quorum: new MockQuorumClients(),
                            taggedLogger: mixinMonitoringContext(new MockLogger(), configProvider({
                                "Fluid.ContainerRuntime.EnableRollback": true,
                            })) as unknown as MockLogger,
                            clientDetails: { capabilities: { interactive: true } },
                            closeFn: (error?: ICriticalContainerError): void => {
                                if (error !== undefined) {
                                    containerErrors.push(error);
                                }
                            },
                            updateDirtyContainerState: (dirty: boolean) => { },
                        };
                    });

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

                    it("No errors propagate to the container on rollback", () => {
                        assert.throws(
                            () => containerRuntime.orderSequentially(
                                () => {
                                    throw new Error("Any");
                                }));

                        assert.strictEqual(containerErrors.length, 0);
                    });

                    it("No errors on successful callback with rollback set", () => {
                        containerRuntime.orderSequentially(() => {});

                        assert.strictEqual(containerErrors.length, 0);
                    });
                });
            }));

        describe("Dirty flag", () => {
            const sandbox = createSandbox();
            const createMockContext =
                (attachState: AttachState, addPendingMsg: boolean): Partial<IContainerContext> => {
                    const pendingState = {
                        pending: { pendingStates: [{
                            type: "attach",
                            content: {},
                        }] },
                        savedOps: [],
                    };

                    return {
                        deltaManager: new MockDeltaManager(),
                        quorum: new MockQuorumClients(),
                        taggedLogger: new MockLogger(),
                        clientDetails: { capabilities: { interactive: true } },
                        updateDirtyContainerState: (_dirty: boolean) => { },
                        attachState,
                        pendingLocalState: addPendingMsg ? pendingState : undefined,
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
        describe("Pending state progress tracking", () => {
            const maxReconnects = 15;

            let containerRuntime: ContainerRuntime;
            const mockLogger = new MockLogger();
            const containerErrors: ICriticalContainerError[] = [];
            const getMockContext = (): Partial<IContainerContext> => {
                return {
                    clientId: "fakeClientId",
                    deltaManager: new MockDeltaManager(),
                    quorum: new MockQuorumClients(),
                    taggedLogger: mockLogger,
                    clientDetails: { capabilities: { interactive: true } },
                    closeFn: (error?: ICriticalContainerError): void => {
                        if (error !== undefined) {
                            containerErrors.push(error);
                        }
                    },
                    updateDirtyContainerState: (_dirty: boolean) => { },
                };
            };
            const getMockPendingStateManager = (): PendingStateManager => {
                // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
                let pendingMessages = 0;
                return {
                    replayPendingStates: () => { },
                    hasPendingMessages: (): boolean => pendingMessages > 0,
                    processMessage: (_message: ISequencedDocumentMessage, _local: boolean) => {
                        return { localAck: false, localOpMetadata: undefined };
                    },
                    processPendingLocalMessage: (_message: ISequencedDocumentMessage) => {
                        return undefined;
                    },
                    get pendingMessagesCount() {
                        return pendingMessages;
                    },
                    onSubmitMessage: (
                        _type: ContainerMessageType,
                        _clientSequenceNumber: number,
                        _referenceSequenceNumber: number,
                        _content: any,
                        _localOpMetadata: unknown,
                        _opMetadata: Record<string, unknown> | undefined,
                    ) => pendingMessages++,
                } as unknown as PendingStateManager;
            };
            const getMockDataStores = (): DataStores => {
                // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
                return {
                    processFluidDataStoreOp:
                        (_message: ISequencedDocumentMessage,
                            _local: boolean,
                            _localMessageMetadata: unknown) => { },
                    setConnectionState: (_connected: boolean, _clientId?: string) => { },
                } as DataStores;
            };

            const getFirstContainerError = (): ICriticalContainerError => {
                assert.ok(containerErrors.length > 0, "Container should have errors");
                return containerErrors[0];
            };

            beforeEach(async () => {
                containerErrors.length = 0;
                containerRuntime = await ContainerRuntime.load(
                    getMockContext() as IContainerContext,
                    [],
                    undefined, // requestHandler
                    {
                        summaryOptions: {
                            summaryConfigOverrides: {
                                state: "disabled",
                            },
                        },
                    },
                );
            });

            function patchRuntime(
                pendingStateManager: PendingStateManager,
                _maxReconnects: number | undefined = undefined,
            ) {
                const runtime = containerRuntime as any;
                runtime.pendingStateManager = pendingStateManager;
                runtime.dataStores = getMockDataStores();
                runtime.maxConsecutiveReconnects = _maxReconnects ?? runtime.maxConsecutiveReconnects;
                return runtime as ContainerRuntime;
            }

            const toggleConnection = (runtime: ContainerRuntime) => {
                runtime.setConnectionState(false);
                runtime.setConnectionState(true);
            };

            const addPendingMessage = (pendingStateManager: PendingStateManager): void =>
                pendingStateManager.onSubmitMessage(ContainerMessageType.FluidDataStoreOp, 0, 0, "", "", undefined);

            it(`No progress for ${maxReconnects} connection state changes and pending state will ` +
                "close the container", async () => {
                    const pendingStateManager = getMockPendingStateManager();
                    patchRuntime(pendingStateManager);

                    for (let i = 0; i < maxReconnects; i++) {
                        addPendingMessage(pendingStateManager);
                        toggleConnection(containerRuntime);
                    }

                    const error = getFirstContainerError();
                    assert.ok(error instanceof DataProcessingError);
                    assert.strictEqual(error.getTelemetryProperties().attempts, maxReconnects);
                    assert.strictEqual(error.getTelemetryProperties().pendingMessages, maxReconnects);
                    mockLogger.assertMatchAny([{
                        eventName: "ContainerRuntime:ReconnectsWithNoProgress",
                        attempts: 7,
                        pendingMessages: 7,
                    }]);
                });

            it(`No progress for ${maxReconnects} / 2 connection state changes and pending state will ` +
                "not close the container", async () => {
                    const pendingStateManager = getMockPendingStateManager();
                    patchRuntime(pendingStateManager);
                    addPendingMessage(pendingStateManager);

                    for (let i = 0; i < maxReconnects / 2; i++) {
                        toggleConnection(containerRuntime);
                    }

                    assert.equal(containerErrors.length, 0);
                    mockLogger.assertMatchAny([{
                        eventName: "ContainerRuntime:ReconnectsWithNoProgress",
                        attempts: 7,
                        pendingMessages: 1,
                    }]);
                });

            it(`No progress for ${maxReconnects} connection state changes and pending state with` +
                "feature disabled will not close the container", async () => {
                    const pendingStateManager = getMockPendingStateManager();
                    patchRuntime(pendingStateManager, -1 /* maxConsecutiveReplays */);

                    for (let i = 0; i < maxReconnects; i++) {
                        addPendingMessage(pendingStateManager);
                        toggleConnection(containerRuntime);
                    }

                    assert.equal(containerErrors.length, 0);
                    mockLogger.assertMatch([]);
                });

            it(`No progress for ${maxReconnects} connection state changes and no pending state will ` +
                "not close the container", async () => {
                    const pendingStateManager = getMockPendingStateManager();
                    patchRuntime(pendingStateManager);

                    for (let i = 0; i < maxReconnects; i++) {
                        toggleConnection(containerRuntime);
                    }

                    assert.equal(containerErrors.length, 0);
                    mockLogger.assertMatch([]);
                });

            it(`No progress for ${maxReconnects} connection state changes and pending state but successfully ` +
                "processing local op will not close the container", async () => {
                    const pendingStateManager = getMockPendingStateManager();
                    patchRuntime(pendingStateManager);
                    addPendingMessage(pendingStateManager);

                    for (let i = 0; i < maxReconnects; i++) {
                        containerRuntime.setConnectionState(!containerRuntime.connected);
                        containerRuntime.process({
                            type: "op",
                            clientId: "clientId",
                            sequenceNumber: 0,
                            contents: {
                                address: "address",
                            },
                        } as any as ISequencedDocumentMessage, true /* local */);
                    }

                    assert.equal(containerErrors.length, 0);
                    mockLogger.assertMatch([]);
                });

            it(`No progress for ${maxReconnects} connection state changes and pending state but successfully ` +
                "processing remote op will close the container", async () => {
                    const pendingStateManager = getMockPendingStateManager();
                    patchRuntime(pendingStateManager);

                    for (let i = 0; i < maxReconnects; i++) {
                        addPendingMessage(pendingStateManager);
                        toggleConnection(containerRuntime);
                        containerRuntime.process({
                            type: "op",
                            clientId: "clientId",
                            sequenceNumber: 0,
                            contents: {
                                address: "address",
                            },
                        } as any as ISequencedDocumentMessage, false /* local */);
                    }

                    const error = getFirstContainerError();
                    assert.ok(error instanceof DataProcessingError);
                    assert.strictEqual(error.getTelemetryProperties().attempts, maxReconnects);
                    assert.strictEqual(error.getTelemetryProperties().pendingMessages, maxReconnects);
                    mockLogger.assertMatchAny([{
                        eventName: "ContainerRuntime:ReconnectsWithNoProgress",
                        attempts: 7,
                        pendingMessages: 7,
                    }]);
                });
        });

        describe("User input validations", () => {
            let containerRuntime: ContainerRuntime;
            const getMockContext = ((): Partial<IContainerContext> => {
                return {
                    deltaManager: new MockDeltaManager(),
                    quorum: new MockQuorumClients(),
                    taggedLogger: new MockLogger(),
                    clientDetails: { capabilities: { interactive: true } },
                    closeFn: (_error?: ICriticalContainerError): void => { },
                    updateDirtyContainerState: (_dirty: boolean) => { },
                };
            });

            before(async () => {
                containerRuntime = await ContainerRuntime.load(
                    getMockContext() as IContainerContext,
                    [],
                    undefined, // requestHandler
                    {}, // runtimeOptions
                );
            });

            it("cannot create root data store with slashes in id", async () => {
                const invalidId = "beforeSlash/afterSlash";
                const codeBlock = async () => {
                    await containerRuntime.createRootDataStore("", invalidId);
                };
                await assert.rejects(codeBlock,
                    (e) => e.errorType === ContainerErrorType.usageError
                        && e.message === `Id cannot contain slashes: '${invalidId}'`);
            });

            it("cannot create detached root data store with slashes in id", async () => {
                const invalidId = "beforeSlash/afterSlash";
                const codeBlock = () => {
                    containerRuntime.createDetachedRootDataStore([""], invalidId);
                };
                assert.throws(codeBlock,
                    (e) => e.errorType === ContainerErrorType.usageError
                        && e.message === `Id cannot contain slashes: '${invalidId}'`);
            });
        });
    });
});
