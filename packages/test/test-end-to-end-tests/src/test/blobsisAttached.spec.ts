/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { AttachState, IContainer, IHostLoader } from "@fluidframework/container-definitions";
import { SharedDirectory, SharedMap } from "@fluidframework/map";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
	ChannelFactoryRegistry,
	ITestFluidObject,
	ITestContainerConfig,
	ITestObjectProvider,
	DataObjectFactoryType,
	createAndAttachContainer,
	timeoutPromise,
} from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluid-internal/test-version-utils";
import { stringToBuffer } from "@fluidframework/common-utils";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { ContainerRuntime } from "@fluidframework/container-runtime";
// eslint-disable-next-line import/no-internal-modules
import { PendingLocalState } from "@fluidframework/container-runtime/dist/test";
import { MockDetachedBlobStorage, driverSupportsBlobs } from "./mockDetachedBlobStorage.js";

const mapId = "map";
const directoryId = "directoryKey";
const registry: ChannelFactoryRegistry = [
	[mapId, SharedMap.getFactory()],
	[directoryId, SharedDirectory.getFactory()],
];

const testContainerConfig: ITestContainerConfig = {
	fluidDataObjectType: DataObjectFactoryType.Test,
	registry,
};

describeNoCompat("blob handle isAttached", (getTestObjectProvider) => {
	describe("from attached container", () => {
		let provider: ITestObjectProvider;
		let loader: IHostLoader;
		let container: IContainer;

		const runtimeOf = (dataObject: ITestFluidObject): ContainerRuntime =>
			dataObject.context.containerRuntime as ContainerRuntime;

		const forceWriteMode = async (map, dataStore1): Promise<void> => {
			map.set("forceWrite", true);
			const runtime = runtimeOf(dataStore1);
			while (runtime.isDirty) {
				await timeoutPromise((resolve) => runtime.once("saved", resolve));
			}
			await provider.ensureSynchronized();
		};

		beforeEach(async () => {
			provider = getTestObjectProvider();
			loader = provider.makeTestLoader(testContainerConfig);
			container = await createAndAttachContainer(
				provider.defaultCodeDetails,
				loader,
				provider.driver.createCreateNewRequest(provider.documentId),
			);
			provider.updateDocumentId(container.resolvedUrl);
		});

		it("blob is attached after usage in map", async function () {
			const testString = "this is a test string";
			const testKey = "a blob";
			const dataStore1 = await requestFluidObject<ITestFluidObject>(container, "default");
			const map = await dataStore1.getSharedObject<SharedMap>(mapId);

			const blob = await dataStore1.runtime.uploadBlob(stringToBuffer(testString, "utf-8"));
			assert.strictEqual(blob.isAttached, false);
			map.set(testKey, blob);
			assert.strictEqual(blob.isAttached, true);
		});

		it("blob is attached after usage in directory", async function () {
			const testString = "this is a test string";
			const testKey = "a blob";
			const dataStore1 = await requestFluidObject<ITestFluidObject>(container, "default");
			const directory = await dataStore1.getSharedObject<SharedDirectory>(directoryId);

			const blob = await dataStore1.runtime.uploadBlob(stringToBuffer(testString, "utf-8"));
			assert.strictEqual(blob.isAttached, false);
			directory.set(testKey, blob);
			assert.strictEqual(blob.isAttached, true);
		});

		it("blob is acked after upload", async function () {
			const testString = "this is a test string";
			const dataStore1 = await requestFluidObject<ITestFluidObject>(container, "default");

			const map = await dataStore1.getSharedObject<SharedMap>(mapId);
			// force write mode to avoid reconnection while uploading the blob. This ensures uploadBlob
			// goes into online flow
			await forceWriteMode(map, dataStore1);

			const blob = await dataStore1.runtime.uploadBlob(stringToBuffer(testString, "utf-8"));
			const pendingBlobs = (runtimeOf(dataStore1).getPendingLocalState() as PendingLocalState)
				.pendingAttachmentBlobs;
			const acked = Object.values<any>(pendingBlobs)[0].acked;
			assert.strictEqual(blob.isAttached, false);
			assert.strictEqual(acked, true);
		});

		it("blob is acked after offline upload", async function () {
			const testString = "this is a test string";
			const dataStore1 = await requestFluidObject<ITestFluidObject>(container, "default");
			// by not calling forceWriteMode we are actually checking offline flow
			const blob = await dataStore1.runtime.uploadBlob(stringToBuffer(testString, "utf-8"));
			await provider.ensureSynchronized();
			const pendingBlobs = (runtimeOf(dataStore1).getPendingLocalState() as PendingLocalState)
				.pendingAttachmentBlobs;
			const acked = Object.values<any>(pendingBlobs)[0].acked;
			assert.strictEqual(blob.isAttached, false);
			assert.strictEqual(acked, true);
		});

		it("removes pending blob after attached and acked", async function () {
			const testString = "this is a test string";
			const testKey = "a blob";
			const dataStore1 = await requestFluidObject<ITestFluidObject>(container, "default");

			const map = await dataStore1.getSharedObject<SharedMap>(mapId);
			// force write mode to avoid reconnection while uploading the blob. This ensures uploadBlob
			// goes into online flow
			await forceWriteMode(map, dataStore1);

			const blob = await dataStore1.runtime.uploadBlob(stringToBuffer(testString, "utf-8"));
			map.set(testKey, blob);
			const pendingBlobs = (runtimeOf(dataStore1).getPendingLocalState() as PendingLocalState)
				.pendingAttachmentBlobs;
			assert.strictEqual(Object.keys(pendingBlobs).length, 0);
		});

		it("removes multiple pending blobs after attached and acked", async function () {
			const dataStore1 = await requestFluidObject<ITestFluidObject>(container, "default");
			const map = await dataStore1.getSharedObject<SharedMap>(mapId);
			// force write mode to avoid reconnection while uploading the blob. This ensures uploadBlob
			// goes into online flow
			await forceWriteMode(map, dataStore1);
			const lots = 10;
			for (let i = 0; i < lots; i++) {
				const blob = await dataStore1.runtime.uploadBlob(stringToBuffer(`${i}`, "utf-8"));
				map.set(`${i}`, blob);
			}
			const pendingBlobs = (runtimeOf(dataStore1).getPendingLocalState() as PendingLocalState)
				.pendingAttachmentBlobs;
			assert.strictEqual(Object.keys(pendingBlobs).length, 0);
		});
	});

	describe("from detached container", () => {
		let provider: ITestObjectProvider;
		let loader: IHostLoader;
		let container: IContainer;
		let detachedBlobStorage: MockDetachedBlobStorage;
		let detachedDataStore: ITestFluidObject;
		let map: SharedMap;
		let directory: SharedDirectory;
		let text: string;
		let blobHandle: IFluidHandle<ArrayBufferLike>;

		beforeEach(async function () {
			provider = getTestObjectProvider();
			if (!driverSupportsBlobs(provider.driver)) {
				this.skip();
			}
			detachedBlobStorage = new MockDetachedBlobStorage();
			loader = provider.makeTestLoader({
				...testContainerConfig,
				loaderProps: { detachedBlobStorage },
			});
			container = await loader.createDetachedContainer(provider.defaultCodeDetails);
			provider.updateDocumentId(container.resolvedUrl);
			detachedDataStore = await requestFluidObject<ITestFluidObject>(container, "default");
			map = SharedMap.create(detachedDataStore.runtime);
			directory = SharedDirectory.create(detachedDataStore.runtime);
			text = "this is some example text";
			blobHandle = await detachedDataStore.runtime.uploadBlob(stringToBuffer(text, "utf-8"));
		});

		const checkForDetachedHandles = (dds: SharedMap | SharedDirectory) => {
			assert.strictEqual(
				container.attachState,
				AttachState.Detached,
				"container should be detached",
			);
			assert.strictEqual(
				detachedDataStore.handle.isAttached,
				false,
				"data store handle should be detached",
			);
			assert.strictEqual(dds.handle.isAttached, false, "dds handle should be detached");
			assert.strictEqual(blobHandle.isAttached, false, "blob handle should be detached");
		};

		const checkForAttachedHandles = (dds: SharedMap | SharedDirectory) => {
			assert.strictEqual(
				container.attachState,
				AttachState.Attached,
				"container should be attached",
			);
			assert.strictEqual(
				detachedDataStore.handle.isAttached,
				true,
				"data store handle should be attached",
			);
			assert.strictEqual(dds.handle.isAttached, true, "dds handle should be attached");
			assert.strictEqual(blobHandle.isAttached, true, "blob handle should be attached");
		};

		it("all detached", async function () {
			checkForDetachedHandles(map);
			checkForDetachedHandles(directory);
		});

		it("after map is set in root directory", async function () {
			detachedDataStore.root.set(mapId, map.handle);
			checkForDetachedHandles(map);
		});

		it("after directory is set in root directory", async function () {
			detachedDataStore.root.set(directoryId, directory.handle);
			checkForDetachedHandles(directory);
		});

		it("after blob handle is set in map", async function () {
			detachedDataStore.root.set("map", map.handle);
			map.set("my blob", blobHandle);
			checkForDetachedHandles(map);
		});

		it("after blob handle is set in directory", async function () {
			detachedDataStore.root.set(directoryId, directory.handle);
			directory.set("my blob", blobHandle);
			checkForDetachedHandles(directory);
		});

		it("after container is attached with map", async function () {
			detachedDataStore.root.set("map", map.handle);
			map.set("my blob", blobHandle);
			await container.attach(provider.driver.createCreateNewRequest(provider.documentId));
			detachedBlobStorage.blobs.clear();
			checkForAttachedHandles(map);
		});

		it("after container is attached with directory", async function () {
			detachedDataStore.root.set(directoryId, directory.handle);
			directory.set("my blob", blobHandle);
			await container.attach(provider.driver.createCreateNewRequest(provider.documentId));
			detachedBlobStorage.blobs.clear();
			checkForAttachedHandles(directory);
		});

		it("after container is attached and dds is detached in map", async function () {
			map.set("my blob", blobHandle);
			await container.attach(provider.driver.createCreateNewRequest(provider.documentId));
			assert.strictEqual(
				map.handle.isAttached,
				false,
				"map should be detached after container attaches",
			);
			assert.strictEqual(
				blobHandle.isAttached,
				false,
				"blob should be detached in a detached dds and attached container",
			);
			detachedBlobStorage.blobs.clear();
			detachedDataStore.root.set(mapId, map.handle);
			assert.strictEqual(
				map.handle.isAttached,
				true,
				"map should be attached after dds attaches",
			);
			assert.strictEqual(
				blobHandle.isAttached,
				true,
				"blob should be attached in an attached dds",
			);
		});

		it("after container is attached and dds is detached in directory", async function () {
			directory.set("my blob", blobHandle);
			await container.attach(provider.driver.createCreateNewRequest(provider.documentId));
			assert.strictEqual(
				directory.handle.isAttached,
				false,
				"directory should be detached after container attaches",
			);
			assert.strictEqual(
				blobHandle.isAttached,
				false,
				"blob should be detached in a detached dds and attached container",
			);
			detachedBlobStorage.blobs.clear();
			detachedDataStore.root.set(directoryId, directory.handle);
			assert.strictEqual(
				directory.handle.isAttached,
				true,
				"directory should be attached after dds attaches",
			);
			assert.strictEqual(
				blobHandle.isAttached,
				true,
				"blob should be attached in an attached dds",
			);
		});
	});
});
