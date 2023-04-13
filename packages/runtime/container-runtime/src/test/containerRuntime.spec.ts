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
import { ISequencedDocumentMessage, MessageType } from "@fluidframework/protocol-definitions";
import {
	FlushMode,
	FlushModeExperimental,
	NamedFluidDataStoreRegistryEntries,
} from "@fluidframework/runtime-definitions";
import {
	ConfigTypes,
	IConfigProviderBase,
	mixinMonitoringContext,
	MockLogger,
} from "@fluidframework/telemetry-utils";
import { MockDeltaManager, MockQuorumClients } from "@fluidframework/test-runtime-utils";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { IRequest, IResponse, FluidObject } from "@fluidframework/core-interfaces";
import {
	CompressionAlgorithms,
	ContainerMessageType,
	ContainerRuntime,
	IContainerRuntimeOptions,
} from "../containerRuntime";
import { IPendingMessage, PendingStateManager } from "../pendingStateManager";
import { DataStores } from "../dataStores";

describe("Runtime", () => {
	const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
		getRawConfig: (name: string): ConfigTypes => settings[name],
	});

	const getMockContext = (
		settings: Record<string, ConfigTypes> = {},
		logger: ITelemetryLogger = new MockLogger(),
	): Partial<IContainerContext> => ({
		attachState: AttachState.Attached,
		deltaManager: new MockDeltaManager(),
		quorum: new MockQuorumClients(),
		taggedLogger: mixinMonitoringContext(
			logger,
			configProvider(settings),
		) as unknown as MockLogger,
		clientDetails: { capabilities: { interactive: true } },
		closeFn: (_error?: ICriticalContainerError): void => {},
		updateDirtyContainerState: (_dirty: boolean) => {},
	});

	describe("Container Runtime", () => {
		describe("flushMode setting", () => {
			let containerRuntime: ContainerRuntime;

			it("Default flush mode", async () => {
				containerRuntime = await ContainerRuntime.loadRuntime({
					context: getMockContext() as IContainerContext,
					registryEntries: [],
					existing: false,
					runtimeOptions: {},
				});

				assert.strictEqual(containerRuntime.flushMode, FlushMode.TurnBased);
			});

			it("Override default flush mode using options", async () => {
				containerRuntime = await ContainerRuntime.loadRuntime({
					context: getMockContext() as IContainerContext,
					registryEntries: [],
					existing: false,
					runtimeOptions: {
						flushMode: FlushMode.Immediate,
					},
				});

				assert.strictEqual(containerRuntime.flushMode, FlushMode.Immediate);
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
					let opFakeSequenceNumber = 1;
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
						});
						containerErrors.length = 0;
						submittedOpsMetdata.length = 0;
						opFakeSequenceNumber = 1;
					});

					it("Can't call flush() inside orderSequentially's callback", () => {
						assert.throws(() =>
							containerRuntime.orderSequentially(() => {
								(containerRuntime as any).flush();
							}),
						);

						const error = getFirstContainerError();
						assert.ok(error instanceof GenericError);
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
						assert.throws(() =>
							containerRuntime.orderSequentially(() => {
								throw new Error("Any");
							}),
						);

						const error = getFirstContainerError();
						assert.ok(error instanceof GenericError);
						assert.strictEqual(error.message, expectedOrderSequentiallyErrorMessage);
						assert.strictEqual(error.error.message, "Any");
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
				});
			}));

		describe("Op reentry enforcement", () => {
			let containerRuntime: ContainerRuntime;

			it("By default, don't enforce the op reentry check", async () => {
				containerRuntime = await ContainerRuntime.load(
					getMockContext() as IContainerContext,
					[],
					undefined, // requestHandler
					{}, // runtimeOptions
				);

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
				containerRuntime = await ContainerRuntime.load(
					getMockContext() as IContainerContext,
					[],
					undefined, // requestHandler
					{
						enableOpReentryCheck: true,
					}, // runtimeOptions
				);

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
				containerRuntime = await ContainerRuntime.load(
					getMockContext({
						"Fluid.ContainerRuntime.DisableOpReentryCheck": true,
					}) as IContainerContext,
					[],
					undefined, // requestHandler
					{
						enableOpReentryCheck: true,
					}, // runtimeOptions
				);

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
				containerRuntime = await ContainerRuntime.load(
					getMockContext({}, mockLogger) as IContainerContext,
					[],
					undefined, // requestHandler
					{}, // runtimeOptions
				);

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
								messageType: ContainerMessageType.BlobAttach,
								content: {},
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
				pendingStateManager.onSubmitMessage(
					ContainerMessageType.FluidDataStoreOp,
					0,
					"",
					"",
					undefined,
				);

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
					assert.ok(error instanceof DataProcessingError);
					assert.strictEqual(
						error.message,
						"Runtime detected too many reconnects with no progress syncing local ops.",
					);
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
					"processing remote op, should generate telemetry event and throw an error that closes the container",
				async () => {
					const pendingStateManager = getMockPendingStateManager();
					patchRuntime(pendingStateManager);

					for (let i = 0; i < maxReconnects; i++) {
						addPendingMessage(pendingStateManager);
						toggleConnection(containerRuntime);
						containerRuntime.process(
							{
								type: "op",
								clientId: "clientId",
								sequenceNumber: 0,
								contents: {
									address: "address",
								},
							} as any as ISequencedDocumentMessage,
							false /* local */,
						);
					}

					// NOTE: any errors returned by getFirstContainerError() are from a variable set in a mock closeFn function passed
					// around during test setup, which executes when the container runtime causes the context (container) to close.
					const error = getFirstContainerError();
					assert.ok(error instanceof DataProcessingError);
					assert.strictEqual(
						error.message,
						"Runtime detected too many reconnects with no progress syncing local ops.",
					);
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

		describe("User input validations", () => {
			let containerRuntime: ContainerRuntime;

			before(async () => {
				containerRuntime = await ContainerRuntime.loadRuntime({
					context: getMockContext() as IContainerContext,
					registryEntries: [],
					existing: false,
					requestHandler: undefined,
					runtimeOptions: {},
				});
			});

			it("cannot create detached root data store with slashes in id", async () => {
				const invalidId = "beforeSlash/afterSlash";
				const codeBlock = () => {
					containerRuntime.createDetachedRootDataStore([""], invalidId);
				};
				assert.throws(
					codeBlock,
					(e) =>
						e.errorType === ContainerErrorType.usageError &&
						e.message === `Id cannot contain slashes: '${invalidId}'`,
				);
			});
		});

		describe("Supports mixin classes", () => {
			it("old load method works", async () => {
				const makeMixin = <T>(
					Base: typeof ContainerRuntime,
					methodName: string,
					methodReturn: T,
				) =>
					class MixinContainerRuntime extends Base {
						public static async load(
							context: IContainerContext,
							registryEntries: NamedFluidDataStoreRegistryEntries,
							requestHandler?:
								| ((
										request: IRequest,
										runtime: IContainerRuntime,
								  ) => Promise<IResponse>)
								| undefined,
							runtimeOptions?: IContainerRuntimeOptions,
							containerScope?: FluidObject,
							existing?: boolean | undefined,
							containerRuntimeCtor: typeof ContainerRuntime = MixinContainerRuntime,
						): Promise<ContainerRuntime> {
							return Base.load(
								context,
								registryEntries,
								requestHandler,
								runtimeOptions,
								containerScope,
								existing,
								containerRuntimeCtor,
							);
						}

						public [methodName](): T {
							return methodReturn;
						}
					} as typeof ContainerRuntime;

				const runtime = await makeMixin(
					makeMixin(ContainerRuntime, "method1", "mixed in return"),
					"method2",
					42,
				).load(
					getMockContext() as IContainerContext,
					[],
					undefined, // requestHandler
					{}, // runtimeOptions
				);

				assert.equal(
					(runtime as unknown as { method1: () => any }).method1(),
					"mixed in return",
				);
				assert.equal((runtime as unknown as { method2: () => any }).method2(), 42);
			});

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
							initializeEntryPoint: (
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
					initializeEntryPoint: async (containerRuntime) => myEntryPoint,
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
			it("when using old load method", async () => {
				const myResponse: IResponse = {
					mimeType: "myMimeType",
					value: "hello!",
					status: 200,
				};
				const containerRuntime = await ContainerRuntime.load(
					getMockContext() as IContainerContext,
					[], // registryEntries
					async (req, ctrRuntime) => myResponse,
					{}, // runtimeOptions
					undefined, // containerScope
					false, // existing
					undefined, // containerRuntimeCtor
				);
				const request: IRequest = { url: "myUrl" };

				// Calling request on the runtime should use the request handler we passed in the runtime's constructor.
				const responseFromRequestMethod = await containerRuntime.request(request);
				assert.deepEqual(
					responseFromRequestMethod,
					myResponse,
					"request method in runtime did not return the expected object",
				);

				// The entryPoint should be undefined because the deprecated load() method was used
				assert(containerRuntime.getEntryPoint !== undefined); // The function should exist, though
				const actualEntryPoint = await containerRuntime.getEntryPoint?.();
				assert.strictEqual(
					actualEntryPoint,
					undefined,
					"entryPoint was not undefined as expected",
				);
			});

			it("when using new loadRuntime method", async () => {
				const myEntryPoint: FluidObject = {
					myProp: "myValue",
				};
				const containerRuntime = await ContainerRuntime.loadRuntime({
					context: getMockContext() as IContainerContext,
					initializeEntryPoint: async (ctrRuntime) => myEntryPoint,
					existing: false,
					registryEntries: [],
				});

				// The entryPoint should come from the provided initialization function.
				const actualEntryPoint = await containerRuntime.getEntryPoint?.();
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
					(state?.pendingStates[0] as IPendingMessage).content.contents,
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
				});

				mockLogger.assertMatchAny([
					{
						eventName: "ContainerLoadStats",
						category: "generic",
						options: JSON.stringify(mergedRuntimeOptions),
						featureGates: JSON.stringify({}),
					},
				]);
			});

			it("Container load stats with feature gate overrides", async () => {
				const featureGates = {
					"Fluid.ContainerRuntime.CompressionDisabled": true,
					"Fluid.ContainerRuntime.CompressionChunkingDisabled": true,
					"Fluid.ContainerRuntime.DisableOpReentryCheck": false,
				};
				await ContainerRuntime.loadRuntime({
					context: localGetMockContext(featureGates) as IContainerContext,
					registryEntries: [],
					existing: false,
					runtimeOptions,
				});

				mockLogger.assertMatchAny([
					{
						eventName: "ContainerLoadStats",
						category: "generic",
						options: JSON.stringify(mergedRuntimeOptions),
						featureGates: JSON.stringify({
							disableCompression: true,
							disableOpReentryCheck: false,
							disableChunking: true,
						}),
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
	});
});
