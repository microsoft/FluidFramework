/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-unsafe-return */
import { strict as assert } from "assert";
import { bufferToString, stringToBuffer } from "@fluidframework/common-utils";
import {
	CompressionAlgorithms,
	ContainerMessageType,
	DefaultSummaryConfiguration,
} from "@fluidframework/container-runtime";
import { IErrorBase, IFluidHandle } from "@fluidframework/core-interfaces";
import { ReferenceType } from "@fluidframework/merge-tree";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { SharedString } from "@fluidframework/sequence";
import {
	ITestContainerConfig,
	ITestObjectProvider,
	waitForContainerConnection,
} from "@fluidframework/test-utils";
import {
	describeFullCompat,
	describeNoCompat,
	ExpectedEvents,
	ITestDataObject,
	itExpects,
} from "@fluid-internal/test-version-utils";
import { v4 as uuid } from "uuid";
import { ConfigTypes, IConfigProviderBase } from "@fluidframework/telemetry-utils";
// eslint-disable-next-line import/no-internal-modules
import { IPendingRuntimeState, IPendingBlobs } from "@fluidframework/container-runtime/src/test";
import {
	driverSupportsBlobs,
	getUrlFromDetachedBlobStorage,
	MockDetachedBlobStorage,
} from "./mockDetachedBlobStorage.js";

const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
	getRawConfig: (name: string): ConfigTypes => settings[name],
});
const testContainerConfig: ITestContainerConfig = {
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
	registry: [["sharedString", SharedString.getFactory()]],
};

const usageErrorMessage = "Empty file summary creation isn't supported in this driver.";

const containerCloseAndDisposeUsageErrors = [
	{ eventName: "fluid:telemetry:Container:ContainerClose", error: usageErrorMessage },
];
const ContainerCloseUsageError: ExpectedEvents = {
	routerlicious: containerCloseAndDisposeUsageErrors,
	tinylicious: containerCloseAndDisposeUsageErrors,
};

describeFullCompat("blobs", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;
	beforeEach(async function () {
		provider = getTestObjectProvider();
		// Currently FRS does not support blob API.
		if (provider.driver.type === "routerlicious" && provider.driver.endpointName === "frs") {
			this.skip();
		}
	});

	it("attach sends an op", async function () {
		const container = await provider.makeTestContainer(testContainerConfig);

		const dataStore = await requestFluidObject<ITestDataObject>(container, "default");

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
		const testString = "this is a test string";
		const testKey = "a blob";
		const container1 = await provider.makeTestContainer(testContainerConfig);

		const dataStore1 = await requestFluidObject<ITestDataObject>(container1, "default");

		const blob = await dataStore1._runtime.uploadBlob(stringToBuffer(testString, "utf-8"));
		dataStore1._root.set(testKey, blob);

		const container2 = await provider.loadTestContainer(testContainerConfig);
		const dataStore2 = await requestFluidObject<ITestDataObject>(container2, "default");

		await provider.ensureSynchronized();

		const blobHandle = dataStore2._root.get<IFluidHandle<ArrayBufferLike>>(testKey);
		assert(blobHandle);
		assert.strictEqual(bufferToString(await blobHandle.get(), "utf-8"), testString);
	});

	it("round trip blob handle on shared string property", async function () {
		const container1 = await provider.makeTestContainer(testContainerConfig);
		const container2 = await provider.loadTestContainer(testContainerConfig);
		const testString = "this is a test string";
		// setup
		{
			const dataStore = await requestFluidObject<ITestDataObject>(container2, "default");
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
			const dataStore2 = await requestFluidObject<ITestDataObject>(container, "default");
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
		const dataStore = await requestFluidObject<ITestDataObject>(container, "default");
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

			const container = await provider.makeTestContainer({
				...testContainerConfig,
				runtimeOptions: {
					...testContainerConfig.runtimeOptions,
					compressionOptions: {
						minimumBatchSizeInBytes: 1,
						compressionAlgorithm: CompressionAlgorithms.lz4,
					},
					enableGroupedBatching,
				},
			});

			const dataStore = await requestFluidObject<ITestDataObject>(container, "default");
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
describeNoCompat("blobs", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;
	beforeEach(async function () {
		provider = getTestObjectProvider();
		// Currently FRS does not support blob API.
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
		const dataStore = await requestFluidObject<ITestDataObject>(container1, "default");

		const attachOpP = new Promise<void>((resolve, reject) =>
			container1.on("op", (op) => {
				if (
					(op.contents as { type?: unknown } | undefined)?.type ===
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

		const container2 = await provider.loadTestContainer(testContainerConfig);
		const snapshot2 = (container2 as any).runtime.blobManager.summarize();
		assert.strictEqual(snapshot2.stats.treeNodeCount, 1);
		assert.strictEqual(snapshot1.summary.tree[0].id, snapshot2.summary.tree[0].id);
	});
	for (const summarizeProtocolTree of [undefined, true, false]) {
		itExpects(
			`works in detached container. summarizeProtocolTree: ${summarizeProtocolTree}`,
			ContainerCloseUsageError,
			async function () {
				const detachedBlobStorage = new MockDetachedBlobStorage();
				const loader = provider.makeTestLoader({
					...testContainerConfig,
					loaderProps: {
						detachedBlobStorage,
						options: { summarizeProtocolTree },
					},
				});
				const container = await loader.createDetachedContainer(provider.defaultCodeDetails);

				const text = "this is some example text";
				const dataStore = await requestFluidObject<ITestDataObject>(container, "default");
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

				// make sure we're getting the blob from actual storage
				detachedBlobStorage.blobs.clear();

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
			loaderProps: { detachedBlobStorage: new MockDetachedBlobStorage() },
		});
		const serializeContainer = await loader.createDetachedContainer(
			provider.defaultCodeDetails,
		);

		const text = "this is some example text";
		const serializeDataStore = await requestFluidObject<ITestDataObject>(
			serializeContainer,
			"default",
		);
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
		const rehydratedContainer = await loader.rehydrateDetachedContainerFromSnapshot(snapshot);
		const rehydratedDataStore = await requestFluidObject<ITestDataObject>(
			rehydratedContainer,
			"default",
		);
		assert.strictEqual(
			bufferToString(await rehydratedDataStore._root.get("my blob").get(), "utf-8"),
			text,
		);
	});

	itExpects("redirect table saved in snapshot", ContainerCloseUsageError, async function () {
		// test with and without offline load enabled
		const offlineCfg = configProvider({ "Fluid.Container.enableOfflineLoad": true });
		for (const cfg of [undefined, offlineCfg]) {
			const detachedBlobStorage = new MockDetachedBlobStorage();
			const loader = provider.makeTestLoader({
				...testContainerConfig,
				loaderProps: { detachedBlobStorage, configProvider: cfg },
			});
			const detachedContainer = await loader.createDetachedContainer(
				provider.defaultCodeDetails,
			);

			const text = "this is some example text";
			const detachedDataStore = await requestFluidObject<ITestDataObject>(
				detachedContainer,
				"default",
			);

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
				await detachedDataStore._runtime.uploadBlob(stringToBuffer("more text", "utf-8")),
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
			detachedBlobStorage.blobs.clear();

			const url = await getUrlFromDetachedBlobStorage(detachedContainer, provider);
			const attachedContainer = await provider
				.makeTestLoader(testContainerConfig)
				.resolve({ url });

			const attachedDataStore = await requestFluidObject<ITestDataObject>(
				attachedContainer,
				"default",
			);
			await provider.ensureSynchronized();
			assert.strictEqual(
				bufferToString(await attachedDataStore._root.get("my blob").get(), "utf-8"),
				text,
			);
		}
	});

	itExpects("serialize/rehydrate then attach", ContainerCloseUsageError, async function () {
		const detachedBlobStorage = new MockDetachedBlobStorage();
		const loader = provider.makeTestLoader({
			...testContainerConfig,
			loaderProps: { detachedBlobStorage },
		});
		const serializeContainer = await loader.createDetachedContainer(
			provider.defaultCodeDetails,
		);

		const text = "this is some example text";
		const dataStore = await requestFluidObject<ITestDataObject>(serializeContainer, "default");
		dataStore._root.set(
			"my blob",
			await dataStore._runtime.uploadBlob(stringToBuffer(text, "utf-8")),
		);

		const snapshot = serializeContainer.serialize();
		serializeContainer.close();
		const rehydratedContainer = await loader.rehydrateDetachedContainerFromSnapshot(snapshot);

		const attachP = rehydratedContainer.attach(
			provider.driver.createCreateNewRequest(provider.documentId),
		);
		if (!driverSupportsBlobs(provider.driver)) {
			return assert.rejects(attachP, (err: IErrorBase) => err.message === usageErrorMessage);
		}
		await attachP;

		const url = await getUrlFromDetachedBlobStorage(rehydratedContainer, provider);
		const attachedContainer = await provider
			.makeTestLoader(testContainerConfig)
			.resolve({ url });
		const attachedDataStore = await requestFluidObject<ITestDataObject>(
			attachedContainer,
			"default",
		);
		await provider.ensureSynchronized();
		assert.strictEqual(
			bufferToString(await attachedDataStore._root.get("my blob").get(), "utf-8"),
			text,
		);
	});

	itExpects(
		"serialize/rehydrate multiple times then attach",
		ContainerCloseUsageError,
		async function () {
			const detachedBlobStorage = new MockDetachedBlobStorage();
			const loader = provider.makeTestLoader({
				...testContainerConfig,
				loaderProps: { detachedBlobStorage },
			});
			let container = await loader.createDetachedContainer(provider.defaultCodeDetails);

			const text = "this is some example text";
			const dataStore = await requestFluidObject<ITestDataObject>(container, "default");
			dataStore._root.set(
				"my blob",
				await dataStore._runtime.uploadBlob(stringToBuffer(text, "utf-8")),
			);

			let snapshot;
			for (const _ of Array(5)) {
				snapshot = container.serialize();
				container.close();
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
			const attachedDataStore = await requestFluidObject<ITestDataObject>(
				attachedContainer,
				"default",
			);
			await provider.ensureSynchronized();
			assert.strictEqual(
				bufferToString(await attachedDataStore._root.get("my blob").get(), "utf-8"),
				text,
			);
		},
	);

	it("rehydrating without detached blob storage results in error", async function () {
		const detachedBlobStorage = new MockDetachedBlobStorage();
		const loader = provider.makeTestLoader({
			...testContainerConfig,
			loaderProps: { detachedBlobStorage },
		});
		const serializeContainer = await loader.createDetachedContainer(
			provider.defaultCodeDetails,
		);

		const text = "this is some example text";
		const dataStore = await requestFluidObject<ITestDataObject>(serializeContainer, "default");
		dataStore._root.set(
			"my blob",
			await dataStore._runtime.uploadBlob(stringToBuffer(text, "utf-8")),
		);

		const snapshot = serializeContainer.serialize();
		serializeContainer.close();

		const loaderWithNoBlobStorage = provider.makeTestLoader(testContainerConfig);
		await assert.rejects(
			loaderWithNoBlobStorage.rehydrateDetachedContainerFromSnapshot(snapshot),
		);
	});

	// regression test for https://github.com/microsoft/FluidFramework/issues/9702
	// this was fixed in 0.58.3000
	it("correctly handles simultaneous identical blob upload on separate containers", async () => {
		const container1 = await provider.makeTestContainer(testContainerConfig);
		const container2 = await provider.loadTestContainer(testContainerConfig);
		const dataStore1 = await requestFluidObject<ITestDataObject>(container1, "default");
		const dataStore2 = await requestFluidObject<ITestDataObject>(container2, "default");
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
		const container1 = await provider.makeTestContainer(testContainerConfig);
		const dataStore1 = await requestFluidObject<ITestDataObject>(container1, "default");
		const runtimeStorage = (container1 as any).runtime.storage;

		let resolveUploadBlob = () => {};
		const uploadBlobPromise = new Promise<void>((resolve) => {
			resolveUploadBlob = resolve;
		});

		const uploadBlobWithDelay = async (target, thisArg, args) => {
			// Wait for the uploadBlobPromise to be resolved
			await uploadBlobPromise;
			const result = Reflect.apply(target, thisArg, args);
			return result;
		};

		const delayedUploadBlob = new Proxy(runtimeStorage.createBlob.bind(runtimeStorage), {
			async apply(target, thisArg, args) {
				return uploadBlobWithDelay(target, thisArg, args);
			},
		});
		runtimeStorage.createBlob = delayedUploadBlob;

		const handleP = dataStore1._runtime.uploadBlob(stringToBuffer("test string", "utf8"));

		container1.disconnect();
		container1.connect();
		await waitForContainerConnection(container1);

		let pendingBlobs: IPendingBlobs = await (container1 as any).runtime
			.getPendingLocalState()
			.then((s) => (s as IPendingRuntimeState).pendingAttachmentBlobs);
		assert.strictEqual(Object.values<any>(pendingBlobs).length, 1);
		const acked = Object.values<any>(pendingBlobs)[0].acked;
		assert.strictEqual(acked, false, "reconnection should not reupload pending blobs");
		// sending some ops to confirm pending blob is not blocking other ops
		dataStore1._root.set("key", "value");
		dataStore1._root.set("another key", "another value");
		await provider.ensureSynchronized();

		resolveUploadBlob();

		await assert.doesNotReject(handleP);
		pendingBlobs = await (container1 as any).runtime
			.getPendingLocalState()
			.then((s) => (s as IPendingRuntimeState).pendingAttachmentBlobs);
		assert.strictEqual(Object.values<any>(pendingBlobs)[0].acked, true);
		runtimeStorage.uploadBlob = delayedUploadBlob;
	});
});
