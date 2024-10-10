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
	IResponse,
} from "@fluidframework/core-interfaces";
import { ISignalEnvelope, type IErrorBase } from "@fluidframework/core-interfaces/internal";
import { ISummaryTree } from "@fluidframework/driver-definitions";
import {
	IDocumentStorageService,
	ISnapshot,
	ISummaryContext,
	type ISnapshotTree,
	MessageType,
	ISequencedDocumentMessage,
	type IVersion,
	type FetchSource,
	type IDocumentAttributes,
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
	type InboundSequencedContainerRuntimeMessage,
	type OutboundContainerRuntimeMessage,
	type RecentlyAddedContainerRuntimeMessageDetails,
	type UnknownContainerRuntimeMessage,
} from "../messageTypes.js";
import type { BatchMessage, InboundMessageResult } from "../opLifecycle/index.js";
import {
	IPendingLocalState,
	IPendingMessage,
	PendingStateManager,
} from "../pendingStateManager.js";
import {
	ISummaryCancellationToken,
	neverCancelledSummaryToken,
	type IRefreshSummaryAckOptions,
} from "../summary/index.js";

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

	(runtime as any)._getClientId = () => clientId;

	runtime.setConnectionState(connected, clientId);
};

interface ISignalEnvelopeWithClientIds {
	envelope: ISignalEnvelope;
	clientId: string;
	targetClientId?: string;
}

function isSignalEnvelope(obj: unknown): obj is ISignalEnvelope {
	return (
		typeof obj === "object" &&
		obj !== null &&
		"contents" in obj &&
		typeof obj.contents === "object" &&
		obj.contents !== null &&
		"content" in obj.contents &&
		"type" in obj.contents &&
		typeof obj.contents.type === "string" &&
		(!("address" in obj) ||
			typeof obj.address === "string" ||
			typeof obj.address === "undefined") &&
		(!("clientBroadcastSignalSequenceNumber" in obj) ||
			typeof obj.clientBroadcastSignalSequenceNumber === "number")
	);
}

describe("Runtime", () => {
	const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
		getRawConfig: (name: string): ConfigTypes => settings[name],
	});

	let submittedOps: any[] = [];
	let submittedSignals: ISignalEnvelopeWithClientIds[] = [];
	let opFakeSequenceNumber = 1;
	let clock: SinonFakeTimers;

	before(() => {
		clock = useFakeTimers();
	});

	beforeEach(() => {
		submittedOps = [];
		opFakeSequenceNumber = 1;
		submittedSignals = [];
	});

	afterEach(() => {
		clock.reset();
	});

	after(() => {
		clock.restore();
	});

	const mockClientId = "mockClientId";

	// Mock the storage layer so "submitSummary" works.
	const defaultMockStorage: Partial<IDocumentStorageService> = {
		uploadSummaryWithContext: async (summary: ISummaryTree, context: ISummaryContext) => {
			return "fakeHandle";
		},
	};
	const getMockContext = (
		params: {
			settings?: Record<string, ConfigTypes>;
			logger?;
			mockStorage?: Partial<IDocumentStorageService>;
			loadedFromVersion?: IVersion;
			baseSnapshot?: ISnapshotTree;
		} = {},
		clientId: string = mockClientId,
	): Partial<IContainerContext> => {
		const {
			settings = {},
			logger = new MockLogger(),
			mockStorage = defaultMockStorage,
			loadedFromVersion,
		} = params;

		const mockContext = {
			attachState: AttachState.Attached,
			deltaManager: new MockDeltaManager(),
			audience: new MockAudience(),
			quorum: new MockQuorumClients(),
			taggedLogger: mixinMonitoringContext(logger, configProvider(settings)).logger,
			clientDetails: { capabilities: { interactive: true } },
			closeFn: (_error?: ICriticalContainerError): void => {},
			updateDirtyContainerState: (_dirty: boolean) => {},
			getLoadedFromVersion: () => loadedFromVersion,
			submitFn: (_type: MessageType, contents: any, _batch: boolean, metadata?: unknown) => {
				submittedOps.push({ ...contents, metadata }); // Note: this object shape is for testing only. Not representative of real ops.
				return opFakeSequenceNumber++;
			},
			submitSignalFn: (content: unknown, targetClientId?: string) => {
				assert(isSignalEnvelope(content), "Invalid signal envelope");
				submittedSignals.push({
					envelope: content,
					clientId,
					targetClientId,
				}); // Note: this object shape is for testing only. Not representative of real signals.
			},
			clientId,
			connected: true,
			storage: mockStorage as IDocumentStorageService,
		} satisfies Partial<IContainerContext>;

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
					context: getMockContext({ logger }) as IContainerContext,
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

		describe("Flushing and Replaying", () => {
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

			it("Process empty batch", async () => {
				let batchBegin = 0;
				let batchEnd = 0;
				let callsToEnsure = 0;
				const containerRuntime = await ContainerRuntime.loadRuntime({
					context: getMockContext({
						settings: {
							"Fluid.Container.enableOfflineLoad": true,
						},
					}) as IContainerContext,
					registryEntries: [],
					existing: false,
					runtimeOptions: {
						flushMode: FlushMode.TurnBased,
					},
					provideEntryPoint: mockProvideEntryPoint,
				});
				(containerRuntime as any).ensureNoDataModelChanges = (callback) => {
					callback();
					callsToEnsure++;
				};
				changeConnectionState(containerRuntime, false, mockClientId);

				// Not connected, so nothing is submitted on flush - just queued in PendingStateManager
				submitDataStoreOp(containerRuntime, "1", "test", { emptyBatch: true });
				(containerRuntime as any).flush();
				changeConnectionState(containerRuntime, true, mockClientId);

				containerRuntime.on("batchBegin", () => batchBegin++);
				containerRuntime.on("batchEnd", () => batchEnd++);
				containerRuntime.process(
					{
						clientId: mockClientId,
						sequenceNumber: 10,
						clientSequenceNumber: 1,
						type: MessageType.Operation,
						contents: JSON.stringify({
							type: "groupedBatch",
							contents: [],
						}),
					} satisfies Partial<ISequencedDocumentMessage> as ISequencedDocumentMessage,
					true,
				);
				assert.strictEqual(callsToEnsure, 1);
				assert.strictEqual(batchBegin, 1);
				assert.strictEqual(batchEnd, 1);
				assert.strictEqual(containerRuntime.isDirty, false);
			});

			[true, undefined].forEach((enableOfflineLoad) =>
				it("Replaying ops should resend in correct order, with batch ID if applicable", async () => {
					const containerRuntime = await ContainerRuntime.loadRuntime({
						context: getMockContext({
							settings: {
								"Fluid.Container.enableOfflineLoad": enableOfflineLoad, // batchId only stamped if true
							},
						}) as IContainerContext,
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

					// Not connected, so nothing is submitted on flush - just queued in PendingStateManager
					submitDataStoreOp(containerRuntime, "1", "test");
					(containerRuntime as any).flush();

					submitDataStoreOp(containerRuntime, "2", "test");
					changeConnectionState(containerRuntime, true, mockClientId);
					(containerRuntime as any).flush();

					assert.strictEqual(submittedOps.length, 2);
					assert.strictEqual(submittedOps[0].contents.address, "1");
					assert.strictEqual(submittedOps[1].contents.address, "2");

					function batchIdMatchesUnsentFormat(batchId?: string) {
						return (
							batchId !== undefined &&
							batchId.length === "00000000-0000-0000-0000-000000000000_[-1]".length &&
							batchId.endsWith("_[-1]")
						);
					}

					if (enableOfflineLoad) {
						assert(
							batchIdMatchesUnsentFormat(submittedOps[0].metadata?.batchId),
							"expected unsent batchId format (0)",
						);
						assert(
							batchIdMatchesUnsentFormat(submittedOps[1].metadata?.batchId),
							"expected unsent batchId format (0)",
						);
					} else {
						assert(submittedOps[0].metadata?.batchId === undefined, "Expected no batchId (0)");
						assert(submittedOps[1].metadata?.batchId === undefined, "Expected no batchId (1)");
					}
				}),
			);
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
					processInboundMessages: (inbound: InboundMessageResult, _local: boolean) => {
						const messages =
							inbound.type === "fullBatch" ? inbound.messages : [inbound.nextMessage];
						return messages.map<{
							message: InboundSequencedContainerRuntimeMessage;
							localOpMetadata?: unknown;
						}>((message) => ({
							message,
							localOpMetadata: undefined,
						}));
					},
					get pendingMessagesCount() {
						return pendingMessages;
					},
					onFlushBatch: (batch: BatchMessage[], _csn?: number) =>
						(pendingMessages += batch.length),
				} satisfies Partial<PendingStateManager> as any as PendingStateManager;
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

			/** Connects with a new clientId and then immediately disconnects, returning that brief connection's clientId */
			const toggleConnection = (runtime: ContainerRuntime, salt: number) => {
				const clientId = salt === undefined ? fakeClientId : `${fakeClientId}-${salt}`;
				changeConnectionState(runtime, true, clientId);
				changeConnectionState(runtime, false, clientId);
				return clientId;
			};

			const addPendingMessage = (pendingStateManager: PendingStateManager): void =>
				pendingStateManager.onFlushBatch([{ referenceSequenceNumber: 0 }], 1);

			it(
				`No progress for ${maxReconnects} connection state changes, with pending state, should ` +
					"generate telemetry event and throw an error that closes the container",
				async () => {
					const pendingStateManager = getMockPendingStateManager();
					patchRuntime(pendingStateManager);

					for (let i = 0; i < maxReconnects; i++) {
						addPendingMessage(pendingStateManager);
						toggleConnection(containerRuntime, i);
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

					for (let i = 0; i < maxReconnects / 2 + 1; i++) {
						toggleConnection(containerRuntime, i);
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
						toggleConnection(containerRuntime, i);
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
						toggleConnection(containerRuntime, i);
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
						const clientId = toggleConnection(containerRuntime, i);
						containerRuntime.process(
							{
								type: "op",
								clientId,
								sequenceNumber: i,
								contents: {
									address: "address",
								},
								clientSequenceNumber: 0,
								minimumSequenceNumber: 0,
							} satisfies Partial<ISequencedDocumentMessage> as ISequencedDocumentMessage,
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

					let seqNum = 1;
					for (let i = 0; i < maxReconnects; i++) {
						addPendingMessage(pendingStateManager);
						toggleConnection(containerRuntime, i);
						containerRuntime.process(
							{
								type: "op",
								clientId: `a unique, remote clientId - ${i}`,
								sequenceNumber: seqNum++,
								clientSequenceNumber: 1,
								contents: {
									address: "address",
								},
								minimumSequenceNumber: 0,
							} satisfies Partial<ISequencedDocumentMessage> as ISequencedDocumentMessage,
							false /* local */,
						);
						containerRuntime.process(
							{
								type: "op",
								clientId: "clientId",
								sequenceNumber: seqNum++,
								contents: {
									address: "address",
									contents: {
										chunkId: i + 1,
										totalChunks: maxReconnects + 1,
									},
									type: "chunkedOp",
								},
								minimumSequenceNumber: 0,
							} satisfies Partial<ISequencedDocumentMessage> as ISequencedDocumentMessage,
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
				assert.throws(
					() => changeConnectionState(patchedContainerRuntime, true, mockClientId),
					(error: IErrorBase) => error.errorType === ContainerErrorTypes.dataProcessingError,
					"Ops with unrecognized type and 'Ignore' compat behavior should fail to resubmit",
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
					"term" | "clientSequenceNumber" | "referenceSequenceNumber" | "timestamp"
				> = {
					contents: JSON.stringify(futureRuntimeMessage),
					type: MessageType.Operation,
					sequenceNumber: 123,
					clientId: "someClientId",
					minimumSequenceNumber: 0,
				};
				assert.throws(
					() =>
						containerRuntime.process(packedOp as ISequencedDocumentMessage, false /* local */),
					(error: IErrorBase) => error.errorType === ContainerErrorTypes.dataProcessingError,
					"Ops with unrecognized type and 'Ignore' compat behavior should fail to process",
				);
			});

			it("process remote op with unrecognized type and no compat behavior", async () => {
				const futureRuntimeMessage = {
					type: "FROM_THE_FUTURE",
					contents: "Hello",
				};

				const packedOp: Omit<
					ISequencedDocumentMessage,
					"term" | "clientSequenceNumber" | "referenceSequenceNumber" | "timestamp"
				> = {
					contents: JSON.stringify(futureRuntimeMessage),
					type: MessageType.Operation,
					sequenceNumber: 123,
					clientId: "someClientId",
					minimumSequenceNumber: 0,
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
					"Fluid.ContainerRuntime.IdCompressorEnabled": true,
					"Fluid.ContainerRuntime.DisablePartialFlush": true,
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
							disablePartialFlush: true,
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
							contents: undefined,
						},
						minimumSequenceNumber: 0,
					} satisfies Partial<ISequencedDocumentMessage> as ISequencedDocumentMessage,
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

		describe("Snapshots", () => {
			/**
			 * This test tests a scenario where a summarizer gets a newer summary ack, but on fetching the latest snapshot,
			 * it gets a snapshot which is older than the one corresponding to the ack.
			 * This can happen in cases such as database rollbacks in server which results in deleting recent snapshots but
			 * not the corresponding acks.
			 * Summarizers should not close in this scenario. They should continue generating summaries.
			 */
			it("Summary succeeds on receiving summary ack for a deleted snapshot", async () => {
				// The latest snapshot version in storage.
				const latestVersion: IVersion = {
					id: "snapshot1",
					treeId: "snapshotTree1",
				};
				// The latest snapshot tree in storage.
				const latestSnapshotTree: ISnapshotTree = {
					blobs: {},
					trees: {
						".protocol": {
							blobs: {
								"attributes": "attributesBlob",
							},
							trees: {},
						},
					},
				};
				// The version of the snapshot that was deleted say during DB rollback.
				const deletedSnapshotId = "snapshot2";
				// The properties of the ack corresponding to the deleted snapshot.
				const deletedSnapshotAckOptions: IRefreshSummaryAckOptions = {
					proposalHandle: "proposal1",
					ackHandle: deletedSnapshotId,
					summaryRefSeq: 100,
					summaryLogger: createChildLogger({}),
				};
				class MockStorageService implements Partial<IDocumentStorageService> {
					/**
					 * This always returns the same snapshot. Basically, when container runtime receives an ack for the
					 * deleted snapshot and tries to fetch the latest snapshot, return the latest snapshot.
					 */
					async getSnapshotTree(version?: IVersion, scenarioName?: string) {
						assert.strictEqual(
							version,
							latestVersion,
							"getSnapshotTree called with incorrect version",
						);
						return latestSnapshotTree;
					}

					async getVersions(
						versionId: string | null,
						count: number,
						scenarioName?: string,
						fetchSource?: FetchSource,
					) {
						return [latestVersion];
					}

					/**
					 * Validates that this is not called by container runtime with the deleted snapshot id even
					 * though it received an ack for it.
					 */
					async uploadSummaryWithContext(summary: ISummaryTree, context: ISummaryContext) {
						assert.notStrictEqual(
							context.ackHandle,
							deletedSnapshotId,
							"Summary uploaded with deleted snapshot's ack",
						);
						return "snapshot3";
					}

					/**
					 * Called by container runtime to read document attributes. Return the sequence number as 0 which
					 * is lower than the deleted snapshot's reference sequence number.
					 */
					async readBlob(id: string) {
						assert.strictEqual(id, "attributesBlob", "Not implemented");
						const attributes: IDocumentAttributes = {
							sequenceNumber: 0,
							minimumSequenceNumber: 0,
						};
						return stringToBuffer(JSON.stringify(attributes), "utf8");
					}
				}

				const mockContext = getMockContext({
					mockStorage: new MockStorageService(),
					loadedFromVersion: latestVersion,
				});
				const containerRuntime = await ContainerRuntime.loadRuntime({
					context: mockContext as IContainerContext,
					registryEntries: [],
					existing: false,
					provideEntryPoint: mockProvideEntryPoint,
				});

				// Call refresh latest summary with the deleted snapshot's options. Container runtime should
				// ignore this but not close.
				await assert.doesNotReject(
					containerRuntime.refreshLatestSummaryAck(deletedSnapshotAckOptions),
					"Container runtime should not close",
				);

				// Submit a summary. This should upload a summary with the snapshot container runtime loaded
				// from and not the deleted snapshot.
				const summarizeResult = await containerRuntime.submitSummary({
					summaryLogger: createChildLogger(),
					cancellationToken: neverCancelledSummaryToken,
					latestSummaryRefSeqNum: 0,
				});
				assert(summarizeResult.stage === "submit", "Summary should not fail");
			});
		});

		describe("GetPendingState", () => {
			it("No Props. No pending state", async () => {
				const logger = new MockLogger();

				const containerRuntime = await ContainerRuntime.loadRuntime({
					context: getMockContext({ logger }) as IContainerContext,
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
					context: getMockContext({ logger }) as IContainerContext,
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
					batchInfo: { clientId: "CLIENT_ID", batchStartCsn: 1, length: 5 },
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
					context: getMockContext({ logger }) as IContainerContext,
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
					batchInfo: { clientId: "CLIENT_ID", batchStartCsn: 1, length: 5 },
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
					context: getMockContext({ logger }) as IContainerContext,
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
					context: getMockContext({ logger }) as IContainerContext,
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
					batchInfo: { clientId: "CLIENT_ID", batchStartCsn: 1, length: 5 },
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

		describe("Duplicate Batch Detection", () => {
			[undefined, true].forEach((enableOfflineLoad) => {
				it(`DuplicateBatchDetector enablement matches Offline load (${enableOfflineLoad ? "ENABLED" : "DISABLED"})`, async () => {
					const containerRuntime = await ContainerRuntime.loadRuntime({
						context: getMockContext({
							settings: { "Fluid.Container.enableOfflineLoad": enableOfflineLoad },
						}) as IContainerContext,
						registryEntries: [],
						existing: false,
						runtimeOptions: {
							flushMode: FlushMode.TurnBased,
							enableRuntimeIdCompressor: "on",
						},
						provideEntryPoint: mockProvideEntryPoint,
					});

					// Process batch "batchId1" with seqNum 123
					containerRuntime.process(
						{
							sequenceNumber: 123,
							type: MessageType.Operation,
							contents: { type: ContainerMessageType.Rejoin, contents: undefined },
							metadata: { batchId: "batchId1" },
						} satisfies Partial<ISequencedDocumentMessage> as ISequencedDocumentMessage,
						false,
					);
					// Process a duplicate batch "batchId1" with different seqNum 234
					const assertThrowsOnlyIfExpected = enableOfflineLoad
						? assert.throws
						: assert.doesNotThrow;
					const errorPredicate = (e: any) =>
						e.message === "Duplicate batch - The same batch was sequenced twice";
					assertThrowsOnlyIfExpected(
						() => {
							containerRuntime.process(
								{
									sequenceNumber: 234,
									type: MessageType.Operation,
									contents: { type: ContainerMessageType.Rejoin, contents: undefined },
									metadata: { batchId: "batchId1" },
								} satisfies Partial<ISequencedDocumentMessage> as ISequencedDocumentMessage,
								false,
							);
						},
						errorPredicate,
						"Expected duplicate batch detection to match Offline Load enablement",
					);
				});
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
				containerContext = getMockContext({ logger }) as IContainerContext;

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

		it("Only log legacy codepath once", async () => {
			const mockLogger = new MockLogger();
			const containerRuntime = await ContainerRuntime.loadRuntime({
				context: getMockContext({ logger: mockLogger }) as IContainerContext,
				registryEntries: [],
				existing: false,
				provideEntryPoint: mockProvideEntryPoint,
			});
			mockLogger.clear();

			const json = JSON.stringify({ hello: "world" });
			const messageBase = { contents: json, clientId: "CLIENT_ID" };

			// This message won't trigger the legacy op log
			containerRuntime.process(
				{
					...messageBase,
					contents: {},
					sequenceNumber: 1,
				} as unknown as ISequencedDocumentMessage,
				false /* local */,
			);
			assert.equal(mockLogger.events.length, 0, "Expected no event logged");

			// This message should trigger the legacy op log
			containerRuntime.process(
				{ ...messageBase, sequenceNumber: 2 } as unknown as ISequencedDocumentMessage,
				false /* local */,
			);
			mockLogger.assertMatch([{ eventName: "LegacyMessageFormat" }]);

			// This message would trigger the legacy op log, except we already logged once
			containerRuntime.process(
				{ ...messageBase, sequenceNumber: 3 } as unknown as ISequencedDocumentMessage,
				false /* local */,
			);
			assert.equal(mockLogger.events.length, 0, "Expected no more events logged");
		});

		describe("Signal Telemetry", () => {
			let containerRuntime: ContainerRuntime;
			let logger: MockLogger;
			let droppedSignals: ISignalEnvelopeWithClientIds[];
			let runtimes: Map<string, ContainerRuntime>;

			beforeEach(async () => {
				runtimes = new Map<string, ContainerRuntime>();
				logger = new MockLogger();
				droppedSignals = [];
				containerRuntime = await ContainerRuntime.loadRuntime({
					context: getMockContext({ logger }) as IContainerContext,
					registryEntries: [],
					existing: false,
					requestHandler: undefined,
					runtimeOptions: {
						enableGroupedBatching: false,
						flushMode: FlushMode.TurnBased,
					},
					provideEntryPoint: mockProvideEntryPoint,
				});
				// Assert that clientId is not undefined
				assert(containerRuntime.clientId !== undefined, "clientId should not be undefined");

				runtimes.set(containerRuntime.clientId, containerRuntime);
				logger.clear();
			});

			function sendSignals(count: number) {
				for (let i = 0; i < count; i++) {
					containerRuntime.submitSignal("TestSignalType", `TestSignalContent ${i + 1}`);
					assert(
						submittedSignals[submittedSignals.length - 1].envelope.contents.type ===
							"TestSignalType",
						"Signal type should match",
					);
					assert(
						submittedSignals[submittedSignals.length - 1].envelope.contents.content ===
							`TestSignalContent ${i + 1}`,
						"Signal content should match",
					);
				}
			}

			function processSignals(signals: ISignalEnvelopeWithClientIds[], count: number) {
				const signalsToProcess = signals.splice(0, count);
				for (const signal of signalsToProcess) {
					if (signal.targetClientId === undefined) {
						for (const runtime of runtimes.values()) {
							runtime.processSignal(
								{
									clientId: signal.clientId,
									content: {
										clientBroadcastSignalSequenceNumber:
											signal.envelope.clientBroadcastSignalSequenceNumber,
										contents: signal.envelope.contents,
									},
									targetClientId: signal.targetClientId,
								},
								true,
							);
						}
					} else {
						const runtime = runtimes.get(signal.targetClientId);
						if (runtime) {
							runtime.processSignal(
								{
									clientId: signal.clientId,
									content: {
										clientBroadcastSignalSequenceNumber:
											signal.envelope.clientBroadcastSignalSequenceNumber,
										contents: signal.envelope.contents,
									},
									targetClientId: signal.targetClientId,
								},
								true,
							);
						}
					}
				}
			}

			function processWithNoTargetSupport(count: number) {
				const signalsToProcess = submittedSignals.splice(0, count);
				for (const signal of signalsToProcess) {
					for (const runtime of runtimes.values()) {
						runtime.processSignal(
							{
								clientId: signal.clientId,
								content: {
									clientBroadcastSignalSequenceNumber:
										signal.envelope.clientBroadcastSignalSequenceNumber,
									contents: signal.envelope.contents,
								},
							},
							true,
						);
					}
				}
			}

			function processSubmittedSignals(count: number) {
				processSignals(submittedSignals, count);
			}

			function processDroppedSignals(count: number) {
				processSignals(droppedSignals, count);
			}

			function dropSignals(count: number) {
				const signalsToDrop = submittedSignals.splice(0, count);
				droppedSignals.push(...signalsToDrop);
			}

			it("emits signal latency telemetry after 100 signals", () => {
				// Send 1st signal and process it to prime the system
				sendSignals(1);
				processSubmittedSignals(1);

				// Send 100 more signals and process each of them in order
				sendSignals(100);
				processSubmittedSignals(100);

				logger.assertMatch(
					[
						{
							eventName: "ContainerRuntime:SignalLatency",
							signalsSent: 1,
							signalsLost: 0,
							outOfOrderSignals: 0,
						},

						{
							eventName: "ContainerRuntime:SignalLatency",
							signalsSent: 100,
							signalsLost: 0,
							outOfOrderSignals: 0,
						},
					],
					"Signal latency telemetry should be logged after 100 signals",
				);
			});

			it("emits SignalLost error event when signal is dropped", () => {
				sendSignals(4);
				processSubmittedSignals(1);
				dropSignals(2);
				processSubmittedSignals(1);

				logger.assertMatch(
					[
						{
							eventName: "ContainerRuntime:SignalLost",
							signalsLost: 2,
						},
					],
					"SignalLost telemetry should be logged when signal is dropped",
				);
			});

			it("emits SignalOutOfOrder error event when missing signal is received non-sequentially", () => {
				sendSignals(3);
				processSubmittedSignals(1);
				dropSignals(1);
				processSubmittedSignals(1);

				logger.assertMatch(
					[
						{
							eventName: "ContainerRuntime:SignalLost",
							signalsLost: 1,
						},
					],
					"SignalLost telemetry should be logged when signal is dropped",
					undefined,
					false,
				);

				logger.assertMatchNone(
					[
						{
							eventName: "ContainerRuntime:SignalOutOfOrder",
						},
					],
					"SignalOutOfOrder telemetry should not be logged on lost signal",
				);

				processDroppedSignals(1);

				logger.assertMatch(
					[
						{
							eventName: "ContainerRuntime:SignalOutOfOrder",
						},
					],
					"SignalOutOfOrder telemetry should be logged when missing signal is received non-sequentially",
				);
			});

			it("does not emit error events when signals are processed in order", () => {
				sendSignals(100);

				processSubmittedSignals(100);

				logger.assertMatchNone(
					[
						{
							eventName: "ContainerRuntime:SignalLost",
						},
						{
							eventName: "ContainerRuntime:SignalOutOfOrder",
						},
					],
					"SignalLost and SignalOutOfOrder telemetry should not be logged when signals are processed in order",
				);
			});

			it("logs relative lost signal count in SignalLost telemetry", () => {
				sendSignals(5);
				dropSignals(1);
				processSubmittedSignals(1);

				// Missing signal should be detected
				logger.assertMatch(
					[
						{
							eventName: "ContainerRuntime:SignalLost",
							signalsLost: 1,
						},
					],
					"SignalLost telemetry should be logged when signal is dropped",
				);

				dropSignals(2);
				processSubmittedSignals(1);

				// Missing 3rd and 4th signals should be detected
				logger.assertMatch(
					[
						{
							eventName: "ContainerRuntime:SignalLost",
							signalsLost: 2,
						},
					],
					"SignalLost telemetry should be logged when signal is dropped",
				);
			});

			it("ignores in-flight signals on disconnect/reconnect", () => {
				// Define resubmit and setConnectionState on channel collection
				// This is needed to submit test data store ops
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

				sendSignals(4);

				// Submit op so message is queued in PendingStateManager
				// This is needed to increase reconnect count
				submitDataStoreOp(containerRuntime, "1", "test");

				// Disconnect + Reconnect
				changeConnectionState(containerRuntime, false, mockClientId);
				changeConnectionState(containerRuntime, true, mockClientId);

				// Temporarily lose two old signals
				dropSignals(2);

				// Receive old signals sent before disconnect
				processSubmittedSignals(2);

				// Receive old out of order signals
				processDroppedSignals(2);

				// No error events should be logged for signals sent before disconnect
				logger.assertMatchNone(
					[
						{
							eventName: "ContainerRuntime:SignalOutOfOrder",
						},
						{
							eventName: "ContainerRuntime:SignalLost",
						},
					],
					"SignalOutOfOrder/SignalLost telemetry should not be logged on reconnect",
				);

				sendSignals(100);
				processSubmittedSignals(100);

				logger.assertMatch(
					[
						{
							eventName: "ContainerRuntime:SignalLatency",
							signalsSent: 97, // 101 (tracked latency signal) - 5 (earliest sent signal on reconnect) + 1 = 97
							signalsLost: 0,
							outOfOrderSignals: 0,
							reconnectCount: 1,
						},
					],
					"SignalLatency telemetry should be logged with correct reconnect count",
				);
			});

			it("counts both relative and abosolute lost signal counts", () => {
				sendSignals(60);
				processSubmittedSignals(10);
				dropSignals(1);
				processSubmittedSignals(39);

				logger.assertMatch(
					[
						{
							eventName: "ContainerRuntime:SignalLost",
							signalsLost: 1,
						},
					],
					"SignalLost telemetry should log relative lost signal count when a signal is dropped",
				);

				dropSignals(5);
				sendSignals(45);
				processSubmittedSignals(30);
				dropSignals(4);

				// Process remaining signals
				processSubmittedSignals(16);

				logger.assertMatch(
					[
						{
							eventName: "ContainerRuntime:SignalLost",
							signalsLost: 5,
						},
						{
							eventName: "ContainerRuntime:SignalLost",
							signalsLost: 4,
						},
						{
							eventName: "ContainerRuntime:SignalLatency",
							signalsSent: 100,
							signalsLost: 10,
							outOfOrderSignals: 0,
						},
					],
					"SignalLost telemetry should log relative lost signal count and SignalLatency telemetry should log absolute lost signal count for each batch of 100 signals",
				);
			});

			it("accurately reports amount of sent and lost signals with multiple SignalLatency events", () => {
				// Send 50 signals and drop 10
				sendSignals(50);
				dropSignals(10);
				processSubmittedSignals(40);

				// Send 60 signals and drop 10
				sendSignals(60);
				processSubmittedSignals(40);
				dropSignals(10);

				// Here we should detect that 100 signals have been sent and 20 signals were lost
				processSubmittedSignals(10);

				// Send 100 signals and drop 1
				sendSignals(100);
				dropSignals(1);

				// Here we should detect that 100 more signals have been sent and 1 signal was lost
				processSubmittedSignals(99);

				// Check SignalLatency logs amount of sent and lost signals
				logger.assertMatch(
					[
						{
							eventName: "ContainerRuntime:SignalLatency",
							signalsSent: 101,
							signalsLost: 20,
							outOfOrderSignals: 0,
						},
						{
							eventName: "ContainerRuntime:SignalLatency",
							signalsSent: 100,
							signalsLost: 1,
							outOfOrderSignals: 0,
						},
					],
					"SignalLatency telemetry should log absolute lost signal count for each batch of 100 signals",
				);
			});

			it("accurately reports amount of sent and lost signals when roundtrip tracked signal is dropped", () => {
				// Send 50 signals and drop 10
				sendSignals(50);
				dropSignals(10);
				processSubmittedSignals(40);

				// Send 60 signals and drop 15 (including roundtrip tracked signal)
				sendSignals(60);
				processSubmittedSignals(40);
				dropSignals(15); // Drop roundtrip tracked signal

				// Since roundtrip signal is lost, we don't expect to see SignalLatency telemetry for the first 100 signals
				processSubmittedSignals(5);

				// Send 100 signals and drop 1
				sendSignals(100);
				dropSignals(1);

				// Here we should detect that 200 signals have been sent and 26 signals were lost
				processSubmittedSignals(99);

				// Check SignalLatency logs amount of sent and lost signals
				logger.assertMatch(
					[
						{
							eventName: "ContainerRuntime:SignalLatency",
							signalsSent: 201,
							signalsLost: 26,
							outOfOrderSignals: 0,
						},
					],
					"SignalLatency telemetry should log absolute lost signal count for each batch of 100 signals",
				);
			});

			it("accurately reports amount of sent and lost signals when rapid fire more than 100+ signals", () => {
				sendSignals(1);
				processSubmittedSignals(1);
				sendSignals(101);
				dropSignals(10);
				processSubmittedSignals(91);

				logger.assertMatch(
					[
						{
							eventName: "ContainerRuntime:SignalLatency",
							signalsSent: 100,
							signalsLost: 10,
							outOfOrderSignals: 0,
						},
					],
					"SignalLatency telemetry should log correct amount of sent and lost signals",
				);
			});

			it("should log out of order signal in between signal latency events", () => {
				// Send 1st signal and process it to prime the system
				sendSignals(1);
				processSubmittedSignals(1);

				// Send 150 signals and temporarily lose 1
				sendSignals(150); //           150 outstanding including 1 tracked signal (#101); max #151
				processSubmittedSignals(95); // 55 outstanding including 1 tracked signal (#101)
				dropSignals(1); //              54 outstanding including 1 tracked signal (#101)
				processSubmittedSignals(14); // 40 outstanding; none tracked
				processDroppedSignals(1); //    40 outstanding; none tracked *out of order signal*
				processSubmittedSignals(40); //  0 outstanding; none tracked

				// Send 60 signals including tracked signal
				sendSignals(60); //             60 outstanding including 1 tracked signal (#201); max #211
				processSubmittedSignals(60); //  0 outstanding; none tracked

				// Check SignalLatency logs amount of sent and lost signals
				logger.assertMatch(
					[
						{
							eventName: "ContainerRuntime:SignalLatency",
							signalsSent: 100,
							signalsLost: 1,
							outOfOrderSignals: 0,
						},
						{
							eventName: "ContainerRuntime:SignalOutOfOrder",
						},
						{
							eventName: "ContainerRuntime:SignalLatency",
							signalsSent: 100,
							signalsLost: 0,
							outOfOrderSignals: 1,
						},
					],
					"SignalLatency telemetry should log absolute lost signal count for each batch of 100 signals and SignalOutOfOrder event",
				);
			});
			describe("multi-client", () => {
				let remoteContainerRuntime: ContainerRuntime;
				let remoteLogger: MockLogger;

				function sendRemoteSignals(count: number) {
					for (let i = 0; i < count; i++) {
						remoteContainerRuntime.submitSignal(
							"TestSignalType",
							`TestSignalContent ${i + 1}`,
						);
					}
				}

				beforeEach(async () => {
					remoteLogger = new MockLogger();
					remoteContainerRuntime = await ContainerRuntime.loadRuntime({
						context: getMockContext(
							{ logger: remoteLogger },
							"remoteMockClientId",
						) as IContainerContext,
						registryEntries: [],
						existing: false,
						requestHandler: undefined,
						runtimeOptions: {
							enableGroupedBatching: false,
							flushMode: FlushMode.TurnBased,
						},
						provideEntryPoint: mockProvideEntryPoint,
					});
					// Assert that clientId is not undefined
					assert(
						remoteContainerRuntime.clientId !== undefined,
						"clientId should not be undefined",
					);

					runtimes.set(remoteContainerRuntime.clientId, remoteContainerRuntime);
				});

				it("ignores remote targeted signal in signalLatency telemetry", () => {
					// Send 1st signal and process it to prime the system
					sendSignals(1);
					processSubmittedSignals(1);

					// Send 101 signals (one targeted)
					sendSignals(50); //             50 outstanding; none tracked;
					containerRuntime.submitSignal(
						"TargetedSignalType",
						"TargetedSignalContent",
						remoteContainerRuntime.clientId,
					); //                           51 outstanding; none tracked; one remote targeted

					sendSignals(49); //            100 outstanding including 1 tracked signals (#101); one targeted
					processSubmittedSignals(100); // 0 outstanding; none tracked

					// Check that remote targeted signal is ignored
					logger.assertMatchNone(
						[
							{
								eventName: "ContainerRuntime:SignalLatency",
								signalsSent: 100,
								signalsLost: 0,
								outOfOrderSignals: 0,
							},
						],
						"SignalLatency telemetry should log correct amount of sent and lost signals",
					);
					sendSignals(1); //               1 outstanding including 1 tracked signals (#101); one targeted
					processSubmittedSignals(1); //   0 outstanding; none tracked

					// Check for logged SignalLatency event
					logger.assertMatch(
						[
							{
								eventName: "ContainerRuntime:SignalLatency",
								signalsSent: 100,
								signalsLost: 0,
								outOfOrderSignals: 0,
							},
						],
						"SignalLatency telemetry should log correct amount of sent and lost signals",
					);

					// Repeat the same for remote runtime which recevied targeted signal
					sendRemoteSignals(1);
					processSubmittedSignals(1);

					sendRemoteSignals(99);
					processSubmittedSignals(99);

					remoteLogger.assertMatchNone(
						[
							{
								eventName: "ContainerRuntime:SignalLatency",
								signalsSent: 100,
								signalsLost: 0,
								outOfOrderSignals: 0,
							},
						],
						"SignalLatency telemetry should log correct amount of sent and lost signals",
					);

					sendRemoteSignals(1);
					processSubmittedSignals(1);

					// Check for logged SignalLatency event
					remoteLogger.assertMatch(
						[
							{
								eventName: "ContainerRuntime:SignalLatency",
								signalsSent: 100,
								signalsLost: 0,
								outOfOrderSignals: 0,
							},
						],
						"SignalLatency telemetry should log correct amount of sent and lost signals",
					);
				});
				it("can detect dropped signal while ignoring non-self targeted signal in signalLatency telemetry", () => {
					// Send 1st signal and process it to prime the system
					sendSignals(1);
					processSubmittedSignals(1);

					// Send 100 signals (one targeted) and drop 10
					sendSignals(40); //              40 outstanding; none tracked;
					containerRuntime.submitSignal(
						"TargetedSignalType",
						"TargetedSignalContent",
						remoteContainerRuntime.clientId,
					); //                            41 outstanding; none tracked; one remote targeted
					sendSignals(40); //              81 outstanding; none tracked; one remote targeted
					dropSignals(10); //              71 outstanding; none tracked; one remote targeted
					sendSignals(20); //              91 outstanding; none tracked; one remote targeted

					// Process all signals (5 out of order)
					processSubmittedSignals(85); //   6 outstanding; none tracked;
					processDroppedSignals(5); //      6 outstanding; none tracked; *out of order signals*
					processSubmittedSignals(6); //    0 outstanding; none tracked;

					// Check for logged SignalLatency event
					logger.assertMatch(
						[
							{
								eventName: "ContainerRuntime:SignalLatency",
								signalsSent: 100,
								signalsLost: 10,
								outOfOrderSignals: 5,
							},
						],
						"SignalLatency telemetry should log correct amount of sent and lost signals",
					);
				});

				it("ignores unexpected targeted signal for a remote client", () => {
					// Send 1st signal and process it to prime the system
					sendSignals(1);
					processSubmittedSignals(1);

					// Send 101 signals (one targeted)
					sendSignals(50); //                50 outstanding; none tracked;
					containerRuntime.submitSignal(
						"TargetedSignalType",
						"TargetedSignalContent",
						remoteContainerRuntime.clientId,
					); //                              51 outstanding; none tracked; one remote targeted
					sendSignals(49); //               100 outstanding; none tracked; one remote targeted
					processWithNoTargetSupport(100); // 0 outstanding; none tracked

					// Check that 'targeted signal' is ignored
					logger.assertMatchNone(
						[
							{
								eventName: "ContainerRuntime:SignalLatency",
								signalsSent: 100,
								signalsLost: 0,
								outOfOrderSignals: 0,
							},
						],
						"SignalLatency telemetry should log correct amount of sent and lost signals",
					);

					sendSignals(1); //             	     1 outstanding including 1 tracked signals (#101); one targeted

					processWithNoTargetSupport(1); //    0 outstanding; none tracked

					// Check for logged SignalLatency event
					logger.assertMatch(
						[
							{
								eventName: "ContainerRuntime:SignalLatency",
								signalsSent: 100,
								signalsLost: 0,
								outOfOrderSignals: 0,
							},
						],
						"SignalLatency telemetry should log correct amount of sent and lost signals",
					);
				});
			});
		});
	});
});
