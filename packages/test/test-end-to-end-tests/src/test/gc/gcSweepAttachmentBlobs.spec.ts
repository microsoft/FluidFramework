/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { stringToBuffer } from "@fluid-internal/client-utils";
import { ITestDataObject, describeCompat, itExpects } from "@fluid-private/test-version-utils";
import { IContainer, LoaderHeader } from "@fluidframework/container-definitions/internal";
import {
	ContainerMessageType,
	ContainerRuntime,
	IGCRuntimeOptions,
} from "@fluidframework/container-runtime/internal";
import {
	blobsTreeName,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/container-runtime/internal/test/blobManager";
import {
	ISweepMessage,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/container-runtime/internal/test/gc";
import {
	ISummarizer,
	RetriableSummaryError,
	defaultMaxAttemptsForSubmitFailures,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/container-runtime/internal/test/summary";
import type { ISummarizeEventProps } from "@fluidframework/container-runtime-definitions/internal";
import { delay } from "@fluidframework/core-utils/internal";
import { ISummaryTree, SummaryType } from "@fluidframework/driver-definitions";
import { gcTreeKey } from "@fluidframework/runtime-definitions/internal";
import { toFluidHandleInternal } from "@fluidframework/runtime-utils/internal";
import {
	ITestContainerConfig,
	ITestObjectProvider,
	toIDeltaManagerFull,
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

import {
	getGCDeletedStateFromSummary,
	getGCStateFromSummary,
	manufactureHandle,
	waitForContainerWriteModeConnectionWrite,
} from "./gcTestSummaryUtils.js";

/**
 * Validates that the given blob state is correct in the summary based on expectDelete and expectGCStateHandle.
 * - If expectDelete is true, there should be no blob tree in the summary. Otherwise, there should be.
 * - If expectGCStateHandle is true, the GC summary tree should be handle. Otherwise, the blob should or should not be
 * present in the GC summary tree as per expectDelete.
 * - The blob should or should not be present in the deleted nodes in GC summary tree as per expectDelete.
 */
function validateBlobStateInSummary(
	summaryTree: ISummaryTree,
	blobNodePath: string,
	expectDelete: boolean,
	expectGCStateHandle: boolean,
) {
	const shouldShouldNot = expectDelete ? "should" : "should not";

	// Validate that the blob tree should not be in the summary since there should be no attachment blobs.
	const blobsTree = summaryTree.tree[blobsTreeName] as ISummaryTree;
	assert.equal(
		blobsTree === undefined,
		expectDelete,
		`Blobs tree ${shouldShouldNot} be present in the summary`,
	);

	if (expectGCStateHandle) {
		assert.equal(
			summaryTree.tree[gcTreeKey].type,
			SummaryType.Handle,
			"Expecting the GC tree to be handle",
		);
		return;
	}

	// Validate that the GC state does not contain an entry for the deleted blob.
	const gcState = getGCStateFromSummary(summaryTree);
	assert(gcState !== undefined, "GC tree is not available in the summary");
	assert.notEqual(
		Object.keys(gcState.gcNodes).includes(blobNodePath),
		expectDelete,
		`Blob ${blobNodePath} ${shouldShouldNot} have been removed from GC state`,
	);

	// Validate that the deleted nodes in the GC data has the deleted blob node.
	const deletedNodesState = getGCDeletedStateFromSummary(summaryTree);
	assert.equal(
		deletedNodesState?.includes(blobNodePath) ?? false,
		expectDelete,
		`Blob ${blobNodePath} ${shouldShouldNot} be in deleted nodes`,
	);
}

/**
 * These tests validate that SweepReady attachment blobs are correctly swept. Swept attachment blobs should be
 * removed from the summary, added to the GC deleted blob, and retrieving them should be prevented.
 */
describeCompat("GC attachment blob sweep tests", "NoCompat", (getTestObjectProvider) => {
	const sweepGracePeriodMs = 50;
	const tombstoneTimeoutMs = 150;
	const sweepTimeoutMs = tombstoneTimeoutMs + sweepGracePeriodMs;
	const gcOptions: IGCRuntimeOptions = {
		inactiveTimeoutMs: 0,
		enableGCSweep: true,
		sweepGracePeriodMs,
	};

	let provider: ITestObjectProvider;
	const configProvider = createTestConfigProvider();
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

	async function loadContainer(
		summaryVersion: string,
		config: ITestContainerConfig = testContainerConfig,
	) {
		return provider.loadTestContainer(config, {
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
				loaderProps: { configProvider },
			},
		);

		return { dataStore, summarizer, summarizerContainer };
	}

	beforeEach("setup", async function () {
		provider = getTestObjectProvider({ syncSummarizer: true });
		// Skip these tests for drivers / services that do not support attachment blobs.
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
				const blobHandle = toFluidHandleInternal(
					await mainDataStore._runtime.uploadBlob(stringToBuffer(blobContents, "utf-8")),
				);

				// Reference and then unreference the blob so that it's unreferenced in the next summary.
				mainDataStore._root.set("blob1", blobHandle);
				mainDataStore._root.delete("blob1");

				// Summarize so that the above attachment blobs are marked unreferenced.
				await provider.ensureSynchronized();
				const summary1 = await summarizeNow(summarizer);
				assert(summary1 !== undefined);

				// Wait for sweep full timeout so that blob is ready to be deleted.
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
				const blobHandle1 = toFluidHandleInternal(
					await mainDataStore._runtime.uploadBlob(stringToBuffer(blobContents, "utf-8")),
				);

				// Upload another blob with the same content so that it is de-duped.
				const blobHandle2 = toFluidHandleInternal(
					await mainDataStore._runtime.uploadBlob(stringToBuffer(blobContents, "utf-8")),
				);

				// Reference and then unreference the blob via one of the handles so that it's unreferenced in next summary.
				mainDataStore._root.set("blob1", blobHandle1);
				mainDataStore._root.delete("blob1");

				// Summarize so that the above attachment blobs are marked unreferenced.
				await provider.ensureSynchronized();
				await summarizeNow(summarizer);

				// Wait for sweep full timeout so that blob is ready to be deleted.
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
				await waitForContainerConnection(mainContainer, true);

				const { summarizer, container: summarizerContainer } = await createSummarizer(
					provider,
					mainContainer,
					summarizerContainerConfig,
				);

				// Remove the blob's handle to unreference it.
				mainDataStore._root.delete("blob");

				// Summarize so that the above attachment blob is marked unreferenced.
				await provider.ensureSynchronized();
				await summarizeNow(summarizer);

				// Wait for sweep full timeout so that blob is ready to be deleted.
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
				const { mainContainer, mainDataStore } = await createDetachedContainerAndDataStore();

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
					summarizerContainerConfig,
				);

				// Summarize so that the above attachment blob is marked unreferenced.
				await provider.ensureSynchronized();
				await summarizeNow(summarizer);

				// Wait for sweep full timeout so that blob is ready to be deleted.
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
				const { mainContainer, mainDataStore } = await createDetachedContainerAndDataStore();

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
					summarizerContainerConfig,
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

				// Wait for sweep full timeout so that blob is ready to be deleted.
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
				summarizerContainerConfig,
			);
			await provider.ensureSynchronized();
			await summarizeNow(summarizer);
			return { summarizer, summarizerContainer };
		}

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

				// Wait for sweep full timeout so that blob is ready to be deleted.
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

				// Wait for sweep full timeout so that blob is ready to be deleted.
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

				// Wait for sweep full timeout so that blob is ready to be deleted.
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
		it(`updates deleted blob state in the summary`, async () => {
			const { dataStore: mainDataStore, summarizer } = await createDataStoreAndSummarizer();

			// Upload an attachment blob.
			const blob1Contents = "Blob contents 1";
			const blob1Handle = toFluidHandleInternal(
				await mainDataStore._runtime.uploadBlob(stringToBuffer(blob1Contents, "utf-8")),
			);
			const blob1NodePath = blob1Handle.absolutePath;

			// Reference and then unreference the blob so that it's unreferenced in the next summary.
			mainDataStore._root.set("blob1", blob1Handle);
			mainDataStore._root.delete("blob1");

			// Summarize so that blob is marked unreferenced.
			await provider.ensureSynchronized();
			await summarizeNow(summarizer);

			// Wait for sweep full timeout so that blob is ready to be deleted.
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
			validateBlobStateInSummary(
				summary3.summaryTree,
				blob1NodePath,
				true /* expectDelete */,
				false /* expectGCStateHandle */,
			);
		});
	});

	describe("Sweep with summarize failures and retries", () => {
		const summarizeErrorMessage = "SimulatedTestFailure";
		/**
		 * This function does the following:
		 * 1. Overrides the summarize function of the given container runtime to fail until final summarize attempt.
		 *
		 * 2. If "blockInboundGCOp" is true, pauses the inbound queue until the final summarize attempt is completed
		 * so that the GC op is not processed until then.
		 *
		 * 3. Generates and returns a promise which resolves with ISummarizeEventProps on successful summarization.
		 */
		async function overrideSummarizeAndGetCompletionPromise(
			summarizer: ISummarizer,
			containerRuntime: ContainerRuntime,
			blockInboundGCOp: boolean = false,
		) {
			let latestAttemptProps: ISummarizeEventProps | undefined;
			const summarizePromiseP = new Promise<ISummarizeEventProps>((resolve, reject) => {
				const handler = (eventProps: ISummarizeEventProps) => {
					latestAttemptProps = eventProps;
					if (eventProps.result !== "failure") {
						summarizer.off("summarize", handler);
						resolve(eventProps);
					} else {
						if (eventProps.error?.message !== summarizeErrorMessage) {
							reject(new Error("Unexpected summarization failure"));
						}
						if (eventProps.currentAttempt === eventProps.maxAttempts) {
							summarizer.off("summarize", handler);
							resolve(eventProps);
						}
					}
				};
				summarizer.on("summarize", handler);
			});

			// Pause the inbound queue so that GC ops are not processed in between failures. This will be resumed
			// before the final attempt.
			if (blockInboundGCOp) {
				await toIDeltaManagerFull(containerRuntime.deltaManager).inbound.pause();
			}

			let summarizeFunc = containerRuntime.summarize;
			const summarizeOverride = async (options: any) => {
				summarizeFunc = summarizeFunc.bind(containerRuntime);
				const results = await summarizeFunc(options);
				// If this is not the last attempt, throw an error so that summarize fails.
				if (
					latestAttemptProps === undefined ||
					latestAttemptProps.maxAttempts - latestAttemptProps.currentAttempt > 1
				) {
					throw new RetriableSummaryError(summarizeErrorMessage, 0.1);
				}
				// If this is the last attempt, resume the inbound queue to let the GC ops (if any) through.
				if (blockInboundGCOp) {
					toIDeltaManagerFull(containerRuntime.deltaManager).inbound.resume();
				}
				return results;
			};
			containerRuntime.summarize = summarizeOverride;
			return { originalSummarize: summarizeFunc, summarizePromiseP };
		}

		/**
		 * In these test, summarize fails until the final attempt but GC succeeds in each of the attempts.
		 * - In case of "multiple" gcOps, in every attempt, GC sends a sweep op with the same deleted blob.
		 * - In case of "one+" gcOps, in the first attempt, GC sends a sweep op. Depending on when this op is
		 * processed, there will be one or more GC ops for the summarization.
		 * It validates that in these scenario, the blob is correctly deleted and nothing unexpected happens.
		 */
		for (const gcOps of ["one+", "multiple"]) {
			itExpects(
				`sweep with multiple successful GC runs and [${gcOps}] GC op(s) for a single successful summarization`,
				[
					{
						eventName: "fluid:telemetry:Summarizer:Running:Summarize_cancel",
						clientType: "noninteractive/summarizer",
						summaryAttempts: 1,
						finalAttempt: false,
						error: summarizeErrorMessage,
					},
					{
						eventName: "fluid:telemetry:Summarizer:Running:Summarize_cancel",
						clientType: "noninteractive/summarizer",
						summaryAttempts: 2,
						finalAttempt: false,
						error: summarizeErrorMessage,
					},
					{
						eventName: "fluid:telemetry:Summarizer:Running:Summarize_cancel",
						clientType: "noninteractive/summarizer",
						summaryAttempts: 3,
						finalAttempt: false,
						error: summarizeErrorMessage,
					},
					{
						eventName: "fluid:telemetry:Summarizer:Running:Summarize_cancel",
						clientType: "noninteractive/summarizer",
						summaryAttempts: 4,
						finalAttempt: false,
						error: summarizeErrorMessage,
					},
					{
						eventName: "fluid:telemetry:BlobManager:GC_Deleted_Blob_Requested",
						clientType: "interactive",
					},
				],
				async () => {
					const { dataStore: mainDataStore, summarizer } =
						await createDataStoreAndSummarizer();

					// Upload an attachment blob.
					const blob1Contents = "Blob contents 1";
					const blob1Handle = toFluidHandleInternal(
						await mainDataStore._runtime.uploadBlob(stringToBuffer(blob1Contents, "utf-8")),
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

					const containerRuntime = (summarizer as any).runtime as ContainerRuntime;

					// Set up event handle to count number of GC sweep ops sent to validate that the correct number of
					// sweep ops are generated.
					let gcSweepOpCount = 0;
					containerRuntime.on("op", (op) => {
						if (op.type === ContainerMessageType.GC) {
							if ((op.contents as ISweepMessage).type === "Sweep") {
								gcSweepOpCount++;
							}
						}
					});

					// Set up summarize to fail until the final attempt.
					// If there should be multiple GC ops, pause the Inbound queue so that GC ops are not processed
					// between summarize attempts and they are sent on every GC run.
					const { originalSummarize, summarizePromiseP } =
						await overrideSummarizeAndGetCompletionPromise(
							summarizer,
							containerRuntime,
							gcOps === "multiple",
						);

					// Summarize. There will be multiple summary attempts and in each, GC runs successfully.
					// In "one+" gcOps scenario, a GC op will be sent in first attempt and it may be processed by the
					// time next attempt starts. The blob may be deleted in this summary itself.
					// In "multiple" gcOps scenario, a GC op will be sent in every attempt and will not be processed
					// until the summary successfully completes. The blob will be deleted in the next summary.
					let summary = await summarizeNow(summarizer, {
						reason: "test",
						retryOnFailure: true,
					});

					// Validate that the summary succeeded on final attempt.
					const props = await summarizePromiseP;
					assert.equal(props.result, "success", "The summary should have been successful");
					assert.equal(
						props.currentAttempt,
						defaultMaxAttemptsForSubmitFailures,
						`The summary should have succeeded at attempt number ${defaultMaxAttemptsForSubmitFailures}`,
					);

					if (gcOps === "multiple") {
						assert.equal(gcSweepOpCount, props.currentAttempt, "Incorrect number of GC ops");
					} else {
						assert(gcSweepOpCount >= 1, "Incorrect number of GC ops");
					}

					// If the number of GC ops sent is equal to the number of summarize attempts, then the blob
					// won't be deleted in this summary. That's because the final GC run didn't know about the deletion
					// and sent a GC op.
					const expectedDeletedInFirstSummary =
						gcSweepOpCount !== defaultMaxAttemptsForSubmitFailures;

					// In "one+" gcOps scenario, the blob may or may not have been deleted depending on how many
					// ops were sent out as described above.
					// In "multiple" gcOps scenario, the blob will not be deleted yet because the inbound queue
					// was paused and GC sweep ops will be processed later.
					// The GC state will be a handle if blob is not deleted because it would not have changed
					// since last time.
					validateBlobStateInSummary(
						summary.summaryTree,
						blob1NodePath,
						expectedDeletedInFirstSummary /* expectDelete */,
						gcOps === "multiple" /* expectGCStateHandle */,
					);

					// Load a container from the above summary, process all ops (including any GC ops) and validate that
					// the deleted blob cannot be retrieved.
					// We load with GC Disabled to confirm that the GC Op is processed regardless of such settings
					const config_gcSweepDisabled = JSON.parse(
						JSON.stringify(testContainerConfig),
					) as ITestContainerConfig;
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					config_gcSweepDisabled.runtimeOptions!.gcOptions!.enableGCSweep = undefined;
					const container2 = await loadContainer(
						summary.summaryVersion,
						config_gcSweepDisabled,
					);
					await waitForContainerConnection(container2);

					await provider.ensureSynchronized();
					const defaultDataStoreContainer2 =
						(await container2.getEntryPoint()) as ITestDataObject;
					const handle = manufactureHandle<ITestDataObject>(
						defaultDataStoreContainer2._context.IFluidHandleContext,
						blob1NodePath,
					);
					await assert.rejects(
						async () => handle.get(),
						(error: any) => {
							const correctErrorType = error.code === 404;
							const correctErrorMessage = error.message as string;
							return correctErrorType && correctErrorMessage.startsWith("Blob was deleted:");
						},
						`Should not be able to get deleted blob`,
					);

					// Revert summarize to not fail anymore.
					containerRuntime.summarize = originalSummarize;

					// Summarize again.
					summary = await summarizeNow(summarizer);

					// The blob should be deleted from the summary / GC tree.
					// The GC state will be a handle if the blob was deleted in the previous summary because it
					// would not have changed since last time.
					validateBlobStateInSummary(
						summary.summaryTree,
						blob1NodePath,
						true /* expectDelete */,
						expectedDeletedInFirstSummary /* expectGCStateHandle */,
					);
				},
			);
		}
	});
});
