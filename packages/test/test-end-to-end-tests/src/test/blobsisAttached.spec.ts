/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { AttachState, IContainer, IHostLoader } from "@fluidframework/container-definitions";
import type { ISharedDirectory, ISharedMap, SharedDirectory } from "@fluidframework/map";
import {
	ChannelFactoryRegistry,
	ITestFluidObject,
	ITestContainerConfig,
	ITestObjectProvider,
	DataObjectFactoryType,
	createAndAttachContainer,
} from "@fluidframework/test-utils";
import { describeCompat } from "@fluid-private/test-version-utils";
import { stringToBuffer } from "@fluid-internal/client-utils";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { ContainerRuntime } from "@fluidframework/container-runtime";
// eslint-disable-next-line import/no-internal-modules
import { type IPendingRuntimeState } from "@fluidframework/container-runtime/test/containerRuntime";
import { MockDetachedBlobStorage, driverSupportsBlobs } from "./mockDetachedBlobStorage.js";

const mapId = "map";
const directoryId = "directoryKey";

describeCompat("blob handle isAttached", "NoCompat", (getTestObjectProvider, apis) => {
	const { SharedMap, SharedDirectory } = apis.dds;
	const registry: ChannelFactoryRegistry = [
		[mapId, SharedMap.getFactory()],
		[directoryId, SharedDirectory.getFactory()],
	];

	const testContainerConfig: ITestContainerConfig = {
		fluidDataObjectType: DataObjectFactoryType.Test,
		registry,
	};

	describe("from attached container", () => {
		let provider: ITestObjectProvider;
		let loader: IHostLoader;
		let container: IContainer;

		const runtimeOf = (dataObject: ITestFluidObject): ContainerRuntime =>
			dataObject.context.containerRuntime as ContainerRuntime;

		beforeEach("createContainer", async () => {
			provider = getTestObjectProvider();
			loader = provider.makeTestLoader(testContainerConfig);
			container = await createAndAttachContainer(
				provider.defaultCodeDetails,
				loader,
				provider.driver.createCreateNewRequest(provider.documentId),
			);
			provider.updateDocumentId(container.resolvedUrl);
		});

		it("blob is aborted before uploading", async function () {
			const testString = "this is a test string";
			const dataStore1 = (await container.getEntryPoint()) as ITestFluidObject;
			const ac = new AbortController();
			ac.abort("abort test");
			try {
				await dataStore1.runtime.uploadBlob(stringToBuffer(testString, "utf-8"), ac.signal);
				assert.fail("Should not succeed");
			} catch (error: any) {
				assert.strictEqual(error.status, undefined);
				assert.strictEqual(error.uploadTime, undefined);
				assert.strictEqual(error.acked, undefined);
			}

			const pendingState = (await runtimeOf(dataStore1).getPendingLocalState()) as
				| IPendingRuntimeState
				| undefined;
			assert.strictEqual(pendingState?.pendingAttachmentBlobs, undefined);
		});

		it("blob is aborted after upload succeds", async function () {
			const testString = "this is a test string";
			const dataStore1 = (await container.getEntryPoint()) as ITestFluidObject;
			const map = await dataStore1.getSharedObject<ISharedMap>(mapId);
			const ac = new AbortController();
			let blob: IFluidHandle<ArrayBufferLike>;
			try {
				blob = await dataStore1.runtime.uploadBlob(
					stringToBuffer(testString, "utf-8"),
					ac.signal,
				);
				ac.abort();
				map.set("key", blob);
			} catch (error: any) {
				assert.fail("Should succeed");
			}
			const pendingState = (await runtimeOf(dataStore1).getPendingLocalState({
				notifyImminentClosure: true,
			})) as IPendingRuntimeState | undefined;
			assert.strictEqual(pendingState?.pendingAttachmentBlobs, undefined);
		});

		it("blob is attached after usage in map", async function () {
			const testString = "this is a test string";
			const testKey = "a blob";
			const dataStore1 = (await container.getEntryPoint()) as ITestFluidObject;
			const map = await dataStore1.getSharedObject<ISharedMap>(mapId);

			const blob = await dataStore1.runtime.uploadBlob(stringToBuffer(testString, "utf-8"));
			assert.strictEqual(blob.isAttached, false);
			map.set(testKey, blob);
			assert.strictEqual(blob.isAttached, true);
		});

		it("blob is attached after usage in directory", async function () {
			const testString = "this is a test string";
			const testKey = "a blob";
			const dataStore1 = (await container.getEntryPoint()) as ITestFluidObject;
			const directory = await dataStore1.getSharedObject<SharedDirectory>(directoryId);

			const blob = await dataStore1.runtime.uploadBlob(stringToBuffer(testString, "utf-8"));
			assert.strictEqual(blob.isAttached, false);
			directory.set(testKey, blob);
			assert.strictEqual(blob.isAttached, true);
		});

		it("removes pending blob when waiting for blob to be attached", async function () {
			const testString = "this is a test string";
			const dataStore1 = (await container.getEntryPoint()) as ITestFluidObject;
			const map = await dataStore1.getSharedObject<ISharedMap>(mapId);
			const blob = await dataStore1.runtime.uploadBlob(stringToBuffer(testString, "utf-8"));
			const pendingStateP: any = runtimeOf(dataStore1).getPendingLocalState({
				notifyImminentClosure: true,
			});
			map.set("key", blob);
			const pendingState = await pendingStateP;
			assert.strictEqual(pendingState?.pendingAttachmentBlobs, undefined);
		});

		it("removes pending blob after attached and acked", async function () {
			const testString = "this is a test string";
			const testKey = "a blob";
			const dataStore1 = (await container.getEntryPoint()) as ITestFluidObject;

			const map = await dataStore1.getSharedObject<ISharedMap>(mapId);
			const blob = await dataStore1.runtime.uploadBlob(stringToBuffer(testString, "utf-8"));
			map.set(testKey, blob);
			const pendingState = (await runtimeOf(dataStore1).getPendingLocalState()) as
				| IPendingRuntimeState
				| undefined;
			assert.strictEqual(pendingState?.pendingAttachmentBlobs, undefined);
		});

		it("removes multiple pending blobs after attached and acked", async function () {
			const dataStore1 = (await container.getEntryPoint()) as ITestFluidObject;
			const map = await dataStore1.getSharedObject<ISharedMap>(mapId);
			const lots = 10;
			for (let i = 0; i < lots; i++) {
				const blob = await dataStore1.runtime.uploadBlob(stringToBuffer(`${i}`, "utf-8"));
				map.set(`${i}`, blob);
			}
			const pendingState = (await runtimeOf(dataStore1).getPendingLocalState()) as
				| IPendingRuntimeState
				| undefined;
			assert.strictEqual(pendingState?.pendingAttachmentBlobs, undefined);
		});
	});

	describe("from detached container", () => {
		let provider: ITestObjectProvider;
		let loader: IHostLoader;
		let container: IContainer;
		let detachedBlobStorage: MockDetachedBlobStorage;
		let detachedDataStore: ITestFluidObject;
		let map: ISharedMap;
		let directory: SharedDirectory;
		let text: string;
		let blobHandle: IFluidHandle<ArrayBufferLike>;

		beforeEach("createContainer", async function () {
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
			detachedDataStore = (await container.getEntryPoint()) as ITestFluidObject;
			map = SharedMap.create(detachedDataStore.runtime);
			directory = SharedDirectory.create(detachedDataStore.runtime);
			text = "this is some example text";
			blobHandle = await detachedDataStore.runtime.uploadBlob(stringToBuffer(text, "utf-8"));
		});

		const checkForDetachedHandles = (dds: ISharedMap | ISharedDirectory) => {
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

		const checkForAttachedHandles = (dds: ISharedMap | ISharedDirectory) => {
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
