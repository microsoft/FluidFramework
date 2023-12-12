/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ContainerRuntime, IGCRuntimeOptions } from "@fluidframework/container-runtime";
import { ISummaryTree } from "@fluidframework/protocol-definitions";
import {
	ITestObjectProvider,
	createSummarizer,
	summarizeNow,
	waitForContainerConnection,
	mockConfigProvider,
	ITestContainerConfig,
} from "@fluidframework/test-utils";
import { describeCompat, ITestDataObject, itExpects } from "@fluid-private/test-version-utils";
import { stringToBuffer } from "@fluid-internal/client-utils";
import { delay } from "@fluidframework/core-utils";
import { IContainer, LoaderHeader } from "@fluidframework/container-definitions";
// eslint-disable-next-line import/no-internal-modules
import { blobsTreeName } from "@fluidframework/container-runtime/dist/summary/index.js";
import {
	driverSupportsBlobs,
	getUrlFromDetachedBlobStorage,
	MockDetachedBlobStorage,
} from "../mockDetachedBlobStorage.js";
import {
	getGCDeletedStateFromSummary,
	getGCStateFromSummary,
	waitForContainerWriteModeConnectionWrite,
} from "./gcTestSummaryUtils.js";

/**
 * These tests validate that SweepReady attachment blobs are correctly swept. Swept attachment blobs should be
 * removed from the summary, added to the GC deleted blob, and retrieving them should be prevented.
 */
describeCompat("GC attachment blob sweep tests", "NoCompat", (getTestObjectProvider) => {
	const sweepTimeoutMs = 200;
	const settings = {};
	const gcOptions: IGCRuntimeOptions = {
		inactiveTimeoutMs: 0,
		enableGCSweep: true,
		sweepGracePeriodMs: 0, // Skip Tombstone, these tests focus on Sweep
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
		blobNodePath: string,
		messagePrefix: string,
		isSummarizerContainer = false,
	) {
		const blobId = blobNodePath.split("/")[2];
		const entryPoint = (await container.getEntryPoint()) as ITestDataObject;
		const runtime = isSummarizerContainer
			? (entryPoint as any).runtime
			: entryPoint._context.containerRuntime;
		const response = await (runtime as ContainerRuntime).resolveHandle({
			url: blobNodePath,
		});
		assert.strictEqual(response?.status, 404, `${messagePrefix}: Expecting a 404 response`);
		assert.equal(
			response.value,
			`Blob was deleted: ${blobId}`,
			`${messagePrefix}: Unexpected response value`,
		);
		assert(container.closed !== true, `${messagePrefix}: Container should not have closed`);
	}

	async function createDataStoreAndSummarizer() {
		const container = await provider.makeTestContainer(testContainerConfig);
		const dataStore = (await container.getEntryPoint()) as ITestDataObject;

		// Send an op to transition the container to write mode.
		dataStore._root.set("transition to write", "true");
		await waitForContainerConnection(container, true);

		const { summarizer, container: summarizerContainer } = await createSummarizer(
			provider,
			container,
			{
				runtimeOptions: { gcOptions },
				loaderProps: { configProvider: mockConfigProvider(settings) },
			},
		);

		return { dataStore, summarizer, summarizerContainer };
	}

	beforeEach(async function () {
		provider = getTestObjectProvider({ syncSummarizer: true });
		settings["Fluid.GarbageCollection.TestOverride.SweepTimeoutMs"] = sweepTimeoutMs;
	});

	describe("Attachment blobs in attached container", () => {
		beforeEach(async function () {
			if (provider.driver.type !== "local") {
				this.skip();
			}
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
				const summary1 = await summarizeNow(summarizer);
				assert(summary1 !== undefined);

				// Wait for sweep timeout so that the blobs are ready to be deleted.
				await delay(sweepTimeoutMs + 10);

				// Send an op to update the current reference timestamp that GC uses to make sweep ready objects.
				mainDataStore._root.set("key", "value");
				await provider.ensureSynchronized();

				// Summarize so that sweep runs and gc op with sweep ready blobs are sent.
				const summary2 = await summarizeNow(summarizer);
				const container2 = await loadContainer(summary2.summaryVersion);

				// Wait for the gc op to be processed so that the sweep ready blobs are deleted.
				await provider.ensureSynchronized();

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
					true,
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

				// Summarize so that sweep runs and gc op with sweep ready blobs are sent.
				const summary2 = await summarizeNow(summarizer);
				const container2 = await loadContainer(summary2.summaryVersion);

				// Wait for the gc op to be processed so that the sweep ready blobs are deleted.
				await provider.ensureSynchronized();

				// Retrieving the blob via any of the handles should fail.
				// Note that the blob is requested via its url since this container does not have access to the blob's handle.
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
					true,
				);
				await validateBlobRetrievalFails(
					summarizerContainer,
					blobHandle2.absolutePath,
					"Summarizer: Blob2",
					true,
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
			const container2MainDataStore = (await container2.getEntryPoint()) as ITestDataObject;
			// Upload the blob and keep the handle around until the blob uploaded by first container is deleted.
			const container2BlobHandle = await container2MainDataStore._runtime.uploadBlob(
				stringToBuffer(blobContents, "utf-8"),
			);

			// Wait for sweep timeout so that the blob uploaded by the first container is ready to be deleted.
			await delay(sweepTimeoutMs / 2 + 10);

			// Send an op to update the current reference timestamp that GC uses to make sweep ready objects.
			mainDataStore._root.set("key", "value");
			await provider.ensureSynchronized();

			// Summarize so that sweep runs and gc op with sweep ready blobs are sent.
			const summary2 = await summarizeNow(summarizer);

			// Load a container from this summary and upload a blob with the same content as the deleted blob.
			// It should be fine to use it because from this container's perspective it uploaded a brand new blob.
			const container3 = await loadContainer(summary2.summaryVersion);

			// Wait for the gc op to be processed so that the sweep ready blobs are deleted.
			await provider.ensureSynchronized();

			const container3MainDataStore = (await container3.getEntryPoint()) as ITestDataObject;

			// Upload the same blob again in container3.
			const container3BlobHandle = await container3MainDataStore._runtime.uploadBlob(
				stringToBuffer(blobContents, "utf-8"),
			);

			// Load the blobs in container2 and container3 and validate that they are still available.
			await assert.doesNotReject(
				container2BlobHandle.get(),
				"Container2 should be able to get the blob",
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
			const mainDataStore = (await mainContainer.getEntryPoint()) as ITestDataObject;
			return { mainContainer, mainDataStore };
		}

		beforeEach(async function () {
			if (!driverSupportsBlobs(provider.driver)) {
				this.skip();
			}
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
					{
						runtimeOptions: { gcOptions },
						loaderProps: { configProvider: mockConfigProvider(settings) },
					},
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

				// Summarize so that sweep runs and gc op with sweep ready blobs are sent.
				const summary2 = await summarizeNow(summarizer);
				const url = await getUrlFromDetachedBlobStorage(mainContainer, provider);
				const container2 = await provider.makeTestLoader(testContainerConfig).resolve({
					url,
					headers: { [LoaderHeader.version]: summary2.summaryVersion },
				});

				// Wait for the gc op to be processed so that the sweep ready blobs are deleted.
				await provider.ensureSynchronized();

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
					true,
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
					{
						runtimeOptions: { gcOptions },
						loaderProps: { configProvider: mockConfigProvider(settings) },
					},
				);

				// Summarize so that the above attachment blob is marked unreferenced.
				await provider.ensureSynchronized();
				await summarizeNow(summarizer);

				// Wait for sweep timeout so that the blob is ready to be deleted.
				await delay(sweepTimeoutMs + 10);

				// Send an op to update the current reference timestamp that GC uses to make sweep ready objects.
				mainDataStore._root.set("key", "value");
				await provider.ensureSynchronized();

				// Summarize so that sweep runs and gc op with sweep ready blobs are sent.
				const summary2 = await summarizeNow(summarizer);
				const url = await getUrlFromDetachedBlobStorage(mainContainer, provider);
				const container2 = await provider.makeTestLoader(testContainerConfig).resolve({
					url,
					headers: { [LoaderHeader.version]: summary2.summaryVersion },
				});

				// Wait for the gc op to be processed so that the sweep ready blobs are deleted.
				await provider.ensureSynchronized();

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
					true,
				);
				await validateBlobRetrievalFails(
					summarizerContainer,
					blobHandle2.absolutePath,
					"Summarizer: Blob2",
					true,
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
					{
						runtimeOptions: { gcOptions },
						loaderProps: { configProvider: mockConfigProvider(settings) },
					},
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

				// Summarize so that sweep runs and gc op with sweep ready blobs are sent.
				const summary2 = await summarizeNow(summarizer);
				const url = await getUrlFromDetachedBlobStorage(mainContainer, provider);
				const container2 = await provider.makeTestLoader(testContainerConfig).resolve({
					url,
					headers: { [LoaderHeader.version]: summary2.summaryVersion },
				});

				// Wait for the gc op to be processed so that the sweep ready blobs are deleted.
				await provider.ensureSynchronized();

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
					true,
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
				{
					runtimeOptions: { gcOptions },
					loaderProps: { configProvider: mockConfigProvider(settings) },
				},
			);
			await provider.ensureSynchronized();
			await summarizeNow(summarizer);
			return { summarizer, summarizerContainer };
		}

		beforeEach(async function () {
			if (provider.driver.type !== "local") {
				this.skip();
			}
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
				const blobHandleP = mainDataStore._context.uploadBlob(
					stringToBuffer(blobContents, "utf-8"),
				);

				// Connect the container after the blob is uploaded. Send an op to transition it to write mode.
				mainContainer.connect();
				const blobHandle = await blobHandleP;
				mainDataStore._root.set("transition to write", "true");
				mainDataStore._root.set("blob", blobHandle);
				await waitForContainerWriteModeConnectionWrite(mainContainer);

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

				// Summarize so that sweep runs and gc op with sweep ready blobs are sent.
				const summary2 = await summarizeNow(summarizer);
				const container2 = await loadContainer(summary2.summaryVersion);

				// Wait for the gc op to be processed so that the sweep ready blobs are deleted.
				await provider.ensureSynchronized();

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
					true,
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
				const blobHandle1P = mainDataStore._context.uploadBlob(
					stringToBuffer(blobContents, "utf-8"),
				);

				// Connect the container after the blob is uploaded. Send an op to transition the container to write mode.
				mainContainer.connect();
				mainDataStore._root.set("transition to write", "true");
				await waitForContainerWriteModeConnectionWrite(mainContainer);
				const blobHandle1 = await blobHandle1P;
				mainDataStore._root.set("blob1", blobHandle1);

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

				// Summarize so that sweep runs and gc op with sweep ready blobs are sent.
				const summary2 = await summarizeNow(summarizer);
				const container2 = await loadContainer(summary2.summaryVersion);

				// Wait for the gc op to be processed so that the sweep ready blobs are deleted.
				await provider.ensureSynchronized();

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
					true,
				);
				await validateBlobRetrievalFails(
					summarizerContainer,
					blobHandle2.absolutePath,
					"Summarizer: Blob2",
					true,
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
				const blobHandle1P = mainDataStore._context.uploadBlob(
					stringToBuffer(blobContents, "utf-8"),
				);
				const blobHandle2P = mainDataStore._context.uploadBlob(
					stringToBuffer(blobContents, "utf-8"),
				);

				// Connect the container after the blob is uploaded. Send an op to transition the container to write mode.
				mainContainer.connect();
				mainDataStore._root.set("transition to write", "true");
				await waitForContainerWriteModeConnectionWrite(mainContainer);
				const blobHandle1 = await blobHandle1P;
				const blobHandle2 = await blobHandle2P;
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
				mainDataStore._root.set("blob3", blobHandle3);
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

				// Summarize so that sweep runs and gc op with sweep ready blobs are sent.
				const summary2 = await summarizeNow(summarizer);
				const container2 = await loadContainer(summary2.summaryVersion);

				// Wait for the gc op to be processed so that the sweep ready blobs are deleted.
				await provider.ensureSynchronized();

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
					true,
				);
			},
		);
	});

	describe("Deleted blob in summary", () => {
		/**
		 * Validates that the given blob state is correct in the summary:
		 * - It should be no blob tree in the summary.
		 * - The blob should not be present in the GC state in GC summary tree.
		 * - The blob should be present in the deleted nodes in GC summary tree.
		 */
		function validateBlobStateInSummary(summaryTree: ISummaryTree, blobNodePath: string) {
			// Validate that the blob tree should not be in the summary since there should be no attachment blobs.
			const blobsTree = summaryTree.tree[blobsTreeName] as ISummaryTree;
			assert(blobsTree === undefined, "Blobs tree should not be present in the summary");

			// Validate that the GC state does not contain an entry for the deleted blob.
			const gcState = getGCStateFromSummary(summaryTree);
			assert(gcState !== undefined, "GC tree is not available in the summary");
			for (const [nodePath] of Object.entries(gcState.gcNodes)) {
				if (nodePath === blobNodePath) {
					assert(false, `Blob ${nodePath} should not present be in GC state`);
				}
			}

			// Validate that the deleted nodes in the GC data has the deleted blob node.
			const deletedNodesState = getGCDeletedStateFromSummary(summaryTree);
			assert(
				deletedNodesState?.includes(blobNodePath),
				`Blob ${blobNodePath} should be in deleted nodes`,
			);
		}

		beforeEach(async function () {
			if (provider.driver.type !== "local") {
				this.skip();
			}
		});

		it("updates deleted blob state in the summary", async () => {
			const { dataStore: mainDataStore, summarizer } = await createDataStoreAndSummarizer();

			// Upload an attachment blob.
			const blob1Contents = "Blob contents 1";
			const blob1Handle = await mainDataStore._runtime.uploadBlob(
				stringToBuffer(blob1Contents, "utf-8"),
			);
			const blob1NodePath = blob1Handle.absolutePath;

			// Reference and then unreference the blob so that it's unreferenced in the next summary.
			mainDataStore._root.set("blob1", blob1Handle);
			mainDataStore._root.delete("blob1");

			// Summarize so that blob is marked unreferenced.
			await provider.ensureSynchronized();
			await summarizeNow(summarizer);

			// Wait for sweep timeout so that blob is ready to be deleted.
			await delay(sweepTimeoutMs + 10);

			// Send an op to update the current reference timestamp that GC uses to make sweep ready objects.
			mainDataStore._root.set("key", "value");
			await provider.ensureSynchronized();

			// Summarize. In this summary, the gc op will be sent with the deleted blob ids. The blobs will be
			// removed in the subsequent summary.
			await summarizeNow(summarizer);

			// Summarize again so that the sweep ready blobs are now deleted from the GC data.
			const summary3 = await summarizeNow(summarizer);
			// Validate that the deleted blob's state is correct in the summary.
			validateBlobStateInSummary(summary3.summaryTree, blob1NodePath);
		});
	});
});
