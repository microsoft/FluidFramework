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
} from "@fluidframework/test-utils";
import { ExpectedEvents, describeNoCompat, itExpects } from "@fluid-internal/test-version-utils";
import { stringToBuffer } from "@fluidframework/common-utils";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { MockDetachedBlobStorage, driverSupportsBlobs } from "./mockDetachedBlobStorage";

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

const usageErrorMessage = "Empty file summary creation isn't supported in this driver.";

const containerCloseAndDisposeUsageErrors = [
	{ eventName: "fluid:telemetry:Container:ContainerClose", error: usageErrorMessage },
];
const ContainerCloseUsageError: ExpectedEvents = {
	routerlicious: containerCloseAndDisposeUsageErrors,
	tinylicious: containerCloseAndDisposeUsageErrors,
};

describeNoCompat("blob handle isAttached", (getTestObjectProvider) => {
	describe("from attached container", () => {
		let provider: ITestObjectProvider;
		let loader: IHostLoader;
		let container: IContainer;
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

		beforeEach(async () => {
			provider = getTestObjectProvider();
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
			assert.strictEqual(container.attachState, AttachState.Detached, "container should be detached");
			assert.strictEqual(detachedDataStore.handle.isAttached, false, "data store handle should be detached");
			assert.strictEqual(dds.handle.isAttached, false, "dds handle should be detached");
			assert.strictEqual(blobHandle.isAttached, false, "blob handle should be detached");
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

		itExpects(
			"after container is attached with map",
			ContainerCloseUsageError,
			async function () {
				detachedDataStore.root.set("map", map.handle);
				map.set("my blob", blobHandle);
				const attachP = container.attach(
					provider.driver.createCreateNewRequest(provider.documentId),
				);
				if (!driverSupportsBlobs(provider.driver)) {
					return assert.rejects(attachP, (err) => err.message === usageErrorMessage);
				}
				await attachP;
				detachedBlobStorage.blobs.clear();
				assert.strictEqual(container.attachState, AttachState.Attached, "container should be attached");
				assert.strictEqual(detachedDataStore.handle.isAttached, true);
				assert.strictEqual(map.handle.isAttached, true);
				assert.strictEqual(blobHandle.isAttached, true);
			},
		);

		itExpects(
			"after container is attached with directory",
			ContainerCloseUsageError,
			async function () {
				detachedDataStore.root.set(directoryId, directory.handle);
				directory.set("my blob", blobHandle);
				const attachP = container.attach(
					provider.driver.createCreateNewRequest(provider.documentId),
				);
				if (!driverSupportsBlobs(provider.driver)) {
					return assert.rejects(attachP, (err) => err.message === usageErrorMessage);
				}
				await attachP;
				detachedBlobStorage.blobs.clear();
				assert.strictEqual(container.attachState, AttachState.Attached);
				assert.strictEqual(detachedDataStore.handle.isAttached, true);
				assert.strictEqual(directory.handle.isAttached, true);
				assert.strictEqual(blobHandle.isAttached, true);
			},
		);
	});
});
