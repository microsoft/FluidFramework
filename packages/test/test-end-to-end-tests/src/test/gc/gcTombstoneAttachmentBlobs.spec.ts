/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { stringToBuffer } from "@fluid-internal/client-utils";
import { ITestDataObject, describeCompat, itExpects } from "@fluid-private/test-version-utils";
import { IContainer, LoaderHeader } from "@fluidframework/container-definitions/internal";
import {
	ContainerRuntime,
	IGCRuntimeOptions,
} from "@fluidframework/container-runtime/internal";
import { delay } from "@fluidframework/core-utils/internal";
import { toFluidHandleInternal } from "@fluidframework/runtime-utils/internal";
import {
	ITestContainerConfig,
	ITestObjectProvider,
	createSummarizer,
	createTestConfigProvider,
	summarizeNow,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";

import {
	MockDetachedBlobStorage,
	driverSupportsBlobs,
	getUrlFromDetachedBlobStorage,
} from "../mockDetachedBlobStorage.js";

import { waitForContainerWriteModeConnectionWrite } from "./gcTestSummaryUtils.js";

/**
 * These tests validate that SweepReady attachment blobs are correctly marked as tombstones. Tombstones should be added
 * to the summary and changing them (sending / receiving ops, loading, etc.) is not allowed.
 */
describeCompat("GC attachment blob tombstone tests", "NoCompat", (getTestObjectProvider) => {
	const tombstoneTimeoutMs = 200;
	const configProvider = createTestConfigProvider();
	const gcOptions: IGCRuntimeOptions = {
		inactiveTimeoutMs: 0,
		enableGCSweep: true,
	};
	const testContainerConfig: ITestContainerConfig = {
		runtimeOptions: {
			summaryOptions: {
				summaryConfigOverrides: {
					state: "disabled",
				},
			},
			gcOptions,
		},
		loaderProps: { configProvider },
	};

	const summarizerContainerConfig: ITestContainerConfig = {
		runtimeOptions: { gcOptions },
		loaderProps: { configProvider },
	};

	let provider: ITestObjectProvider;

	async function loadContainer(summaryVersion: string) {
		return provider.loadTestContainer(testContainerConfig, {
			[LoaderHeader.version]: summaryVersion,
		});
	}

	beforeEach("setup", async function () {
		provider = getTestObjectProvider({ syncSummarizer: true });
		if (!driverSupportsBlobs(provider.driver)) {
			this.skip();
		}
		configProvider.set(
			"Fluid.GarbageCollection.TestOverride.TombstoneTimeoutMs",
			tombstoneTimeoutMs,
		);
	});

	afterEach(() => {
		configProvider.clear();
	});

	describe("Attachment blobs in attached container", () => {
		async function createDataStoreAndSummarizer() {
			const container = await provider.makeTestContainer(testContainerConfig);
			const dataStore = (await container.getEntryPoint()) as ITestDataObject;

			// Send an op to transition the container to write mode.
			dataStore._root.set("transition to write", "true");
			await waitForContainerConnection(container);

			const { summarizer } = await createSummarizer(
				provider,
				container,
				summarizerContainerConfig,
			);

			return { dataStore, summarizer };
		}

		itExpects(
			"fails retrieval of tombstones attachment blobs",
			[
				{
					eventName:
						"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_Blob_Requested",
					clientType: "interactive",
				},
				{
					eventName:
						"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_Blob_Requested",
					clientType: "noninteractive/summarizer",
				},
			],
			async () => {
				const { dataStore: mainDataStore, summarizer } = await createDataStoreAndSummarizer();

				// Upload an attachment blob.
				const blobContents = "Blob contents";
				const blobHandle = toFluidHandleInternal(
					await mainDataStore._runtime.uploadBlob(stringToBuffer(blobContents, "utf-8")),
				);

				// Reference and then unreference the blob so that it's unreferenced in the next summary.
				mainDataStore._root.set("blob1", blobHandle);
				mainDataStore._root.delete("blob1");

				// Summarize so that the above attachment blobs are marked unreferenced.
				await provider.ensureSynchronized();
				await summarizeNow(summarizer);

				// Wait for tombstone timeout so that the blobs are tombstoned.
				await delay(tombstoneTimeoutMs + 10);

				// Send an op to update the current reference timestamp that GC uses to make sweep ready objects.
				mainDataStore._root.set("key", "value");
				await provider.ensureSynchronized();

				// Summarize so that the tombstoned blobs are now part of the summary.
				const summary2 = await summarizeNow(summarizer);
				const container2 = await loadContainer(summary2.summaryVersion);

				// Retrieving the blob should fail. Note that the blob is requested via its url since this container does
				// not have access to the blob's handle since it loaded after the blob was tombstoned.
				const entryPoint2 = (await container2.getEntryPoint()) as ITestDataObject;
				const containerRuntime2 = entryPoint2._context.containerRuntime as ContainerRuntime;
				const response = await containerRuntime2.resolveHandle({
					url: blobHandle.absolutePath,
				});
				assert.strictEqual(response?.status, 404, `Expecting a 404 response`);
				assert.equal(
					response.value,
					`Blob was tombstoned: ${blobHandle.absolutePath}`,
					`Unexpected response value`,
				);
				assert(container2.closed !== true, "Container should not have closed");

				// But the summarizing container should succeed (logging and error)
				const { container: summarizingContainer, summarizer: summarizer2 } =
					await createSummarizer(
						provider,
						container2,
						summarizerContainerConfig,
						summary2.summaryVersion,
					);
				const summarizer2Runtime = (summarizer2 as any).runtime as ContainerRuntime;
				const summarizingResponse = await summarizer2Runtime.resolveHandle({
					url: blobHandle.absolutePath,
				});
				assert.strictEqual(summarizingResponse?.status, 200, `Expecting a 200 response`);
				assert(summarizingResponse.value !== undefined, `Expecting a value`);
				assert(summarizingContainer.closed !== true, "Container should not have closed");
			},
		);

		itExpects(
			"fails retrieval of blobs that are de-duped in same container and are tombstoned",
			[
				{
					eventName:
						"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_Blob_Requested",
					clientType: "interactive",
				},
				{
					eventName:
						"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_Blob_Requested",
					clientType: "interactive",
				},
			],
			async () => {
				const { dataStore: mainDataStore, summarizer } = await createDataStoreAndSummarizer();

				// Upload an attachment blob.
				const blobContents = "Blob contents";
				const blobHandle1 = await mainDataStore._runtime.uploadBlob(
					stringToBuffer(blobContents, "utf-8"),
				);

				// Upload another blob with the same content so that it is de-duped.
				const blobHandle2 = await mainDataStore._runtime.uploadBlob(
					stringToBuffer(blobContents, "utf-8"),
				);

				// Reference and then unreference the blob via one of the handles so that it's unreferenced in next summary.
				mainDataStore._root.set("blob1", blobHandle1);
				mainDataStore._root.delete("blob1");

				// Summarize so that the above attachment blobs are marked unreferenced.
				await provider.ensureSynchronized();
				await summarizeNow(summarizer);

				// Wait for tombstone timeout so that the blobs are tombstoned.
				await delay(tombstoneTimeoutMs + 10);

				// Send an op to update the current reference timestamp that GC uses to make sweep ready objects.
				mainDataStore._root.set("key", "value");
				await provider.ensureSynchronized();

				// Summarize so that te tombstoned blobs are now part of the summary.
				const summary2 = await summarizeNow(summarizer);

				// Load a container from the above summary. Retrieving the blob via any of the handles should fail. Note
				// that the blob is requested via its url since this container does not have access to the blob's handle.
				const container2 = await loadContainer(summary2.summaryVersion);
				const entryPoint2 = (await container2.getEntryPoint()) as ITestDataObject;
				const containerRuntime2 = entryPoint2._context.containerRuntime as ContainerRuntime;
				const response1 = await containerRuntime2.resolveHandle({
					url: toFluidHandleInternal(blobHandle1).absolutePath,
				});
				assert.strictEqual(
					response1?.status,
					404,
					`Expecting a 404 response for blob handle 1`,
				);
				assert(
					response1.value.startsWith("Blob was tombstoned:"),
					`Unexpected response value for blob handle 1`,
				);

				const response2 = await containerRuntime2.resolveHandle({
					url: toFluidHandleInternal(blobHandle2).absolutePath,
				});
				assert.strictEqual(
					response2?.status,
					404,
					`Expecting a 404 response for blob handle 2`,
				);
				assert(
					response2.value.startsWith("Blob was tombstoned:"),
					`Unexpected response value for blob handle 2`,
				);
			},
		);

		itExpects(
			"Can un-tombstone attachment blob by storing a handle",
			[
				{
					eventName:
						"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_Blob_Requested",
					clientType: "interactive",
				},
			],
			async () => {
				const { dataStore: mainDataStore, summarizer } = await createDataStoreAndSummarizer();

				// Upload an attachment blob.
				const blobContents = "Blob contents";
				const blobHandle1 = await mainDataStore._runtime.uploadBlob(
					stringToBuffer(blobContents, "utf-8"),
				);

				// Reference and then unreference the blob so that it's unreferenced in next summary.
				mainDataStore._root.set("blob1", blobHandle1);
				mainDataStore._root.delete("blob1");

				// Summarize so that the above attachment blob is marked unreferenced.
				await provider.ensureSynchronized();
				await summarizeNow(summarizer);

				// Wait for tombstone timeout so that the blob is tombstoned.
				await delay(tombstoneTimeoutMs + 10);

				// Send an op to update the current reference timestamp that GC uses to make sweep ready objects.
				mainDataStore._root.set("key", "value");
				await provider.ensureSynchronized();

				// Summarize so that the tombstoned blob is now part of the summary.
				const summary2 = await summarizeNow(summarizer);

				// Load a container from the above summary. Retrieving the blob should fail. Note that the blob is requested
				// via its url since this container does not have access to the blob's handle.
				const container2 = await loadContainer(summary2.summaryVersion);
				const entryPoint2 = (await container2.getEntryPoint()) as ITestDataObject;
				const containerRuntime2 = entryPoint2._context.containerRuntime as ContainerRuntime;
				const response1 = await containerRuntime2.resolveHandle({
					url: toFluidHandleInternal(blobHandle1).absolutePath,
				});
				assert.strictEqual(
					response1?.status,
					404,
					`Expecting a 404 response for blob handle 1`,
				);
				assert(
					response1.value.startsWith("Blob was tombstoned:"),
					`Unexpected response value for blob handle 1`,
				);
				container2.close();

				// Reference the blob in the main container where it's not a tombstone yet. This should un-tombstone the
				// blob.
				mainDataStore._root.set("blob1", blobHandle1);

				// Summarize so that the blob is not a tombstone in the summary.
				await provider.ensureSynchronized();
				const summary3 = await summarizeNow(summarizer);

				// Load a container from the above summary. Retrieving the blob should now pass. Note that the blob is
				// requested via its url since this container does not have access to the blob's handle.
				const container3 = await loadContainer(summary3.summaryVersion);
				const entryPoint3 = (await container3.getEntryPoint()) as ITestDataObject;
				const containerRuntime3 = entryPoint3._context.containerRuntime as ContainerRuntime;
				const response2 = await containerRuntime3.resolveHandle({
					url: toFluidHandleInternal(blobHandle1).absolutePath,
				});
				assert.strictEqual(
					response2?.status,
					200,
					`Expecting a 200 response for blob handle 1`,
				);
			},
		);

		itExpects(
			"logs tombstone event on retrieval of tombstones attachment blobs when ThrowOnTombstoneLoad is not enabled",
			[
				{
					eventName:
						"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_Blob_Requested",
					clientType: "interactive",
				},
			],
			async () => {
				// Disable ThrowOnTombstoneLoad setting.
				configProvider.set("Fluid.GarbageCollection.DisableThrowOnTombstoneLoad", true);

				const { dataStore: mainDataStore, summarizer } = await createDataStoreAndSummarizer();

				// Upload an attachment blob.
				const blobContents = "Blob contents";
				const blobHandle = await mainDataStore._runtime.uploadBlob(
					stringToBuffer(blobContents, "utf-8"),
				);

				// Reference and then unreference the blob so that it's unreferenced in the next summary.
				mainDataStore._root.set("blob1", blobHandle);
				mainDataStore._root.delete("blob1");

				// Summarize so that the above attachment blobs are marked unreferenced.
				await provider.ensureSynchronized();
				await summarizeNow(summarizer);

				// Wait for tombstone timeout so that the blobs are tombstoned.
				await delay(tombstoneTimeoutMs + 10);

				// Send an op to update the current reference timestamp that GC uses to make sweep ready objects.
				mainDataStore._root.set("key", "value");
				await provider.ensureSynchronized();

				// Summarize so that the tombstoned blobs are now part of the summary.
				const summary2 = await summarizeNow(summarizer);
				const container2 = await loadContainer(summary2.summaryVersion);

				// Retrieving the blob should fail. Note that the blob is requested via its url since this container does
				// not have access to the blob's handle.
				const entryPoint2 = (await container2.getEntryPoint()) as ITestDataObject;
				const containerRuntime2 = entryPoint2._context.containerRuntime as ContainerRuntime;
				const response = await containerRuntime2.resolveHandle({
					url: toFluidHandleInternal(blobHandle).absolutePath,
				});
				assert.strictEqual(response?.status, 200, `Expecting a 200 response`);
				assert(container2.closed !== true, "Container should not have closed");
			},
		);

		/**
		 * This test validates that when blobs are de-duped in different containers, these containers can use these
		 * blobs irrespective of whether the original blob is tombstoned. Basically, after uploading a blob, a container
		 * should be able to use it the same way whether it was de-duped or not.
		 */
		it("should allow access to blobs that are de-duped in different containers", async () => {
			const { dataStore: mainDataStore, summarizer } = await createDataStoreAndSummarizer();

			// Upload an attachment blob.
			const blobContents = "Blob contents";
			const blobHandle = await mainDataStore._runtime.uploadBlob(
				stringToBuffer(blobContents, "utf-8"),
			);

			// Reference and then unreference the blob so that it's unreferenced in the next summary.
			mainDataStore._root.set("blob1", blobHandle);
			mainDataStore._root.delete("blob1");

			// Summarize so that the above attachment blobs are marked unreferenced.
			await provider.ensureSynchronized();
			const summary1 = await summarizeNow(summarizer);

			// Wait for half tombstone timeout and load a container. This container will upload a blob with the same content
			// as above so that it is de-duped. This container should be able to use this blob until its session
			// expires.
			await delay(tombstoneTimeoutMs / 2);
			const container2 = await loadContainer(summary1.summaryVersion);
			const container2MainDataStore = (await container2.getEntryPoint()) as ITestDataObject;
			// Upload the blob and keep the handle around until the blob uploaded by first container is tombstoned.
			const container2BlobHandle = await container2MainDataStore._runtime.uploadBlob(
				stringToBuffer(blobContents, "utf-8"),
			);

			// Wait for tombstone timeout so that the blob uploaded by the first container is tombstoned.
			await delay(tombstoneTimeoutMs / 2 + 10);

			// Send an op to update the current reference timestamp that GC uses to make sweep ready objects.
			mainDataStore._root.set("key", "value");
			await provider.ensureSynchronized();

			// Summarize so that the tombstoned blob is now part of the summary.
			const summary2 = await summarizeNow(summarizer);

			// Load a container from this summary and upload a blob with the same content as the tombstoned blob.
			// This blob will get de-duped but it should be fine to use it because from this container's perspective
			// it uploaded a brand new blob.
			const container3 = await loadContainer(summary2.summaryVersion);
			const container3MainDataStore = (await container3.getEntryPoint()) as ITestDataObject;

			const container3BlobHandle = await container3MainDataStore._runtime.uploadBlob(
				stringToBuffer(blobContents, "utf-8"),
			);
			await assert.doesNotReject(
				container3BlobHandle.get(),
				"Container3 should be able to get the blob",
			);

			// Reference the blob in container2 and container3 which should be valid. There should not be any asserts
			// or errors logged in any container because of this.
			container2MainDataStore._root.set("container2BlobHandle", container2BlobHandle);
			container3MainDataStore._root.set("container3BlobHandle", container3BlobHandle);

			// Wait for the above ops to be processed. They should not result in errors in containers where the blob
			// is tombstoned.
			await provider.ensureSynchronized();
		});
	});

	describe("Attachment blobs in detached container", () => {
		/**
		 * Creates a detached container and returns it along with the default data store.
		 */
		async function createDetachedContainerAndDataStore() {
			const detachedBlobStorage = new MockDetachedBlobStorage();
			const loader = provider.makeTestLoader({
				...testContainerConfig,
				loaderProps: { ...testContainerConfig.loaderProps, detachedBlobStorage },
			});
			const mainContainer = await loader.createDetachedContainer(provider.defaultCodeDetails);
			const mainDataStore = (await mainContainer.getEntryPoint()) as ITestDataObject;
			return { mainContainer, mainDataStore };
		}

		itExpects(
			"tombstones blobs uploaded in detached container",
			[
				{
					eventName:
						"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_Blob_Requested",
					clientType: "interactive",
				},
			],
			async () => {
				const { mainContainer, mainDataStore } = await createDetachedContainerAndDataStore();

				// Upload an attachment blob and mark it referenced by storing its handle in a DDS.
				const blobContents = "Blob contents";
				const blobHandle = await mainDataStore._context.uploadBlob(
					stringToBuffer(blobContents, "utf-8"),
				);
				mainDataStore._root.set("blob", blobHandle);

				// Attach the container after the blob is uploaded.
				await mainContainer.attach(
					provider.driver.createCreateNewRequest(provider.documentId),
				);

				// Send an op to transition the container to write mode.
				mainDataStore._root.set("transition to write", "true");
				await waitForContainerConnection(mainContainer);

				const { summarizer } = await createSummarizer(
					provider,
					mainContainer,
					summarizerContainerConfig,
				);

				// Remove the blob's handle to unreference it.
				mainDataStore._root.delete("blob");

				// Summarize so that the above attachment blob is marked unreferenced.
				await provider.ensureSynchronized();
				await summarizeNow(summarizer);

				// Wait for tombstone timeout so that the blob is tombstoned.
				await delay(tombstoneTimeoutMs + 10);

				// Send an op to update the current reference timestamp that GC uses to make sweep ready objects.
				mainDataStore._root.set("key", "value");
				await provider.ensureSynchronized();

				// Summarize so that the tombstoned blob should are now part of the summary.
				const summary2 = await summarizeNow(summarizer);

				// Load a new container from the above summary which should have the blob tombstoned.
				const url = await getUrlFromDetachedBlobStorage(mainContainer, provider);
				const container2 = await provider.makeTestLoader(testContainerConfig).resolve({
					url,
					headers: { [LoaderHeader.version]: summary2.summaryVersion },
				});

				// Retrieving the blob should fail. Note that the blob is requested via its url since this container does
				// not have access to the blob's handle.
				const entryPoint2 = (await container2.getEntryPoint()) as ITestDataObject;
				const containerRuntime2 = entryPoint2._context.containerRuntime as ContainerRuntime;
				const response = await containerRuntime2.resolveHandle({
					url: toFluidHandleInternal(blobHandle).absolutePath,
				});
				assert.strictEqual(response?.status, 404, `Expecting a 404 response`);
				assert(response.value.startsWith("Blob was tombstoned:"), `Unexpected response value`);
				assert(container2.closed !== true, "Container should not have closed");
			},
		);

		itExpects(
			"tombstones blobs uploaded in detached and de-duped in attached container",
			[
				{
					eventName:
						"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_Blob_Requested",
					clientType: "interactive",
				},
				{
					eventName:
						"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_Blob_Requested",
					clientType: "interactive",
				},
			],
			async () => {
				const { mainContainer, mainDataStore } = await createDetachedContainerAndDataStore();

				// Upload an attachment blob. We should get a handle with a localId for the blob. Mark it referenced by
				// storing its handle in a DDS.
				const blobContents = "Blob contents";
				const localHandle1 = await mainDataStore._context.uploadBlob(
					stringToBuffer(blobContents, "utf-8"),
				);
				mainDataStore._root.set("local1", localHandle1);

				// Attach the container after the blob is uploaded.
				await mainContainer.attach(
					provider.driver.createCreateNewRequest(provider.documentId),
				);

				// Send an op to transition the container to write mode.
				mainDataStore._root.set("transition to write", "true");
				await waitForContainerConnection(mainContainer);

				// Upload the same blob. This will get de-duped and we will get back another local handle. Both the these
				// localIds should be mapped to the same storageId.
				const localHandle2 = await mainDataStore._context.uploadBlob(
					stringToBuffer(blobContents, "utf-8"),
				);
				assert.notStrictEqual(
					toFluidHandleInternal(localHandle1).absolutePath,
					toFluidHandleInternal(localHandle2).absolutePath,
					"The two local ids should be different",
				);

				// Add the new local handle and then remove both the handles to unreference the blob.
				mainDataStore._root.set("local2", localHandle2);
				mainDataStore._root.delete("local1");
				mainDataStore._root.delete("local2");

				const { summarizer } = await createSummarizer(
					provider,
					mainContainer,
					summarizerContainerConfig,
				);

				// Summarize so that the above attachment blob is marked unreferenced.
				await provider.ensureSynchronized();
				await summarizeNow(summarizer);

				// Wait for tombstone timeout so that the blob is tombstoned.
				await delay(tombstoneTimeoutMs + 10);

				// Send an op to update the current reference timestamp that GC uses to make sweep ready objects.
				mainDataStore._root.set("key", "value");
				await provider.ensureSynchronized();

				// Summarize so that the tombstoned blob is now  part of the summary.
				const summary2 = await summarizeNow(summarizer);

				// Load a new container from the above summary which should have the blob tombstoned.
				const url = await getUrlFromDetachedBlobStorage(mainContainer, provider);
				const container2 = await provider.makeTestLoader(testContainerConfig).resolve({
					url,
					headers: { [LoaderHeader.version]: summary2.summaryVersion },
				});

				// Retrieving the blob via any of the handles should fail. Note that the blob is requested via its url since
				// this container does not have access to the blob's handle.
				const entryPoint2 = (await container2.getEntryPoint()) as ITestDataObject;
				const containerRuntime2 = entryPoint2._context.containerRuntime as ContainerRuntime;
				const localResponse1 = await containerRuntime2.resolveHandle({
					url: toFluidHandleInternal(localHandle1).absolutePath,
				});
				assert.strictEqual(
					localResponse1?.status,
					404,
					`Expecting a 404 response for local handle`,
				);
				assert(
					localResponse1.value.startsWith("Blob was tombstoned:"),
					`Unexpected value for local handle 1`,
				);

				const localResponse2 = await containerRuntime2.resolveHandle({
					url: toFluidHandleInternal(localHandle2).absolutePath,
				});
				assert.strictEqual(
					localResponse2?.status,
					404,
					`Expecting a 404 response for storage handle`,
				);
				assert(
					localResponse2.value.startsWith("Blob was tombstoned:"),
					`Unexpected value for local handle 2`,
				);
			},
		);

		itExpects(
			"tombstones blobs uploaded and de-duped in detached container",
			[
				{
					eventName:
						"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_Blob_Requested",
					clientType: "interactive",
				},
				{
					eventName:
						"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_Blob_Requested",
					clientType: "interactive",
				},
				{
					eventName:
						"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_Blob_Requested",
					clientType: "interactive",
				},
			],
			async () => {
				const { mainContainer, mainDataStore } = await createDetachedContainerAndDataStore();

				// Upload couple of attachment blobs with the same content. When these blobs are uploaded to the server,
				// they will be de-duped and redirect to the same storageId.
				const blobContents = "Blob contents";
				const localHandle1 = await mainDataStore._context.uploadBlob(
					stringToBuffer(blobContents, "utf-8"),
				);
				const localHandle2 = await mainDataStore._context.uploadBlob(
					stringToBuffer(blobContents, "utf-8"),
				);

				// Attach the container after the blob is uploaded.
				await mainContainer.attach(
					provider.driver.createCreateNewRequest(provider.documentId),
				);

				// Send an op to transition the container to write mode.
				mainDataStore._root.set("transition to write", "true");
				await waitForContainerConnection(mainContainer);

				const { summarizer } = await createSummarizer(
					provider,
					mainContainer,
					summarizerContainerConfig,
				);

				// Add the blob's local handles to reference them.
				mainDataStore._root.set("local1", localHandle1);
				mainDataStore._root.set("local2", localHandle2);

				// Upload the same blob. This will get de-duped and we will get back another local handle. Both this and
				// the blob uploaded in detached mode should be mapped to the same storageId.
				const localHandle3 = await mainDataStore._context.uploadBlob(
					stringToBuffer(blobContents, "utf-8"),
				);
				assert.notStrictEqual(
					toFluidHandleInternal(localHandle1).absolutePath,
					toFluidHandleInternal(localHandle3).absolutePath,
					"local handles should be different",
				);
				mainDataStore._root.set("local3", localHandle3);

				// Remove the blob's local handles to unreference them.
				mainDataStore._root.delete("local1");
				mainDataStore._root.delete("local2");
				mainDataStore._root.delete("local3");

				// Summarize so that the above attachment blobs are marked unreferenced.
				await provider.ensureSynchronized();
				await summarizeNow(summarizer);

				// Wait for tombstone timeout so that the blob is tombstoned.
				await delay(tombstoneTimeoutMs + 10);

				// Send an op to update the current reference timestamp that GC uses to make sweep ready objects.
				mainDataStore._root.set("key", "value");
				await provider.ensureSynchronized();

				// Summarize so that the tombstoned blobs are now part of the summary.
				const summary2 = await summarizeNow(summarizer);

				// Load a new container from the above summary which should have the blobs tombstoned.
				const url = await getUrlFromDetachedBlobStorage(mainContainer, provider);
				const container2 = await provider.makeTestLoader(testContainerConfig).resolve({
					url,
					headers: { [LoaderHeader.version]: summary2.summaryVersion },
				});

				// Retrieving the blob via any of the handles should fail. Note that the blob is requested via its url since
				// this container does not have access to the blob's handle.
				const entryPoint2 = (await container2.getEntryPoint()) as ITestDataObject;
				const containerRuntime2 = entryPoint2._context.containerRuntime as ContainerRuntime;
				const localResponse1 = await containerRuntime2.resolveHandle({
					url: toFluidHandleInternal(localHandle1).absolutePath,
				});
				assert.strictEqual(
					localResponse1?.status,
					404,
					`Expecting a 404 response for local handle 1`,
				);
				assert(
					localResponse1.value.startsWith("Blob was tombstoned:"),
					`Unexpected value for local handle 1`,
				);

				const localResponse2 = await containerRuntime2.resolveHandle({
					url: toFluidHandleInternal(localHandle2).absolutePath,
				});
				assert.strictEqual(
					localResponse2?.status,
					404,
					`Expecting a 404 response for local handle 2`,
				);
				assert(
					localResponse2.value.startsWith("Blob was tombstoned:"),
					`Unexpected value for local handle 2`,
				);

				const localResponse3 = await containerRuntime2.resolveHandle({
					url: toFluidHandleInternal(localHandle3).absolutePath,
				});
				assert.strictEqual(
					localResponse3?.status,
					404,
					`Expecting a 404 response for storage handle`,
				);
				assert(
					localResponse3.value.startsWith("Blob was tombstoned:"),
					`Unexpected value for local handle 3`,
				);
			},
		);
	});

	describe("Attachment blobs in disconnected container", () => {
		/**
		 * Creates a container and returns it along with the default data store.
		 */
		async function createContainerAndDataStore() {
			const mainContainer = await provider.makeTestContainer(testContainerConfig);
			const mainDataStore = (await mainContainer.getEntryPoint()) as ITestDataObject;
			await waitForContainerConnection(mainContainer);
			return { mainContainer, mainDataStore };
		}

		/**
		 * Creates a summarizer, does an initial summary and returns the summarizer. The initial summary is done so
		 * that GarbageCollector has initial GC data. When GC runs next with the attachment blobs, it has a previous
		 * GC data to validate references against and ensure that gcUnknownOutboundReferences error is not logged.
		 */
		async function createSummarizerWithInitialSummary(container: IContainer) {
			const { summarizer } = await createSummarizer(
				provider,
				container,
				summarizerContainerConfig,
			);
			await provider.ensureSynchronized();
			await summarizeNow(summarizer);
			return summarizer;
		}

		itExpects(
			"tombstones blobs uploaded in disconnected container",
			[
				{
					eventName:
						"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_Blob_Requested",
					clientType: "interactive",
				},
			],
			async () => {
				const { mainContainer, mainDataStore } = await createContainerAndDataStore();

				// Create a summarizer which does an initial summary.
				const summarizer = await createSummarizerWithInitialSummary(mainContainer);

				// Disconnect the main container, upload an attachment blob and mark it referenced.
				mainContainer.disconnect();
				const blobContents = "Blob contents";
				const blobHandleP = mainDataStore._context.uploadBlob(
					stringToBuffer(blobContents, "utf-8"),
				);

				// Connect the container after the blob is uploaded. Send an op to transition it to write mode.
				mainContainer.connect();
				mainDataStore._root.set("transition to write", "true");
				await waitForContainerWriteModeConnectionWrite(mainContainer);
				const blobHandle = await blobHandleP;
				mainDataStore._root.set("blob", blobHandle);

				// Remove the blob's handle to unreference it.
				mainDataStore._root.delete("blob");

				// Summarize so that the above attachment blob is marked unreferenced.
				await provider.ensureSynchronized();
				await summarizeNow(summarizer);

				// Wait for tombstone timeout so that the blob is tombstoned.
				await delay(tombstoneTimeoutMs + 10);

				// Send an op to update the current reference timestamp that GC uses to make sweep ready objects.
				mainDataStore._root.set("key", "value");
				await provider.ensureSynchronized();

				// Summarize so that the tombstoned blob should are now part of the summary.
				const summary2 = await summarizeNow(summarizer);

				// Load a new container from the above summary which should have the blob tombstoned.
				const container2 = await loadContainer(summary2.summaryVersion);

				// Retrieving the blob should fail. Note that the blob is requested via its url since this container does
				// not have access to the blob's handle.
				const entryPoint2 = (await container2.getEntryPoint()) as ITestDataObject;
				const containerRuntime2 = entryPoint2._context.containerRuntime as ContainerRuntime;
				const response = await containerRuntime2.resolveHandle({
					url: toFluidHandleInternal(blobHandle).absolutePath,
				});
				assert.strictEqual(response?.status, 404, `Expecting a 404 response`);
				assert(response.value.startsWith("Blob was tombstoned:"), `Unexpected response value`);
				assert(container2.closed !== true, "Container should not have closed");
			},
		);

		itExpects(
			"tombstones blobs uploaded in disconnected and de-duped in connected container",
			[
				{
					eventName:
						"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_Blob_Requested",
					clientType: "interactive",
				},
				{
					eventName:
						"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_Blob_Requested",
					clientType: "interactive",
				},
			],
			async () => {
				const { mainContainer, mainDataStore } = await createContainerAndDataStore();

				// Create a summarizer which does an initial summary.
				const summarizer = await createSummarizerWithInitialSummary(mainContainer);

				// Disconnect the main container, upload an attachment blob and mark it referenced. We should get a handle
				// with a localId for the blob.
				mainContainer.disconnect();
				const blobContents = "Blob contents";
				const localHandle1P = mainDataStore._context.uploadBlob(
					stringToBuffer(blobContents, "utf-8"),
				);

				// Connect the container after the blob is uploaded. Send an op to transition the container to write mode.
				mainContainer.connect();
				mainDataStore._root.set("transition to write", "true");
				await waitForContainerWriteModeConnectionWrite(mainContainer);
				const localHandle1 = await localHandle1P;
				mainDataStore._root.set("local1", localHandle1);
				// Upload the same blob. This will get de-duped and we will get back another local handle. Both this and
				// the blob uploaded in disconnected mode should be mapped to the same storageId.
				const localHandle2 = await mainDataStore._context.uploadBlob(
					stringToBuffer(blobContents, "utf-8"),
				);
				assert.notStrictEqual(
					toFluidHandleInternal(localHandle1).absolutePath,
					toFluidHandleInternal(localHandle2).absolutePath,
					"local handles should be different",
				);

				// Add the new local handle and then remove both the handles to unreference the blob.
				mainDataStore._root.set("local2", localHandle2);
				mainDataStore._root.delete("local1");
				mainDataStore._root.delete("local2");

				// Summarize so that the above attachment blob is marked unreferenced.
				await provider.ensureSynchronized();
				await summarizeNow(summarizer);

				// Wait for tombstone timeout so that the blob is tombstoned.
				await delay(tombstoneTimeoutMs + 10);

				// Send an op to update the current reference timestamp that GC uses to make sweep ready objects.
				mainDataStore._root.set("key", "value");
				await provider.ensureSynchronized();

				// Summarize so that the tombstoned blob is now  part of the summary.
				const summary2 = await summarizeNow(summarizer);

				// Load a new container from the above summary which should have the blob tombstoned.
				const container2 = await loadContainer(summary2.summaryVersion);

				// Retrieving the blob via any of the handles should fail. Note that the blob is requested via its url since
				// this container does not have access to the blob's handle.
				const entryPoint2 = (await container2.getEntryPoint()) as ITestDataObject;
				const containerRuntime2 = entryPoint2._context.containerRuntime as ContainerRuntime;
				const localResponse1 = await containerRuntime2.resolveHandle({
					url: toFluidHandleInternal(localHandle1).absolutePath,
				});
				assert.strictEqual(
					localResponse1?.status,
					404,
					`Expecting a 404 response for local handle`,
				);
				assert(
					localResponse1.value.startsWith("Blob was tombstoned:"),
					`Unexpected value for local handle 1`,
				);

				const localResponse2 = await containerRuntime2.resolveHandle({
					url: toFluidHandleInternal(localHandle2).absolutePath,
				});
				assert.strictEqual(
					localResponse2?.status,
					404,
					`Expecting a 404 response for storage handle`,
				);
				assert(
					localResponse2.value.startsWith("Blob was tombstoned:"),
					`Unexpected value for local handle 2`,
				);
			},
		);

		itExpects(
			"tombstones blobs uploaded and de-duped in disconnected container",
			[
				{
					eventName:
						"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_Blob_Requested",
					clientType: "interactive",
				},
				{
					eventName:
						"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_Blob_Requested",
					clientType: "interactive",
				},
				{
					eventName:
						"fluid:telemetry:ContainerRuntime:GarbageCollector:GC_Tombstone_Blob_Requested",
					clientType: "interactive",
				},
			],
			async () => {
				const { mainContainer, mainDataStore } = await createContainerAndDataStore();

				const summarizer = await createSummarizerWithInitialSummary(mainContainer);

				// Disconnect the main container, upload couple of blobs with same content and mark them referenced. When
				// these blobs are uploaded to the server, they will be de-duped and redirect to the same storageId.
				mainContainer.disconnect();
				const blobContents = "Blob contents";
				const localHandle1P = mainDataStore._context.uploadBlob(
					stringToBuffer(blobContents, "utf-8"),
				);
				const localHandle2P = mainDataStore._context.uploadBlob(
					stringToBuffer(blobContents, "utf-8"),
				);

				// Connect the container after the blob is uploaded. Send an op to transition the container to write mode.
				mainContainer.connect();
				mainDataStore._root.set("transition to write", "true");
				await waitForContainerWriteModeConnectionWrite(mainContainer);
				const localHandle1 = await localHandle1P;
				const localHandle2 = await localHandle2P;

				// Add the blob's local handles to reference them.
				mainDataStore._root.set("local1", localHandle1);
				mainDataStore._root.set("local2", localHandle2);

				// Upload the same blob. This will get de-duped and we will get back another local handle. Both this and
				// the blobs uploaded in disconnected mode should be mapped to the same storageId.
				const localHandle3 = await mainDataStore._context.uploadBlob(
					stringToBuffer(blobContents, "utf-8"),
				);
				assert.notStrictEqual(
					toFluidHandleInternal(localHandle1).absolutePath,
					toFluidHandleInternal(localHandle3).absolutePath,
					"local handles should be different",
				);

				// Add the new local handle and then remove all the local handles to unreference the blob.
				mainDataStore._root.set("local3", localHandle3);
				mainDataStore._root.delete("local1");
				mainDataStore._root.delete("local2");
				mainDataStore._root.delete("local3");

				// Summarize so that the above attachment blobs are marked unreferenced.
				await provider.ensureSynchronized();
				await summarizeNow(summarizer);

				// Wait for tombstone timeout so that the blob is tombstoned.
				await delay(tombstoneTimeoutMs + 10);

				// Send an op to update the current reference timestamp that GC uses to make sweep ready objects.
				mainDataStore._root.set("key", "value");
				await provider.ensureSynchronized();

				// Summarize so that the tombstoned blobs are now part of the summary.
				const summary2 = await summarizeNow(summarizer);

				// Load a new container from the above summary which should have the blobs tombstoned.
				const container2 = await loadContainer(summary2.summaryVersion);

				// Retrieving the blob via any of the handles should fail. Note that the blob is requested via its url since
				// this container does not have access to the blob's handle.
				const entryPoint2 = (await container2.getEntryPoint()) as ITestDataObject;
				const containerRuntime2 = entryPoint2._context.containerRuntime as ContainerRuntime;
				const localResponse1 = await containerRuntime2.resolveHandle({
					url: toFluidHandleInternal(localHandle1).absolutePath,
				});
				assert.strictEqual(
					localResponse1?.status,
					404,
					`Expecting a 404 response for local handle 1`,
				);
				assert(
					localResponse1.value.startsWith("Blob was tombstoned:"),
					`Unexpected value for local handle 1`,
				);

				const localResponse2 = await containerRuntime2.resolveHandle({
					url: toFluidHandleInternal(localHandle2).absolutePath,
				});
				assert.strictEqual(
					localResponse2?.status,
					404,
					`Expecting a 404 response for local handle 2`,
				);
				assert(
					localResponse2.value.startsWith("Blob was tombstoned:"),
					`Unexpected value for local handle 2`,
				);

				const localResponse3 = await containerRuntime2.resolveHandle({
					url: toFluidHandleInternal(localHandle3).absolutePath,
				});
				assert.strictEqual(
					localResponse3?.status,
					404,
					`Expecting a 404 response for storage handle`,
				);
				assert(
					localResponse3.value.startsWith("Blob was tombstoned:"),
					`Unexpected value for local handle 2`,
				);
			},
		);
	});
});
