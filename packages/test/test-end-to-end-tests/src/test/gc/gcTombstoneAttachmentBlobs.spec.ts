/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IGCRuntimeOptions } from "@fluidframework/container-runtime";
import {
    requestFluidObject } from "@fluidframework/runtime-utils";
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
import { LoaderHeader } from "@fluidframework/container-definitions";
import { IOdspResolvedUrl } from "@fluidframework/odsp-driver-definitions";
import { getUrlFromItemId, MockDetachedBlobStorage } from "../mockDetachedBlobStorage";

/**
 * These tests validate that SweepReady attachment blobs are correctly marked as tombstones. Tombstones should be added
 * to the summary and changing them (sending / receiving ops, loading, etc.) is not allowed.
 */
describeNoCompat("GC attachment blob tombstone tests", (getTestObjectProvider) => {
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
        return provider.loadTestContainer(
            testContainerConfig,
            { [LoaderHeader.version]: summaryVersion },
        );
    }

    describe("Attachment blobs in attached container", () => {
        async function createDataStoreAndSummarizer() {
            const container = await provider.makeTestContainer(testContainerConfig);
            const dataStore = await requestFluidObject<ITestDataObject>(container, "default");

            // Send an op to transition the container to write mode.
            dataStore._root.set("transition to write", "true");
            await waitForContainerConnection(container);

            const summarizer = await createSummarizer(
                provider,
                container,
                undefined /* summaryVersion */,
                gcOptions,
                mockConfigProvider(settings),
            );

            return { dataStore, summarizer };
        }

        beforeEach(async function() {
            provider = getTestObjectProvider({ syncSummarizer: true });
            if (provider.driver.type !== "local") {
                this.skip();
            }

            settings["Fluid.GarbageCollection.ThrowOnTombstoneUsage"] = true;
            settings["Fluid.GarbageCollection.TestOverride.SweepTimeoutMs"] = sweepTimeoutMs;
        });

        itExpects("fails retrieval of tombstones attachment blobs",
        [
            {
                eventName: "fluid:telemetry:BlobManager:GC_Tombstone_Blob_Requested",
            },
        ], async () => {
            const { dataStore: mainDataStore, summarizer } = await createDataStoreAndSummarizer();

            // Upload an attachment blob.
            const blobContents = "Blob contents";
            const blobHandle = await mainDataStore._runtime.uploadBlob(stringToBuffer(blobContents, "utf-8"));

            // Reference and then unreference the blob so that it's unreferenced in the next summary.
            mainDataStore._root.set("blob1", blobHandle);
            mainDataStore._root.delete("blob1");

            // Summarize so that the above attachment blobs are marked unreferenced.
            await provider.ensureSynchronized();
            await summarizeNow(summarizer);

            // Wait for sweep timeout so that the blobs are tombstoned.
            await delay(sweepTimeoutMs + 10);

            // Send an op to update the current reference timestamp that GC uses to make sweep ready objects.
            mainDataStore._root.set("key", "value");
            await provider.ensureSynchronized();

            // Summarize so that the tombstoned blobs are now part of the summary.
            const summary2 = await summarizeNow(summarizer);
            const container2 = await loadContainer(summary2.summaryVersion);

            // Retrieving the blob should fail. Note that the blob is requested via its url since this container does
            // not have access to the blob's handle.
            const response = await container2.request({ url: blobHandle.absolutePath });
            assert.strictEqual(response?.status, 404, `Expecting a 404 response`);
            assert(response.value.startsWith("Blob removed by gc:"), `Unexpected response value`);
            assert(container2.closed !== true, "Container should not have closed");
        });

        itExpects("fails retrieval of blobs that are de-duped in same container and are tombstoned",
        [
            {
                eventName: "fluid:telemetry:BlobManager:GC_Tombstone_Blob_Requested",
            },
            {
                eventName: "fluid:telemetry:BlobManager:GC_Tombstone_Blob_Requested",
            },
        ], async () => {
            const { dataStore: mainDataStore, summarizer } = await createDataStoreAndSummarizer();

            // Upload an attachment blob.
            const blobContents = "Blob contents";
            const blobHandle1 = await mainDataStore._runtime.uploadBlob(stringToBuffer(blobContents, "utf-8"));

            // Upload another blob with the same content so that it is de-duped.
            const blobHandle2 = await mainDataStore._runtime.uploadBlob(stringToBuffer(blobContents, "utf-8"));
            assert.strictEqual(blobHandle1.absolutePath, blobHandle2.absolutePath, "Blobs are not de-duped");

            // Reference and then unreference the blob via one of the handles so that it's unreferenced in next summary.
            mainDataStore._root.set("blob1", blobHandle1);
            mainDataStore._root.delete("blob1");

            // Summarize so that the above attachment blobs are marked unreferenced.
            await provider.ensureSynchronized();
            await summarizeNow(summarizer);

            // Wait for sweep timeout so that the blobs are tombstoned.
            await delay(sweepTimeoutMs + 10);

            // Send an op to update the current reference timestamp that GC uses to make sweep ready objects.
            mainDataStore._root.set("key", "value");
            await provider.ensureSynchronized();

            // Summarize so that te tombstoned blobs are now part of the summary.
            const summary2 = await summarizeNow(summarizer);

            // Load a container from the above summary. Retrieving the blob via any of the handles should fail. Note
            // that the blob is requested via its url since this container does not have access to the blob's handle.
            const container2 = await loadContainer(summary2.summaryVersion);
            const response1 = await container2.request({ url: blobHandle1.absolutePath });
            assert.strictEqual(response1?.status, 404, `Expecting a 404 response for blob handle 1`);
            assert(response1.value.startsWith("Blob removed by gc:"), `Unexpected response value for blob handle 1`);

            const response2 = await container2.request({ url: blobHandle2.absolutePath });
            assert.strictEqual(response2?.status, 404, `Expecting a 404 response for blob handle 2`);
            assert(response2.value.startsWith("Blob removed by gc:"), `Unexpected response value for blob handle 2`);
        });

        itExpects("Can un-tombstone attachment blob by storing a handle",
        [
            {
                eventName: "fluid:telemetry:BlobManager:GC_Tombstone_Blob_Requested",
            },
            { eventName: "fluid:telemetry:Summarizer:Running:SweepReadyObject_Revived" },
        ],
        async () => {
            const { dataStore: mainDataStore, summarizer } = await createDataStoreAndSummarizer();

            // Upload an attachment blob.
            const blobContents = "Blob contents";
            const blobHandle1 = await mainDataStore._runtime.uploadBlob(stringToBuffer(blobContents, "utf-8"));

            // Reference and then unreference the blob so that it's unreferenced in next summary.
            mainDataStore._root.set("blob1", blobHandle1);
            mainDataStore._root.delete("blob1");

            // Summarize so that the above attachment blob is marked unreferenced.
            await provider.ensureSynchronized();
            await summarizeNow(summarizer);

            // Wait for sweep timeout so that the blob is tombstoned.
            await delay(sweepTimeoutMs + 10);

            // Send an op to update the current reference timestamp that GC uses to make sweep ready objects.
            mainDataStore._root.set("key", "value");
            await provider.ensureSynchronized();

            // Summarize so that the tombstoned blob is now part of the summary.
            const summary2 = await summarizeNow(summarizer);

            // Load a container from the above summary. Retrieving the blob should fail. Note that the blob is requested
            // via its url since this container does not have access to the blob's handle.
            const container2 = await loadContainer(summary2.summaryVersion);
            const response1 = await container2.request({ url: blobHandle1.absolutePath });
            assert.strictEqual(response1?.status, 404, `Expecting a 404 response for blob handle 1`);
            assert(response1.value.startsWith("Blob removed by gc:"), `Unexpected response value for blob handle 1`);
            container2.close();

            // Reference the blob in the main container where it's not a tombstone yet. This should un-tombstone the
            // blob. It will result in a SweepReadyObject_Revived error log.
            mainDataStore._root.set("blob1", blobHandle1);

            // Summarize so that the blob is not a tombstone in the summary.
            await provider.ensureSynchronized();
            const summary3 = await summarizeNow(summarizer);

            // Load a container from the above summary. Retrieving the blob should now pass. Note that the blob is
            // requested via its url since this container does not have access to the blob's handle.
            const container3 = await loadContainer(summary3.summaryVersion);
            const response2 = await container3.request({ url: blobHandle1.absolutePath });
            assert.strictEqual(response2?.status, 200, `Expecting a 200 response for blob handle 1`);
        });

        itExpects("logs error on retrieval of tombstones attachment blobs when ThrowOnTombstoneUsage is not enabled",
        [
            {
                eventName: "fluid:telemetry:BlobManager:GC_Tombstone_Blob_Requested",
            },
            {
                error: "SweepReadyObject_Loaded",
                eventName: "fluid:telemetry:ContainerRuntime:GarbageCollector:SweepReadyObject_Loaded",
            },
        ],
        async () => {
            // Turn ThrowOnTombstoneUsage setting off.
            settings["Fluid.GarbageCollection.ThrowOnTombstoneUsage"] = false;

            const { dataStore: mainDataStore, summarizer } = await createDataStoreAndSummarizer();

            // Upload an attachment blob.
            const blobContents = "Blob contents";
            const blobHandle = await mainDataStore._runtime.uploadBlob(stringToBuffer(blobContents, "utf-8"));

            // Reference and then unreference the blob so that it's unreferenced in the next summary.
            mainDataStore._root.set("blob1", blobHandle);
            mainDataStore._root.delete("blob1");

            // Summarize so that the above attachment blobs are marked unreferenced.
            await provider.ensureSynchronized();
            await summarizeNow(summarizer);

            // Wait for sweep timeout so that the blobs are tombstoned.
            await delay(sweepTimeoutMs + 10);

            // Send an op to update the current reference timestamp that GC uses to make sweep ready objects.
            mainDataStore._root.set("key", "value");
            await provider.ensureSynchronized();

            // Summarize so that the tombstoned blobs are now part of the summary.
            const summary2 = await summarizeNow(summarizer);
            const container2 = await loadContainer(summary2.summaryVersion);

            // Retrieving the blob should fail. Note that the blob is requested via its url since this container does
            // not have access to the blob's handle.
            const response = await container2.request({ url: blobHandle.absolutePath });
            assert.strictEqual(response?.status, 200, `Expecting a 200 response`);
            assert(container2.closed !== true, "Container should not have closed");
        });

        /**
         * Function that rejects instead of not rejecting. Used in these tests to demonstrate that because of a bug we
         * are not getting the expected results. Once the bug is fixed, these asserts should start working as expected.
         */
        async function assertWronglyRejects(block: Promise<any>, message?: string | Error) {
            return assert.rejects(block, message);
        };

        /**
         * This test validates that when blobs are de-duped in different containers, these containers can use these
         * blobs irrespective of whether the original blob is tombstoned. Basically, after uploading a blob, a container
         * should be able to use it the same way whether it was de-duped or not.
         */
        itExpects("should allow access to blobs that are de-duped in different containers",
        [
            { eventName: "fluid:telemetry:BlobManager:GC_Tombstone_Blob_Requested" }
        ],
        async () => {
            const { dataStore: mainDataStore, summarizer } = await createDataStoreAndSummarizer();

            // Upload an attachment blob.
            const blobContents = "Blob contents";
            const blobHandle = await mainDataStore._runtime.uploadBlob(stringToBuffer(blobContents, "utf-8"));

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
            const container2MainDataStore = await requestFluidObject<ITestDataObject>(container2, "default");
            // Upload the blob and keep the handle around until the blob uploaded by first container is tombstoned.
            const container2BlobHandle =
                await container2MainDataStore._runtime.uploadBlob(stringToBuffer(blobContents, "utf-8"));

            // Wait for sweep timeout so that the blob uploaded by the first container is tombstoned.
            await delay(sweepTimeoutMs / 2 + 10);

            // Send an op to update the current reference timestamp that GC uses to make sweep ready objects.
            mainDataStore._root.set("key", "value");
            await provider.ensureSynchronized();

            // Summarize so that the tombstoned blob is now part of the summary.
            const summary2 = await summarizeNow(summarizer);

            // Load a container from this summary and upload a blob with the same content as the tombstoned blob.
            // This blob will get de-duped but it should be fine to use it because from this container's perspective
            // it uploaded a brand new blob.
            const container3 = await loadContainer(summary2.summaryVersion);
            const container3MainDataStore = await requestFluidObject<ITestDataObject>(container3, "default");

            const container3BlobHandle =
                await container3MainDataStore._runtime.uploadBlob(stringToBuffer(blobContents, "utf-8"));
            // Ideally, this should not reject but currently it will because of a bug with how blob de-dup interacts
            // with GC.
            await assertWronglyRejects(container3BlobHandle.get(), "Container3 should be able to get the blob");

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
        async function createContainerAndDataStore() {
            const detachedBlobStorage = new MockDetachedBlobStorage();
            const loader = provider.makeTestLoader({
                ...testContainerConfig,
                loaderProps: { ...testContainerConfig.loaderProps, detachedBlobStorage },
            });
            const container = await loader.createDetachedContainer(provider.defaultCodeDetails);
            const dataStore = await requestFluidObject<ITestDataObject>(container, "/");
            return { container, dataStore };
        }

        beforeEach(async function() {
            provider = getTestObjectProvider();
            if (provider.driver.type !== "odsp") {
                this.skip();
            }

            settings["Fluid.GarbageCollection.ThrowOnTombstoneUsage"] = true;
            settings["Fluid.GarbageCollection.TestOverride.SweepTimeoutMs"] = sweepTimeoutMs;
        });

        itExpects("tombstones blobs uploaded in detached container",
        [
            {
                eventName: "fluid:telemetry:BlobManager:GC_Tombstone_Blob_Requested",
            },
        ],
        async () => {
            const { container: mainContainer, dataStore: mainDataStore } = await createContainerAndDataStore();

            // Upload an attachment blob and mark it referenced by storing its handle in a DDS.
            const blobContents = "Blob contents";
            const blobHandle = await mainDataStore._context.uploadBlob(stringToBuffer(blobContents, "utf-8"));
            mainDataStore._root.set("blob", blobHandle);

            // Attach the container after the blob is uploaded.
            await mainContainer.attach(provider.driver.createCreateNewRequest(provider.documentId));

            // Send an op to transition the container to write mode.
            mainDataStore._root.set("transition to write", "true");
            await waitForContainerConnection(mainContainer);

            const summarizer = await createSummarizer(
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

            // Wait for sweep timeout so that the blob is tombstoned.
            await delay(sweepTimeoutMs + 10);

            // Send an op to update the current reference timestamp that GC uses to make sweep ready objects.
            mainDataStore._root.set("key", "value");
            await provider.ensureSynchronized();

            // Summarize so that the tombstoned blob should are now part of the summary.
            const summary2 = await summarizeNow(summarizer);

            // Load a new container from the above summary which should have the blob tombstoned.
            const url = getUrlFromItemId((mainContainer.resolvedUrl as IOdspResolvedUrl).itemId, provider);
            const container2 = await provider.makeTestLoader(testContainerConfig).resolve({
                url,
                headers: { [LoaderHeader.version]: summary2.summaryVersion },
            });

            // Retrieving the blob should fail. Note that the blob is requested via its url since this container does
            // not have access to the blob's handle.
            const response = await container2.request({ url: blobHandle.absolutePath });
            assert.strictEqual(response?.status, 404, `Expecting a 404 response`);
            assert(response.value.startsWith("Blob removed by gc:"), `Unexpected response value`);
            assert(container2.closed !== true, "Container should not have closed");
        });

        itExpects("tombstones blobs uploaded in detached and de-duped in attached container",
        [
            {
                eventName: "fluid:telemetry:BlobManager:GC_Tombstone_Blob_Requested",
            },
            {
                eventName: "fluid:telemetry:BlobManager:GC_Tombstone_Blob_Requested",
            }
        ],
        async () => {
            const { container: mainContainer, dataStore: mainDataStore } = await createContainerAndDataStore();

            // Upload an attachment blob. We should get a handle with a localId for the blob. Mark it referenced by
            // storing its handle in a DDS.
            const blobContents = "Blob contents";
            const localHandle = await mainDataStore._context.uploadBlob(stringToBuffer(blobContents, "utf-8"));
            mainDataStore._root.set("localBlob", localHandle);

            // Attach the container after the blob is uploaded.
            await mainContainer.attach(provider.driver.createCreateNewRequest(provider.documentId));

            // Send an op to transition the container to write mode.
            mainDataStore._root.set("transition to write", "true");
            await waitForContainerConnection(mainContainer);

            const summarizer = await createSummarizer(
                provider,
                mainContainer,
                undefined /* summaryVersion */,
                gcOptions,
                mockConfigProvider(settings),
            );


            // Upload the same blob. This will get de-duped and we will get back a handle with the storageId instead of
            // the localId that we got when uploading in detached container.
            const storageHandle = await mainDataStore._context.uploadBlob(stringToBuffer(blobContents, "utf-8"));
            assert.notStrictEqual(
                localHandle.absolutePath, storageHandle.absolutePath, "local and storage handles should be different");

            // Remove the blob's handle to unreference it.
            mainDataStore._root.delete("localBlob");

            // Summarize so that the above attachment blob is marked unreferenced.
            await provider.ensureSynchronized();
            await summarizeNow(summarizer);

            // Wait for sweep timeout so that the blob is tombstoned.
            await delay(sweepTimeoutMs + 10);

            // Send an op to update the current reference timestamp that GC uses to make sweep ready objects.
            mainDataStore._root.set("key", "value");
            await provider.ensureSynchronized();

            // Summarize so that the tombstoned blob is now  part of the summary.
            const summary2 = await summarizeNow(summarizer);

            // Load a new container from the above summary which should have the blob tombstoned.
            const url = getUrlFromItemId((mainContainer.resolvedUrl as IOdspResolvedUrl).itemId, provider);
            const container2 = await provider.makeTestLoader(testContainerConfig).resolve({
                url,
                headers: { [LoaderHeader.version]: summary2.summaryVersion },
            });

            // Retrieving the blob via any of the handles should fail. Note that the blob is requested via its url since
            // this container does not have access to the blob's handle.
            const localResponse = await container2.request({ url: localHandle.absolutePath });
            assert.strictEqual(localResponse?.status, 404, `Expecting a 404 response for local handle`);
            assert(localResponse.value.startsWith("Blob removed by gc:"), `Unexpected value for local handle 1`);

            // Retrieving the blob via the storage handle should fail as well.
            const storageResponse = await container2.request({ url: storageHandle.absolutePath });
            assert.strictEqual(storageResponse?.status, 404, `Expecting a 404 response for storage handle`);
            assert(storageResponse.value.startsWith("Blob removed by gc:"), `Unexpected value for local handle 2`);
        });

        itExpects("tombstones blobs uploaded and de-duped in detached container",
        [
            {
                eventName: "fluid:telemetry:BlobManager:GC_Tombstone_Blob_Requested",
            },
            {
                eventName: "fluid:telemetry:BlobManager:GC_Tombstone_Blob_Requested",
            },
            {
                eventName: "fluid:telemetry:BlobManager:GC_Tombstone_Blob_Requested",
            }
        ],
        async () => {
            const { container: mainContainer, dataStore: mainDataStore } = await createContainerAndDataStore();

            // Upload couple of attachment blobs with the same content. When these blobs are uploaded to the server,
            // they will be de-duped and redirect to the same storageId.
            const blobContents = "Blob contents";
            const localHandle1 = await mainDataStore._context.uploadBlob(stringToBuffer(blobContents, "utf-8"));
            const localHandle2 = await mainDataStore._context.uploadBlob(stringToBuffer(blobContents, "utf-8"));

            // Attach the container after the blob is uploaded.
            await mainContainer.attach(provider.driver.createCreateNewRequest(provider.documentId));

            // Send an op to transition the container to write mode.
            mainDataStore._root.set("transition to write", "true");
            await waitForContainerConnection(mainContainer);

            const summarizer = await createSummarizer(
                provider,
                mainContainer,
                undefined /* summaryVersion */,
                gcOptions,
                mockConfigProvider(settings),
            );

            // Add the blob's local handles to reference them.
            mainDataStore._root.set("localBlob1", localHandle1);
            mainDataStore._root.set("localBlob2", localHandle2);

            // Upload the same blob. This will get de-duped and we will get back a handle with the storageId instead of
            // the localId that we got when uploading in detached container.
            const storageHandle = await mainDataStore._context.uploadBlob(stringToBuffer(blobContents, "utf-8"));
            assert.notStrictEqual(
                localHandle1.absolutePath, storageHandle.absolutePath, "local and storage handles should be different");

            // Remove the blob's local handles to unreference them.
            mainDataStore._root.delete("localBlob1");
            mainDataStore._root.delete("localBlob2");

            // Summarize so that the above attachment blobs are marked unreferenced.
            await provider.ensureSynchronized();
            await summarizeNow(summarizer);

            // Wait for sweep timeout so that the blob is tombstoned.
            await delay(sweepTimeoutMs + 10);

            // Send an op to update the current reference timestamp that GC uses to make sweep ready objects.
            mainDataStore._root.set("key", "value");
            await provider.ensureSynchronized();

            // Summarize so that the tombstoned blobs are now part of the summary.
            const summary2 = await summarizeNow(summarizer);

            // Load a new container from the above summary which should have the blobs tombstoned.
            const url = getUrlFromItemId((mainContainer.resolvedUrl as IOdspResolvedUrl).itemId, provider);
            const container2 = await provider.makeTestLoader(testContainerConfig).resolve({
                url,
                headers: { [LoaderHeader.version]: summary2.summaryVersion },
            });

            // Retrieving the blob via any of the handles should fail. Note that the blob is requested via its url since
            // this container does not have access to the blob's handle.
            const localResponse1 = await container2.request({ url: localHandle1.absolutePath });
            assert.strictEqual(localResponse1?.status, 404, `Expecting a 404 response for local handle 1`);
            assert(localResponse1.value.startsWith("Blob removed by gc:"), `Unexpected value for local handle 1`);

            const localResponse2 = await container2.request({ url: localHandle2.absolutePath });
            assert.strictEqual(localResponse2?.status, 404, `Expecting a 404 response for local handle 2`);
            assert(localResponse2.value.startsWith("Blob removed by gc:"), `Unexpected value for local handle 2`);

            const storageResponse = await container2.request({ url: storageHandle.absolutePath });
            assert.strictEqual(storageResponse?.status, 404, `Expecting a 404 response for storage handle`);
            assert(storageResponse.value.startsWith("Blob removed by gc:"), `Unexpected value for storage handle`);
        });
    });
});
