/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    IGCRuntimeOptions,
    ISummarizer,
} from "@fluidframework/container-runtime";
import {
    requestFluidObject } from "@fluidframework/runtime-utils";
import {
    ITestObjectProvider,
    createSummarizerWithContainer,
    summarizeNow,
    waitForContainerConnection,
    mockConfigProvider,
    ITestContainerConfig,
} from "@fluidframework/test-utils";
import { describeNoCompat, ITestDataObject, itExpects } from "@fluidframework/test-version-utils";
import { delay, stringToBuffer } from "@fluidframework/common-utils";
import { LoaderHeader } from "@fluidframework/container-definitions";

describeNoCompat("GC tombstone blob tests", (getTestObjectProvider) => {
    const waitLessThanSweepTimeoutMs = 100;
    const sweepTimeoutMs = 200;
    assert(waitLessThanSweepTimeoutMs < sweepTimeoutMs, "waitLessThanSweepTimeoutMs should be < sweepTimeoutMs");
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
    let documentAbsoluteUrl: string | undefined;

    const makeContainer = async () => {
        const container = await provider.makeTestContainer(testContainerConfig);
        documentAbsoluteUrl = await container.getAbsoluteUrl("");
        return container;
    };

    async function loadContainer(summaryVersion: string) {
        return provider.loadTestContainer(
            testContainerConfig,
            { [LoaderHeader.version]: summaryVersion },
        );
    }

    const loadSummarizerAndContainer = async (summaryVersion?: string) => {
        return createSummarizerWithContainer(
            provider,
            documentAbsoluteUrl,
            summaryVersion,
            gcOptions,
            mockConfigProvider(settings),
        );
    };
    const summarize = async (summarizer: ISummarizer) => {
        await provider.ensureSynchronized();
        return summarizeNow(summarizer);
    };

    beforeEach(async function() {
        provider = getTestObjectProvider({ syncSummarizer: true });
        if (provider.driver.type !== "local") {
            this.skip();
        }
        settings["Fluid.GarbageCollection.ThrowOnTombstoneUsage"] = true;
        settings["Fluid.GarbageCollection.TestOverride.SweepTimeoutMs"] = sweepTimeoutMs;
    });

    // This function creates an unreferenced blob and returns the blob's id and the summary version that
    // blob was unreferenced in.
    const summarizationWithUnreferencedBlobAfterTime =
    async (approximateUnreferenceTimestampMs: number) => {
        const container = await makeContainer();
        const defaultDataObject = await requestFluidObject<ITestDataObject>(container, "default");
        await waitForContainerConnection(container);

        // Create blob
        const handleKey = "handle";
        const blobContents = "Blob contents";
        const blobHandle = await defaultDataObject._runtime.uploadBlob(stringToBuffer(blobContents, "utf-8"));

        // Reference a blob - important for making it live
        defaultDataObject._root.set(handleKey, blobHandle);

        // Unreference a blob
        defaultDataObject._root.delete(handleKey);

        // Summarize
        const {
            container: summarizingContainer1,
            summarizer: summarizer1,
        } = await loadSummarizerAndContainer();
        const summaryVersion = (await summarize(summarizer1)).summaryVersion;

        // Close the containers as these containers would be closed by session expiry before sweep ready ever occurs
        container.close();
        summarizingContainer1.close();

        // Wait some time, the datastore can be in many different unreference states
        await delay(approximateUnreferenceTimestampMs);

        // Load a new container and summarizer based on the latest summary, summarize
        const {
            container: summarizingContainer2,
            summarizer: summarizer2,
        } = await loadSummarizerAndContainer(summaryVersion);

        return {
            absolutePath: blobHandle.absolutePath,
            summarizingContainer: summarizingContainer2,
            summarizer: summarizer2,
            summaryVersion,
        };
    };

    // If this test starts failing due to runtime is closed errors try first adjusting `sweepTimeoutMs` above
    itExpects("Handle request for tombstoned blobs fails in summarizing container loaded after sweep timeout",
    [
        {
            error: "GC_Tombstone_Blob_Requested",
            eventName: "fluid:telemetry:BlobManager:GC_Tombstone_Blob_Requested",
            viaHandle: true,
        },
    ],
    async () => {
        const {
            absolutePath,
            summarizingContainer,
            summarizer,
        } = await summarizationWithUnreferencedBlobAfterTime(sweepTimeoutMs);
        // The blob should be tombstoned now
        const { summaryVersion } = await summarize(summarizer);

        const container = await loadContainer(summaryVersion);
        const defaultDataObject = await requestFluidObject<ITestDataObject>(container, "default");
        const fluidHandleContext = defaultDataObject._context.containerRuntime.IFluidHandleContext;

        // Handle requests for blob handle should fail!
        const response = await fluidHandleContext.resolveHandle({ url: absolutePath });
        assert(response?.status === 404, `Expecting a 404 response!`);
        assert(response.value.startsWith("Blob removed by gc:"));
        assert(summarizingContainer.closed !== true, "Summarizing container should not have closed!");
        assert(container.closed !== true, "Container does not close");
    });

    // If this test starts failing due to runtime is closed errors try first adjusting `sweepTimeoutMs` above
    itExpects("Handle request for tombstoned blobs only logs in summarizing container loaded after sweep timeout",
    [
        {
            error: "GC_Tombstone_Blob_Requested",
            eventName: "fluid:telemetry:BlobManager:GC_Tombstone_Blob_Requested",
            viaHandle: true,
        },
        {
            error: "SweepReadyObject_Loaded",
            eventName: "fluid:telemetry:ContainerRuntime:GarbageCollector:SweepReadyObject_Loaded",
        },
    ],
    async () => {
        settings["Fluid.GarbageCollection.ThrowOnTombstoneUsage"] = false;
        const {
            absolutePath,
            summarizingContainer,
            summarizer,
        } = await summarizationWithUnreferencedBlobAfterTime(sweepTimeoutMs);
        // The blob should be tombstoned now
        const { summaryVersion } = await summarize(summarizer);

        const container = await loadContainer(summaryVersion);
        const defaultDataObject = await requestFluidObject<ITestDataObject>(container, "default");
        const fluidHandleContext = defaultDataObject._context.containerRuntime.IFluidHandleContext;

        // Requesting the tombstoned blob should succeed since ThrowOnTombstoneUsage is not enabled.
        const response = await fluidHandleContext.resolveHandle({ url: absolutePath });
        assert(response?.status === 200, `Expecting a 200 response!`);
        assert(summarizingContainer.closed !== true, "Summarizing container should not have closed!");
        assert(container.closed !== true, "Container does not close");
    });
});
