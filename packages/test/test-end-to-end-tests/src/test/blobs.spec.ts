/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { bufferToString, stringToBuffer } from "@fluid-internal/client-utils";
import {
	ExpectedEvents,
	ITestDataObject,
	describeCompat,
	itExpects,
} from "@fluid-private/test-version-utils";
import { AttachState } from "@fluidframework/container-definitions";
import { DisconnectReason } from "@fluidframework/container-definitions/internal";
import type { IDetachedBlobStorage } from "@fluidframework/container-loader/internal";
import {
	CompressionAlgorithms,
	ContainerMessageType,
	DefaultSummaryConfiguration,
	type IContainerRuntimeOptionsInternal,
} from "@fluidframework/container-runtime/internal";
import { IErrorBase, IFluidHandle } from "@fluidframework/core-interfaces";
import { Deferred } from "@fluidframework/core-utils/internal";
import { IDocumentServiceFactory } from "@fluidframework/driver-definitions/internal";
import { ReferenceType } from "@fluidframework/merge-tree/internal";
import type { SharedString } from "@fluidframework/sequence/internal";
import {
	ChannelFactoryRegistry,
	ITestContainerConfig,
	ITestObjectProvider,
	createTestConfigProvider,
	getContainerEntryPointBackCompat,
	waitForContainerConnection,
	timeoutPromise,
} from "@fluidframework/test-utils/internal";
import { v4 as uuid } from "uuid";

import { wrapObjectAndOverride } from "../mocking.js";
import { TestPersistedCache } from "../testPersistedCache.js";

import {
	MockDetachedBlobStorage,
	driverSupportsBlobs,
	getUrlFromDetachedBlobStorage,
} from "./mockDetachedBlobStorage.js";

function makeTestContainerConfig(registry: ChannelFactoryRegistry): ITestContainerConfig {
	return {
		runtimeOptions: {
			summaryOptions: {
				initialSummarizerDelayMs: 20, // Previous Containers had this property under SummaryOptions.
				summaryConfigOverrides: {
					...DefaultSummaryConfiguration,
					...{
						minIdleTime: 5000,
						maxIdleTime: 5000,
						maxTime: 5000 * 12,
						maxAckWaitTime: 120000,
						maxOps: 1,
						initialSummarizerDelayMs: 20,
					},
				},
			},
		},
		registry,
	};
}

const usageErrorMessage = "Empty file summary creation isn't supported in this driver.";

const containerCloseAndDisposeUsageErrors = [
	{ eventName: "fluid:telemetry:Container:ContainerClose", error: usageErrorMessage },
];
const ContainerStateEventsOrErrors: ExpectedEvents = {
	routerlicious: containerCloseAndDisposeUsageErrors,
	tinylicious: containerCloseAndDisposeUsageErrors,
	odsp: [
		{
			eventName: "fluid:telemetry:OdspDriver:createNewEmptyFile_end",
			containerAttachState: "Detached",
		},
		{
			eventName: "fluid:telemetry:OdspDriver:uploadSummary_end",
			containerAttachState: "Attaching",
		},
		{
			eventName: "fluid:telemetry:OdspDriver:renameFile_end",
			containerAttachState: "Attaching",
		},
	],
};

describeCompat("blobs", "FullCompat", (getTestObjectProvider, apis) => {
	const { SharedString } = apis.dds;
	const testContainerConfig = makeTestContainerConfig([
		["sharedString", SharedString.getFactory()],
	]);

	let provider: ITestObjectProvider;
	beforeEach("getTestObjectProvider", async function () {
		provider = getTestObjectProvider();
		// Currently, AFR does not support blob API.
		if (provider.driver.type === "routerlicious" && provider.driver.endpointName === "frs") {
			this.skip();
		}
	});

	it("attach sends an op", async function () {
		const container = await provider.makeTestContainer(testContainerConfig);

		const dataStore = await getContainerEntryPointBackCompat<ITestDataObject>(container);

		const blobOpP = new Promise<void>((resolve, reject) =>
			dataStore._context.containerRuntime.on("op", (op) => {
				if (op.type === ContainerMessageType.BlobAttach) {
					if ((op.metadata as { blobId?: unknown } | undefined)?.blobId) {
						resolve();
					} else {
						reject(new Error("no op metadata"));
					}
				}
			}),
		);

		const blob = await dataStore._runtime.uploadBlob(
			stringToBuffer("some random text", "utf-8"),
		);

		dataStore._root.set("my blob", blob);

		await blobOpP;
	});

	it("can get remote attached blob", async function () {
		// TODO: Re-enable after cross version compat bugs are fixed - ADO:6286
		if (provider.type === "TestObjectProviderWithVersionedLoad") {
			this.skip();
		}
		const testString = "this is a test string";
		const testKey = "a blob";
		const container1 = await provider.makeTestContainer(testContainerConfig);

		const dataStore1 = await getContainerEntryPointBackCompat<ITestDataObject>(container1);

		const blob = await dataStore1._runtime.uploadBlob(stringToBuffer(testString, "utf-8"));
		dataStore1._root.set(testKey, blob);

		const container2 = await provider.loadTestContainer(testContainerConfig);
		const dataStore2 = await getContainerEntryPointBackCompat<ITestDataObject>(container2);

		await provider.ensureSynchronized();

		const blobHandle = dataStore2._root.get<IFluidHandle<ArrayBufferLike>>(testKey);
		assert(blobHandle);
		assert.strictEqual(bufferToString(await blobHandle.get(), "utf-8"), testString);
	});

	it("round trip blob handle on shared string property", async function () {
		// TODO: Re-enable after cross version compat bugs are fixed - ADO:6286
		if (provider.type === "TestObjectProviderWithVersionedLoad") {
			this.skip();
		}
		const container1 = await provider.makeTestContainer(testContainerConfig);
		const container2 = await provider.loadTestContainer(testContainerConfig);
		const testString = "this is a test string";
		// setup
		{
			const dataStore = await getContainerEntryPointBackCompat<ITestDataObject>(container2);
			const sharedString = SharedString.create(dataStore._runtime, uuid());
			dataStore._root.set("sharedString", sharedString.handle);

			const blob = await dataStore._runtime.uploadBlob(stringToBuffer(testString, "utf-8"));

			sharedString.insertMarker(0, ReferenceType.Simple, { blob });

			// wait for summarize, then summary ack so the next container will load from snapshot
			await new Promise<void>((resolve, reject) => {
				let summarized = false;
				container1.on("op", (op) => {
					switch (op.type) {
						case "summaryAck": {
							if (summarized) {
								resolve();
							}
							break;
						}
						case "summaryNack": {
							reject(new Error("summaryNack"));
							break;
						}
						case "summarize": {
							summarized = true;
							break;
						}
						default: {
							break;
						}
					}
				});
			});
		}

		// validate on remote container, local container, and container loaded from summary
		for (const container of [
			container1,
			container2,
			await provider.loadTestContainer(testContainerConfig),
		]) {
			const dataStore2 = await getContainerEntryPointBackCompat<ITestDataObject>(container);
			await provider.ensureSynchronized();
			const handle = dataStore2._root.get<IFluidHandle<SharedString>>("sharedString");
			assert(handle);
			const sharedString2 = await handle.get();

			const props = sharedString2.getPropertiesAtPosition(0);

			assert.strictEqual(bufferToString(await props?.blob.get(), "utf-8"), testString);
		}
	});

	it("correctly handles simultaneous identical blob upload on one container", async () => {
		const container = await provider.makeTestContainer(testContainerConfig);
		const dataStore = await getContainerEntryPointBackCompat<ITestDataObject>(container);
		const blob = stringToBuffer("some different yet still random text", "utf-8");

		// upload the blob twice and make sure nothing bad happens.
		await Promise.all([
			dataStore._runtime.uploadBlob(blob),
			dataStore._runtime.uploadBlob(blob),
		]);
	});

	[false, true].forEach((enableGroupedBatching) => {
		it(`attach sends ops with compression enabled and ${
			enableGroupedBatching ? "grouped" : "regular"
		} batching`, async function () {
			// Tracked by AB#4130, the test run on the tinylicous driver is disabled temporarily to ensure normal operation of the build-client package pipeline
			if (provider.driver.type === "tinylicious" || provider.driver.type === "t9s") {
				this.skip();
			}

			// Skip this test for standard r11s as its flaky and non-reproducible
			if (provider.driver.type === "r11s" && provider.driver.endpointName !== "frs") {
				this.skip();
			}

			const runtimeOptions: IContainerRuntimeOptionsInternal = {
				...testContainerConfig.runtimeOptions,
				compressionOptions: {
					minimumBatchSizeInBytes: 1,
					compressionAlgorithm: CompressionAlgorithms.lz4,
				},
				enableGroupedBatching,
			};

			const container = await provider.makeTestContainer({
				...testContainerConfig,
				runtimeOptions,
			});

			const dataStore = await getContainerEntryPointBackCompat<ITestDataObject>(container);
			const blobOpP = timeoutPromise((resolve, reject) =>
				dataStore._context.containerRuntime.on("op", (op) => {
					if (op.type === ContainerMessageType.BlobAttach) {
						if ((op.metadata as { blobId?: unknown } | undefined)?.blobId) {
							resolve();
						} else {
							reject(new Error("no op metadata"));
						}
					}
				}),
			);

			for (let i = 0; i < 5; i++) {
				const blob = await dataStore._runtime.uploadBlob(
					stringToBuffer("some random text", "utf-8"),
				);

				dataStore._root.set(`Blob #${i}`, blob);
			}

			await blobOpP;
		});
	});
});

// this functionality was added in 0.47 and can be added to the compat-enabled
// tests above when the LTS version is bumped > 0.47
describeCompat("blobs", "NoCompat", (getTestObjectProvider, apis) => {
	const { SharedString } = apis.dds;
	const testContainerConfig = makeTestContainerConfig([
		["sharedString", SharedString.getFactory()],
	]);

	let provider: ITestObjectProvider;
	let testPersistedCache: TestPersistedCache;
	beforeEach("getTestObjectProvider", async function () {
		testPersistedCache = new TestPersistedCache();
		provider = getTestObjectProvider({ persistedCache: testPersistedCache });
		// Currently AFR does not support blob API.
		if (provider.driver.type === "routerlicious" && provider.driver.endpointName === "frs") {
			this.skip();
		}
	});

	// this test relies on an internal function that has been renamed (snapshot -> summarize)
	it("loads from snapshot", async function () {
		// GitHub Issue: #9534
		if (!driverSupportsBlobs(provider.driver)) {
			this.skip();
		}
		const container1 = await provider.makeTestContainer(testContainerConfig);
		const dataStore = (await container1.getEntryPoint()) as ITestDataObject;

		const attachOpP = new Promise<void>((resolve, reject) =>
			container1.on("op", (op) => {
				if (
					typeof op.contents === "string" &&
					(JSON.parse(op.contents) as { type?: unknown })?.type ===
						ContainerMessageType.BlobAttach
				) {
					if ((op.metadata as { blobId?: unknown } | undefined)?.blobId) {
						resolve();
					} else {
						reject(new Error("no op metadata"));
					}
				}
			}),
		);

		const blob = await dataStore._runtime.uploadBlob(
			stringToBuffer("some random text", "utf-8"),
		);

		// this will send the blob attach op on < 0.41 runtime (otherwise it's sent at time of upload)
		dataStore._root.set("my blob", blob);
		await attachOpP;

		const snapshot1 = (container1 as any).runtime.blobManager.summarize();

		// wait for summarize, then summary ack so the next container will load from snapshot
		await new Promise<void>((resolve, reject) => {
			let summarized = false;
			container1.on("op", (op) => {
				switch (op.type) {
					case "summaryAck": {
						if (summarized) {
							resolve();
						}
						break;
					}
					case "summaryNack": {
						reject(new Error("summaryNack"));
						break;
					}
					case "summarize": {
						summarized = true;
						break;
					}
					default: {
						break;
					}
				}
			});
		});

		// Make sure the next container loads from the network so as to get latest snapshot.
		testPersistedCache.clearCache();
		const container2 = await provider.loadTestContainer(testContainerConfig);
		const snapshot2 = (container2 as any).runtime.blobManager.summarize();
		assert.strictEqual(snapshot2.stats.treeNodeCount, 1);
		assert.strictEqual(snapshot1.summary.tree[0].id, snapshot2.summary.tree[0].id);
	});

	for (const getDetachedBlobStorage of [undefined, () => new MockDetachedBlobStorage()]) {
		serializationTests({ getDetachedBlobStorage, testContainerConfig });
	}

	// regression test for https://github.com/microsoft/FluidFramework/issues/9702
	// this was fixed in 0.58.3000
	it("correctly handles simultaneous identical blob upload on separate containers", async () => {
		const container1 = await provider.makeTestContainer(testContainerConfig);
		const container2 = await provider.loadTestContainer(testContainerConfig);
		const dataStore1 = (await container1.getEntryPoint()) as ITestDataObject;
		const dataStore2 = (await container2.getEntryPoint()) as ITestDataObject;
		const blob = stringToBuffer("some different yet still random text", "utf-8");

		// pause so the ops are in flight at the same time
		await provider.opProcessingController.pauseProcessing();

		// upload the blob twice and make sure nothing bad happens.
		const uploadP = Promise.all([
			dataStore1._runtime.uploadBlob(blob),
			dataStore2._runtime.uploadBlob(blob),
		]);
		provider.opProcessingController.resumeProcessing();
		await uploadP;
	});

	it("reconnection does not block ops when having pending blobs", async () => {
		const uploadBlobPromise = new Deferred<void>();
		const container1 = await provider.makeTestContainer({
			...testContainerConfig,
			loaderProps: {
				documentServiceFactory: wrapObjectAndOverride(provider.documentServiceFactory, {
					createDocumentService: {
						connectToStorage: {
							createBlob: (dss) => async (blob) => {
								// Wait for the uploadBlobPromise to be resolved
								await uploadBlobPromise.promise;
								return dss.createBlob(blob);
							},
						},
					},
				}),
			},
		});
		const dataStore1 = (await container1.getEntryPoint()) as ITestDataObject;

		const handleP = dataStore1._runtime.uploadBlob(stringToBuffer("test string", "utf8"));

		container1.disconnect();
		container1.connect();
		await waitForContainerConnection(container1);
		// sending some ops to confirm pending blob is not blocking other ops
		dataStore1._root.set("key", "value");
		dataStore1._root.set("another key", "another value");

		const container2 = await provider.loadTestContainer(testContainerConfig);
		const dataStore2 = (await container2.getEntryPoint()) as ITestDataObject;
		await provider.ensureSynchronized();

		assert.strictEqual(dataStore2._root.get("key"), "value");
		assert.strictEqual(dataStore2._root.get("another key"), "another value");

		uploadBlobPromise.resolve();
		await assert.doesNotReject(handleP);
	});
});

function serializationTests({
	getDetachedBlobStorage,
	testContainerConfig,
}: {
	getDetachedBlobStorage?: () => IDetachedBlobStorage;
	testContainerConfig: ITestContainerConfig;
}) {
	return describeCompat(
		`Detached Container Serialization ${
			getDetachedBlobStorage === undefined ? "without" : "with"
		} detachedBlobStorage`,
		"NoCompat",
		(getTestObjectProvider) => {
			let provider: ITestObjectProvider;
			let detachedBlobStorage: IDetachedBlobStorage | undefined;
			beforeEach(async function () {
				provider = getTestObjectProvider();
				detachedBlobStorage = getDetachedBlobStorage?.();
			});
			for (const summarizeProtocolTree of [undefined, true, false]) {
				itExpects(
					`works in detached container. summarizeProtocolTree: ${summarizeProtocolTree}`,
					ContainerStateEventsOrErrors,
					async function () {
						const loader = provider.makeTestLoader({
							...testContainerConfig,
							loaderProps: {
								detachedBlobStorage,
								options: { summarizeProtocolTree },
								configProvider: createTestConfigProvider({
									"Fluid.Container.MemoryBlobStorageEnabled": true,
								}),
							},
						});
						const container = await loader.createDetachedContainer(
							provider.defaultCodeDetails,
						);

						const text = "this is some example text";
						const dataStore = (await container.getEntryPoint()) as ITestDataObject;
						const blobHandle = await dataStore._runtime.uploadBlob(
							stringToBuffer(text, "utf-8"),
						);
						assert.strictEqual(bufferToString(await blobHandle.get(), "utf-8"), text);

						dataStore._root.set("my blob", blobHandle);
						assert.strictEqual(
							bufferToString(await dataStore._root.get("my blob").get(), "utf-8"),
							text,
						);

						const attachP = container.attach(
							provider.driver.createCreateNewRequest(provider.documentId),
						);
						if (!driverSupportsBlobs(provider.driver)) {
							return assert.rejects(
								attachP,
								(err: IErrorBase) => err.message === usageErrorMessage,
							);
						}
						await attachP;
						if (detachedBlobStorage) {
							// make sure we're getting the blob from actual storage
							assert.strictEqual(
								detachedBlobStorage.size,
								0,
								"detachedBlobStorage should be disposed after attach",
							);
						}

						// old handle still works
						assert.strictEqual(bufferToString(await blobHandle.get(), "utf-8"), text);
						// new handle works
						assert.strictEqual(
							bufferToString(await dataStore._root.get("my blob").get(), "utf-8"),
							text,
						);
					},
				);
			}

			it("serialize/rehydrate container with blobs", async function () {
				const loader = provider.makeTestLoader({
					...testContainerConfig,
					loaderProps: {
						detachedBlobStorage,
						configProvider: createTestConfigProvider({
							"Fluid.Container.MemoryBlobStorageEnabled": true,
						}),
					},
				});
				const serializeContainer = await loader.createDetachedContainer(
					provider.defaultCodeDetails,
				);

				const text = "this is some example text";
				const serializeDataStore =
					(await serializeContainer.getEntryPoint()) as ITestDataObject;
				const blobHandle = await serializeDataStore._runtime.uploadBlob(
					stringToBuffer(text, "utf-8"),
				);
				assert.strictEqual(bufferToString(await blobHandle.get(), "utf-8"), text);

				serializeDataStore._root.set("my blob", blobHandle);
				assert.strictEqual(
					bufferToString(await serializeDataStore._root.get("my blob").get(), "utf-8"),
					text,
				);

				const snapshot = serializeContainer.serialize();
				const rehydratedContainer =
					await loader.rehydrateDetachedContainerFromSnapshot(snapshot);
				const rehydratedDataStore =
					(await rehydratedContainer.getEntryPoint()) as ITestDataObject;
				assert.strictEqual(
					bufferToString(await rehydratedDataStore._root.get("my blob").get(), "utf-8"),
					text,
				);
			});

			it("serialize while attaching and rehydrate container with blobs", async function () {
				// build a fault injected driver to fail attach on the  summary upload
				// after create that happens in the blob flow
				const documentServiceFactory = wrapObjectAndOverride<IDocumentServiceFactory>(
					provider.documentServiceFactory,
					{
						createContainer: {
							connectToStorage: {
								uploadSummaryWithContext: () => assert.fail("fail on real summary upload"),
							},
						},
					},
				);
				const loader = provider.makeTestLoader({
					...testContainerConfig,
					loaderProps: {
						detachedBlobStorage,
						documentServiceFactory,
						configProvider: createTestConfigProvider({
							"Fluid.Container.MemoryBlobStorageEnabled": true,
							"Fluid.Container.RetryOnAttachFailure": true,
						}),
					},
				});
				const serializeContainer = await loader.createDetachedContainer(
					provider.defaultCodeDetails,
				);

				const text = "this is some example text";
				const serializeDataStore =
					(await serializeContainer.getEntryPoint()) as ITestDataObject;
				const blobHandle = await serializeDataStore._runtime.uploadBlob(
					stringToBuffer(text, "utf-8"),
				);
				assert.strictEqual(bufferToString(await blobHandle.get(), "utf-8"), text);

				serializeDataStore._root.set("my blob", blobHandle);
				assert.strictEqual(
					bufferToString(await serializeDataStore._root.get("my blob").get(), "utf-8"),
					text,
				);

				await serializeContainer.attach(provider.driver.createCreateNewRequest()).then(
					() => assert.fail("should fail"),
					() => {},
				);
				assert.strictEqual(serializeContainer.closed, false);
				// only drivers that support blobs will transition to attaching
				// but for other drivers the test still ensures we can capture
				// after an attach attempt
				if (driverSupportsBlobs(provider.driver)) {
					assert.strictEqual(serializeContainer.attachState, AttachState.Attaching);
				} else {
					assert.strictEqual(serializeContainer.attachState, AttachState.Detached);
				}
				const snapshot = serializeContainer.serialize();

				const rehydratedContainer =
					await loader.rehydrateDetachedContainerFromSnapshot(snapshot);
				const rehydratedDataStore =
					(await rehydratedContainer.getEntryPoint()) as ITestDataObject;
				assert.strictEqual(
					bufferToString(await rehydratedDataStore._root.get("my blob").get(), "utf-8"),
					text,
				);
			});

			itExpects(
				"redirect table saved in snapshot",
				ContainerStateEventsOrErrors,
				async function () {
					// test with and without offline load enabled
					const offlineCfg = {
						"Fluid.Container.enableOfflineLoad": true,
					};
					for (const cfg of [undefined, offlineCfg]) {
						const loader = provider.makeTestLoader({
							...testContainerConfig,
							loaderProps: {
								detachedBlobStorage,
								configProvider: createTestConfigProvider({
									"Fluid.Container.MemoryBlobStorageEnabled": true,
									...offlineCfg,
								}),
							},
						});
						const detachedContainer = await loader.createDetachedContainer(
							provider.defaultCodeDetails,
						);

						const text = "this is some example text";
						const detachedDataStore =
							(await detachedContainer.getEntryPoint()) as ITestDataObject;

						detachedDataStore._root.set(
							"my blob",
							await detachedDataStore._runtime.uploadBlob(stringToBuffer(text, "utf-8")),
						);
						detachedDataStore._root.set(
							"my same blob",
							await detachedDataStore._runtime.uploadBlob(stringToBuffer(text, "utf-8")),
						);
						detachedDataStore._root.set(
							"my other blob",
							await detachedDataStore._runtime.uploadBlob(
								stringToBuffer("more text", "utf-8"),
							),
						);

						const attachP = detachedContainer.attach(
							provider.driver.createCreateNewRequest(provider.documentId),
						);
						if (!driverSupportsBlobs(provider.driver)) {
							return assert.rejects(
								attachP,
								(err: IErrorBase) => err.message === usageErrorMessage,
							);
						}
						await attachP;
						if (detachedBlobStorage) {
							// make sure we're getting the blob from actual storage
							assert.strictEqual(
								detachedBlobStorage.size,
								0,
								"detachedBlobStorage should be disposed after attach",
							);
						}
						const url = await getUrlFromDetachedBlobStorage(detachedContainer, provider);
						const attachedContainer = await provider
							.makeTestLoader(testContainerConfig)
							.resolve({ url });

						const attachedDataStore =
							(await attachedContainer.getEntryPoint()) as ITestDataObject;
						await provider.ensureSynchronized();
						assert.strictEqual(
							bufferToString(await attachedDataStore._root.get("my blob").get(), "utf-8"),
							text,
						);
					}
				},
			);

			itExpects(
				"serialize/rehydrate then attach",
				ContainerStateEventsOrErrors,
				async function () {
					const loader = provider.makeTestLoader({
						...testContainerConfig,
						loaderProps: {
							detachedBlobStorage,
							configProvider: createTestConfigProvider({
								"Fluid.Container.MemoryBlobStorageEnabled": true,
							}),
						},
					});
					const serializeContainer = await loader.createDetachedContainer(
						provider.defaultCodeDetails,
					);

					const text = "this is some example text";
					const dataStore = (await serializeContainer.getEntryPoint()) as ITestDataObject;
					dataStore._root.set(
						"my blob",
						await dataStore._runtime.uploadBlob(stringToBuffer(text, "utf-8")),
					);

					const snapshot = serializeContainer.serialize();
					serializeContainer.close(DisconnectReason.Expected);
					const rehydratedContainer =
						await loader.rehydrateDetachedContainerFromSnapshot(snapshot);

					const attachP = rehydratedContainer.attach(
						provider.driver.createCreateNewRequest(provider.documentId),
					);
					if (!driverSupportsBlobs(provider.driver)) {
						return assert.rejects(
							attachP,
							(err: IErrorBase) => err.message === usageErrorMessage,
						);
					}
					await attachP;

					const url = await getUrlFromDetachedBlobStorage(rehydratedContainer, provider);
					const attachedContainer = await provider
						.makeTestLoader(testContainerConfig)
						.resolve({ url });
					const attachedDataStore =
						(await attachedContainer.getEntryPoint()) as ITestDataObject;
					await provider.ensureSynchronized();
					assert.strictEqual(
						bufferToString(await attachedDataStore._root.get("my blob").get(), "utf-8"),
						text,
					);
				},
			);

			itExpects(
				"serialize/rehydrate multiple times then attach",
				ContainerStateEventsOrErrors,
				async function () {
					const loader = provider.makeTestLoader({
						...testContainerConfig,
						loaderProps: {
							detachedBlobStorage,
							configProvider: createTestConfigProvider({
								"Fluid.Container.MemoryBlobStorageEnabled": true,
							}),
						},
					});
					let container = await loader.createDetachedContainer(provider.defaultCodeDetails);

					const text = "this is some example text";
					const dataStore = (await container.getEntryPoint()) as ITestDataObject;
					dataStore._root.set(
						"my blob",
						await dataStore._runtime.uploadBlob(stringToBuffer(text, "utf-8")),
					);

					let snapshot;
					for (const _ of Array(5)) {
						snapshot = container.serialize();
						container.close(DisconnectReason.Expected);
						container = await loader.rehydrateDetachedContainerFromSnapshot(snapshot);
					}

					const attachP = container.attach(
						provider.driver.createCreateNewRequest(provider.documentId),
					);
					if (!driverSupportsBlobs(provider.driver)) {
						return assert.rejects(
							attachP,
							(err: IErrorBase) => err.message === usageErrorMessage,
						);
					}
					await attachP;

					const url = await getUrlFromDetachedBlobStorage(container, provider);
					const attachedContainer = await provider
						.makeTestLoader(testContainerConfig)
						.resolve({ url });
					const attachedDataStore =
						(await attachedContainer.getEntryPoint()) as ITestDataObject;
					await provider.ensureSynchronized();
					assert.strictEqual(
						bufferToString(await attachedDataStore._root.get("my blob").get(), "utf-8"),
						text,
					);
				},
			);

			it("rehydrating without detached blob storage results in error", async function () {
				const loader = provider.makeTestLoader({
					...testContainerConfig,
					loaderProps: { detachedBlobStorage: new MockDetachedBlobStorage() },
				});
				const serializeContainer = await loader.createDetachedContainer(
					provider.defaultCodeDetails,
				);

				const text = "this is some example text";
				const dataStore = (await serializeContainer.getEntryPoint()) as ITestDataObject;
				dataStore._root.set(
					"my blob",
					await dataStore._runtime.uploadBlob(stringToBuffer(text, "utf-8")),
				);

				const snapshot = serializeContainer.serialize();
				serializeContainer.close(DisconnectReason.Expected);

				const loaderWithNoBlobStorage = provider.makeTestLoader(testContainerConfig);
				await assert.rejects(
					loaderWithNoBlobStorage.rehydrateDetachedContainerFromSnapshot(snapshot),
				);
			});
		},
	);
}
