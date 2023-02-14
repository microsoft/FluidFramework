/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { Container } from "@fluidframework/container-loader";
import { IGCRuntimeOptions } from "@fluidframework/container-runtime";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
	ITestObjectProvider,
	createSummarizer,
	summarizeNow,
	waitForContainerConnection,
	mockConfigProvider,
	ITestContainerConfig,
} from "@fluidframework/test-utils";
import { describeNoCompat, ITestDataObject, itExpects } from "@fluidframework/test-version-utils";
import { delay, stringToBuffer } from "@fluidframework/common-utils";
import { IContainer, LoaderHeader } from "@fluidframework/container-definitions";
import { IOdspResolvedUrl } from "@fluidframework/odsp-driver-definitions";
import { getUrlFromItemId, MockDetachedBlobStorage } from "../mockDetachedBlobStorage";

/**
 * These tests validate that SweepReady attachment blobs are correctly swept. Swept attachment blobs should be
 * removed from the summary, added to the GC deleted blob, and retrieving them should be prevented.
 */
describeNoCompat("GC attachment blob sweep tests", (getTestObjectProvider) => {
	const sweepTimeoutMs = 200;
	const settings = {};
	const gcOptions: IGCRuntimeOptions = { inactiveTimeoutMs: 0 };
	const testContainerConfig: ITestContainerConfig = {
		runtimeOptions: {
			summaryOptions: {
				summaryConfigOverrides: {
					state: "disabled",
				},
			},
			gcOptions,
		},
		loaderProps: { configProvider: mockConfigProvider(settings) },
	};

	let provider: ITestObjectProvider;

	async function loadContainer(summaryVersion: string) {
		return provider.loadTestContainer(testContainerConfig, {
			[LoaderHeader.version]: summaryVersion,
		});
	}

	async function validateBlobRetrievalFails(
		container: IContainer,
		blobUrl: string,
		messagePrefix: string,
	) {
		const blobId = blobUrl.split("/")[2];
		const response = await container.request({ url: blobUrl });
		assert.strictEqual(response?.status, 404, `${messagePrefix}: Expecting a 404 response`);
		assert.equal(
			response.value,
			`Blob was deleted: ${blobId}`,
			`${messagePrefix}: Unexpected response value`,
		);
		assert(container.closed !== true, `${messagePrefix}: Container should not have closed`);
	}

	describe("Attachment blobs in attached container", () => {
		async function createDataStoreAndSummarizer() {
			const container = await provider.makeTestContainer(testContainerConfig);
			const dataStore = await requestFluidObject<ITestDataObject>(container, "default");

			// Send an op to transition the container to write mode.
			dataStore._root.set("transition to write", "true");
			await waitForContainerConnection(container, true);

			const { summarizer, container: summarizerContainer } = await createSummarizer(
				provider,
				container,
				undefined /* summaryVersion */,
				gcOptions,
				mockConfigProvider(settings),
			);

			return { dataStore, summarizer, summarizerContainer };
		}

		beforeEach(async function () {
			provider = getTestObjectProvider({ syncSummarizer: true });
			if (provider.driver.type !== "local") {
				this.skip();
			}

			settings["Fluid.GarbageCollection.Test.SweepAttachmentBlobs"] = true;
			settings["Fluid.GarbageCollection.RunSweep"] = true;
			settings["Fluid.GarbageCollection.TestOverride.SweepTimeoutMs"] = sweepTimeoutMs;
		});

		itExpects(
			"fails retrieval of deleted attachment blobs",
			[
				{
					eventName: "fluid:telemetry:BlobManager:GC_Deleted_Blob_Requested",
					clientType: "interactive",
				},
				{
					eventName: "fluid:telemetry:BlobManager:GC_Deleted_Blob_Requested",
					clientType: "noninteractive/summarizer",
				},
			],
			async () => {
				const {
					dataStore: mainDataStore,
					summarizer,
					summarizerContainer,
				} = await createDataStoreAndSummarizer();

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

				// Wait for sweep timeout so that the blobs are ready to be deleted.
				await delay(sweepTimeoutMs + 10);

				// Send an op to update the current reference timestamp that GC uses to make sweep ready objects.
				mainDataStore._root.set("key", "value");
				await provider.ensureSynchronized();

				// Summarize so that the sweep ready blobs are deleted.
				const summary2 = await summarizeNow(summarizer);
				const container2 = await loadContainer(summary2.summaryVersion);

				// Retrieving the blob should fail. Note that the blob is requested via its url since this container does
				// not have access to the blob's handle since it loaded after the blob was deleted.
				await validateBlobRetrievalFails(
					container2,
					blobHandle.absolutePath,
					"Container2: Blob1",
				);

				// Retrieving the blob in the summarizer container should fail as well.
				await validateBlobRetrievalFails(
					summarizerContainer,
					blobHandle.absolutePath,
					"Summarizer: Blob1",
				);
			},
		);

		itExpects(
			"fails retrieval of blobs that are de-duped in same container and are deleted",
			[
				{
					eventName: "fluid:telemetry:BlobManager:GC_Deleted_Blob_Requested",
					clientType: "interactive",
				},
				{
					eventName: "fluid:telemetry:BlobManager:GC_Deleted_Blob_Requested",
					clientType: "interactive",
				},
				{
					eventName: "fluid:telemetry:BlobManager:GC_Deleted_Blob_Requested",
					clientType: "noninteractive/summarizer",
				},
				{
					eventName: "fluid:telemetry:BlobManager:GC_Deleted_Blob_Requested",
					clientType: "noninteractive/summarizer",
				},
			],
			async () => {
				const {
					dataStore: mainDataStore,
					summarizer,
					summarizerContainer,
				} = await createDataStoreAndSummarizer();

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

				// Wait for sweep timeout so that the blobs are ready to be deleted.
				await delay(sweepTimeoutMs + 10);

				// Send an op to update the current reference timestamp that GC uses to make sweep ready objects.
				mainDataStore._root.set("key", "value");
				await provider.ensureSynchronized();

				// Summarize so that the sweep ready blobs are deleted.
				const summary2 = await summarizeNow(summarizer);

				// Load a container from the above summary. Retrieving the blob via any of the handles should fail. Note
				// that the blob is requested via its url since this container does not have access to the blob's handle.
				const container2 = await loadContainer(summary2.summaryVersion);
				await validateBlobRetrievalFails(
					container2,
					blobHandle1.absolutePath,
					"Container2: Blob1",
				);
				await validateBlobRetrievalFails(
					container2,
					blobHandle2.absolutePath,
					"Container2: Blob2",
				);

				// Retrieving the blobs in the summarizer container should fail as well.
				await validateBlobRetrievalFails(
					summarizerContainer,
					blobHandle1.absolutePath,
					"Summarizer: Blob1",
				);
				await validateBlobRetrievalFails(
					summarizerContainer,
					blobHandle2.absolutePath,
					"Summarizer: Blob2",
				);
			},
		);

		/**
		 * This test validates that when blobs are de-duped in different containers, these containers can use these
		 * blobs irrespective of whether the original blob is deleted. Basically, after uploading a blob, a container
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

			// Wait for half sweep timeout and load a container. This container will upload a blob with the same content
			// as above so that it is de-duped. This container should be able to use this blob until its session
			// expires.
			await delay(sweepTimeoutMs / 2);
			const container2 = await loadContainer(summary1.summaryVersion);
			const container2MainDataStore = await requestFluidObject<ITestDataObject>(
				container2,
				"default",
			);
			// Upload the blob and keep the handle around until the blob uploaded by first container is deleted.
			const container2BlobHandle = await container2MainDataStore._runtime.uploadBlob(
				stringToBuffer(blobContents, "utf-8"),
			);

			// Wait for sweep timeout so that the blob uploaded by the first container is ready to be deleted.
			await delay(sweepTimeoutMs / 2 + 10);

			// Send an op to update the current reference timestamp that GC uses to make sweep ready objects.
			mainDataStore._root.set("key", "value");
			await provider.ensureSynchronized();

			// Summarize so that the blob is now deleted.
			const summary2 = await summarizeNow(summarizer);

			// Load a container from this summary and upload a blob with the same content as the deleted blob.
			// It should be fine to use it because from this container's perspective it uploaded a brand new blob.
			const container3 = await loadContainer(summary2.summaryVersion);
			const container3MainDataStore = await requestFluidObject<ITestDataObject>(
				container3,
				"default",
			);

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
			// is deleted.
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
			const mainDataStore = await requestFluidObject<ITestDataObject>(mainContainer, "/");
			return { mainContainer, mainDataStore };
		}

		beforeEach(async function () {
			provider = getTestObjectProvider({ syncSummarizer: true });
			if (provider.driver.type !== "odsp") {
				this.skip();
			}

			settings["Fluid.GarbageCollection.Test.SweepAttachmentBlobs"] = true;
			settings["Fluid.GarbageCollection.RunSweep"] = true;
			settings["Fluid.GarbageCollection.TestOverride.SweepTimeoutMs"] = sweepTimeoutMs;
		});

		itExpects(
			"deletes blobs uploaded in detached container",
			[
				{
					eventName: "fluid:telemetry:BlobManager:GC_Deleted_Blob_Requested",
					clientType: "interactive",
				},
				{
					eventName: "fluid:telemetry:BlobManager:GC_Deleted_Blob_Requested",
					clientType: "noninteractive/summarizer",
				},
			],
			async () => {
				const { mainContainer, mainDataStore } =
					await createDetachedContainerAndDataStore();

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
				await waitForContainerConnection(mainContainer, true);

				const { summarizer, container: summarizerContainer } = await createSummarizer(
					provider,
					mainContainer,
					undefined /* summaryVersion */,
					gcOptions,
					mockConfigProvider(settings),
				);

				// Remove the blob's handle to unreference it.
				mainDataStore._root.delete("blob");

				// Summarize so that the above attachment blob is marked unreferenced.
				await provider.ensureSynchronized();
				await summarizeNow(summarizer);

				// Wait for sweep timeout so that the blob is ready to be deleted.
				await delay(sweepTimeoutMs + 10);

				// Send an op to update the current reference timestamp that GC uses to make sweep ready objects.
				mainDataStore._root.set("key", "value");
				await provider.ensureSynchronized();

				// Summarize so that the blob is deleted.
				const summary2 = await summarizeNow(summarizer);

				// Load a new container from the above summary which should no longer have the blob.
				const url = getUrlFromItemId(
					(mainContainer.resolvedUrl as IOdspResolvedUrl).itemId,
					provider,
				);
				const container2 = await provider.makeTestLoader(testContainerConfig).resolve({
					url,
					headers: { [LoaderHeader.version]: summary2.summaryVersion },
				});

				// Retrieving the blob should fail. Note that the blob is requested via its url since this container does
				// not have access to the blob's handle.
				await validateBlobRetrievalFails(
					container2,
					blobHandle.absolutePath,
					"Container2: Blob1",
				);

				// Retrieving the blobs in the summarizer container should fail as well.
				await validateBlobRetrievalFails(
					summarizerContainer,
					blobHandle.absolutePath,
					"Summarizer: Blob1",
				);
			},
		);

		itExpects(
			"deletes blobs uploaded in detached and de-duped in attached container",
			[
				{
					eventName: "fluid:telemetry:BlobManager:GC_Deleted_Blob_Requested",
					clientType: "interactive",
				},
				{
					eventName: "fluid:telemetry:BlobManager:GC_Deleted_Blob_Requested",
					clientType: "interactive",
				},
				{
					eventName: "fluid:telemetry:BlobManager:GC_Deleted_Blob_Requested",
					clientType: "noninteractive/summarizer",
				},
				{
					eventName: "fluid:telemetry:BlobManager:GC_Deleted_Blob_Requested",
					clientType: "noninteractive/summarizer",
				},
			],
			async () => {
				const { mainContainer, mainDataStore } =
					await createDetachedContainerAndDataStore();

				// Upload an attachment blob. Mark it referenced by storing its handle in a DDS.
				const blobContents = "Blob contents";
				const blobHandle1 = await mainDataStore._context.uploadBlob(
					stringToBuffer(blobContents, "utf-8"),
				);
				mainDataStore._root.set("blob1", blobHandle1);

				// Attach the container after the blob is uploaded.
				await mainContainer.attach(
					provider.driver.createCreateNewRequest(provider.documentId),
				);

				// Send an op to transition the container to write mode.
				mainDataStore._root.set("transition to write", "true");
				await waitForContainerConnection(mainContainer, true);

				// Upload the same blob. This will get de-duped and we will get back another blob handle. Both these
				// blobIds should be different.
				const blobHandle2 = await mainDataStore._context.uploadBlob(
					stringToBuffer(blobContents, "utf-8"),
				);
				assert.notStrictEqual(
					blobHandle1.absolutePath,
					blobHandle2.absolutePath,
					"The two blob ids should be different",
				);

				// Add the new blob handle and then remove both the handles to unreference the blob.
				mainDataStore._root.set("blob2", blobHandle2);
				mainDataStore._root.delete("blob1");
				mainDataStore._root.delete("blob2");

				const { summarizer, container: summarizerContainer } = await createSummarizer(
					provider,
					mainContainer,
					undefined /* summaryVersion */,
					gcOptions,
					mockConfigProvider(settings),
				);

				// Summarize so that the above attachment blob is marked unreferenced.
				await provider.ensureSynchronized();
				await summarizeNow(summarizer);

				// Wait for sweep timeout so that the blob is ready to be deleted.
				await delay(sweepTimeoutMs + 10);

				// Send an op to update the current reference timestamp that GC uses to make sweep ready objects.
				mainDataStore._root.set("key", "value");
				await provider.ensureSynchronized();

				// Summarize so that the blob is deleted.
				const summary2 = await summarizeNow(summarizer);

				// Load a new container from the above summary which should not have the blob.
				const url = getUrlFromItemId(
					(mainContainer.resolvedUrl as IOdspResolvedUrl).itemId,
					provider,
				);
				const container2 = await provider.makeTestLoader(testContainerConfig).resolve({
					url,
					headers: { [LoaderHeader.version]: summary2.summaryVersion },
				});

				// Retrieving the blob via any of the handles should fail. Note that the blob is requested via its url since
				// this container does not have access to the blob's handle.
				await validateBlobRetrievalFails(
					container2,
					blobHandle1.absolutePath,
					"Container2: Blob1",
				);
				await validateBlobRetrievalFails(
					container2,
					blobHandle2.absolutePath,
					"Container2: Blob2",
				);
				// Retrieving the blobs in the summarizer container should fail as well.
				await validateBlobRetrievalFails(
					summarizerContainer,
					blobHandle1.absolutePath,
					"Summarizer: Blob1",
				);
				await validateBlobRetrievalFails(
					summarizerContainer,
					blobHandle2.absolutePath,
					"Summarizer: Blob2",
				);
			},
		);

		itExpects(
			"deletes blobs uploaded and de-duped in detached container",
			[
				{
					eventName: "fluid:telemetry:BlobManager:GC_Deleted_Blob_Requested",
					clientType: "interactive",
				},
				{
					eventName: "fluid:telemetry:BlobManager:GC_Deleted_Blob_Requested",
					clientType: "interactive",
				},
				{
					eventName: "fluid:telemetry:BlobManager:GC_Deleted_Blob_Requested",
					clientType: "interactive",
				},
				{
					eventName: "fluid:telemetry:BlobManager:GC_Deleted_Blob_Requested",
					clientType: "noninteractive/summarizer",
				},
			],
			async () => {
				const { mainContainer, mainDataStore } =
					await createDetachedContainerAndDataStore();

				// Upload couple of attachment blobs with the same content. When these blobs are uploaded to the server,
				// they will be de-duped and redirect to the same storageId.
				const blobContents = "Blob contents";
				const blobHandle1 = await mainDataStore._context.uploadBlob(
					stringToBuffer(blobContents, "utf-8"),
				);
				const blobHandle2 = await mainDataStore._context.uploadBlob(
					stringToBuffer(blobContents, "utf-8"),
				);

				// Attach the container after the blob is uploaded.
				await mainContainer.attach(
					provider.driver.createCreateNewRequest(provider.documentId),
				);

				// Send an op to transition the container to write mode.
				mainDataStore._root.set("transition to write", "true");
				await waitForContainerConnection(mainContainer, true);

				const { summarizer, container: summarizerContainer } = await createSummarizer(
					provider,
					mainContainer,
					undefined /* summaryVersion */,
					gcOptions,
					mockConfigProvider(settings),
				);

				// Add the blob handles to reference them.
				mainDataStore._root.set("blob1", blobHandle1);
				mainDataStore._root.set("blob2", blobHandle2);

				// Upload the same blob. This will get de-duped and we will get back another blob handle..
				const blobHandle3 = await mainDataStore._context.uploadBlob(
					stringToBuffer(blobContents, "utf-8"),
				);
				assert.notStrictEqual(
					blobHandle1.absolutePath,
					blobHandle3.absolutePath,
					"blob handles should be different",
				);
				mainDataStore._root.set("blob3", blobHandle3);

				// Remove the blob handles to unreference them.
				mainDataStore._root.delete("blob1");
				mainDataStore._root.delete("blob2");
				mainDataStore._root.delete("blob3");

				// Summarize so that the above blobs are marked unreferenced.
				await provider.ensureSynchronized();
				await summarizeNow(summarizer);

				// Wait for sweep timeout so that the blob are ready to be deleted.
				await delay(sweepTimeoutMs + 10);

				// Send an op to update the current reference timestamp that GC uses to make sweep ready objects.
				mainDataStore._root.set("key", "value");
				await provider.ensureSynchronized();

				// Summarize so that the blobs are deleted.
				const summary2 = await summarizeNow(summarizer);

				// Load a new container from the above summary which should not have the blobs.
				const url = getUrlFromItemId(
					(mainContainer.resolvedUrl as IOdspResolvedUrl).itemId,
					provider,
				);
				const container2 = await provider.makeTestLoader(testContainerConfig).resolve({
					url,
					headers: { [LoaderHeader.version]: summary2.summaryVersion },
				});

				// Retrieving the blob via any of the handles should fail. Note that the blob is requested via its url since
				// this container does not have access to the blob's handle.
				await validateBlobRetrievalFails(
					container2,
					blobHandle1.absolutePath,
					"Container2: Blob1",
				);
				await validateBlobRetrievalFails(
					container2,
					blobHandle2.absolutePath,
					"Container2: Blob2",
				);
				await validateBlobRetrievalFails(
					container2,
					blobHandle3.absolutePath,
					"Container2: Blob3",
				);

				// Retrieving the blobs in the summarizer container should fail as well.
				await validateBlobRetrievalFails(
					summarizerContainer,
					blobHandle1.absolutePath,
					"Summarizer: Blob1",
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
			const mainDataStore = await requestFluidObject<ITestDataObject>(mainContainer, "/");
			await waitForContainerConnection(mainContainer, true);
			return { mainContainer, mainDataStore };
		}

		/**
		 * Creates a summarizer, does an initial summary and returns the summarizer. The initial summary is done so
		 * that GarbageCollector has initial GC data. When GC runs next with the attachment blobs, it has a previous
		 * GC data to validate references against and ensure that gcUnknownOutboundReferences error is not logged.
		 */
		async function createSummarizerWithInitialSummary(container: IContainer) {
			const { summarizer, container: summarizerContainer } = await createSummarizer(
				provider,
				container,
				undefined /* summaryVersion */,
				gcOptions,
				mockConfigProvider(settings),
			);
			await provider.ensureSynchronized();
			await summarizeNow(summarizer);
			return { summarizer, summarizerContainer };
		}

		const ensureContainerConnectedWriteMode = async (container: IContainer) => {
			const resolveIfActive = (res: () => void) => {
				if (container.deltaManager.active) {
					res();
				}
			};
			if (!container.deltaManager.active) {
				await new Promise<void>((resolve) =>
					container.on("connected", () => resolveIfActive(resolve)),
				);
				(container as Container).off("connected", resolveIfActive);
			}
		};

		beforeEach(async function () {
			provider = getTestObjectProvider({ syncSummarizer: true });
			if (provider.driver.type !== "local") {
				this.skip();
			}

			settings["Fluid.GarbageCollection.Test.SweepAttachmentBlobs"] = true;
			settings["Fluid.GarbageCollection.RunSweep"] = true;
			settings["Fluid.GarbageCollection.TestOverride.SweepTimeoutMs"] = sweepTimeoutMs;
		});

		itExpects(
			"deletes blobs uploaded in disconnected container",
			[
				{
					eventName: "fluid:telemetry:BlobManager:GC_Deleted_Blob_Requested",
					clientType: "interactive",
				},
				{
					eventName: "fluid:telemetry:BlobManager:GC_Deleted_Blob_Requested",
					clientType: "noninteractive/summarizer",
				},
			],
			async () => {
				const { mainContainer, mainDataStore } = await createContainerAndDataStore();

				// Create a summarizer which does an initial summary.
				const { summarizer, summarizerContainer } =
					await createSummarizerWithInitialSummary(mainContainer);

				// Disconnect the main container, upload an attachment blob and mark it referenced.
				mainContainer.disconnect();
				const blobContents = "Blob contents";
				const blobHandle = await mainDataStore._context.uploadBlob(
					stringToBuffer(blobContents, "utf-8"),
				);
				mainDataStore._root.set("blob", blobHandle);

				// Connect the container after the blob is uploaded. Send an op to transition it to write mode.
				mainContainer.connect();
				mainDataStore._root.set("transition to write", "true");
				await ensureContainerConnectedWriteMode(mainContainer);

				// Remove the blob's handle to unreference it.
				mainDataStore._root.delete("blob");

				// Summarize so that the above attachment blob is marked unreferenced.
				await provider.ensureSynchronized();
				await summarizeNow(summarizer);

				// Wait for sweep timeout so that the blob is ready to be deleted.
				await delay(sweepTimeoutMs + 10);

				// Send an op to update the current reference timestamp that GC uses to make sweep ready objects.
				mainDataStore._root.set("key", "value");
				await provider.ensureSynchronized();

				// Summarize so that the blob is deleted.
				const summary2 = await summarizeNow(summarizer);

				// Load a new container from the above summary which should not have the blob.
				const container2 = await loadContainer(summary2.summaryVersion);

				// Retrieving the blob should fail. Note that the blob is requested via its url since this container does
				// not have access to the blob's handle.
				await validateBlobRetrievalFails(
					container2,
					blobHandle.absolutePath,
					"Container2: Blob1",
				);

				// Retrieving the blobs in the summarizer container should fail as well.
				await validateBlobRetrievalFails(
					summarizerContainer,
					blobHandle.absolutePath,
					"Summarizer: Blob1",
				);
			},
		);

		itExpects(
			"deletes blobs uploaded in disconnected and de-duped in connected container",
			[
				{
					eventName: "fluid:telemetry:BlobManager:GC_Deleted_Blob_Requested",
					clientType: "interactive",
				},
				{
					eventName: "fluid:telemetry:BlobManager:GC_Deleted_Blob_Requested",
					clientType: "interactive",
				},
				{
					eventName: "fluid:telemetry:BlobManager:GC_Deleted_Blob_Requested",
					clientType: "noninteractive/summarizer",
				},
				{
					eventName: "fluid:telemetry:BlobManager:GC_Deleted_Blob_Requested",
					clientType: "noninteractive/summarizer",
				},
			],
			async () => {
				const { mainContainer, mainDataStore } = await createContainerAndDataStore();

				// Create a summarizer which does an initial summary.
				const { summarizer, summarizerContainer } =
					await createSummarizerWithInitialSummary(mainContainer);

				// Disconnect the main container, upload an attachment blob and mark it referenced.
				mainContainer.disconnect();
				const blobContents = "Blob contents";
				const blobHandle1 = await mainDataStore._context.uploadBlob(
					stringToBuffer(blobContents, "utf-8"),
				);
				mainDataStore._root.set("blob1", blobHandle1);

				// Connect the container after the blob is uploaded. Send an op to transition the container to write mode.
				mainContainer.connect();
				mainDataStore._root.set("transition to write", "true");
				await ensureContainerConnectedWriteMode(mainContainer);

				// Upload the same blob. This will get de-duped and we will get back another blob handle. Both this and
				// the blob uploaded in disconnected mode should be different.
				const blobHandle2 = await mainDataStore._context.uploadBlob(
					stringToBuffer(blobContents, "utf-8"),
				);
				assert.notStrictEqual(
					blobHandle1.absolutePath,
					blobHandle2.absolutePath,
					"blob handles should be different",
				);

				// Add the new blob handle and then remove both the handles to unreference the blob.
				mainDataStore._root.set("blob2", blobHandle2);
				mainDataStore._root.delete("blob1");
				mainDataStore._root.delete("blob2");

				// Summarize so that the above attachment blob is marked unreferenced.
				await provider.ensureSynchronized();
				await summarizeNow(summarizer);

				// Wait for sweep timeout so that the blob is ready to be deleted.
				await delay(sweepTimeoutMs + 10);

				// Send an op to update the current reference timestamp that GC uses to make sweep ready objects.
				mainDataStore._root.set("key", "value");
				await provider.ensureSynchronized();

				// Summarize so that the blob is deleted.
				const summary2 = await summarizeNow(summarizer);

				// Load a new container from the above summary which should not have the blob.
				const container2 = await loadContainer(summary2.summaryVersion);

				// Retrieving the blob via any of the handles should fail. Note that the blob is requested via its url since
				// this container does not have access to the blob's handle.
				await validateBlobRetrievalFails(
					container2,
					blobHandle1.absolutePath,
					"Container2: Blob1",
				);
				await validateBlobRetrievalFails(
					container2,
					blobHandle2.absolutePath,
					"Container2: Blob2",
				);

				// Retrieving the blobs in the summarizer container should fail as well.
				await validateBlobRetrievalFails(
					summarizerContainer,
					blobHandle1.absolutePath,
					"Summarizer: Blob1",
				);
				await validateBlobRetrievalFails(
					summarizerContainer,
					blobHandle2.absolutePath,
					"Summarizer: Blob2",
				);
			},
		);

		itExpects(
			"deletes blobs uploaded and de-duped in disconnected container",
			[
				{
					eventName: "fluid:telemetry:BlobManager:GC_Deleted_Blob_Requested",
					clientType: "interactive",
				},
				{
					eventName: "fluid:telemetry:BlobManager:GC_Deleted_Blob_Requested",
					clientType: "interactive",
				},
				{
					eventName: "fluid:telemetry:BlobManager:GC_Deleted_Blob_Requested",
					clientType: "interactive",
				},
				{
					eventName: "fluid:telemetry:BlobManager:GC_Deleted_Blob_Requested",
					clientType: "noninteractive/summarizer",
				},
			],
			async () => {
				const { mainContainer, mainDataStore } = await createContainerAndDataStore();

				const { summarizer, summarizerContainer } =
					await createSummarizerWithInitialSummary(mainContainer);

				// Disconnect the main container, upload couple of blobs with same content and mark them referenced. When
				// these blobs are uploaded to the server, they will be de-duped and redirect to the same storageId.
				mainContainer.disconnect();
				const blobContents = "Blob contents";
				const blobHandle1 = await mainDataStore._context.uploadBlob(
					stringToBuffer(blobContents, "utf-8"),
				);
				const blobHandle2 = await mainDataStore._context.uploadBlob(
					stringToBuffer(blobContents, "utf-8"),
				);

				// Connect the container after the blob is uploaded. Send an op to transition the container to write mode.
				mainContainer.connect();
				mainDataStore._root.set("transition to write", "true");
				await ensureContainerConnectedWriteMode(mainContainer);

				// Add the blob handles to reference them.
				mainDataStore._root.set("blob1", blobHandle1);
				mainDataStore._root.set("blob2", blobHandle2);

				// Upload the same blob. This will get de-duped and we will get back another handle.
				const blobHandle3 = await mainDataStore._context.uploadBlob(
					stringToBuffer(blobContents, "utf-8"),
				);
				assert.notStrictEqual(
					blobHandle1.absolutePath,
					blobHandle3.absolutePath,
					"blob handles should be different",
				);

				// Add the new handle and then remove all the handles to unreference the blob.
				mainDataStore._root.set("blob3", blobHandle2);
				mainDataStore._root.delete("blob1");
				mainDataStore._root.delete("blob2");
				mainDataStore._root.delete("blob3");

				// Summarize so that the above attachment blobs are marked unreferenced.
				await provider.ensureSynchronized();
				await summarizeNow(summarizer);

				// Wait for sweep timeout so that the blob is ready to be deleted.
				await delay(sweepTimeoutMs + 10);

				// Send an op to update the current reference timestamp that GC uses to make sweep ready objects.
				mainDataStore._root.set("key", "value");
				await provider.ensureSynchronized();

				// Summarize so that the blobs are deleted.
				const summary2 = await summarizeNow(summarizer);

				// Load a new container from the above summary which should note have the blobs.
				const container2 = await loadContainer(summary2.summaryVersion);

				// Retrieving the blob via any of the handles should fail. Note that the blob is requested via its url since
				// this container does not have access to the blob's handle.
				await validateBlobRetrievalFails(
					container2,
					blobHandle1.absolutePath,
					"Container2: Blob1",
				);
				await validateBlobRetrievalFails(
					container2,
					blobHandle2.absolutePath,
					"Container2: Blob2",
				);
				await validateBlobRetrievalFails(
					container2,
					blobHandle3.absolutePath,
					"Container2: Blob3",
				);

				// Retrieving the blobs in the summarizer container should fail as well.
				await validateBlobRetrievalFails(
					summarizerContainer,
					blobHandle1.absolutePath,
					"Summarizer: Blob1",
				);
			},
		);
	});
});
