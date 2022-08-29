/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IContainer } from "@fluidframework/container-definitions";
import { ISummarizer } from "@fluidframework/container-runtime";
import {
    ISummaryTree,
    SummaryType,
} from "@fluidframework/protocol-definitions";
import { channelsTreeName } from "@fluidframework/runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
    ITestContainerConfig,
    ITestObjectProvider,
    createSummarizer,
    summarizeNow,
    waitForContainerConnection,
 } from "@fluidframework/test-utils";
import { describeNoCompat, ITestDataObject, TestDataObjectType } from "@fluidframework/test-version-utils";
import { defaultGCConfig } from "./gcTestConfigs";
import {
    getGCStateFromSummary,
} from "./gcTestSummaryUtils";

/**
 * Validates that when GC is disabled on a document that had run GC previously, the GC state is removed from summary
 * and all data stores are marked as referenced.
 * This validates scenarios where due to some bug the GC state in summary is incorrect and we need to quickly recover
 * documents. Disabling GC will ensure that we are not deleting / marking things unreferenced incorrectly.
 */
describeNoCompat("GC state reset in summaries", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    let mainContainer: IContainer;

    /** Creates a new container with the GC enabled / disabled as per gcAllowed param. */
    const createContainer = async (gcAllowed: boolean): Promise<IContainer> => {
        const testContainerConfig: ITestContainerConfig = {
            ...defaultGCConfig,
            runtimeOptions: {
                ...defaultGCConfig.runtimeOptions,
                gcOptions: {
                    gcAllowed,
                },
            },
        };
        return provider.makeTestContainer(testContainerConfig);
    };

    /**
     * Generated a summary for the given client and validates the GC state in the summary as per the params:
     * @param shouldGCRun - Whether GC should run or not. If true, validates that the summary contains a GC tree.
     * @param shouldRegenerateSummary - Whether the summary should be regenerated. If true, validates that all data
     * store entries in the summary are of type ISummaryTree.
     * @param unreferencedDataStoreIds - A list of data store IDs that should be unreferenced in the summary. Validates
     * that all these data store's summary tree is marked unreferenced. If shouldRunGC is true, also validates that the
     * GC state for these have an unreferenced timestamp.
     *
     * @returns The summary version of the generated summary.
     */
    async function summarizeAndValidateGCState(
        summarizer: ISummarizer,
        shouldGCRun: boolean,
        shouldRegenerateSummary: boolean,
        unreferencedDataStoreIds: string[] = [],
    ) {
        await provider.ensureSynchronized();
        const summaryResult = await summarizeNow(summarizer);

        const channelsTree = (summaryResult.summaryTree.tree[channelsTreeName] as ISummaryTree).tree;
        for (const [id, summaryObject] of Object.entries(channelsTree)) {
            if (summaryObject.type !== SummaryType.Tree) {
                assert(!shouldRegenerateSummary, `DataStore ${id}'s entry should be a tree if summary was regenerated`);
                continue;
            }

            if (unreferencedDataStoreIds.includes(id)) {
                assert(summaryObject.unreferenced === true, `DataStore ${id} should be unreferenced`);
            } else {
                assert(summaryObject.unreferenced !== true, `DataStore ${id} should be referenced`);
            }
        }

        const gcState = getGCStateFromSummary(summaryResult.summaryTree);
        if (gcState === undefined) {
            assert(!shouldGCRun, `If GC tree is not present in summary, GC should not have run.`);
            return;
        }

        for (const [nodeId, nodeData] of Object.entries(gcState.gcNodes)) {
            // All nodes belonging to the data store in unreferencedDataStoreIds should have unreferenced timestamp.
            // All other nodes should not have unreferenced timestamp.
            const dsId = nodeId.split("/")[1];
            if (unreferencedDataStoreIds.includes(dsId)) {
                assert(
                    nodeData.unreferencedTimestampMs !== undefined,
                    `Node ${nodeId} should have unreferenced timestamp`,
                );
            } else {
                assert(
                    nodeData.unreferencedTimestampMs === undefined,
                    `Node ${nodeId} shouldn't have unreferenced timestamp`,
                );
            }
        }

        return summaryResult.summaryVersion;
    }

    beforeEach(async function() {
        provider = getTestObjectProvider({ syncSummarizer: true });
        // These tests validate the end-to-end behavior of summaries when GC is enabled / disabled. This behavior
        // is not affected by the service. So, it doesn't need to run against real services.
        if (provider.driver.type !== "local") {
            this.skip();
        }
    });

    it("removes GC state and marks all objects as referenced on disabling GC", async () => {
        // Create a document with GC enabled.
        mainContainer = await createContainer(true /* gcAllowed */);
        const mainDataStore = await requestFluidObject<ITestDataObject>(mainContainer, "default");
        await waitForContainerConnection(mainContainer);

        // Create a summarizer with GC enabled as well.
        const summarizer1 = await createSummarizer(provider, mainContainer);

        // Mark the second data store as referenced by storing its handle in a referenced DDS.
        const newDataStore = await requestFluidObject<ITestDataObject>(
            await mainDataStore._context.containerRuntime.createDataStore(TestDataObjectType), "");
        mainDataStore._root.set("newDataStore", newDataStore.handle);

        // Mark the data store as unreferenced by deleting its handle from the DDS.
        mainDataStore._root.delete("newDataStore");

        // Validate that GC ran and the unreferenced data store is marked as such in GC state.
        let summaryVersion = await summarizeAndValidateGCState(
            summarizer1,
            true /* shouldGCRun */,
            false /* shouldRegenerateSummary */,
            [newDataStore._context.id],
        );

        // Load a new summarizer from the last summary with GC disabled.
        summarizer1.close();
        const summarizer2 = await createSummarizer(
            provider,
            mainContainer,
            summaryVersion,
            { disableGC: true },
        );

        // Validate that GC does not run and the summary is regenerated because GC was disabled.
        await summarizeAndValidateGCState(
            summarizer2,
            false /* shouldGCRun */,
            true /* shouldRegenerateSummary */,
        );

        // Validate that GC does not run and the summary is not regenerated again. The summary is regenerated
        // only the first time GC is disabled after it was enabled before.
        summaryVersion = await summarizeAndValidateGCState(
            summarizer2,
            false /* shouldGCRun */,
            false /* shouldRegenerateSummary */,
        );

        // Load a new summarizer from the last summary with GC enabled.
        summarizer2.close();
        const summarizer3 = await createSummarizer(provider, mainContainer, summaryVersion);
        // Validate that GC runs and the summary is regenerated because GC was disabled in the previous summary and
        // is now enabled. Also, the unreferenced data stores should be marked as such.
        await summarizeAndValidateGCState(
            summarizer3,
            true /* shouldGCRun */,
            true /* shouldRegenerateSummary */,
            [newDataStore._context.id],
        );
    });

    it("keeps GC enabled throughout the lifetime of a document", async () => {
        // Create a document with GC enabled.
        mainContainer = await createContainer(true /* gcAllowed */);
        const mainDataStore = await requestFluidObject<ITestDataObject>(mainContainer, "default");
        await waitForContainerConnection(mainContainer);

        // Get a new summarizer that sets gcAllowed option to false.
        const summarizer = await createSummarizer(
            provider,
            mainContainer,
            undefined /* summaryVersion */,
            { gcAllowed: false },
        );

        // Mark the second data store as referenced by storing its handle in a referenced DDS.
        const newDataStore = await requestFluidObject<ITestDataObject>(
            await mainDataStore._context.containerRuntime.createDataStore(TestDataObjectType), "");
        mainDataStore._root.set("newDataStore", newDataStore.handle);

        // Validate that GC ran even though gcAllowed was set to false. Whether GC runs or not is determined by the
        // gcAllowed flag when the document was created.
        await summarizeAndValidateGCState(
            summarizer,
            true /* shouldGCRun */,
            false /* shouldRegenerateSummary */,
        );
    });

    it("keeps GC disabled throughout the lifetime of a document", async () => {
        // Create a document with GC disabled.
        mainContainer = await createContainer(false /* gcAllowed */);
        const mainDataStore = await requestFluidObject<ITestDataObject>(mainContainer, "default");
        await waitForContainerConnection(mainContainer);

        // Get a new summarizer that sets gcAllowed option to true.
        const summarizer = await createSummarizer(
            provider,
            mainContainer,
            undefined /* summaryVersion */,
            { gcAllowed: true },
        );

        // Mark the second data store as referenced by storing its handle in a referenced DDS.
        const newDataStore = await requestFluidObject<ITestDataObject>(
            await mainDataStore._context.containerRuntime.createDataStore(TestDataObjectType), "");
        mainDataStore._root.set("newDataStore", newDataStore.handle);

        // Validate that GC did not run even though gcAllowed is set to true. Whether GC runs or not is determined by
        // the gcAllowed flag when the document was created.
        await summarizeAndValidateGCState(
            summarizer,
            false /* shouldGCRun */,
            false /* shouldRegenerateSummary */,
        );
    });
});
