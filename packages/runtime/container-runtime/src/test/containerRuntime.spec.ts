/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { createSandbox, SinonFakeTimers, useFakeTimers } from "sinon";
import {
	AttachState,
	ContainerErrorType,
	ContainerErrorTypes,
	IContainerContext,
	ICriticalContainerError,
} from "@fluidframework/container-definitions";
import {
	ISequencedDocumentMessage,
	ISummaryTree,
	MessageType,
} from "@fluidframework/protocol-definitions";
import {
	FlushMode,
	FlushModeExperimental,
	ISummaryTreeWithStats,
	NamedFluidDataStoreRegistryEntries,
} from "@fluidframework/runtime-definitions";
import {
	createChildLogger,
	isFluidError,
	isILoggingError,
	mixinMonitoringContext,
	MockLogger,
} from "@fluidframework/telemetry-utils";
import { MockDeltaManager, MockQuorumClients } from "@fluidframework/test-runtime-utils";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import {
	IErrorBase,
	IResponse,
	FluidObject,
	IGenericError,
	ConfigTypes,
	IConfigProviderBase,
} from "@fluidframework/core-interfaces";
import { IDocumentStorageService, ISummaryContext } from "@fluidframework/driver-definitions";
import {
	CompressionAlgorithms,
	ContainerRuntime,
	IContainerRuntimeOptions,
	defaultPendingOpsWaitTimeoutMs,
} from "../containerRuntime";
import {
	ContainerMessageType,
	type RecentlyAddedContainerRuntimeMessageDetails,
	type OutboundContainerRuntimeMessage,
} from "../messageTypes";
import { PendingStateManager } from "../pendingStateManager";
import { DataStores } from "../dataStores";
import { ISummaryCancellationToken, neverCancelledSummaryToken } from "../summary";

describe("Runtime", () => {
	const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
		getRawConfig: (name: string): ConfigTypes => settings[name],
	});

	let submittedOps: any[] = [];
	let opFakeSequenceNumber = 1;
	let clock: SinonFakeTimers;

	before(() => {
		clock = useFakeTimers();
	});

	beforeEach(() => {
		submittedOps = [];
		opFakeSequenceNumber = 1;
	});

	afterEach(() => {
		clock.reset();
	});

	after(() => {
		clock.restore();
	});

	const getMockContext = (
		settings: Record<string, ConfigTypes> = {},
		logger = new MockLogger(),
	): Partial<IContainerContext> => {
		const mockClientId = "mockClientId";

		// Mock the storage layer so "submitSummary" works.
		const mockStorage: Partial<IDocumentStorageService> = {
			uploadSummaryWithContext: async (summary: ISummaryTree, context: ISummaryContext) => {
				return "fakeHandle";
			},
		};
		const mockContext = {
			attachState: AttachState.Attached,
			deltaManager: new MockDeltaManager(),
			quorum: new MockQuorumClients(),
			taggedLogger: mixinMonitoringContext(logger, configProvider(settings)).logger,
			clientDetails: { capabilities: { interactive: true } },
			closeFn: (_error?: ICriticalContainerError): void => {},
			updateDirtyContainerState: (_dirty: boolean) => {},
			getLoadedFromVersion: () => undefined,
			submitFn: (_type: MessageType, contents: any, _batch: boolean, appData?: any) => {
				submittedOps.push(contents);
				return opFakeSequenceNumber++;
			},
			clientId: mockClientId,
			connected: true,
			storage: mockStorage as IDocumentStorageService,
		};

		// Update the delta manager's last message which is used for validation during summarization.
		mockContext.deltaManager.lastMessage = {
			clientId: mockClientId,
			type: MessageType.Operation,
			sequenceNumber: 0,
			timestamp: Date.now(),
			minimumSequenceNumber: 0,
			referenceSequenceNumber: 0,
			clientSequenceNumber: 0,
			contents: undefined,
		};
		return mockContext;
	};

	const mockProvideEntryPoint = async () => ({
		myProp: "myValue",
	});

	describe("Container Runtime", () => {
		describe("flushMode setting", () => {
			it("Default flush mode", async () => {
				const containerRuntime = await ContainerRuntime.loadRuntime({
					context: getMockContext() as IContainerContext,
					registryEntries: [],
					existing: false,
					runtimeOptions: {},
					provideEntryPoint: mockProvideEntryPoint,
				});

				assert.strictEqual(containerRuntime.flushMode, FlushMode.TurnBased);
			});

			it("Override default flush mode using options", async () => {
				const containerRuntime = await ContainerRuntime.loadRuntime({
					context: getMockContext() as IContainerContext,
					registryEntries: [],
					existing: false,
					runtimeOptions: {
						flushMode: FlushMode.Immediate,
					},
					provideEntryPoint: mockProvideEntryPoint,
				});

				assert.strictEqual(containerRuntime.flushMode, FlushMode.Immediate);
			});

			it("Replaying ops should resend in correct order", async () => {
				const containerRuntime = await ContainerRuntime.loadRuntime({
					context: getMockContext() as IContainerContext,
					registryEntries: [],
					existing: false,
					runtimeOptions: {
						flushMode: FlushMode.TurnBased,
					},
					provideEntryPoint: mockProvideEntryPoint,
				});

				// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
				(containerRuntime as any).dataStores = {
					setConnectionState: (_connected: boolean, _clientId?: string) => {},
					// Pass data store op right back to ContainerRuntime
					resubmitDataStoreOp: (envelope, localOpMetadata) => {
						containerRuntime.submitDataStoreOp(
							envelope.address,
							envelope.contents,
							localOpMetadata,
						);
					},
				} as DataStores;

				containerRuntime.setConnectionState(false);

				containerRuntime.submitDataStoreOp("1", "test");
				(containerRuntime as any).flush();

				containerRuntime.submitDataStoreOp("2", "test");
				containerRuntime.setConnectionState(true);
				(containerRuntime as any).flush();

				assert.strictEqual(submittedOps.length, 2);
				assert.strictEqual(submittedOps[0].contents.address, "1");
				assert.strictEqual(submittedOps[1].contents.address, "2");
			});
		});

		describe("orderSequentially", () =>
			[
				FlushMode.TurnBased,
				FlushMode.Immediate,
				FlushModeExperimental.Async as unknown as FlushMode,
			].forEach((flushMode: FlushMode) => {
				describe(`orderSequentially with flush mode: ${
					FlushMode[flushMode] ?? FlushModeExperimental[flushMode]
				}`, () => {
					let containerRuntime: ContainerRuntime;
					let mockContext: Partial<IContainerContext>;
					const submittedOpsMetdata: any[] = [];
					const containerErrors: ICriticalContainerError[] = [];
					const getMockContextForOrderSequentially = (): Partial<IContainerContext> => {
						return {
							attachState: AttachState.Attached,
							deltaManager: new MockDeltaManager(),
							quorum: new MockQuorumClients(),
							taggedLogger: new MockLogger(),
							supportedFeatures: new Map([["referenceSequenceNumbers", true]]),
							clientDetails: { capabilities: { interactive: true } },
							closeFn: (error?: ICriticalContainerError): void => {
								if (error !== undefined) {
									containerErrors.push(error);
								}
							},
							updateDirtyContainerState: (_dirty: boolean) => {},
							submitFn: (
								_type: MessageType,
								contents: any,
								_batch: boolean,
								appData?: any,
							) => {
								if (contents.type === "groupedBatch") {
									for (const subMessage of contents.contents) {
										submittedOpsMetdata.push(subMessage.metadata);
									}
								} else {
									submittedOpsMetdata.push(appData);
								}
								return opFakeSequenceNumber++;
							},
							connected: true,
							clientId: "fakeClientId",
							getLoadedFromVersion: () => undefined,
						};
					};

					const getFirstContainerError = (): ICriticalContainerError => {
						assert.ok(containerErrors.length > 0, "Container should have errors");
						return containerErrors[0];
					};

					const expectedOrderSequentiallyErrorMessage =
						"orderSequentially callback exception";

					beforeEach(async () => {
						mockContext = getMockContextForOrderSequentially();
						containerRuntime = await ContainerRuntime.loadRuntime({
							context: mockContext as IContainerContext,
							registryEntries: [],
							existing: false,
							runtimeOptions: {
								summaryOptions: {
									summaryConfigOverrides: {
										state: "disabled",
									},
								},
								flushMode,
							},
							provideEntryPoint: mockProvideEntryPoint,
						});
						containerErrors.length = 0;
						submittedOpsMetdata.length = 0;
					});

					it("Can't call flush() inside orderSequentially's callback", () => {
						assert.throws(() =>
							containerRuntime.orderSequentially(() => {
								(containerRuntime as any).flush();
							}),
						);

						const error = getFirstContainerError();
						assert.strictEqual(error.errorType, ContainerErrorTypes.genericError);
						assert.strictEqual(error.message, expectedOrderSequentiallyErrorMessage);
					});

					it("Can't call flush() inside orderSequentially's callback when nested", () => {
						assert.throws(() =>
							containerRuntime.orderSequentially(() =>
								containerRuntime.orderSequentially(() => {
									(containerRuntime as any).flush();
								}),
							),
						);

						const error = getFirstContainerError();
						assert.strictEqual(error.errorType, ContainerErrorTypes.genericError);
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
						assert.strictEqual(error.errorType, ContainerErrorTypes.genericError);
						assert.strictEqual(error.message, expectedOrderSequentiallyErrorMessage);
					});

					it("Errors propagate to the container", () => {
						assert.throws(() =>
							containerRuntime.orderSequentially(() => {
								throw new Error("Any");
							}),
						);

						const error = getFirstContainerError();
						assert(isFluidError(error));
						assert.strictEqual(error.errorType, ContainerErrorTypes.genericError);
						assert.strictEqual(error.message, expectedOrderSequentiallyErrorMessage);
						assert.strictEqual((error as IGenericError).error.message, "Any");
					});

					it("Errors propagate to the container when nested", () => {
						assert.throws(() =>
							containerRuntime.orderSequentially(() =>
								containerRuntime.orderSequentially(() => {
									throw new Error("Any");
								}),
							),
						);

						const error = getFirstContainerError();
						assert(isFluidError(error));
						assert.strictEqual(error.errorType, ContainerErrorTypes.genericError);
						assert.strictEqual(error.message, expectedOrderSequentiallyErrorMessage);
						assert.strictEqual((error as IGenericError).error.message, "Any");
					});

					it("Batching property set properly", () => {
						containerRuntime.orderSequentially(() => {
							containerRuntime.submitDataStoreOp("1", "test");
							containerRuntime.submitDataStoreOp("2", "test");
							containerRuntime.submitDataStoreOp("3", "test");
						});
						(containerRuntime as any).flush();

						assert.strictEqual(
							submittedOpsMetdata.length,
							3,
							"3 messages should be sent",
						);
						assert.strictEqual(
							submittedOpsMetdata[0].batch,
							true,
							"first message should be the batch start",
						);
						assert.strictEqual(
							submittedOpsMetdata[1],
							undefined,
							"second message should not hold batch info",
						);
						assert.strictEqual(
							submittedOpsMetdata[2].batch,
							false,
							"third message should be the batch end",
						);
					});

					it("Resubmitting batch preserves original batches", async () => {
						// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
						(containerRuntime as any).dataStores = {
							setConnectionState: (_connected: boolean, _clientId?: string) => {},
							// Pass data store op right back to ContainerRuntime
							resubmitDataStoreOp: (envelope, localOpMetadata) => {
								containerRuntime.submitDataStoreOp(
									envelope.address,
									envelope.contents,
									localOpMetadata,
								);
							},
						} as DataStores;

						containerRuntime.setConnectionState(false);

						containerRuntime.orderSequentially(() => {
							containerRuntime.submitDataStoreOp("1", "test");
							containerRuntime.submitDataStoreOp("2", "test");
							containerRuntime.submitDataStoreOp("3", "test");
						});
						(containerRuntime as any).flush();

						containerRuntime.orderSequentially(() => {
							containerRuntime.submitDataStoreOp("4", "test");
							containerRuntime.submitDataStoreOp("5", "test");
							containerRuntime.submitDataStoreOp("6", "test");
						});
						(containerRuntime as any).flush();

						assert.strictEqual(
							submittedOpsMetdata.length,
							0,
							"no messages should be sent",
						);

						containerRuntime.setConnectionState(true);

						assert.strictEqual(
							submittedOpsMetdata.length,
							6,
							"6 messages should be sent",
						);

						const expectedBatchMetadata = [
							{ batch: true },
							undefined,
							{ batch: false },
							{ batch: true },
							undefined,
							{ batch: false },
						];

						assert.deepStrictEqual(
							submittedOpsMetdata,
							expectedBatchMetadata,
							"batch metadata does not match",
						);
					});
				});
			}));

		describe("Op reentry enforcement", () => {
			let containerRuntime: ContainerRuntime;

			it("By default, don't enforce the op reentry check", async () => {
				containerRuntime = await ContainerRuntime.loadRuntime({
					context: getMockContext() as IContainerContext,
					registryEntries: [],
					provideEntryPoint: mockProvideEntryPoint,
					existing: false,
				});

				assert.ok(
					containerRuntime.ensureNoDataModelChanges(() => {
						containerRuntime.submitDataStoreOp("id", "test");
						return true;
					}),
				);

				assert.ok(
					containerRuntime.ensureNoDataModelChanges(() =>
						containerRuntime.ensureNoDataModelChanges(() =>
							containerRuntime.ensureNoDataModelChanges(() => {
								containerRuntime.submitDataStoreOp("id", "test");
								return true;
							}),
						),
					),
				);
			});

			it("If option enabled, enforce the op reentry check", async () => {
				containerRuntime = await ContainerRuntime.loadRuntime({
					context: getMockContext() as IContainerContext,
					registryEntries: [],
					runtimeOptions: {
						enableOpReentryCheck: true,
					},
					provideEntryPoint: mockProvideEntryPoint,
					existing: false,
				});

				assert.throws(() =>
					containerRuntime.ensureNoDataModelChanges(() =>
						containerRuntime.submitDataStoreOp("id", "test"),
					),
				);

				assert.throws(() =>
					containerRuntime.ensureNoDataModelChanges(() =>
						containerRuntime.ensureNoDataModelChanges(() =>
							containerRuntime.ensureNoDataModelChanges(() =>
								containerRuntime.submitDataStoreOp("id", "test"),
							),
						),
					),
				);
			});

			it("If option enabled but disabled via feature gate, don't enforce the op reentry check", async () => {
				containerRuntime = await ContainerRuntime.loadRuntime({
					context: getMockContext({
						"Fluid.ContainerRuntime.DisableOpReentryCheck": true,
					}) as IContainerContext,
					registryEntries: [],
					runtimeOptions: {
						enableOpReentryCheck: true,
					},
					provideEntryPoint: mockProvideEntryPoint,
					existing: false,
				});

				containerRuntime.ensureNoDataModelChanges(() =>
					containerRuntime.submitDataStoreOp("id", "test"),
				);

				containerRuntime.ensureNoDataModelChanges(() =>
					containerRuntime.ensureNoDataModelChanges(() =>
						containerRuntime.ensureNoDataModelChanges(() =>
							containerRuntime.submitDataStoreOp("id", "test"),
						),
					),
				);
			});

			it("Report at most 5 reentrant ops", async () => {
				const mockLogger = new MockLogger();
				containerRuntime = await ContainerRuntime.loadRuntime({
					context: getMockContext({}, mockLogger) as IContainerContext,
					registryEntries: [],
					provideEntryPoint: mockProvideEntryPoint,
					existing: false,
				});

				mockLogger.clear();
				containerRuntime.ensureNoDataModelChanges(() => {
					for (let i = 0; i < 10; i++) {
						containerRuntime.submitDataStoreOp("id", "test");
					}
				});

				// We expect only 5 events
				mockLogger.assertMatchStrict(
					Array.from(Array(5).keys()).map(() => ({
						eventName: "ContainerRuntime:OpReentry",
						error: "Op was submitted from within a `ensureNoDataModelChanges` callback",
					})),
				);
			});

			it("Can't call flush() inside ensureNoDataModelChanges's callback", async () => {
				containerRuntime = await ContainerRuntime.loadRuntime({
					context: getMockContext() as IContainerContext,
					registryEntries: [],
					runtimeOptions: {
						flushMode: FlushMode.Immediate,
					},
					provideEntryPoint: mockProvideEntryPoint,
					existing: false,
				});

				assert.throws(() =>
					containerRuntime.ensureNoDataModelChanges(() => {
						containerRuntime.orderSequentially(() => {});
					}),
				);
			});

			it("Can't create an infinite ensureNoDataModelChanges recursive call ", async () => {
				containerRuntime = await ContainerRuntime.loadRuntime({
					context: getMockContext() as IContainerContext,
					registryEntries: [],
					provideEntryPoint: mockProvideEntryPoint,
					existing: false,
				});

				const callback = () => {
					containerRuntime.ensureNoDataModelChanges(() => {
						containerRuntime.submitDataStoreOp("id", "test");
						callback();
					});
				};
				assert.throws(() => callback());
			});
		});

		describe("orderSequentially with rollback", () =>
			[
				FlushMode.TurnBased,
				FlushMode.Immediate,
				FlushModeExperimental.Async as unknown as FlushMode,
			].forEach((flushMode: FlushMode) => {
				describe(`orderSequentially with flush mode: ${
					FlushMode[flushMode] ?? FlushModeExperimental[flushMode]
				}`, () => {
					let containerRuntime: ContainerRuntime;
					const containerErrors: ICriticalContainerError[] = [];

					const getMockContextForOrderSequentially = (): Partial<IContainerContext> => ({
						attachState: AttachState.Attached,
						deltaManager: new MockDeltaManager(),
						quorum: new MockQuorumClients(),
						taggedLogger: mixinMonitoringContext(
							new MockLogger(),
							configProvider({
								"Fluid.ContainerRuntime.EnableRollback": true,
							}),
						) as unknown as MockLogger,
						clientDetails: { capabilities: { interactive: true } },
						closeFn: (error?: ICriticalContainerError): void => {
							if (error !== undefined) {
								containerErrors.push(error);
							}
						},
						updateDirtyContainerState: (dirty: boolean) => {},
						getLoadedFromVersion: () => undefined,
					});

					beforeEach(async () => {
						containerRuntime = await ContainerRuntime.loadRuntime({
							context: getMockContextForOrderSequentially() as IContainerContext,
							registryEntries: [],
							existing: false,
							runtimeOptions: {
								summaryOptions: {
									summaryConfigOverrides: { state: "disabled" },
								},
								flushMode,
							},
							provideEntryPoint: mockProvideEntryPoint,
						});
						containerErrors.length = 0;
					});

					it("No errors propagate to the container on rollback", () => {
						assert.throws(() =>
							containerRuntime.orderSequentially(() => {
								throw new Error("Any");
							}),
						);

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
			const createMockContext = (
				attachState: AttachState,
				addPendingMsg: boolean,
			): Partial<IContainerContext> => {
				const pendingState = {
					pending: {
						pendingStates: [
							{
								type: "message",
								content: `{"type": "${ContainerMessageType.BlobAttach}", "contents": {}}`,
							},
						],
					},
					savedOps: [],
				};

				return {
					deltaManager: new MockDeltaManager(),
					quorum: new MockQuorumClients(),
					taggedLogger: new MockLogger(),
					clientDetails: { capabilities: { interactive: true } },
					updateDirtyContainerState: (_dirty: boolean) => {},
					attachState,
					pendingLocalState: addPendingMsg ? pendingState : undefined,
					getLoadedFromVersion: () => undefined,
				};
			};

			it("should NOT be set to dirty if context is attached with no pending ops", async () => {
				const mockContext = createMockContext(AttachState.Attached, false);
				const updateDirtyStateStub = sandbox.stub(mockContext, "updateDirtyContainerState");
				await ContainerRuntime.loadRuntime({
					context: mockContext as IContainerContext,
					registryEntries: [],
					existing: false,
					runtimeOptions: undefined,
					containerScope: {},
					provideEntryPoint: mockProvideEntryPoint,
				});
				assert.deepStrictEqual(updateDirtyStateStub.calledOnce, true);
				assert.deepStrictEqual(updateDirtyStateStub.args, [[false]]);
			});

			it("should be set to dirty if context is attached with pending ops", async () => {
				const mockContext = createMockContext(AttachState.Attached, true);
				const updateDirtyStateStub = sandbox.stub(mockContext, "updateDirtyContainerState");
				await ContainerRuntime.loadRuntime({
					context: mockContext as IContainerContext,
					registryEntries: [],
					existing: false,
					requestHandler: undefined,
					runtimeOptions: {},
					provideEntryPoint: mockProvideEntryPoint,
				});
				assert.deepStrictEqual(updateDirtyStateStub.calledOnce, true);
				assert.deepStrictEqual(updateDirtyStateStub.args, [[true]]);
			});

			it("should be set to dirty if context is attaching", async () => {
				const mockContext = createMockContext(AttachState.Attaching, false);
				const updateDirtyStateStub = sandbox.stub(mockContext, "updateDirtyContainerState");
				await ContainerRuntime.loadRuntime({
					context: mockContext as IContainerContext,
					registryEntries: [],
					existing: false,
					requestHandler: undefined,
					runtimeOptions: {},
					provideEntryPoint: mockProvideEntryPoint,
				});
				assert.deepStrictEqual(updateDirtyStateStub.calledOnce, true);
				assert.deepStrictEqual(updateDirtyStateStub.args, [[true]]);
			});

			it("should be set to dirty if context is detached", async () => {
				const mockContext = createMockContext(AttachState.Detached, false);
				const updateDirtyStateStub = sandbox.stub(mockContext, "updateDirtyContainerState");
				await ContainerRuntime.loadRuntime({
					context: mockContext as IContainerContext,
					registryEntries: [],
					existing: false,
					requestHandler: undefined,
					runtimeOptions: {},
					provideEntryPoint: mockProvideEntryPoint,
				});
				assert.deepStrictEqual(updateDirtyStateStub.calledOnce, true);
				assert.deepStrictEqual(updateDirtyStateStub.args, [[true]]);
			});
		});

		describe("Pending state progress tracking", () => {
			const maxReconnects = 7; // 7 is the default used by ContainerRuntime for the max reconnection attempts

			let containerRuntime: ContainerRuntime;
			const mockLogger = new MockLogger();
			const containerErrors: ICriticalContainerError[] = [];
			const getMockContextForPendingStateProgressTracking =
				(): Partial<IContainerContext> => {
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
						updateDirtyContainerState: (_dirty: boolean) => {},
						getLoadedFromVersion: () => undefined,
					};
				};
			const getMockPendingStateManager = (): PendingStateManager => {
				let pendingMessages = 0;
				return {
					replayPendingStates: () => {},
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
					processFluidDataStoreOp: (
						_message: ISequencedDocumentMessage,
						_local: boolean,
						_localMessageMetadata: unknown,
					) => {},
					setConnectionState: (_connected: boolean, _clientId?: string) => {},
				} as DataStores;
			};

			const getFirstContainerError = (): ICriticalContainerError => {
				assert.ok(containerErrors.length > 0, "Container should have errors");
				return containerErrors[0];
			};

			beforeEach(async () => {
				containerErrors.length = 0;
				containerRuntime = await ContainerRuntime.loadRuntime({
					context: getMockContextForPendingStateProgressTracking() as IContainerContext,
					registryEntries: [],
					existing: false,
					requestHandler: undefined,
					runtimeOptions: {
						summaryOptions: {
							summaryConfigOverrides: {
								state: "disabled",
							},
						},
					},
					provideEntryPoint: mockProvideEntryPoint,
				});
			});

			function patchRuntime(
				pendingStateManager: PendingStateManager,
				_maxReconnects: number | undefined = undefined,
			) {
				const runtime = containerRuntime as any;
				runtime.pendingStateManager = pendingStateManager;
				runtime.dataStores = getMockDataStores();
				runtime.maxConsecutiveReconnects =
					_maxReconnects ?? runtime.maxConsecutiveReconnects;
				return runtime as ContainerRuntime;
			}

			const toggleConnection = (runtime: ContainerRuntime) => {
				runtime.setConnectionState(false);
				runtime.setConnectionState(true);
			};

			const addPendingMessage = (pendingStateManager: PendingStateManager): void =>
				pendingStateManager.onSubmitMessage("", 0, "", undefined);

			it(
				`No progress for ${maxReconnects} connection state changes, with pending state, should ` +
					"generate telemetry event and throw an error that closes the container",
				async () => {
					const pendingStateManager = getMockPendingStateManager();
					patchRuntime(pendingStateManager);

					for (let i = 0; i < maxReconnects; i++) {
						addPendingMessage(pendingStateManager);
						toggleConnection(containerRuntime);
					}

					// NOTE: any errors returned by getFirstContainerError() are from a variable set in a mock closeFn function passed
					// around during test setup, which executes when the container runtime causes the context (container) to close.
					const error = getFirstContainerError();
					assert.strictEqual(error.errorType, ContainerErrorTypes.dataProcessingError);
					assert.strictEqual(
						error.message,
						"Runtime detected too many reconnects with no progress syncing local ops.",
					);
					assert(isILoggingError(error));
					assert.strictEqual(error.getTelemetryProperties().attempts, maxReconnects);
					assert.strictEqual(
						error.getTelemetryProperties().pendingMessages,
						maxReconnects,
					);
					mockLogger.assertMatchAny([
						{
							eventName: "ContainerRuntime:ReconnectsWithNoProgress",
							attempts: 3,
							pendingMessages: 3,
						},
					]);
				},
			);

			it(
				`No progress for ${maxReconnects} / 2 connection state changes, with pending state, should ` +
					"generate telemetry event but not throw an error that closes the container",
				async () => {
					const pendingStateManager = getMockPendingStateManager();
					patchRuntime(pendingStateManager);
					addPendingMessage(pendingStateManager);

					for (let i = 0; i < maxReconnects / 2; i++) {
						toggleConnection(containerRuntime);
					}

					// The particulars of the setup for this test mean that no errors here indicate the container did not close.
					assert.equal(containerErrors.length, 0);
					mockLogger.assertMatchAny([
						{
							eventName: "ContainerRuntime:ReconnectsWithNoProgress",
							attempts: 3,
							pendingMessages: 1,
						},
					]);
				},
			);

			it(
				`No progress for ${maxReconnects} connection state changes, with pending state, with ` +
					"feature disabled, should not generate telemetry event nor throw an error that closes the container",
				async () => {
					const pendingStateManager = getMockPendingStateManager();
					patchRuntime(pendingStateManager, -1 /* maxConsecutiveReconnects */);

					for (let i = 0; i < maxReconnects; i++) {
						addPendingMessage(pendingStateManager);
						toggleConnection(containerRuntime);
					}

					// The particulars of the setup for this test mean that no errors here indicate the container did not close.
					assert.equal(containerErrors.length, 0);
					mockLogger.assertMatchNone([
						{
							eventName: "ContainerRuntime:ReconnectsWithNoProgress",
						},
					]);
				},
			);

			it(
				`No progress for ${maxReconnects} connection state changes, with no pending state, should ` +
					"not generate telemetry event nor throw an error that closes the container",
				async () => {
					const pendingStateManager = getMockPendingStateManager();
					patchRuntime(pendingStateManager);

					for (let i = 0; i < maxReconnects; i++) {
						toggleConnection(containerRuntime);
					}

					// The particulars of the setup for this test mean that no errors here indicate the container did not close.
					assert.equal(containerErrors.length, 0);
					mockLogger.assertMatchNone([
						{
							eventName: "ContainerRuntime:ReconnectsWithNoProgress",
						},
					]);
				},
			);

			it(
				`No progress for ${maxReconnects} connection state changes, with pending state, successfully ` +
					"processing local op, should not generate telemetry event nor throw an error that closes the container",
				async () => {
					const pendingStateManager = getMockPendingStateManager();
					patchRuntime(pendingStateManager);
					addPendingMessage(pendingStateManager);

					for (let i = 0; i < maxReconnects; i++) {
						containerRuntime.setConnectionState(!containerRuntime.connected);
						containerRuntime.process(
							{
								type: "op",
								clientId: "clientId",
								sequenceNumber: 0,
								contents: {
									address: "address",
								},
							} as any as ISequencedDocumentMessage,
							true /* local */,
						);
					}

					// The particulars of the setup for this test mean that no errors here indicate the container did not close.
					assert.equal(containerErrors.length, 0);
					mockLogger.assertMatchNone([
						{
							eventName: "ContainerRuntime:ReconnectsWithNoProgress",
						},
					]);
				},
			);

			it(
				`No progress for ${maxReconnects} connection state changes, with pending state, successfully ` +
					"processing remote op and local chunked op, should generate telemetry event and throw an error that closes the container",
				async () => {
					const pendingStateManager = getMockPendingStateManager();
					patchRuntime(pendingStateManager);

					for (let i = 0; i < maxReconnects; i++) {
						addPendingMessage(pendingStateManager);
						toggleConnection(containerRuntime);
						containerRuntime.process(
							{
								type: "op",
								clientId: "a unique, remote clientId",
								sequenceNumber: 0,
								contents: {
									address: "address",
								},
							} as any as ISequencedDocumentMessage,
							false /* local */,
						);
						containerRuntime.process(
							{
								type: "op",
								clientId: "clientId",
								sequenceNumber: 0,
								contents: {
									address: "address",
									contents: {
										chunkId: i + 1,
										totalChunks: maxReconnects + 1,
									},
									type: "chunkedOp",
								},
							} as any as ISequencedDocumentMessage,
							true /* local */,
						);
					}

					// NOTE: any errors returned by getFirstContainerError() are from a variable set in a mock closeFn function passed
					// around during test setup, which executes when the container runtime causes the context (container) to close.
					const error = getFirstContainerError();
					assert.strictEqual(error.errorType, ContainerErrorTypes.dataProcessingError);
					assert.strictEqual(
						error.message,
						"Runtime detected too many reconnects with no progress syncing local ops.",
					);
					assert(isILoggingError(error));
					assert.strictEqual(error.getTelemetryProperties().attempts, maxReconnects);
					assert.strictEqual(
						error.getTelemetryProperties().pendingMessages,
						maxReconnects,
					);
					mockLogger.assertMatchAny([
						{
							eventName: "ContainerRuntime:ReconnectsWithNoProgress",
							attempts: 3,
							pendingMessages: 3,
						},
					]);
				},
			);
		});

		describe("Future op type compatibility", () => {
			let containerRuntime: ContainerRuntime;
			beforeEach(async () => {
				containerRuntime = await ContainerRuntime.loadRuntime({
					context: getMockContext() as IContainerContext,
					registryEntries: [],
					existing: false,
					requestHandler: undefined,
					runtimeOptions: {},
					provideEntryPoint: mockProvideEntryPoint,
				});
			});

			it("can submit op compat behavior", async () => {
				// Create a container runtime type where the submit method is public. This makes it easier to test
				// submission and processing of ops. The other option is to send data store or alias ops whose
				// processing requires creation of data store context and runtime as well.
				type ContainerRuntimeWithSubmit = Omit<ContainerRuntime, "submit"> & {
					submit(
						containerRuntimeMessage: OutboundContainerRuntimeMessage,
						localOpMetadata: unknown,
						metadata: Record<string, unknown> | undefined,
					): void;
				};
				const containerRuntimeWithSubmit =
					containerRuntime as unknown as ContainerRuntimeWithSubmit;

				const runtimeCompatMessage: Omit<
					OutboundContainerRuntimeMessage,
					"type" | "contents"
				> & {
					type: string;
					contents: any;
				} = {
					type: "NEW",
					contents: "Hello",
					compatDetails: { behavior: "Ignore" },
				};

				assert.doesNotThrow(
					() =>
						containerRuntimeWithSubmit.submit(
							runtimeCompatMessage as OutboundContainerRuntimeMessage,
							undefined,
							undefined,
						),
					"Cannot submit container runtime message with compatDetails",
				);
			});

			it("process remote op with unrecognized type and 'Ignore' compat behavior", async () => {
				const futureRuntimeMessage: RecentlyAddedContainerRuntimeMessageDetails &
					Record<string, unknown> = {
					type: "FROM_THE_FUTURE",
					contents: "Hello",
					compatDetails: { behavior: "Ignore" },
				};

				const packedOp: Omit<
					ISequencedDocumentMessage,
					| "term"
					| "minimumSequenceNumber"
					| "clientSequenceNumber"
					| "referenceSequenceNumber"
					| "timestamp"
				> = {
					contents: JSON.stringify(futureRuntimeMessage),
					type: MessageType.Operation,
					sequenceNumber: 123,
					clientId: "someClientId",
				};
				containerRuntime.process(packedOp as ISequencedDocumentMessage, false /* local */);
			});

			it("process remote op with unrecognized type and 'FailToProcess' compat behavior", async () => {
				const futureRuntimeMessage: RecentlyAddedContainerRuntimeMessageDetails &
					Record<string, unknown> = {
					type: "FROM THE FUTURE",
					contents: "Hello",
					compatDetails: { behavior: "FailToProcess" },
				};

				const packedOp: Omit<
					ISequencedDocumentMessage,
					| "term"
					| "minimumSequenceNumber"
					| "clientSequenceNumber"
					| "referenceSequenceNumber"
					| "timestamp"
				> = {
					type: MessageType.Operation,
					contents: JSON.stringify(futureRuntimeMessage),
					sequenceNumber: 123,
					clientId: "someClientId",
				};
				assert.throws(
					() =>
						containerRuntime.process(
							packedOp as ISequencedDocumentMessage,
							false /* local */,
						),
					(error: IErrorBase) =>
						error.errorType === ContainerErrorType.dataProcessingError,
					"Ops with unrecognized type and 'FailToProcess' compat behavior should fail to process",
				);
			});

			it("process remote op with unrecognized type and no compat behavior", async () => {
				const futureRuntimeMessage = {
					type: "FROM_THE_FUTURE",
					contents: "Hello",
				};

				const packedOp: Omit<
					ISequencedDocumentMessage,
					| "term"
					| "minimumSequenceNumber"
					| "clientSequenceNumber"
					| "referenceSequenceNumber"
					| "timestamp"
				> = {
					contents: JSON.stringify(futureRuntimeMessage),
					type: MessageType.Operation,
					sequenceNumber: 123,
					clientId: "someClientId",
				};
				assert.throws(
					() =>
						containerRuntime.process(
							packedOp as ISequencedDocumentMessage,
							false /* local */,
						),
					(error: IErrorBase) =>
						error.errorType === ContainerErrorType.dataProcessingError,
					"Ops with unrecognized type and no specified compat behavior should fail to process",
				);
			});
		});

		describe("User input validations", () => {
			let containerRuntime: ContainerRuntime;

			before(async () => {
				containerRuntime = await ContainerRuntime.loadRuntime({
					context: getMockContext() as IContainerContext,
					registryEntries: [],
					existing: false,
					requestHandler: undefined,
					runtimeOptions: {},
					provideEntryPoint: mockProvideEntryPoint,
				});
			});

			it("cannot create detached root data store with slashes in id", async () => {
				const invalidId = "beforeSlash/afterSlash";
				const codeBlock = () => {
					containerRuntime.createDetachedRootDataStore([""], invalidId);
				};
				assert.throws(
					codeBlock,
					(e: IErrorBase) =>
						e.errorType === ContainerErrorType.usageError &&
						e.message === `Id cannot contain slashes: '${invalidId}'`,
				);
			});
		});

		describe("Supports mixin classes", () => {
			it("new loadRuntime method works", async () => {
				const makeMixin = <T>(
					Base: typeof ContainerRuntime,
					methodName: string,
					methodReturn: T,
				) =>
					class MixinContainerRuntime extends Base {
						public static async loadRuntime(params: {
							context: IContainerContext;
							containerRuntimeCtor?: typeof ContainerRuntime;
							provideEntryPoint: (
								containerRuntime: IContainerRuntime,
							) => Promise<FluidObject>;
							existing: boolean;
							runtimeOptions: IContainerRuntimeOptions;
							registryEntries: NamedFluidDataStoreRegistryEntries;
							containerScope: FluidObject;
						}): Promise<ContainerRuntime> {
							// Note: we're mutating the parameter object here, normally a no-no, but shouldn't be
							// an issue in our tests.
							params.containerRuntimeCtor =
								params.containerRuntimeCtor ?? MixinContainerRuntime;
							params.containerScope = params.containerScope ?? params.context.scope;
							return Base.loadRuntime(params);
						}

						public [methodName](): T {
							return methodReturn;
						}
					} as typeof ContainerRuntime;

				const myEntryPoint: FluidObject = {
					myProp: "myValue",
				};

				const runtime = await makeMixin(
					makeMixin(ContainerRuntime, "method1", "mixed in return"),
					"method2",
					42,
				).loadRuntime({
					context: getMockContext() as IContainerContext,
					provideEntryPoint: async (containerRuntime) => myEntryPoint,
					existing: false,
					registryEntries: [],
				});

				assert.equal(
					(runtime as unknown as { method1: () => any }).method1(),
					"mixed in return",
				);
				assert.equal((runtime as unknown as { method2: () => any }).method2(), 42);
			});
		});

		describe("EntryPoint initialized correctly", () => {
			it("when using new loadRuntime method", async () => {
				const myEntryPoint: FluidObject = {
					myProp: "myValue",
				};
				const containerRuntime = await ContainerRuntime.loadRuntime({
					context: getMockContext() as IContainerContext,
					provideEntryPoint: async (ctrRuntime) => myEntryPoint,
					existing: false,
					registryEntries: [],
				});

				// The entryPoint should come from the provided initialization function.
				const actualEntryPoint = await containerRuntime.getEntryPoint();
				assert(actualEntryPoint !== undefined, "entryPoint was not initialized");
				assert.deepEqual(
					actualEntryPoint,
					myEntryPoint,
					"entryPoint does not match expected object",
				);
			});

			it("loadRuntime accepts both requestHandlers and entryPoint", async () => {
				const myResponse: IResponse = {
					mimeType: "fluid/object",
					value: "hello!",
					status: 200,
				};
				const myEntryPoint: FluidObject = {
					myProp: "myValue",
				};

				const containerRuntime = await ContainerRuntime.loadRuntime({
					context: getMockContext() as IContainerContext,
					requestHandler: async (req, ctrRuntime) => myResponse,
					provideEntryPoint: async (ctrRuntime) => myEntryPoint,
					existing: false,
					registryEntries: [],
				});

				// Calling request on the runtime should use the request handler we passed in the runtime's constructor.
				const responseFromRequestMethod = await (containerRuntime as any).request({
					url: "/",
				});
				assert.deepEqual(
					responseFromRequestMethod,
					myResponse,
					"request method in runtime did not return the expected object",
				);

				// The entryPoint should come from the provided initialization function.
				const actualEntryPoint = await containerRuntime.getEntryPoint();
				assert(actualEntryPoint !== undefined, "entryPoint was not initialized");
				assert.deepEqual(
					actualEntryPoint,
					myEntryPoint,
					"entryPoint does not match expected object",
				);
			});
		});

		describe("Op content modification", () => {
			let containerRuntime: ContainerRuntime;
			let pendingStateManager: PendingStateManager;

			beforeEach(async () => {
				containerRuntime = await ContainerRuntime.loadRuntime({
					context: getMockContext() as IContainerContext,
					registryEntries: [],
					existing: false,
					runtimeOptions: {},
					provideEntryPoint: mockProvideEntryPoint,
				});
				pendingStateManager = (containerRuntime as any).pendingStateManager;
			});

			it("modifying op content after submit does not reflect in PendingStateManager", () => {
				const content = { prop1: 1 };
				containerRuntime.submitDataStoreOp("1", content);
				(containerRuntime as any).flush();

				content.prop1 = 2;

				const state = pendingStateManager.getLocalState();

				assert.notStrictEqual(state, undefined, "expect pending local state");
				assert.strictEqual(state?.pendingStates.length, 1, "expect 1 pending message");
				assert.deepStrictEqual(
					JSON.parse(state?.pendingStates?.[0].content).contents.contents,
					{
						prop1: 1,
					},
					"content of pending local message has changed",
				);
			});
		});

		describe("Container logging when loaded", () => {
			let mockLogger: MockLogger;

			const localGetMockContext = (
				featureGates: Record<string, ConfigTypes> = {},
			): Partial<IContainerContext> => {
				return {
					attachState: AttachState.Attached,
					deltaManager: new MockDeltaManager(),
					quorum: new MockQuorumClients(),
					taggedLogger: mixinMonitoringContext(
						mockLogger,
						configProvider(featureGates),
					) as unknown as MockLogger,
					supportedFeatures: new Map([["referenceSequenceNumbers", true]]),
					clientDetails: { capabilities: { interactive: true } },
					closeFn: (_error?: ICriticalContainerError): void => {},
					updateDirtyContainerState: (_dirty: boolean) => {},
					getLoadedFromVersion: () => undefined,
				};
			};

			beforeEach(async () => {
				mockLogger = new MockLogger();
			});

			const runtimeOptions = {
				compressionOptions: {
					minimumBatchSizeInBytes: 1024 * 1024,
					compressionAlgorithm: CompressionAlgorithms.lz4,
				},
				chunkSizeInBytes: 800 * 1024,
				gcOptions: {
					gcAllowed: true,
				},
				flushMode: FlushModeExperimental.Async as unknown as FlushMode,
				enableGroupedBatching: true,
			};

			const defaultRuntimeOptions = {
				summaryOptions: {},
				gcOptions: {},
				loadSequenceNumberVerification: "close",
				flushMode: FlushMode.TurnBased,
				compressionOptions: {
					minimumBatchSizeInBytes: 614400,
					compressionAlgorithm: CompressionAlgorithms.lz4,
				},
				maxBatchSizeInBytes: 700 * 1024,
				chunkSizeInBytes: 204800,
				enableRuntimeIdCompressor: false,
				enableOpReentryCheck: false,
				enableGroupedBatching: false,
			};
			const mergedRuntimeOptions = { ...defaultRuntimeOptions, ...runtimeOptions };

			it("Container load stats", async () => {
				await ContainerRuntime.loadRuntime({
					context: localGetMockContext({}) as IContainerContext,
					registryEntries: [],
					existing: false,
					runtimeOptions,
					provideEntryPoint: mockProvideEntryPoint,
				});

				mockLogger.assertMatchAny([
					{
						eventName: "ContainerRuntime:ContainerLoadStats",
						category: "generic",
						options: JSON.stringify(mergedRuntimeOptions),
						featureGates: JSON.stringify({
							idCompressorEnabled: false,
						}),
					},
				]);
			});

			it("Container load stats with feature gate overrides", async () => {
				const featureGates = {
					"Fluid.ContainerRuntime.CompressionDisabled": true,
					"Fluid.ContainerRuntime.CompressionChunkingDisabled": true,
					"Fluid.ContainerRuntime.DisableOpReentryCheck": false,
					"Fluid.ContainerRuntime.IdCompressorEnabled": true,
					"Fluid.ContainerRuntime.DisableGroupedBatching": true,
				};
				await ContainerRuntime.loadRuntime({
					context: localGetMockContext(featureGates) as IContainerContext,
					registryEntries: [],
					existing: false,
					runtimeOptions,
					provideEntryPoint: mockProvideEntryPoint,
				});

				mockLogger.assertMatchAny([
					{
						eventName: "ContainerRuntime:ContainerLoadStats",
						category: "generic",
						options: JSON.stringify(mergedRuntimeOptions),
						featureGates: JSON.stringify({
							disableCompression: true,
							disableOpReentryCheck: false,
							disableChunking: true,
							idCompressorEnabled: true,
						}),
						groupedBatchingEnabled: false,
					},
				]);
			});
		});

		describe("Container feature detection", () => {
			const mockLogger = new MockLogger();

			beforeEach(() => {
				mockLogger.clear();
			});

			const localGetMockContext = (
				features?: ReadonlyMap<string, unknown>,
			): Partial<IContainerContext> => {
				return {
					attachState: AttachState.Attached,
					deltaManager: new MockDeltaManager(),
					quorum: new MockQuorumClients(),
					taggedLogger: mockLogger,
					supportedFeatures: features,
					clientDetails: { capabilities: { interactive: true } },
					closeFn: (_error?: ICriticalContainerError): void => {},
					updateDirtyContainerState: (_dirty: boolean) => {},
					getLoadedFromVersion: () => undefined,
				};
			};

			[
				undefined,
				new Map([["referenceSequenceNumbers", false]]),
				new Map([
					["other", true],
					["feature", true],
				]),
			].forEach((features) => {
				it("Loader not supported for async FlushMode, fallback to TurnBased", async () => {
					const runtime = await ContainerRuntime.loadRuntime({
						context: localGetMockContext(features) as IContainerContext,
						registryEntries: [],
						existing: false,
						runtimeOptions: {
							flushMode: FlushModeExperimental.Async as unknown as FlushMode,
						},
						provideEntryPoint: mockProvideEntryPoint,
					});

					assert.equal(runtime.flushMode, FlushMode.TurnBased);
					mockLogger.assertMatchAny([
						{
							eventName: "ContainerRuntime:FlushModeFallback",
							category: "error",
						},
					]);
				});
			});

			it("Loader supported for async FlushMode", async () => {
				const runtime = await ContainerRuntime.loadRuntime({
					context: localGetMockContext(
						new Map([["referenceSequenceNumbers", true]]),
					) as IContainerContext,
					registryEntries: [],
					existing: false,
					runtimeOptions: {
						flushMode: FlushModeExperimental.Async as unknown as FlushMode,
					},
					provideEntryPoint: mockProvideEntryPoint,
				});

				assert.equal(runtime.flushMode, FlushModeExperimental.Async);
				mockLogger.assertMatchNone([
					{
						eventName: "ContainerRuntime:FlushModeFallback",
						category: "error",
					},
				]);
			});
		});

		describe("Summarization", () => {
			let containerRuntime: ContainerRuntime;

			async function yieldEventLoop(): Promise<void> {
				const yieldP = new Promise<void>((resolve) => {
					setTimeout(resolve);
				});
				clock.tick(1);
				await yieldP;
			}

			beforeEach(async () => {
				const settings = {};
				settings["Fluid.Summarizer.ValidateSummaryBeforeUpload"] = true;
				containerRuntime = await ContainerRuntime.loadRuntime({
					context: getMockContext(settings) as IContainerContext,
					registryEntries: [],
					existing: false,
					provideEntryPoint: mockProvideEntryPoint,
				});
			});

			it("summary is submitted successfully", async () => {
				const summarizeResult = await containerRuntime.submitSummary({
					summaryLogger: createChildLogger(),
					cancellationToken: neverCancelledSummaryToken,
				});
				assert(summarizeResult.stage === "submit", "Summary did not succeed");
			});

			it("summary fails if summary token is canceled", async () => {
				const cancelledSummaryToken: ISummaryCancellationToken = {
					cancelled: true,
					waitCancelled: new Promise(() => {}),
				};
				const summarizeResult = await containerRuntime.submitSummary({
					summaryLogger: createChildLogger(),
					cancellationToken: cancelledSummaryToken,
				});
				assert(summarizeResult.stage === "base", "Summary did not fail");
				assert.strictEqual(
					summarizeResult.error,
					"disconnected",
					"Summary was not canceled",
				);
			});

			it("summary fails before generate if there are pending ops", async () => {
				// Submit an op and yield for it to be flushed from outbox to pending state manager.
				containerRuntime.submitDataStoreOp("fakeId", "fakeContents");
				await yieldEventLoop();

				const summarizeResultP = containerRuntime.submitSummary({
					summaryLogger: createChildLogger(),
					cancellationToken: neverCancelledSummaryToken,
				});

				// Advance the clock by the time that container runtime would wait for pending ops to be processed.
				clock.tick(defaultPendingOpsWaitTimeoutMs);
				const summarizeResult = await summarizeResultP;
				assert(summarizeResult.stage === "base", "Summary did not fail");
				assert.strictEqual(
					summarizeResult.error.message,
					"PendingOpsWhileSummarizing",
					"Summary did not fail with the right error",
				);
				assert.strictEqual(
					summarizeResult.error.beforeGenerate,
					true,
					"It should have failed before generating summary",
				);
			});

			it("summary fails after generate if there are pending ops", async () => {
				// Patch the summarize function to submit messages during it. This way there will be pending
				// messages after generating the summary.
				const patch = (fn: (...args) => Promise<ISummaryTreeWithStats>) => {
					const boundFn = fn.bind(containerRuntime);
					return async (...args: any[]) => {
						// Submit an op and yield for it to be flushed from outbox to pending state manager.
						containerRuntime.submitDataStoreOp("fakeId", "fakeContents");
						await yieldEventLoop();
						return boundFn(...args);
					};
				};
				containerRuntime.summarize = patch(containerRuntime.summarize);

				const summarizeResult = await containerRuntime.submitSummary({
					summaryLogger: createChildLogger(),
					cancellationToken: neverCancelledSummaryToken,
				});
				assert(summarizeResult.stage === "base", "Summary did not fail");
				assert.strictEqual(
					summarizeResult.error.message,
					"PendingOpsWhileSummarizing",
					"Summary did not fail with the right error",
				);
				assert.strictEqual(
					summarizeResult.error.beforeGenerate,
					false,
					"It should have failed after generating summary",
				);
			});

			it("summary passes if pending ops are processed during pending op processing timeout", async () => {
				// Create a container runtime type where the submit method is public. This makes it easier to test
				// submission and processing of ops. The other option is to send data store or alias ops whose
				// processing requires creation of data store context and runtime as well.
				type ContainerRuntimeWithSubmit = Omit<ContainerRuntime, "submit"> & {
					submit(
						containerRuntimeMessage: OutboundContainerRuntimeMessage,
						localOpMetadata: unknown,
						metadata: Record<string, unknown> | undefined,
					): void;
				};
				const containerRuntimeWithSubmit =
					containerRuntime as unknown as ContainerRuntimeWithSubmit;
				// Submit a rejoin op and yield for it to be flushed from outbox to pending state manager.
				containerRuntimeWithSubmit.submit(
					{
						type: ContainerMessageType.Rejoin,
						contents: undefined,
					},
					undefined,
					undefined,
				);
				await yieldEventLoop();

				// Create a mock logger to validate that pending ops event is generated with correct params.
				const mockLogger = new MockLogger();
				const summaryLogger = createChildLogger({ logger: mockLogger });
				const summarizeResultP = containerRuntime.submitSummary({
					summaryLogger,
					cancellationToken: neverCancelledSummaryToken,
				});

				// Advance the clock by 1 ms less than the time waited for pending ops to be processed. This will allow
				// summarization to proceed far enough to wait for pending ops.
				clock.tick(defaultPendingOpsWaitTimeoutMs - 1);
				// Process the rejoin op so that there are no pending ops.
				containerRuntime.process(
					{
						type: "op",
						clientId: "fakeClientId",
						sequenceNumber: 0,
						contents: {
							type: ContainerMessageType.Rejoin,
							contents: "something",
						},
					} as any as ISequencedDocumentMessage,
					true /* local */,
				);
				// Advance the clock by the remaining time so that pending ops wait is completed.
				clock.tick(1);

				const summarizeResult = await summarizeResultP;
				assert(summarizeResult.stage === "submit", "Summary did not succeed");
				mockLogger.assertMatch([
					{
						eventName: "PendingOpsWhileSummarizing",
						countBefore: 1,
						countAfter: 0,
						saved: true,
					},
				]);
			});
		});
	});
});
