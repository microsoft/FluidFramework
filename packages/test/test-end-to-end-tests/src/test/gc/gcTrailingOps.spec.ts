/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    IGCRuntimeOptions,
} from "@fluidframework/container-runtime";
import {
    ITestObjectProvider,
    mockConfigProvider,
    ITestContainerConfig,
    waitForContainerConnection,
    createSummarizer,
    summarizeNow,
} from "@fluidframework/test-utils";
import { describeNoCompat, ITestDataObject, TestDataObjectType } from "@fluidframework/test-version-utils";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { getGCTombstoneStateFromSummary } from "./gcTestSummaryUtils";
import { stringToBuffer } from "@fluidframework/common-utils";

/**
 * These tests validate that SweepReady data stores are correctly marked as tombstones. Tombstones should be added
 * to the summary and changing them (sending / receiving ops, loading, etc.) is not allowed.
 */
describeNoCompat("GC data store tombstone tests", (getTestObjectProvider) => {
    const sweepTimeoutMs = 1;
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

    beforeEach(async function() {
        provider = getTestObjectProvider({ syncSummarizer: true });
        if (provider.driver.type !== "local") {
            this.skip();
        }
        settings["Fluid.GarbageCollection.ThrowOnTombstoneUsage"] = true;
        settings["Fluid.GarbageCollection.TestOverride.SweepTimeoutMs"] = sweepTimeoutMs;
    });

    it("A summary has a datastore referenced, but the trailing op unreferenced the datastore and the datastore should be tombstoned.", async () => {
        const mainContainer = await provider.makeTestContainer(testContainerConfig);
        const mainDefaultDataStore = await requestFluidObject<ITestDataObject>(mainContainer, "default");
        await waitForContainerConnection(mainContainer);

        // Create a data store and blob.
        const newDataStore = await mainDefaultDataStore._context.containerRuntime.createDataStore(TestDataObjectType);
        const blobContents = "Blob contents";
        const blobHandle = await mainDefaultDataStore._runtime.uploadBlob(stringToBuffer(blobContents, "utf-8"));

        const mainSummarizer = await createSummarizer(
            provider,
            mainContainer,
            undefined /* summaryVersion */,
            gcOptions,
            mockConfigProvider(settings),
        );

        assert(newDataStore.entryPoint !== undefined, `Should have a handle`);
        mainDefaultDataStore._root.set("datastore", newDataStore.entryPoint);
        mainDefaultDataStore._root.set("blob", blobHandle);


        await provider.ensureSynchronized();
        const { summaryVersion } = await summarizeNow(mainSummarizer);
        mainDefaultDataStore._root.delete("datastore");
        mainDefaultDataStore._root.delete("blob");
        await provider.ensureSynchronized();

        const summarizer = await createSummarizer(
            provider,
            mainContainer,
            summaryVersion,
            gcOptions,
            mockConfigProvider(settings),
        );

        mainContainer.close();
        mainSummarizer.close();

        await provider.ensureSynchronized();
        const { summaryTree: unreferencedTree } = await summarizeNow(summarizer);
        const noTombstoneState = getGCTombstoneStateFromSummary(unreferencedTree);
        assert(noTombstoneState === undefined, `Should have no tombstone state!`);

        const { summaryTree } = await summarizeNow(summarizer);
        const gcTombstoneState = getGCTombstoneStateFromSummary(summaryTree);
        assert(gcTombstoneState !== undefined, `Should have tombstone state!`);
        assert(gcTombstoneState.length === 3, `Should have tombstoned datastore and blob!`);
    });
});
