/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { stringToBuffer } from "@fluid-internal/client-utils";
import { AttachState, ICriticalContainerError } from "@fluidframework/container-definitions";
import {
	ContainerErrorTypes,
	IContainerContext,
} from "@fluidframework/container-definitions/internal";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import {
	ConfigTypes,
	FluidObject,
	IConfigProviderBase,
	IErrorBase,
	IResponse,
} from "@fluidframework/core-interfaces";
import { ISummaryTree } from "@fluidframework/driver-definitions";
import {
	IDocumentStorageService,
	ISnapshot,
	ISummaryContext,
	type ISnapshotTree,
	MessageType,
	ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";
import {
	ISummaryTreeWithStats,
	FluidDataStoreRegistryEntry,
	FlushMode,
	FlushModeExperimental,
	IFluidDataStoreContext,
	IFluidDataStoreFactory,
	IFluidDataStoreRegistry,
	NamedFluidDataStoreRegistryEntries,
} from "@fluidframework/runtime-definitions/internal";
import {
	IFluidErrorBase,
	MockLogger,
	createChildLogger,
	isFluidError,
	isILoggingError,
	mixinMonitoringContext,
} from "@fluidframework/telemetry-utils/internal";
import {
	MockAudience,
	MockDeltaManager,
	MockFluidDataStoreRuntime,
	MockQuorumClients,
} from "@fluidframework/test-runtime-utils/internal";
import { SinonFakeTimers, createSandbox, useFakeTimers } from "sinon";

import { ChannelCollection } from "../channelCollection.js";
import {
	CompressionAlgorithms,
	ContainerRuntime,
	IContainerRuntimeOptions,
	IPendingRuntimeState,
	defaultPendingOpsWaitTimeoutMs,
} from "../containerRuntime.js";
import {
	ContainerMessageType,
	type ContainerRuntimeGCMessage,
	type OutboundContainerRuntimeMessage,
	type RecentlyAddedContainerRuntimeMessageDetails,
	type UnknownContainerRuntimeMessage,
} from "../messageTypes.js";
import type { BatchMessage } from "../opLifecycle/index.js";
import {
	IPendingLocalState,
	IPendingMessage,
	PendingStateManager,
} from "../pendingStateManager.js";
import { ISummaryCancellationToken, neverCancelledSummaryToken } from "../summary/index.js";

// Type test:
const outboundMessage: OutboundContainerRuntimeMessage =
	{} as unknown as OutboundContainerRuntimeMessage;
// @ts-expect-error Outbound type should not include compat behavior
(() => {})(outboundMessage.compatDetails);

function submitDataStoreOp(
	runtime: Pick<ContainerRuntime, "submitMessage">,
	id: string,
	contents: any,
	localOpMetadata?: unknown,
) {
	runtime.submitMessage(
		ContainerMessageType.FluidDataStoreOp,
		{
			address: id,
			contents,
		},
		localOpMetadata,
	);
}

const changeConnectionState = (
	runtime: Omit<ContainerRuntime, "submit">,
	connected: boolean,
	clientId: string,
) => {
	const audience = runtime.getAudience() as MockAudience;
	audience.setCurrentClientId(clientId);
	runtime.setConnectionState(connected, clientId);
};

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

	const mockClientId = "mockClientId";

	const getMockContext = (
		settings: Record<string, ConfigTypes> = {},
		logger = new MockLogger(),
	): Partial<IContainerContext> => {
		// Mock the storage layer so "submitSummary" works.
		const mockStorage: Partial<IDocumentStorageService> = {
			uploadSummaryWithContext: async (summary: ISummaryTree, context: ISummaryContext) => {
				return "fakeHandle";
			},
		};
		const mockContext = {
			attachState: AttachState.Attached,
			deltaManager: new MockDeltaManager(),
			audience: new MockAudience(),
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
		describe("IdCompressor", () => {
			it("finalizes idRange on attach", async () => {
				const logger = new MockLogger();
				const containerRuntime = await ContainerRuntime.loadRuntime({
					context: getMockContext({}, logger) as IContainerContext,
					registryEntries: [],
					existing: false,
					runtimeOptions: {
						flushMode: FlushMode.TurnBased,
						enableRuntimeIdCompressor: "on",
					},
					provideEntryPoint: mockProvideEntryPoint,
				});

				logger.clear();

				const compressor = containerRuntime.idCompressor;
				assert(compressor !== undefined);
				compressor.generateCompressedId();
				containerRuntime.createSummary();

				const range = compressor.takeNextCreationRange();
				assert.equal(
					range.ids,
					undefined,
					"All Ids should have been finalized after calling createSummary()",
				);
			});
		});

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
				(containerRuntime as any).channelCollection = {
					setConnectionState: (_connected: boolean, _clientId?: string) => {},
					// Pass data store op right back to ContainerRuntime
					reSubmit: (type: string, envelope: any, localOpMetadata: unknown) => {
						submitDataStoreOp(
							containerRuntime,
							envelope.address,
							envelope.contents,
							localOpMetadata,
						);
					},
				} as ChannelCollection;

				changeConnectionState(containerRuntime, false, mockClientId);

				submitDataStoreOp(containerRuntime, "1", "test");
				(containerRuntime as any).flush();

				submitDataStoreOp(containerRuntime, "2", "test");
				changeConnectionState(containerRuntime, true, mockClientId);
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
				const fakeClientId = "fakeClientId";

				describe(`orderSequentially with flush mode: ${
					FlushMode[flushMode] ?? FlushModeExperimental[flushMode]
				}`, () => {
					let containerRuntime: ContainerRuntime;
					let mockContext: Partial<IContainerContext>;
					const submittedOpsMetadata: any[] = [];
					const containerErrors: ICriticalContainerError[] = [];
					const getMockContextForOrderSequentially = (): Partial<IContainerContext> => {
						return {
							attachState: AttachState.Attached,
							deltaManager: new MockDeltaManager(),
							audience: new MockAudience(),
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
										submittedOpsMetadata.push(subMessage.metadata);
									}
								} else {
									submittedOpsMetadata.push(appData);
								}
								return opFakeSequenceNumber++;
							},
							connected: true,
							clientId: fakeClientId,
							getLoadedFromVersion: () => undefined,
						};
					};

					const getFirstContainerError = (): ICriticalContainerError => {
						assert.ok(containerErrors.length > 0, "Container should have errors");
						return containerErrors[0];
					};

					const expectedOrderSequentiallyErrorMessage = "orderSequentially callback exception";

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
						submittedOpsMetadata.length = 0;
					});

					it("Can't call flush() inside orderSequentially's callback", () => {
						assert.throws(() =>
							containerRuntime.orderSequentially(() => {
								(containerRuntime as any).flush();
							}),
						);

						const error = getFirstContainerError();
						assert(isFluidError(error));
						assert.strictEqual(error.errorType, ContainerErrorTypes.genericError);
						assert.strictEqual(
							error.message,
							`${expectedOrderSequentiallyErrorMessage}: 0x24c`,
						);
						assert.strictEqual(error.getTelemetryProperties().orderSequentiallyCalls, 1);
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
						assert(isFluidError(error));
						assert.strictEqual(error.errorType, ContainerErrorTypes.genericError);
						assert.strictEqual(
							error.message,
							`${expectedOrderSequentiallyErrorMessage}: 0x24c`,
						);
						assert.strictEqual(error.getTelemetryProperties().orderSequentiallyCalls, 2);
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
						assert(isFluidError(error));
						assert.strictEqual(error.errorType, ContainerErrorTypes.genericError);
						assert.strictEqual(
							error.message,
							`${expectedOrderSequentiallyErrorMessage}: 0x24c`,
						);
						assert.strictEqual(error.getTelemetryProperties().orderSequentiallyCalls, 2);
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
						assert.strictEqual(error.message, `${expectedOrderSequentiallyErrorMessage}: Any`);
						assert.strictEqual(error.getTelemetryProperties().orderSequentiallyCalls, 1);
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
						assert.strictEqual(error.message, `${expectedOrderSequentiallyErrorMessage}: Any`);
						assert.strictEqual(error.getTelemetryProperties().orderSequentiallyCalls, 2);
					});

					it("Batching property set properly", () => {
						containerRuntime.orderSequentially(() => {
							submitDataStoreOp(containerRuntime, "1", "test");
							submitDataStoreOp(containerRuntime, "2", "test");
							submitDataStoreOp(containerRuntime, "3", "test");
						});
						(containerRuntime as any).flush();

						assert.strictEqual(submittedOpsMetadata.length, 3, "3 messages should be sent");
						assert.strictEqual(
							submittedOpsMetadata[0].batch,
							true,
							"first message should be the batch start",
						);
						assert.strictEqual(
							submittedOpsMetadata[1],
							undefined,
							"second message should not hold batch info",
						);
						assert.strictEqual(
							submittedOpsMetadata[2].batch,
							false,
							"third message should be the batch end",
						);
					});

					it("Resubmitting batch preserves original batches", async () => {
						// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
						(containerRuntime as any).channelCollection = {
							setConnectionState: (_connected: boolean, _clientId?: string) => {},
							// Pass data store op right back to ContainerRuntime
							reSubmit: (type: string, envelope: any, localOpMetadata: unknown) => {
								submitDataStoreOp(
									containerRuntime,
									envelope.address,
									envelope.contents,
									localOpMetadata,
								);
							},
						} as ChannelCollection;

						changeConnectionState(containerRuntime, false, fakeClientId);

						containerRuntime.orderSequentially(() => {
							submitDataStoreOp(containerRuntime, "1", "test");
							submitDataStoreOp(containerRuntime, "2", "test");
							submitDataStoreOp(containerRuntime, "3", "test");
						});
						(containerRuntime as any).flush();

						containerRuntime.orderSequentially(() => {
							submitDataStoreOp(containerRuntime, "4", "test");
							submitDataStoreOp(containerRuntime, "5", "test");
							submitDataStoreOp(containerRuntime, "6", "test");
						});
						(containerRuntime as any).flush();

						assert.strictEqual(submittedOpsMetadata.length, 0, "no messages should be sent");

						changeConnectionState(containerRuntime, true, fakeClientId);

						assert.strictEqual(submittedOpsMetadata.length, 6, "6 messages should be sent");

						const expectedBatchMetadata = [
							{ batch: true },
							undefined,
							{ batch: false },
							{ batch: true },
							undefined,
							{ batch: false },
						];

						assert.deepStrictEqual(
							submittedOpsMetadata,
							expectedBatchMetadata,
							"batch metadata does not match",
						);
					});
				});
			}));

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
						audience: new MockAudience(),
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
					audience: new MockAudience(),
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
			const fakeClientId = "fakeClientId";
			const getMockContextForPendingStateProgressTracking = (): Partial<IContainerContext> => {
				return {
					connected: false,
					clientId: fakeClientId,
					attachState: AttachState.Attached,
					deltaManager: new MockDeltaManager(),
					audience: new MockAudience(),
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
					onFlushBatch: (batch: BatchMessage[], _csn?: number) =>
						(pendingMessages += batch.length),
				} as unknown as PendingStateManager;
			};
			const getMockChannelCollection = (): ChannelCollection => {
				// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
				return {
					process: (..._args) => {},
					setConnectionState: (..._args) => {},
				} as ChannelCollection;
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
				runtime.channelCollection = getMockChannelCollection();
				runtime.maxConsecutiveReconnects = _maxReconnects ?? runtime.maxConsecutiveReconnects;
				return runtime as ContainerRuntime;
			}

			const toggleConnection = (runtime: ContainerRuntime) => {
				changeConnectionState(runtime, true, fakeClientId);
				changeConnectionState(runtime, false, fakeClientId);
			};

			const addPendingMessage = (pendingStateManager: PendingStateManager): void =>
				pendingStateManager.onFlushBatch([{ referenceSequenceNumber: 0 }], 0);

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
					assert.strictEqual(error.getTelemetryProperties().pendingMessages, maxReconnects);
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
						changeConnectionState(containerRuntime, !containerRuntime.connected, fakeClientId);
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
					assert.strictEqual(error.getTelemetryProperties().pendingMessages, maxReconnects);
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

		describe("[DEPRECATED] Future op type compatibility", () => {
			let containerRuntime: ContainerRuntime;
			beforeEach(async () => {
				containerRuntime = await ContainerRuntime.loadRuntime({
					context: getMockContext() as IContainerContext,
					registryEntries: [],
					existing: false,
					requestHandler: undefined,
					runtimeOptions: {
						enableGroupedBatching: false,
					},
					provideEntryPoint: mockProvideEntryPoint,
				});
			});

			it("can submit op compat behavior (temporarily still available for GC op)", async () => {
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

				const gcMessageWithDeprecatedCompatDetails: ContainerRuntimeGCMessage = {
					type: ContainerMessageType.GC,
					contents: { type: "Sweep", deletedNodeIds: [] },
					compatDetails: { behavior: "Ignore" },
				};

				assert.doesNotThrow(
					() =>
						containerRuntimeWithSubmit.submit(
							gcMessageWithDeprecatedCompatDetails,
							undefined,
							undefined,
						),
					"Cannot submit container runtime message with compatDetails",
				);
			});

			/** Overwrites channelCollection property and exposes private submit function with modified typing */
			function patchContainerRuntime(): Omit<ContainerRuntime, "submit"> & {
				submit: (containerRuntimeMessage: UnknownContainerRuntimeMessage) => void;
			} {
				const patched = containerRuntime as unknown as Omit<
					ContainerRuntime,
					"submit" | "channelCollection"
				> & {
					submit: (containerRuntimeMessage: UnknownContainerRuntimeMessage) => void;
					channelCollection: Partial<ChannelCollection>;
				};

				patched.channelCollection = {
					setConnectionState: (_connected: boolean, _clientId?: string) => {},
					// Pass data store op right back to ContainerRuntime
					reSubmit: (type: string, envelope: any, localOpMetadata: unknown) => {
						submitDataStoreOp(
							containerRuntime,
							envelope.address,
							envelope.contents,
							localOpMetadata,
						);
					},
				} satisfies Partial<ChannelCollection>;

				return patched;
			}

			it("Op with unrecognized type and 'Ignore' compat behavior is ignored by resubmit", async () => {
				const patchedContainerRuntime = patchContainerRuntime();

				changeConnectionState(patchedContainerRuntime, false, mockClientId);

				submitDataStoreOp(patchedContainerRuntime, "1", "test");
				submitDataStoreOp(patchedContainerRuntime, "2", "test");
				patchedContainerRuntime.submit({
					type: "FUTURE_TYPE" as any,
					contents: "3",
					compatDetails: { behavior: "Ignore" }, // This op should be ignored by resubmit
				});
				submitDataStoreOp(patchedContainerRuntime, "4", "test");

				assert.strictEqual(
					submittedOps.length,
					0,
					"no messages should be sent while disconnected",
				);

				// Connect, which will trigger resubmit
				changeConnectionState(patchedContainerRuntime, true, mockClientId);

				assert.strictEqual(
					submittedOps.length,
					3,
					"Only 3 messages should be sent - Do not resubmit the future/unknown op",
				);
			});

			it("Op with unrecognized type and no compat behavior causes resubmit to throw", async () => {
				const patchedContainerRuntime = patchContainerRuntime();

				changeConnectionState(patchedContainerRuntime, false, mockClientId);

				patchedContainerRuntime.submit({
					type: "FUTURE_TYPE" as any,
					contents: "3",
					// No compatDetails so it will throw on resubmit.
				});

				assert.strictEqual(
					submittedOps.length,
					0,
					"no messages should be sent while disconnected",
				);

				// Note: hitting this error case in practice would require a new op type to be deployed,
				// one such op to be stashed, then a new session loads on older code that is unaware
				// of the new op type.
				assert.throws(() => {
					// Connect, which will trigger resubmit
					changeConnectionState(patchedContainerRuntime, true, mockClientId);
				}, "Expected resubmit to throw");
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
						containerRuntime.process(packedOp as ISequencedDocumentMessage, false /* local */),
					(error: IErrorBase) => error.errorType === ContainerErrorTypes.dataProcessingError,
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
						containerRuntime.process(packedOp as ISequencedDocumentMessage, false /* local */),
					(error: IErrorBase) => error.errorType === ContainerErrorTypes.dataProcessingError,
					"Ops with unrecognized type and no specified compat behavior should fail to process",
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
							provideEntryPoint: (containerRuntime: IContainerRuntime) => Promise<FluidObject>;
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
				submitDataStoreOp(containerRuntime, "1", content);
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
					audience: new MockAudience(),
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
				enableRuntimeIdCompressor: undefined,
				enableGroupedBatching: false,
				explicitSchemaControl: false,
			} satisfies IContainerRuntimeOptions;
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
						idCompressorMode: defaultRuntimeOptions.enableRuntimeIdCompressor,
					},
				]);
			});

			it("Container load stats with feature gate overrides", async () => {
				const featureGates = {
					"Fluid.ContainerRuntime.CompressionDisabled": true,
					"Fluid.ContainerRuntime.CompressionChunkingDisabled": true,
					"Fluid.ContainerRuntime.IdCompressorEnabled": true,
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
						idCompressorMode: "on",
						featureGates: JSON.stringify({
							disableCompression: true,
							disableChunking: true,
						}),
						groupedBatchingEnabled: true,
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
					audience: new MockAudience(),
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
					latestSummaryRefSeqNum: 0,
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
					latestSummaryRefSeqNum: 0,
				});
				assert(summarizeResult.stage === "base", "Summary did not fail");
				assert.strictEqual(
					summarizeResult.error?.message,
					"disconnected",
					"Summary was not canceled",
				);
			});

			it("summary fails before generate if there are pending ops", async () => {
				// Submit an op and yield for it to be flushed from outbox to pending state manager.
				submitDataStoreOp(containerRuntime, "fakeId", "fakeContents");
				await yieldEventLoop();

				const summarizeResultP = containerRuntime.submitSummary({
					summaryLogger: createChildLogger(),
					cancellationToken: neverCancelledSummaryToken,
					latestSummaryRefSeqNum: 0,
				});

				// Advance the clock by the time that container runtime would wait for pending ops to be processed.
				clock.tick(defaultPendingOpsWaitTimeoutMs);
				const summarizeResult = await summarizeResultP;
				assert(summarizeResult.stage === "base", "Summary did not fail");
				assert.strictEqual(
					summarizeResult.error?.message,
					"PendingOpsWhileSummarizing",
					"Summary did not fail with the right error",
				);
				assert.strictEqual(
					isILoggingError(summarizeResult.error) &&
						summarizeResult.error.getTelemetryProperties().beforeGenerate,
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
						submitDataStoreOp(containerRuntime, "fakeId", "fakeContents");
						await yieldEventLoop();
						return boundFn(...args);
					};
				};
				containerRuntime.summarize = patch(containerRuntime.summarize);

				const summarizeResult = await containerRuntime.submitSummary({
					summaryLogger: createChildLogger(),
					cancellationToken: neverCancelledSummaryToken,
					latestSummaryRefSeqNum: 0,
				});
				assert(summarizeResult.stage === "base", "Summary did not fail");
				assert.strictEqual(
					summarizeResult.error?.message,
					"PendingOpsWhileSummarizing",
					"Summary did not fail with the right error",
				);
				assert.strictEqual(
					isILoggingError(summarizeResult.error) &&
						summarizeResult.error.getTelemetryProperties().beforeGenerate,
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
					latestSummaryRefSeqNum: 0,
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

		describe("GetPendingState", () => {
			it("No Props. No pending state", async () => {
				const logger = new MockLogger();

				const containerRuntime = await ContainerRuntime.loadRuntime({
					context: getMockContext({}, logger) as IContainerContext,
					registryEntries: [],
					existing: false,
					runtimeOptions: {
						flushMode: FlushMode.TurnBased,
						enableRuntimeIdCompressor: "on",
					},
					provideEntryPoint: mockProvideEntryPoint,
				});

				const mockPendingStateManager = new Proxy<PendingStateManager>({} as any, {
					get: (_t, p: keyof PendingStateManager, _r) => {
						switch (p) {
							case "getLocalState":
								return () => undefined;
							case "pendingMessagesCount":
								return 0;
							default:
								assert.fail(`unexpected access to pendingStateManager.${p}`);
						}
					},
				});

				(containerRuntime as any).pendingStateManager = mockPendingStateManager;

				const state = containerRuntime.getPendingLocalState() as Partial<IPendingRuntimeState>;
				assert.ok(state.sessionExpiryTimerStarted !== undefined);
			});
			it("No Props. Some pending state", async () => {
				const logger = new MockLogger();

				const containerRuntime = await ContainerRuntime.loadRuntime({
					context: getMockContext({}, logger) as IContainerContext,
					registryEntries: [],
					existing: false,
					runtimeOptions: {
						flushMode: FlushMode.TurnBased,
						enableRuntimeIdCompressor: "on",
					},
					provideEntryPoint: mockProvideEntryPoint,
				});
				const pendingStates = Array.from({ length: 5 }).map<IPendingMessage>((_, i) => ({
					content: i.toString(),
					type: "message",
					referenceSequenceNumber: 0,
					localOpMetadata: undefined,
					opMetadata: undefined,
				}));
				const mockPendingStateManager = new Proxy<PendingStateManager>({} as any, {
					get: (_t, p: keyof PendingStateManager, _r) => {
						switch (p) {
							case "getLocalState":
								return (): IPendingLocalState => ({
									pendingStates,
								});
							case "pendingMessagesCount":
								return 5;
							default:
								assert.fail(`unexpected access to pendingStateManager.${p}`);
						}
					},
				});

				(containerRuntime as any).pendingStateManager = mockPendingStateManager;

				const state = containerRuntime.getPendingLocalState() as Partial<IPendingRuntimeState>;
				assert.strictEqual(typeof state, "object");
				assert.strictEqual(state.pending?.pendingStates, pendingStates);
			});
			it("notifyImminentClosure. Some pending state", async () => {
				const logger = new MockLogger();

				const containerRuntime = await ContainerRuntime.loadRuntime({
					context: getMockContext({}, logger) as IContainerContext,
					registryEntries: [],
					existing: false,
					runtimeOptions: {
						flushMode: FlushMode.TurnBased,
						enableRuntimeIdCompressor: "on",
					},
					provideEntryPoint: mockProvideEntryPoint,
				});
				const pendingStates = Array.from({ length: 5 }).map<IPendingMessage>((_, i) => ({
					content: i.toString(),
					type: "message",
					referenceSequenceNumber: 0,
					localOpMetadata: undefined,
					opMetadata: undefined,
				}));
				const mockPendingStateManager = new Proxy<PendingStateManager>({} as any, {
					get: (_t, p: keyof PendingStateManager, _r) => {
						switch (p) {
							case "getLocalState":
								return (): IPendingLocalState => ({
									pendingStates,
								});
							case "pendingMessagesCount":
								return 5;
							default:
								assert.fail(`unexpected access to pendingStateManager.${p}`);
						}
					},
				});

				(containerRuntime as any).pendingStateManager = mockPendingStateManager;

				const stateP = containerRuntime.getPendingLocalState({
					notifyImminentClosure: true,
				}) as PromiseLike<Partial<IPendingRuntimeState>>;
				assert("then" in stateP, "should be a promise like");
				const state = await stateP;
				assert.strictEqual(typeof state, "object");
				assert.strictEqual(state.pending?.pendingStates, pendingStates);
			});

			it("sessionExpiryTimerStarted. No pending state", async () => {
				const logger = new MockLogger();

				const containerRuntime = await ContainerRuntime.loadRuntime({
					context: getMockContext({}, logger) as IContainerContext,
					registryEntries: [],
					existing: false,
					runtimeOptions: {
						flushMode: FlushMode.TurnBased,
						enableRuntimeIdCompressor: "on",
					},
					provideEntryPoint: mockProvideEntryPoint,
				});

				const state = (await containerRuntime.getPendingLocalState({
					notifyImminentClosure: true,
					sessionExpiryTimerStarted: 100,
				})) as Partial<IPendingRuntimeState>;
				assert.strictEqual(typeof state, "object");
				assert.strictEqual(state.sessionExpiryTimerStarted, 100);
			});

			it("sessionExpiryTimerStarted. Some pending state", async () => {
				const logger = new MockLogger();

				const containerRuntime = await ContainerRuntime.loadRuntime({
					context: getMockContext({}, logger) as IContainerContext,
					registryEntries: [],
					existing: false,
					runtimeOptions: {
						flushMode: FlushMode.TurnBased,
						enableRuntimeIdCompressor: "on",
					},
					provideEntryPoint: mockProvideEntryPoint,
				});
				const pendingStates = Array.from({ length: 5 }).map<IPendingMessage>((_, i) => ({
					content: i.toString(),
					type: "message",
					referenceSequenceNumber: 0,
					localOpMetadata: undefined,
					opMetadata: undefined,
				}));
				const mockPendingStateManager = new Proxy<PendingStateManager>({} as any, {
					get: (_t, p: keyof PendingStateManager, _r) => {
						switch (p) {
							case "getLocalState":
								return (): IPendingLocalState => ({
									pendingStates,
								});
							case "pendingMessagesCount":
								return 5;
							default:
								assert.fail(`unexpected access to pendingStateManager.${p}`);
						}
					},
				});

				(containerRuntime as any).pendingStateManager = mockPendingStateManager;

				const state = (await containerRuntime.getPendingLocalState({
					notifyImminentClosure: true,
					sessionExpiryTimerStarted: 100,
				})) as Partial<IPendingRuntimeState>;
				assert.strictEqual(state.sessionExpiryTimerStarted, 100);
			});
		});

		describe("Load Partial Snapshot with datastores with GroupId", () => {
			let snapshotWithContents: ISnapshot;
			let blobContents: Map<string, ArrayBuffer>;
			let ops: ISequencedDocumentMessage[];
			let containerRuntime: ContainerRuntime;
			let containerContext: IContainerContext;
			let entryDefault: FluidDataStoreRegistryEntry;
			let snapshotTree: ISnapshotTree;
			let missingDataStoreRuntime: MockFluidDataStoreRuntime;
			beforeEach(async () => {
				snapshotTree = {
					id: "SnapshotId",
					blobs: { ".metadata": "bARD4RKvW4LL1KmaUKp6hUMSp" },
					trees: {
						".channels": {
							blobs: {},
							trees: {
								default: {
									blobs: {
										".component": "bARC6dCXlcrPxQHw3PeROtmKc",
									},
									trees: {
										".channels": {
											blobs: {},
											trees: {
												root: { blobs: {}, trees: {} },
											},
										},
									},
								},
							},
							unreferenced: true,
						},
						".blobs": { blobs: {}, trees: {} },
						"gc": {
							id: "e8ed0760ac37fd8042020559779ce80b1d88f266",
							blobs: {
								__gc_root: "018d97818f8b519f99c418cb3c33ce5cc4e38e3f",
							},
							trees: {},
						},
					},
				};

				blobContents = new Map<string, ArrayBuffer>([
					[
						"bARD4RKvW4LL1KmaUKp6hUMSp",
						stringToBuffer(JSON.stringify({ summaryFormatVersion: 1, gcFeature: 3 }), "utf8"),
					],
					[
						"bARC6dCXlcrPxQHw3PeROtmKc",
						stringToBuffer(
							JSON.stringify({
								pkg: '["@fluid-example/smde"]',
								summaryFormatVersion: 2,
								isRootDataStore: true,
							}),
							"utf8",
						),
					],
					[
						"018d97818f8b519f99c418cb3c33ce5cc4e38e3f",
						stringToBuffer(
							JSON.parse(
								JSON.stringify(
									'{"gcNodes":{"/":{"outboundRoutes":["/rootDOId"]},"/rootDOId":{"outboundRoutes":["/rootDOId/de68ca53-be31-479e-8d34-a267958997e4","/rootDOId/root"]},"/rootDOId/de68ca53-be31-479e-8d34-a267958997e4":{"outboundRoutes":["/rootDOId"]},"/rootDOId/root":{"outboundRoutes":["/rootDOId","/rootDOId/de68ca53-be31-479e-8d34-a267958997e4"]}}}',
								),
							),
							"utf8",
						),
					],
				]);

				ops = [
					{
						clientId: "X",
						clientSequenceNumber: -1,
						contents: null,
						minimumSequenceNumber: 0,
						referenceSequenceNumber: -1,
						sequenceNumber: 1,
						timestamp: 1623883807452,
						type: "join",
					},
					{
						clientId: "Y",
						clientSequenceNumber: -1,
						contents: null,
						minimumSequenceNumber: 0,
						referenceSequenceNumber: -1,
						sequenceNumber: 2,
						timestamp: 1623883811928,
						type: "join",
					},
				];
				snapshotWithContents = {
					blobContents,
					ops,
					snapshotTree,
					sequenceNumber: 0,
					snapshotFormatV: 1,
					latestSequenceNumber: 2,
				};

				const logger = new MockLogger();
				containerContext = getMockContext({}, logger) as IContainerContext;

				(containerContext as any).snapshotWithContents = snapshotWithContents;
				(containerContext as any).baseSnapshot = snapshotWithContents.snapshotTree;
				containerContext.storage.readBlob = async (id: string) => {
					return blobContents.get(id) as ArrayBuffer;
				};
				missingDataStoreRuntime = new MockFluidDataStoreRuntime();
				const entryA = createDataStoreRegistryEntry([]);
				const entryB = createDataStoreRegistryEntry([]);
				entryDefault = createDataStoreRegistryEntry([
					["default", Promise.resolve(entryA)],
					["missingDataStore", Promise.resolve(entryB)],
				]);

				logger.clear();
			});

			function createSnapshot(addMissindDatasore: boolean, setGroupId: boolean = true) {
				if (addMissindDatasore) {
					snapshotTree.trees[".channels"].trees.missingDataStore = {
						blobs: { ".component": "id" },
						trees: {
							".channels": {
								blobs: {},
								trees: {
									root: { blobs: {}, trees: {} },
								},
							},
						},
						groupId: setGroupId ? "G1" : undefined,
					};
				}
			}

			// Helper function that creates a FluidDataStoreRegistryEntry with the registry entries
			// provided to it.
			function createDataStoreRegistryEntry(
				entries: NamedFluidDataStoreRegistryEntries,
			): FluidDataStoreRegistryEntry {
				const registryEntries = new Map(entries);
				const factory: IFluidDataStoreFactory = {
					type: "store-type",
					get IFluidDataStoreFactory() {
						return factory;
					},
					instantiateDataStore: async (context: IFluidDataStoreContext) => {
						if (context.id === "missingDataStore") {
							return missingDataStoreRuntime;
						}
						return new MockFluidDataStoreRuntime();
					},
				};
				const registry: IFluidDataStoreRegistry = {
					get IFluidDataStoreRegistry() {
						return registry;
					},
					// Returns the registry entry as per the entries provided in the param.
					get: async (pkg) => registryEntries.get(pkg),
				};

				const entry: FluidDataStoreRegistryEntry = {
					get IFluidDataStoreFactory() {
						return factory;
					},
					get IFluidDataStoreRegistry() {
						return registry;
					},
				};
				return entry;
			}

			it("Load snapshot with missing snapshot contents for datastores should fail when groupId not specified", async () => {
				// In this test we will try to load the container runtime with a snapshot which has 2 datastores. However,
				// snapshot for datastore "missingDataStore" is omitted and we will check that the container runtime loads fine
				// but the "missingDataStore" is aliased, it fails if the snapshot for it does not have loadingGroupId to fetch
				// the omitted snapshot contents.
				createSnapshot(true /* addMissingDatastore */, false /* Don't set groupId property */);
				containerRuntime = await ContainerRuntime.loadRuntime({
					context: containerContext,
					registryEntries: [["@fluid-example/smde", Promise.resolve(entryDefault)]],
					existing: true,
					runtimeOptions: {
						flushMode: FlushMode.TurnBased,
						enableRuntimeIdCompressor: "on",
					},
					provideEntryPoint: mockProvideEntryPoint,
				});
				const defaultDataStore =
					await containerRuntime.getAliasedDataStoreEntryPoint("default");
				assert(defaultDataStore !== undefined, "data store should load and is attached");
				await assert.rejects(async () => {
					await containerRuntime.getAliasedDataStoreEntryPoint("missingDataStore");
				}, "Resolving missing datastore should reject");
			});

			it("Load snapshot with missing snapshot contents for datastores should fail for summarizer in case group snapshot is ahead of initial snapshot seq number", async () => {
				// In this test we will try to load the container runtime with a snapshot which has 2 datastores. However,
				// snapshot for datastore "missingDataStore" is omitted and we will check that the container runtime loads fine
				// but the "missingDataStore" is requested/aliased, it fails to because for summarizer the fetched snapshot could
				// not be ahead of the base snapshot as that means that a snapshot is missing and the summarizer is not up to date.
				containerContext.storage.getSnapshot = async (snapshotFetchOptions) => {
					snapshotWithContents.sequenceNumber = 10;
					return snapshotWithContents;
				};
				createSnapshot(true /* addMissingDatastore */);
				containerContext.clientDetails.type = "summarizer";
				containerRuntime = await ContainerRuntime.loadRuntime({
					context: containerContext,
					registryEntries: [["@fluid-example/smde", Promise.resolve(entryDefault)]],
					existing: true,
					runtimeOptions: {
						flushMode: FlushMode.TurnBased,
						enableRuntimeIdCompressor: "on",
					},
					provideEntryPoint: mockProvideEntryPoint,
				});
				const defaultDataStore =
					await containerRuntime.getAliasedDataStoreEntryPoint("default");
				assert(defaultDataStore !== undefined, "data store should load and is attached");
				await assert.rejects(
					async () => {
						await containerRuntime.getAliasedDataStoreEntryPoint("missingDataStore");
					},
					(err: IFluidErrorBase) => {
						assert(
							err.message ===
								"Summarizer client behind, loaded newer snapshot with loadingGroupId",
							"summarizer client is behind",
						);
						return true;
					},
				);
			});

			it("Load snapshot with missing snapshot contents for datastores should load properly", async () => {
				// In this test we will try to load the container runtime with a snapshot which has 2 datastores. However,
				// snapshot for datastore "missingDataStore" is omitted and we will check that the container runtime loads fine
				// and when the "missingDataStore" is requested/aliased, it does that successfully.
				let getSnapshotCalledTimes = 0;
				containerContext.storage.getSnapshot = async (snapshotFetchOptions) => {
					getSnapshotCalledTimes++;
					snapshotWithContents.blobContents.set(
						"id",
						stringToBuffer(
							JSON.stringify({
								pkg: '["@fluid-example/smde"]',
								summaryFormatVersion: 2,
								isRootDataStore: true,
							}),
							"utf8",
						),
					);
					return snapshotWithContents;
				};
				createSnapshot(true /* addMissingDatastore */);
				containerRuntime = await ContainerRuntime.loadRuntime({
					context: containerContext,
					registryEntries: [["@fluid-example/smde", Promise.resolve(entryDefault)]],
					existing: true,
					runtimeOptions: {
						flushMode: FlushMode.TurnBased,
						enableRuntimeIdCompressor: "on",
					},
					provideEntryPoint: mockProvideEntryPoint,
				});
				const defaultDataStore =
					await containerRuntime.getAliasedDataStoreEntryPoint("default");
				assert(defaultDataStore !== undefined, "data store should load and is attached");
				const datastore1 = await containerRuntime.resolveHandle({
					url: "/missingDataStore",
				});
				// Mock Datastore runtime will return null when requested for "/".
				assert.strictEqual(datastore1, null, "resolveHandle should work fine");

				// Now try to get snapshot for missing data store again from container runtime. It should be returned
				// from cache.
				const snapshot = await containerRuntime.getSnapshotForLoadingGroupId(
					["G1"],
					["missingDataStore"],
				);
				assert.deepStrictEqual(
					snapshotTree.trees[".channels"].trees.missingDataStore,
					snapshot.snapshotTree,
					"snapshot should be equal",
				);
				assert(getSnapshotCalledTimes === 1, "second time should be from cache");

				// Set api to undefined to see that it should not be called again.
				containerContext.storage.getSnapshot = undefined;
				const datastore2 = await containerRuntime.resolveHandle({
					url: "/missingDataStore",
				});
				assert(datastore2 !== undefined, "resolveHandle should work fine");
			});

			it("Load snapshot with missing snapshot contents for datastores should work in case group snapshot is ahead of initial snapshot seq number", async () => {
				// In this test we will try to load the container runtime with a snapshot which has 2 datastores. However,
				// snapshot for datastore "missingDataStore" is omitted and we will check that the container runtime loads fine
				// and the container runtime waits for delta manager to reach snapshot seq number before returning the snapshot.
				containerContext.storage.getSnapshot = async (snapshotFetchOptions) => {
					snapshotWithContents.blobContents.set(
						"id",
						stringToBuffer(
							JSON.stringify({
								pkg: '["@fluid-example/smde"]',
								summaryFormatVersion: 2,
								isRootDataStore: true,
							}),
							"utf8",
						),
					);
					snapshotWithContents.sequenceNumber = 5;
					return snapshotWithContents;
				};
				createSnapshot(true /* addMissingDatastore */);
				containerRuntime = await ContainerRuntime.loadRuntime({
					context: containerContext,
					registryEntries: [["@fluid-example/smde", Promise.resolve(entryDefault)]],
					existing: true,
					runtimeOptions: {
						flushMode: FlushMode.TurnBased,
						enableRuntimeIdCompressor: "on",
					},
					provideEntryPoint: mockProvideEntryPoint,
				});
				const defaultDataStore =
					await containerRuntime.getAliasedDataStoreEntryPoint("default");
				assert(defaultDataStore !== undefined, "data store should load and is attached");
				// Set it to seq number of partial fetched snapshot so that it is returned successfully by container runtime.
				(containerContext.deltaManager as any).lastSequenceNumber = 5;
				const missingDataStore = await containerRuntime.resolveHandle({
					url: "/missingDataStore",
				});
				// Mock Datastore runtime will return null when requested for "/".
				assert.strictEqual(missingDataStore, null, "resolveHandle should work fine");
			});

			it("Load snapshot with missing snapshot contents for datastores should only process ops in datastore context which are after the snapshot seq number", async () => {
				// In this test we will try to load the container runtime with a snapshot which has 2 datastores. However,
				// snapshot for datastore "missingDataStore" is omitted and we will check that the container runtime loads fine
				// and the data store context only process ops which are after the snapshot seq number.
				containerContext.storage.getSnapshot = async (snapshotFetchOptions) => {
					snapshotWithContents.sequenceNumber = 2;
					snapshotWithContents.blobContents.set(
						"id",
						stringToBuffer(
							JSON.stringify({
								pkg: '["@fluid-example/smde"]',
								summaryFormatVersion: 2,
								isRootDataStore: true,
							}),
							"utf8",
						),
					);
					return snapshotWithContents;
				};
				createSnapshot(true /* addMissingDatastore */);
				containerRuntime = await ContainerRuntime.loadRuntime({
					context: containerContext,
					registryEntries: [["@fluid-example/smde", Promise.resolve(entryDefault)]],
					existing: true,
					runtimeOptions: {
						flushMode: FlushMode.TurnBased,
						enableRuntimeIdCompressor: "on",
					},
					provideEntryPoint: mockProvideEntryPoint,
				});
				const defaultDataStore =
					await containerRuntime.getAliasedDataStoreEntryPoint("default");
				assert(defaultDataStore !== undefined, "data store should load and is attached");
				const missingDataStoreContext =
					// eslint-disable-next-line @typescript-eslint/dot-notation
					containerRuntime["channelCollection"]["contexts"].get("missingDataStore");
				assert(missingDataStoreContext !== undefined, "context should be there");
				// Add ops to this context.
				const messages = [
					{ sequenceNumber: 1 },
					{ sequenceNumber: 2 },
					{ sequenceNumber: 3 },
					{ sequenceNumber: 4 },
				];
				// eslint-disable-next-line @typescript-eslint/dot-notation
				missingDataStoreContext["pending"] = messages as ISequencedDocumentMessage[];

				// Set it to seq number of partial fetched snapshot so that it is returned successfully by container runtime.
				(containerContext.deltaManager as any).lastSequenceNumber = 2;

				let opsProcessed = 0;
				let opsStart: number | undefined;
				missingDataStoreRuntime.process = (
					message: ISequencedDocumentMessage,
					local: boolean,
					localOpMetadata,
				) => {
					if (opsProcessed === 0) {
						opsStart = message.sequenceNumber;
					}
					opsProcessed++;
				};
				await assert.doesNotReject(async () => {
					await containerRuntime.resolveHandle({ url: "/missingDataStore" });
				}, "resolveHandle should work fine");

				assert(opsProcessed === 2, "only 2 ops should be processed with seq number 3 and 4");
				assert(opsStart === 3, "first op processed should have seq number 3");
			});
		});
	});
});
