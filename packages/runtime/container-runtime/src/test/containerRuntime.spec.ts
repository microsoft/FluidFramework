/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { createSandbox } from "sinon";
import {
    AttachState,
    ContainerErrorType,
    IContainerContext,
    ICriticalContainerError,
} from "@fluidframework/container-definitions";
import { GenericError, DataProcessingError } from "@fluidframework/container-utils";
import {
    ISequencedDocumentMessage, MessageType,
} from "@fluidframework/protocol-definitions";
import { FlushMode } from "@fluidframework/runtime-definitions";
import {
    ConfigTypes,
    IConfigProviderBase,
    mixinMonitoringContext,
    MockLogger,
} from "@fluidframework/telemetry-utils";
import { MockDeltaManager, MockQuorumClients } from "@fluidframework/test-runtime-utils";
import { ContainerMessageType, ContainerRuntime } from "../containerRuntime";
import { PendingStateManager } from "../pendingStateManager";
import { DataStores } from "../dataStores";

describe("Runtime", () => {
    describe("Container Runtime", () => {
        describe("flushMode setting", () => {
            let containerRuntime: ContainerRuntime;
            const getMockContext = ((): Partial<IContainerContext> => {
                return {
                    attachState: AttachState.Attached,
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
                    let mockContext: Partial<IContainerContext>;
                    const submittedOpsMetdata: any[] = [];
                    const containerErrors: ICriticalContainerError[] = [];
                    let opFakeSequenceNumber = 1;
                    const getMockContext = ((): Partial<IContainerContext> => {
                        return {
                            attachState: AttachState.Attached,
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
                            submitFn: (_type: MessageType, _contents: any, _batch: boolean, appData?: any) => {
                                submittedOpsMetdata.push(appData);
                                return opFakeSequenceNumber++;
                            },
                            connected: true,
                        };
                    });

                    const getFirstContainerError = (): ICriticalContainerError => {
                        assert.ok(containerErrors.length > 0, "Container should have errors");
                        return containerErrors[0];
                    };

                    const expectedOrderSequentiallyErrorMessage = "orderSequentially callback exception";

                    beforeEach(async () => {
                        mockContext = getMockContext();
                        containerRuntime = await ContainerRuntime.load(
                            mockContext as IContainerContext,
                            [],
                            undefined, // requestHandler
                            {
                                summaryOptions: {
                                    summaryConfigOverrides: {
                                        state: "disabled",
                                    },
                                },
                                flushMode,
                            },
                        );
                        containerErrors.length = 0;
                        submittedOpsMetdata.length = 0;
                        opFakeSequenceNumber = 1;
                    });

                    it("Can't call flush() inside orderSequentially's callback", () => {
                        assert.throws(() => containerRuntime.orderSequentially(() => {
                            (containerRuntime as any).flush();
                        }));

                        const error = getFirstContainerError();
                        assert.ok(error instanceof GenericError);
                        assert.strictEqual(error.message, expectedOrderSequentiallyErrorMessage);
                    });

                    it("Can't call flush() inside orderSequentially's callback when nested", () => {
                        assert.throws(
                            () => containerRuntime.orderSequentially(
                                () => containerRuntime.orderSequentially(
                                    () => {
                                        (containerRuntime as any).flush();
                                    })));

                        const error = getFirstContainerError();
                        assert.ok(error instanceof GenericError);
                        assert.strictEqual(error.message, expectedOrderSequentiallyErrorMessage);
                    });

                    it("Can't call flush() inside orderSequentially's callback when nested ignoring exceptions", () => {
                        containerRuntime.orderSequentially(() => {
                            try {
                                containerRuntime.orderSequentially(() => {
                                    (containerRuntime as any).flush();
                                });
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

                    it("Batching property set properly", () => {
                        containerRuntime.orderSequentially(() => {
                            containerRuntime.submitDataStoreOp("1", "test");
                            containerRuntime.submitDataStoreOp("2", "test");
                            containerRuntime.submitDataStoreOp("3", "test");
                        });
                        (containerRuntime as any).flush();

                        assert.strictEqual(submittedOpsMetdata.length, 3, "3 messages should be sent");
                        assert.strictEqual(submittedOpsMetdata[0].batch, true,
                            "first message should be the batch start");
                        assert.strictEqual(submittedOpsMetdata[1], undefined,
                            "second message should not hold batch info");
                        assert.strictEqual(submittedOpsMetdata[2].batch, false,
                            "third message should be the batch end");
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
                            attachState: AttachState.Attached,
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
                                flushMode,
                            },
                        );
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
                        containerRuntime.orderSequentially(() => { });

                        assert.strictEqual(containerErrors.length, 0);
                    });
                });
            }));

        describe("Dirty flag", () => {
            const sandbox = createSandbox();
            const createMockContext =
                (attachState: AttachState, addPendingMsg: boolean): Partial<IContainerContext> => {
                    const pendingState = {
                        pending: {
                            pendingStates: [{
                                type: "message",
                                messageType: ContainerMessageType.BlobAttach,
                                content: {},
                            }],
                        },
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

        describe("Pending state progress tracking", () => {
            const maxReconnects = 7;

            let containerRuntime: ContainerRuntime;
            const mockLogger = new MockLogger();
            const containerErrors: ICriticalContainerError[] = [];
            const getMockContext = (): Partial<IContainerContext> => {
                return {
                    clientId: "fakeClientId",
                    attachState: AttachState.Attached,
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
                        attempts: 3,
                        pendingMessages: 3,
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
                        attempts: 3,
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
                        attempts: 3,
                        pendingMessages: 3,
                    }]);
                });
        });

        describe("User input validations", () => {
            let containerRuntime: ContainerRuntime;
            const getMockContext = ((): Partial<IContainerContext> => {
                return {
                    attachState: AttachState.Attached,
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
