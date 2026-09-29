/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * Unit and integration coverage for the point-in-time load entry point.
 *
 * Input-validation tests use tripwire dependencies to prove malformed targets fail before loading
 * begins. Cancellation and telemetry coverage use a locally generated Fluid snapshot to exercise
 * successful loading, snapshot-boundary validation, and failure reporting without service
 * credentials.
 */

import { strict as assert } from "node:assert";

import { bufferToString, stringToBuffer } from "@fluid-internal/client-utils";
import type {
	ICodeDetailsLoader,
	ICriticalContainerError,
} from "@fluidframework/container-definitions/internal";
import {
	FluidErrorTypes,
	LogLevel,
	type IErrorBase,
} from "@fluidframework/core-interfaces/internal";
import type {
	IDocumentService,
	IDocumentServiceFactory,
	IResolvedUrl,
	ISnapshot,
	IUrlResolver,
} from "@fluidframework/driver-definitions/internal";
import {
	createGenericNetworkError,
	NonRetryableError,
} from "@fluidframework/driver-utils/internal";
import {
	GenericError,
	isFluidError,
	MockLogger,
} from "@fluidframework/telemetry-utils/internal";
import { createSandbox, type SinonSpy } from "sinon";
import { v4 as uuid } from "uuid";

import { Container } from "../container.js";
import { loadContainerToSequenceNumber } from "../loadContainerToSequenceNumber.js";
import { Loader } from "../loader.js";
import { getDetachedContainerStateFromSerializedContainer } from "../utils.js";

import { failProxy } from "./failProxy.js";
import {
	createTestCodeLoaderProxy,
	createTestDocumentServiceFactoryProxy,
} from "./testProxies.js";

/** A resolver that fails the test if the load gets far enough to resolve the request. */
const tripwireUrlResolver = {
	resolve: async () => assert.fail("urlResolver must not be used for a malformed target"),
	getAbsoluteUrl: async () =>
		assert.fail("urlResolver must not be used for a malformed target"),
} as unknown as IUrlResolver;

/**
 * A factory that fails the test if it is inspected. Note it is deliberately *not* point-in-time
 * capable: reaching it would raise a different `UsageError`, so the assertions below also prove the
 * target check runs before the capability check.
 */
const tripwireDocumentServiceFactory = {
	createDocumentService: async () =>
		assert.fail("documentServiceFactory must not be used for a malformed target"),
	createContainer: async () =>
		assert.fail("documentServiceFactory must not be used for a malformed target"),
} as unknown as IDocumentServiceFactory;

const tripwireCodeLoader = {
	load: async () => assert.fail("codeLoader must not be used for a malformed target"),
} as unknown as ICodeDetailsLoader;

const resolvedUrl: IResolvedUrl = {
	id: "version-mark-test",
	endpoints: {},
	tokens: {},
	type: "fluid",
	url: `https://localhost/tenant/${uuid()}`,
};

const urlResolver: IUrlResolver = {
	resolve: async () => resolvedUrl,
	getAbsoluteUrl: async () => resolvedUrl.url,
};

function makeCapableFactory(
	createPointInTimeDocumentService: () => Promise<IDocumentService>,
): IDocumentServiceFactory {
	return {
		createDocumentService: async () => assert.fail("the adapter should use the capability"),
		createContainer: async () =>
			assert.fail("point-in-time loading cannot create a container"),
		createPointInTimeDocumentService,
	} as unknown as IDocumentServiceFactory;
}

async function createSnapshot(sequenceNumber: number): Promise<ISnapshot> {
	const loader = new Loader({
		codeLoader: createTestCodeLoaderProxy(),
		documentServiceFactory: createTestDocumentServiceFactoryProxy(resolvedUrl),
		urlResolver: failProxy(),
	});
	const detached = await loader.createDetachedContainer({ package: "none" });
	const state = getDetachedContainerStateFromSerializedContainer(detached.serialize());
	detached.dispose();
	assert(state.baseSnapshot !== undefined, "detached state should contain a base snapshot");
	const snapshotTree = { ...state.baseSnapshot, id: "version-mark-snapshot" };
	const protocolAttributesBlobId = snapshotTree.trees[".protocol"]?.blobs.attributes;
	assert(
		protocolAttributesBlobId !== undefined,
		"detached snapshot should contain protocol attributes",
	);
	const blobContents = new Map(
		Object.entries(state.snapshotBlobs).map(([id, content]) => [
			id,
			stringToBuffer(content, "utf8"),
		]),
	);
	const protocolAttributes = JSON.parse(
		bufferToString(blobContents.get(protocolAttributesBlobId) ?? new ArrayBuffer(0), "utf8"),
	) as { sequenceNumber: number; minimumSequenceNumber: number };
	blobContents.set(
		protocolAttributesBlobId,
		stringToBuffer(
			JSON.stringify({
				...protocolAttributes,
				sequenceNumber,
				minimumSequenceNumber: Math.min(
					protocolAttributes.minimumSequenceNumber,
					sequenceNumber,
				),
			}),
			"utf8",
		),
	);
	return {
		snapshotTree,
		blobContents,
		ops: [],
		sequenceNumber,
		latestSequenceNumber: sequenceNumber,
		snapshotFormatV: 1,
	};
}

function makeSnapshotService(snapshot: ISnapshot): IDocumentService {
	const storage = {
		getSnapshot: async () => snapshot,
		getVersions: async () => [
			{ id: snapshot.snapshotTree.id, treeId: snapshot.snapshotTree.id },
		],
		getSnapshotTree: async () => snapshot.snapshotTree,
		readBlob: async (id: string) => {
			const blob = snapshot.blobContents.get(id);
			assert(blob !== undefined, `snapshot blob ${id} should exist`);
			return blob;
		},
	};
	return {
		policies: { storageOnly: true, supportGetSnapshotApi: true },
		resolvedUrl,
		connectToStorage: async () => storage,
		dispose: () => {},
		on() {
			return this;
		},
		off() {
			return this;
		},
	} as unknown as IDocumentService;
}

describe("loadContainerToSequenceNumber", () => {
	describe("target sequence number validation", () => {
		const loadTo = async (
			loadToSequenceNumber: number,
			logger?: MockLogger,
		): Promise<unknown> =>
			loadContainerToSequenceNumber({
				codeLoader: tripwireCodeLoader,
				urlResolver: tripwireUrlResolver,
				documentServiceFactory: tripwireDocumentServiceFactory,
				request: { url: "https://example.com/point-in-time-validation" },
				loadToSequenceNumber,
				...(logger === undefined ? {} : { logger }),
			});

		const malformedTargets: [name: string, target: number][] = [
			["negative", -1],
			["negative non-integer", -1.5],
			["non-integer", 1.5],
			["NaN", Number.NaN],
			["Infinity", Number.POSITIVE_INFINITY],
			["-Infinity", Number.NEGATIVE_INFINITY],
		];

		for (const [name, target] of malformedTargets) {
			it(`rejects a ${name} target with a UsageError`, async () => {
				await assert.rejects(
					loadTo(target),
					(error: IErrorBase) =>
						error.errorType === FluidErrorTypes.usageError &&
						/non-negative integer/i.test(error.message),
					`a ${name} target (${target}) should be rejected up front`,
				);
			});
		}

		it("accepts a well-formed target (fails later, on the capability check)", async () => {
			const logger = new MockLogger(LogLevel.essential);
			// 0 is the boundary value: valid, so validation must fall through to the point-in-time
			// capability check. This pins the boundary and proves the guard rejects only malformed
			// targets rather than everything.
			await assert.rejects(
				loadTo(0, logger),
				(error: IErrorBase) =>
					error.errorType === FluidErrorTypes.usageError &&
					/does not support point-in-time loading/i.test(error.message),
				"a valid target should pass validation and reach the capability check",
			);
			assert.deepEqual(
				logger.events,
				[],
				"capability misuse is not a materialization attempt",
			);
		});
	});

	describe("telemetry", () => {
		const loadWithFactoryFailure = async (
			error: Error & IErrorBase,
			logger: MockLogger,
			loadToSequenceNumber = 42,
			signal?: AbortSignal,
		): Promise<unknown> =>
			loadContainerToSequenceNumber({
				codeLoader: tripwireCodeLoader,
				urlResolver,
				documentServiceFactory: makeCapableFactory(async () => {
					throw error;
				}),
				request: { url: resolvedUrl.url },
				loadToSequenceNumber,
				logger,
				...(signal === undefined ? {} : { signal }),
			});

		it("reports a successful sequence-zero load through an essential-only logger", async () => {
			const service = makeSnapshotService(await createSnapshot(0));
			const logger = new MockLogger(LogLevel.essential);

			const container = await loadContainerToSequenceNumber({
				codeLoader: createTestCodeLoaderProxy({
					runtimeWithout_setConnectionStatus: true,
				}),
				urlResolver,
				documentServiceFactory: makeCapableFactory(async () => service),
				request: { url: resolvedUrl.url },
				loadToSequenceNumber: 0,
				logger,
			});
			assert.equal(container.closed, false);
			logger.assertMatchNone([{ category: "error" }], undefined, false, false);

			const terminalEvent = logger.events.find(
				(event) => event.eventName === "fluid:telemetry:VersionMarkPointInTimeLoad",
			);
			assert(Number.isInteger(terminalEvent?.duration));
			logger.assertMatch([
				{
					eventName: "fluid:telemetry:VersionMarkPointInTimeLoad",
					category: "performance",
					outcome: "succeeded",
					replayedOpCount: 0,
				},
			]);
			container.dispose();
		});

		it("classifies a snapshot newer than the target", async () => {
			const logger = new MockLogger(LogLevel.essential);

			await assert.rejects(
				loadContainerToSequenceNumber({
					codeLoader: createTestCodeLoaderProxy({
						runtimeWithout_setConnectionStatus: true,
					}),
					urlResolver,
					documentServiceFactory: makeCapableFactory(async () =>
						makeSnapshotService(await createSnapshot(50)),
					),
					request: { url: resolvedUrl.url },
					loadToSequenceNumber: 42,
					logger,
				}),
				/Most recent snapshot is newer/,
			);

			logger.assertMatch([
				{
					eventName: "fluid:telemetry:VersionMarkPointInTimeLoad",
					category: "error",
					outcome: "failed",
					targetSequenceNumber: 42,
					availabilityOutcome: "targetOlderThanSnapshot",
					baseSnapshotSequenceNumber: 50,
					errorType: FluidErrorTypes.genericError,
					error: "VersionMarkPointInTimeLoad",
					stack: undefined,
				},
			]);
		});

		async function assertMissingOpsTerminalEvent(
			error: Error & IErrorBase,
			expectedErrorType: string,
			assertErrorPropertiesExcluded = false,
		): Promise<void> {
			const logger = new MockLogger(LogLevel.essential);

			await assert.rejects(
				loadWithFactoryFailure(error, logger),
				(candidate: IErrorBase) => candidate === error,
			);

			logger.assertMatch([
				{
					eventName: "fluid:telemetry:VersionMarkPointInTimeLoad",
					category: "error",
					outcome: "failed",
					targetSequenceNumber: 42,
					availabilityOutcome: "missingOps",
					baseSnapshotSequenceNumber: undefined,
					errorType: expectedErrorType,
					...(assertErrorPropertiesExcluded
						? {
								error: "VersionMarkPointInTimeLoad",
								stack: undefined,
								driverVersion: undefined,
								versionLabel: undefined,
							}
						: {}),
				},
			]);
		}

		it("propagates missingOps for cannotCatchUp without copying error payloads", async () => {
			await assertMissingOpsTerminalEvent(
				new NonRetryableError("missing ops", "cannotCatchUp", {
					driverVersion: "test-driver",
					versionLabel: "high-cardinality-version-label",
					versionMarkAvailabilityOutcome: "missingOps",
				}),
				"cannotCatchUp",
				true,
			);
		});

		it("propagates missingOps for the bounded-replay genericNetworkError", async () => {
			await assertMissingOpsTerminalEvent(
				createGenericNetworkError(
					"Failed to retrieve ops from storage (Too Many Retries)",
					{ canRetry: false },
					{
						driverVersion: "test-driver",
						versionLabel: "high-cardinality-version-label",
						versionMarkAvailabilityOutcome: "missingOps",
					},
				),
				"genericNetworkError",
			);
		});

		it("does not classify an ordinary network failure as missing ops", async () => {
			const logger = new MockLogger(LogLevel.essential);
			const error = createGenericNetworkError(
				"Failed to contact the storage service",
				{ canRetry: false },
				{ driverVersion: "test-driver" },
			);

			await assert.rejects(
				loadWithFactoryFailure(error, logger),
				(candidate: IErrorBase) => candidate === error,
			);

			logger.assertMatch([
				{
					eventName: "fluid:telemetry:VersionMarkPointInTimeLoad",
					category: "error",
					outcome: "failed",
					targetSequenceNumber: 42,
					availabilityOutcome: undefined,
					baseSnapshotSequenceNumber: undefined,
					errorType: "genericNetworkError",
				},
			]);
		});

		it("propagates a known base snapshot on a missing-ops replay failure", async () => {
			const logger = new MockLogger(LogLevel.essential);
			const error = new NonRetryableError("missing ops", "cannotCatchUp", {
				driverVersion: "test-driver",
				versionMarkAvailabilityOutcome: "missingOps",
				versionMarkBaseSnapshotSequenceNumber: 10,
			});

			await assert.rejects(
				loadWithFactoryFailure(error, logger, 12),
				(candidate: IErrorBase) => candidate.errorType === "cannotCatchUp",
			);

			logger.assertMatch([
				{
					eventName: "fluid:telemetry:VersionMarkPointInTimeLoad",
					category: "error",
					outcome: "failed",
					targetSequenceNumber: 12,
					availabilityOutcome: "missingOps",
					baseSnapshotSequenceNumber: 10,
					errorType: "cannotCatchUp",
				},
			]);
		});

		it("does not classify an unrelated failure as cancellation when the signal is aborted", async () => {
			const logger = new MockLogger(LogLevel.essential);
			const abortController = new AbortController();
			abortController.abort();
			const error = new GenericError("factory failed");

			await assert.rejects(
				loadWithFactoryFailure(error, logger, 42, abortController.signal),
				(candidate: IErrorBase) => candidate === error,
			);

			logger.assertMatch([
				{
					eventName: "fluid:telemetry:VersionMarkPointInTimeLoad",
					category: "error",
					outcome: "failed",
					targetSequenceNumber: 42,
					availabilityOutcome: undefined,
					errorType: FluidErrorTypes.genericError,
					error: "VersionMarkPointInTimeLoad",
					stack: undefined,
				},
			]);
		});
	});

	it("rejects when the loaded container closes before completion", async () => {
		const service = makeSnapshotService(await createSnapshot(0));
		const expectedError = new GenericError(
			"simulated close during forceReadonly",
		) as ICriticalContainerError;
		const sandbox = createSandbox();
		const loadContainer = Container.load.bind(Container);
		let closeSpy: SinonSpy | undefined;
		let disposeSpy: SinonSpy | undefined;
		sandbox.stub(Container, "load").callsFake(async (loadProps, createProps) => {
			const container = await loadContainer(loadProps, createProps);
			closeSpy = sandbox.spy(container, "close");
			disposeSpy = sandbox.spy(container, "dispose");
			sandbox.stub(container, "forceReadonly").callsFake(() => {
				container.close(expectedError);
			});
			return container;
		});

		try {
			await assert.rejects(
				loadContainerToSequenceNumber({
					codeLoader: createTestCodeLoaderProxy({
						runtimeWithout_setConnectionStatus: true,
					}),
					urlResolver,
					documentServiceFactory: makeCapableFactory(async () => service),
					request: { url: resolvedUrl.url },
					loadToSequenceNumber: 0,
				}),
				(error: unknown) => error === expectedError,
			);
			assert.equal(closeSpy?.calledOnceWithExactly(expectedError), true);
			assert.equal(disposeSpy?.calledOnceWithExactly(expectedError), true);
		} finally {
			sandbox.restore();
		}
	});

	it("rejects when the loaded container is disposed before completion", async () => {
		const service = makeSnapshotService(await createSnapshot(0));
		const expectedError = new GenericError(
			"simulated disposal during forceReadonly",
		) as ICriticalContainerError;
		const sandbox = createSandbox();
		const loadContainer = Container.load.bind(Container);
		sandbox.stub(Container, "load").callsFake(async (loadProps, createProps) => {
			const container = await loadContainer(loadProps, createProps);
			sandbox.stub(container, "forceReadonly").callsFake(() => {
				container.dispose(expectedError);
			});
			return container;
		});

		try {
			await assert.rejects(
				loadContainerToSequenceNumber({
					codeLoader: createTestCodeLoaderProxy({
						runtimeWithout_setConnectionStatus: true,
					}),
					urlResolver,
					documentServiceFactory: makeCapableFactory(async () => service),
					request: { url: resolvedUrl.url },
					loadToSequenceNumber: 0,
				}),
				(error: unknown) => error === expectedError,
			);
		} finally {
			sandbox.restore();
		}
	});

	it("preserves the close error when the container closes during replay", async () => {
		const service = makeSnapshotService(await createSnapshot(0));
		const expectedError = new GenericError(
			"simulated close during replay",
		) as ICriticalContainerError;
		const sandbox = createSandbox();
		const loadContainer = Container.load.bind(Container);
		let assertContainerInteractions: (() => void) | undefined;
		sandbox.stub(Container, "load").callsFake(async (loadProps, createProps) => {
			const container = await loadContainer(loadProps, createProps);
			const disposeSpy = sandbox.spy(container, "dispose");
			const onSpy = sandbox.spy(container, "on");
			const offSpy = sandbox.spy(container, "off");
			const connectStub = sandbox.stub(container, "connect").callsFake(() => {
				container.close(expectedError);
			});
			assertContainerInteractions = (): void => {
				assert.equal(connectStub.callCount, 1, "the replay should attempt to connect once");
				assert(disposeSpy.calledOnceWithExactly(expectedError));
				assert.equal(
					onSpy.getCalls().filter((call) => call.args[0] === "op").length,
					1,
					"the replay op listener should be registered once",
				);
				assert.equal(
					offSpy.getCalls().filter((call) => call.args[0] === "op").length,
					1,
					"the replay op listener should be removed once",
				);
				const registeredClosedListeners = onSpy
					.getCalls()
					.filter((call) => call.args[0] === "closed")
					.map((call) => call.args[1]);
				const removedClosedListeners = offSpy
					.getCalls()
					.filter((call) => call.args[0] === "closed")
					.map((call) => call.args[1]);
				assert.deepEqual(
					removedClosedListeners,
					registeredClosedListeners,
					"all closed listeners should be removed after replay fails",
				);
			};
			return container;
		});

		try {
			await assert.rejects(
				loadContainerToSequenceNumber({
					codeLoader: createTestCodeLoaderProxy({
						runtimeWithout_setConnectionStatus: true,
					}),
					urlResolver,
					documentServiceFactory: makeCapableFactory(async () => service),
					request: { url: resolvedUrl.url },
					loadToSequenceNumber: 1,
				}),
				(error: unknown) => error === expectedError,
			);

			assert(
				assertContainerInteractions !== undefined,
				"the point-in-time container should be instrumented",
			);
			assertContainerInteractions();
		} finally {
			sandbox.restore();
		}
	});

	it("rejects when the container closes after replay resolves", async () => {
		const service = makeSnapshotService(await createSnapshot(0));
		const expectedError = new GenericError(
			"simulated close after replay resolution",
		) as ICriticalContainerError;
		const sandbox = createSandbox();
		const loadContainer = Container.load.bind(Container);
		let assertContainerInteractions: (() => void) | undefined;
		sandbox.stub(Container, "load").callsFake(async (loadProps, createProps) => {
			const container = await loadContainer(loadProps, createProps);
			sandbox.stub(container.deltaManager, "lastSequenceNumber").get(() => 1);
			const disposeSpy = sandbox.spy(container, "dispose");
			const disconnectSpy = sandbox.spy(container, "disconnect");
			const onSpy = sandbox.spy(container, "on");
			const connectStub = sandbox.stub(container, "connect").callsFake(() => {
				const opHandlerCall = onSpy.getCalls().find((call) => call.args[0] === "op");
				assert(opHandlerCall !== undefined, "the replay op listener should be registered");
				const replayOpHandler = opHandlerCall.args[1] as () => void;
				const disposedHandlerCall = onSpy
					.getCalls()
					.find((call) => call.args[0] === "disposed");
				assert(
					disposedHandlerCall !== undefined,
					"the replay disposed listener should be registered",
				);
				const replayDisposedHandler = disposedHandlerCall.args[1] as (
					error?: ICriticalContainerError,
				) => void;

				replayOpHandler();
				container.close(expectedError);
				replayDisposedHandler();
			});
			assertContainerInteractions = (): void => {
				assert.equal(connectStub.callCount, 1, "the replay should attempt to connect once");
				assert.equal(
					disconnectSpy.callCount,
					0,
					"a container closed after replay resolution should not be disconnected",
				);
				assert(disposeSpy.calledOnceWithExactly(expectedError));
			};
			return container;
		});

		try {
			await assert.rejects(
				loadContainerToSequenceNumber({
					codeLoader: createTestCodeLoaderProxy({
						runtimeWithout_setConnectionStatus: true,
					}),
					urlResolver,
					documentServiceFactory: makeCapableFactory(async () => service),
					request: { url: resolvedUrl.url },
					loadToSequenceNumber: 1,
				}),
				(error: unknown) => error === expectedError,
			);

			assert(
				assertContainerInteractions !== undefined,
				"the point-in-time container should be instrumented",
			);
			assertContainerInteractions();
		} finally {
			sandbox.restore();
		}
	});

	it("cleans up when connecting for replay throws synchronously", async () => {
		const service = makeSnapshotService(await createSnapshot(0));
		const expectedError = new GenericError(
			"simulated synchronous connect failure",
		) as ICriticalContainerError;
		const sandbox = createSandbox();
		const loadContainer = Container.load.bind(Container);
		let assertContainerInteractions: (() => void) | undefined;
		sandbox.stub(Container, "load").callsFake(async (loadProps, createProps) => {
			const container = await loadContainer(loadProps, createProps);
			const disposeSpy = sandbox.spy(container, "dispose");
			const onSpy = sandbox.spy(container, "on");
			const offSpy = sandbox.spy(container, "off");
			const connectStub = sandbox.stub(container, "connect").throws(expectedError);
			assertContainerInteractions = (): void => {
				assert.equal(connectStub.callCount, 1, "the replay should attempt to connect once");
				assert(disposeSpy.calledOnceWithExactly(expectedError));
				assert.equal(
					offSpy.getCalls().filter((call) => call.args[0] === "op").length,
					1,
					"the replay op listener should be removed once",
				);
				for (const eventName of ["closed", "disposed"] as const) {
					const registeredListeners = onSpy
						.getCalls()
						.filter((call) => call.args[0] === eventName)
						.map((call) => call.args[1]);
					const removedListeners = offSpy
						.getCalls()
						.filter((call) => call.args[0] === eventName)
						.map((call) => call.args[1]);
					assert.deepEqual(
						removedListeners,
						registeredListeners,
						`all ${eventName} listeners should be removed after connect fails`,
					);
				}
			};
			return container;
		});

		try {
			await assert.rejects(
				loadContainerToSequenceNumber({
					codeLoader: createTestCodeLoaderProxy({
						runtimeWithout_setConnectionStatus: true,
					}),
					urlResolver,
					documentServiceFactory: makeCapableFactory(async () => service),
					request: { url: resolvedUrl.url },
					loadToSequenceNumber: 1,
				}),
				(error: unknown) => error === expectedError,
			);

			assert(
				assertContainerInteractions !== undefined,
				"the point-in-time container should be instrumented",
			);
			assertContainerInteractions();
		} finally {
			sandbox.restore();
		}
	});

	it("preserves the disposal error when the container is disposed during replay", async () => {
		const service = makeSnapshotService(await createSnapshot(0));
		const expectedError = new GenericError(
			"simulated disposal during replay",
		) as ICriticalContainerError;
		const sandbox = createSandbox();
		const loadContainer = Container.load.bind(Container);
		let assertContainerInteractions: (() => void) | undefined;
		sandbox.stub(Container, "load").callsFake(async (loadProps, createProps) => {
			const container = await loadContainer(loadProps, createProps);
			const onSpy = sandbox.spy(container, "on");
			const offSpy = sandbox.spy(container, "off");
			const connectStub = sandbox.stub(container, "connect").callsFake(() => {
				container.dispose(expectedError);
			});
			assertContainerInteractions = (): void => {
				assert.equal(connectStub.callCount, 1, "the replay should attempt to connect once");
				const registeredDisposedListeners = onSpy
					.getCalls()
					.filter((call) => call.args[0] === "disposed")
					.map((call) => call.args[1]);
				const removedDisposedListeners = offSpy
					.getCalls()
					.filter((call) => call.args[0] === "disposed")
					.map((call) => call.args[1]);
				assert.deepEqual(
					removedDisposedListeners,
					registeredDisposedListeners,
					"all disposed listeners should be removed after replay fails",
				);
				assert.equal(
					offSpy.getCalls().filter((call) => call.args[0] === "op").length,
					1,
					"the replay op listener should be removed once",
				);
			};
			return container;
		});

		try {
			await assert.rejects(
				loadContainerToSequenceNumber({
					codeLoader: createTestCodeLoaderProxy({
						runtimeWithout_setConnectionStatus: true,
					}),
					urlResolver,
					documentServiceFactory: makeCapableFactory(async () => service),
					request: { url: resolvedUrl.url },
					loadToSequenceNumber: 1,
				}),
				(error: unknown) => error === expectedError,
			);

			assert(
				assertContainerInteractions !== undefined,
				"the point-in-time container should be instrumented",
			);
			assertContainerInteractions();
		} finally {
			sandbox.restore();
		}
	});

	it("reports an error when the container closes without one during replay", async () => {
		const service = makeSnapshotService(await createSnapshot(0));
		const sandbox = createSandbox();
		const loadContainer = Container.load.bind(Container);
		let disposeSpy: SinonSpy | undefined;
		sandbox.stub(Container, "load").callsFake(async (loadProps, createProps) => {
			const container = await loadContainer(loadProps, createProps);
			disposeSpy = sandbox.spy(container, "dispose");
			sandbox.stub(container, "connect").callsFake(() => {
				container.close();
			});
			return container;
		});

		try {
			let rejectedError: IErrorBase | undefined;
			await assert.rejects(
				loadContainerToSequenceNumber({
					codeLoader: createTestCodeLoaderProxy({
						runtimeWithout_setConnectionStatus: true,
					}),
					urlResolver,
					documentServiceFactory: makeCapableFactory(async () => service),
					request: { url: resolvedUrl.url },
					loadToSequenceNumber: 1,
				}),
				(error: unknown) => {
					if (!isFluidError(error)) {
						return false;
					}
					rejectedError = error;
					return (
						error.message ===
						"Container closed or disposed without error while the paused load was waiting for ops."
					);
				},
			);
			assert.equal(disposeSpy?.calledOnceWithExactly(rejectedError), true);
		} finally {
			sandbox.restore();
		}
	});

	it("cancels without connecting when the signal is already aborted", async () => {
		const service = makeSnapshotService(await createSnapshot(0));
		const abortController = new AbortController();
		abortController.abort();
		const sandbox = createSandbox();
		const loadContainer = Container.load.bind(Container);
		let assertContainerInteractions: ((expectedError: IErrorBase) => void) | undefined;
		sandbox.stub(Container, "load").callsFake(async (loadProps, createProps) => {
			const container = await loadContainer(loadProps, createProps);
			const closeSpy = sandbox.spy(container, "close");
			const disposeSpy = sandbox.spy(container, "dispose");
			const connectSpy = sandbox.spy(container, "connect");
			const onSpy = sandbox.spy(container, "on");
			const offSpy = sandbox.spy(container, "off");
			assertContainerInteractions = (expectedError: IErrorBase): void => {
				assert.equal(
					connectSpy.callCount,
					0,
					"an already-aborted load must not start a connection",
				);
				assert(
					closeSpy.notCalled,
					"a rejected load should be disposed without being closed first",
				);
				assert(disposeSpy.calledOnceWithExactly(expectedError));
				assert.equal(
					onSpy.getCalls().filter((call) => call.args[0] === "op").length,
					1,
					"the replay op listener should be registered once",
				);
				assert.equal(
					offSpy.getCalls().filter((call) => call.args[0] === "op").length,
					1,
					"the replay op listener should be removed once",
				);
				const registeredClosedListeners = onSpy
					.getCalls()
					.filter((call) => call.args[0] === "closed")
					.map((call) => call.args[1]);
				const removedClosedListeners = offSpy
					.getCalls()
					.filter((call) => call.args[0] === "closed")
					.map((call) => call.args[1]);
				assert.deepEqual(
					removedClosedListeners,
					registeredClosedListeners,
					"all closed listeners should be removed after cancellation",
				);
			};
			return container;
		});
		const addAbortListenerSpy = sandbox.spy(abortController.signal, "addEventListener");
		const removeAbortListenerSpy = sandbox.spy(abortController.signal, "removeEventListener");

		try {
			let rejectedError: IErrorBase | undefined;
			await assert.rejects(
				loadContainerToSequenceNumber({
					codeLoader: createTestCodeLoaderProxy({
						runtimeWithout_setConnectionStatus: true,
					}),
					urlResolver,
					documentServiceFactory: makeCapableFactory(async () => service),
					request: { url: resolvedUrl.url },
					loadToSequenceNumber: 1,
					signal: abortController.signal,
				}),
				(error: unknown) => {
					if (!isFluidError(error)) {
						return false;
					}
					rejectedError = error;
					return /cancel/i.test(error.message);
				},
			);

			assert(
				assertContainerInteractions !== undefined,
				"the point-in-time container should be instrumented",
			);
			assert(rejectedError !== undefined, "the cancellation error should be captured");
			assertContainerInteractions(rejectedError);

			assert.equal(addAbortListenerSpy.callCount, 1);
			const abortListener = addAbortListenerSpy.firstCall.args[1];
			assert(
				removeAbortListenerSpy.calledOnceWithExactly("abort", abortListener),
				"the abort listener should be removed after cancellation",
			);
		} finally {
			sandbox.restore();
		}
	});
});
