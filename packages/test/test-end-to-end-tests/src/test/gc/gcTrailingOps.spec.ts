/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    ITestObjectProvider,
    mockConfigProvider,
    waitForContainerConnection,
    createSummarizer,
    summarizeNow,
} from "@fluidframework/test-utils";
import { describeNoCompat, ITestDataObject, TestDataObjectType } from "@fluidframework/test-version-utils";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { getGCStateFromSummary } from "./gcTestSummaryUtils";
import { stringToBuffer } from "@fluidframework/common-utils";
import { ISummaryTree } from "@fluidframework/protocol-definitions";
import { defaultGCConfig } from "./gcTestConfigs";

describeNoCompat("GC trailing ops tests", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;

    /**
     * Submits a summary and returns the unreferenced timestamp for all the nodes in the container. If a node is
     * referenced, the unreferenced timestamp is undefined.
     * @returns a map of nodeId to its unreferenced timestamp.
     */
    async function getUnreferencedTimestamps(summaryTree: ISummaryTree) {
        const gcState = getGCStateFromSummary(summaryTree);
        assert(gcState !== undefined, "GC tree is not available in the summary");
        const nodeTimestamps: Map<string, number | undefined> = new Map();
        for (const [nodeId, nodeData] of Object.entries(gcState.gcNodes)) {
            nodeTimestamps.set(nodeId.slice(1), nodeData.unreferencedTimestampMs);
        }
        return nodeTimestamps;
    }

    beforeEach(async function() {
        provider = getTestObjectProvider({ syncSummarizer: true });
    });

    it("A summary has a datastore and blob referenced, but trailing ops unreferenced them", async () => {
        const mainContainer = await provider.makeTestContainer(defaultGCConfig);
        const mainDefaultDataStore = await requestFluidObject<ITestDataObject>(mainContainer, "default");
        await waitForContainerConnection(mainContainer);

        // Create a data store and blob.
        const newDataStore = await mainDefaultDataStore._context.containerRuntime.createDataStore(TestDataObjectType);
        const blobContents = "Blob contents";
        const blobHandle = await mainDefaultDataStore._runtime.uploadBlob(stringToBuffer(blobContents, "utf-8"));

        const mainSummarizer = await createSummarizer(provider, mainContainer);

        assert(newDataStore.entryPoint !== undefined, `Should have a handle`);
        mainDefaultDataStore._root.set("datastore", newDataStore.entryPoint);
        mainDefaultDataStore._root.set("blob", blobHandle);

        await provider.ensureSynchronized();
        const { summaryVersion } = await summarizeNow(mainSummarizer);
        mainDefaultDataStore._root.delete("datastore");
        mainDefaultDataStore._root.delete("blob");
        await provider.ensureSynchronized();

        const summarizer = await createSummarizer(provider, mainContainer, summaryVersion);

        mainContainer.close();
        mainSummarizer.close();

        await provider.ensureSynchronized();
        const { summaryTree } = await summarizeNow(summarizer);
        const unreferencedTimestamps = await getUnreferencedTimestamps(summaryTree);
        const dataStoreTimestamp = unreferencedTimestamps.get(newDataStore.entryPoint.absolutePath.slice(1));
        const blobTimestamp = unreferencedTimestamps.get(blobHandle.absolutePath.slice(1));
        assert(dataStoreTimestamp !== undefined, `Should have unreferenced datastore`);
        assert(blobTimestamp !== undefined, `Should have unreferenced blob`);
    });

    beforeEach(async function() {
        provider = getTestObjectProvider({ syncSummarizer: true });
    });

    it("A summary has a datastore and blob unreferenced, but trailing ops referenced them", async () => {
        const mainContainer = await provider.makeTestContainer(defaultGCConfig);
        const mainDefaultDataStore = await requestFluidObject<ITestDataObject>(mainContainer, "default");
        await waitForContainerConnection(mainContainer);

        // Create a data store and blob.
        const newDataStore = await mainDefaultDataStore._context.containerRuntime.createDataStore(TestDataObjectType);
        const blobContents = "Blob contents";
        const blobHandle = await mainDefaultDataStore._runtime.uploadBlob(stringToBuffer(blobContents, "utf-8"));

        const mainSummarizer = await createSummarizer(provider, mainContainer);

        assert(newDataStore.entryPoint !== undefined, `Should have a handle`);
        mainDefaultDataStore._root.set("datastore", newDataStore.entryPoint);
        mainDefaultDataStore._root.set("blob", blobHandle);
        mainDefaultDataStore._root.delete("datastore");
        mainDefaultDataStore._root.delete("blob");

        await provider.ensureSynchronized();
        const { summaryVersion } = await summarizeNow(mainSummarizer);
        mainDefaultDataStore._root.set("datastore", newDataStore.entryPoint);
        mainDefaultDataStore._root.set("blob", blobHandle);
        await provider.ensureSynchronized();

        const summarizer = await createSummarizer(provider, mainContainer, summaryVersion);

        mainContainer.close();
        mainSummarizer.close();

        await provider.ensureSynchronized();
        const { summaryTree } = await summarizeNow(summarizer);
        const unreferencedTimestamps = await getUnreferencedTimestamps(summaryTree);
        const dataStoreId = newDataStore.entryPoint.absolutePath.slice(1);
        const blobId = blobHandle.absolutePath.slice(1);
        assert(unreferencedTimestamps.has(dataStoreId), `GC should detect the datastore`);
        assert(unreferencedTimestamps.has(blobId), `GC should detect the blob`);
        const dataStoreTimestamp = unreferencedTimestamps.get(dataStoreId);
        const blobTimestamp = unreferencedTimestamps.get(blobId);
        assert(dataStoreTimestamp === undefined, `Should have a referenced datastore`);
        assert(blobTimestamp === undefined, `Should have a referenced blob`);
    });
});
