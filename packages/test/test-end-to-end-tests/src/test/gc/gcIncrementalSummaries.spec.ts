/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IContainer } from "@fluidframework/container-definitions";
import { ISummarizer } from "@fluidframework/container-runtime";
import { ISummaryTree, SummaryType } from "@fluidframework/protocol-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeNoCompat, ITestDataObject, TestDataObjectType } from "@fluidframework/test-version-utils";
import { channelsTreeName } from "@fluidframework/runtime-definitions";
import { defaultGCConfig } from "./gcTestConfigs";
import { createSummarizer, summarizeNow, waitForContainerConnection } from "./gcTestSummaryUtils";

/**
 * Validates that unchanged Fluid objects are not summarized again. Basically, only objects that have changed since
 * the previous summary should be summarized and for the rest, we add handles that refer to the previous summary.
 * A Fluid object is considered changed since the last summary if either or both of the following is true:
 * - It received an op.
 * - Its reference state changed, i.e., it was referenced and became unreferenced or vice-versa.
 */
describeNoCompat("GC incremental summaries", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    let mainContainer: IContainer;
    let dataStoreA: ITestDataObject;

    /**
     * Submits a summary and validates that the data stores with ids in `changedDataStoreIds` are summarized. All
     * other data stores are not summarized and a handle is sent for them in the summary.
     */
    async function validateIncrementalSummary(
        summarizer: ISummarizer,
        dataStoreSummaryTypes: Map<string, SummaryType>,
    ) {
        await provider.ensureSynchronized();
        const summaryResult = await summarizeNow(summarizer);
        const channelsTree = (summaryResult.summaryTree.tree[channelsTreeName] as ISummaryTree).tree;
        for (const [id, summaryObject] of Object.entries(channelsTree)) {
            const summaryType = dataStoreSummaryTypes.get(id);
            if (summaryType !== undefined) {
                assert(summaryObject.type === summaryType, `Data store ${id}'s entry should be ${summaryType}`);
            }
        }
        return summaryResult.summaryVersion;
    }

    beforeEach(async () => {
        provider = getTestObjectProvider({ syncSummarizer: true });
        mainContainer = await provider.makeTestContainer(defaultGCConfig);
        dataStoreA = await requestFluidObject<ITestDataObject>(mainContainer, "default");
        await waitForContainerConnection(mainContainer);
    });

    it("only summarizes changed data stores", async () => {
        const dataStoreSummaryTypesMap: Map<string, SummaryType> = new Map();
        const summarizer1 = await createSummarizer(provider, mainContainer);

        // Create data stores B and C, and mark them as referenced.
        const dataStoreB = await requestFluidObject<ITestDataObject>(
            await dataStoreA._context.containerRuntime.createDataStore(TestDataObjectType), "");
        dataStoreA._root.set("dataStoreB", dataStoreB.handle);
        const dataStoreC = await requestFluidObject<ITestDataObject>(
            await dataStoreA._context.containerRuntime.createDataStore(TestDataObjectType), "");
        dataStoreA._root.set("dataStoreC", dataStoreC.handle);

        // Summarize and validate that all data store entries are trees since this is the first summary.
        dataStoreSummaryTypesMap.set(dataStoreA._context.id, SummaryType.Tree);
        dataStoreSummaryTypesMap.set(dataStoreB._context.id, SummaryType.Tree);
        dataStoreSummaryTypesMap.set(dataStoreC._context.id, SummaryType.Tree);
        await validateIncrementalSummary(summarizer1, dataStoreSummaryTypesMap);

        // Make a change in dataStoreA.
        dataStoreA._root.set("key", "value");

        // Summarize and validate that dataStoreA's entry is a tree and rest of the data store entries are handles.
        dataStoreSummaryTypesMap.set(dataStoreB._context.id, SummaryType.Handle);
        dataStoreSummaryTypesMap.set(dataStoreC._context.id, SummaryType.Handle);
        await validateIncrementalSummary(summarizer1, dataStoreSummaryTypesMap);

        // Summarize again and validate that all data store entries are handles since none of them changed.
        dataStoreSummaryTypesMap.set(dataStoreA._context.id, SummaryType.Handle);
        await validateIncrementalSummary(summarizer1, dataStoreSummaryTypesMap);
    });

    it("only summarizes changed data stores across multiple summarizer clients", async () => {
        const dataStoreSummaryTypesMap: Map<string, SummaryType> = new Map();
        const summarizer1 = await createSummarizer(provider, mainContainer);

        // Create data stores B and C, and mark them as referenced.
        const dataStoreB = await requestFluidObject<ITestDataObject>(
            await dataStoreA._context.containerRuntime.createDataStore(TestDataObjectType), "");
        dataStoreA._root.set("dataStoreB", dataStoreB.handle);
        const dataStoreC = await requestFluidObject<ITestDataObject>(
            await dataStoreA._context.containerRuntime.createDataStore(TestDataObjectType), "");
        dataStoreA._root.set("dataStoreC", dataStoreC.handle);

        // Validate that all data store entries are trees since this is the first summary.
        // Summarize and validate that all data store entries are trees since this is the first summary.
        dataStoreSummaryTypesMap.set(dataStoreA._context.id, SummaryType.Tree);
        dataStoreSummaryTypesMap.set(dataStoreB._context.id, SummaryType.Tree);
        dataStoreSummaryTypesMap.set(dataStoreC._context.id, SummaryType.Tree);
        let summaryVersion = await validateIncrementalSummary(summarizer1, dataStoreSummaryTypesMap);

        // Close existing summarizer and load a new summarizer from the summary generated above.
        summarizer1.close();
        const summarizer2 = await createSummarizer(provider, mainContainer, summaryVersion);

        // Summarize the new client and validate that all data store entries are handles since none of them changed.
        dataStoreSummaryTypesMap.set(dataStoreA._context.id, SummaryType.Handle);
        dataStoreSummaryTypesMap.set(dataStoreB._context.id, SummaryType.Handle);
        dataStoreSummaryTypesMap.set(dataStoreC._context.id, SummaryType.Handle);
        summaryVersion = await validateIncrementalSummary(summarizer2, dataStoreSummaryTypesMap);

        // Make a change in dataStoreA.
        dataStoreA._root.set("key", "value");

        // Close existing summarizer and load a new summarizer from the summary generated above.
        summarizer2.close();
        const summarizer3 = await createSummarizer(provider, mainContainer, summaryVersion);

        // Summarize the new client and validate that dataStoreA's entry is a tree and rest of the data store
        // entries are handles.
        dataStoreSummaryTypesMap.set(dataStoreA._context.id, SummaryType.Tree);
        await validateIncrementalSummary(summarizer3, dataStoreSummaryTypesMap);
    });

    it("summarizes data stores whose reference state changed across summarizer clients", async () => {
        const dataStoreSummaryTypesMap: Map<string, SummaryType> = new Map();
        const summarizer1 = await createSummarizer(provider, mainContainer);

        // Create data stores B and C, and mark them as referenced.
        const dataStoreB = await requestFluidObject<ITestDataObject>(
            await dataStoreA._context.containerRuntime.createDataStore(TestDataObjectType), "");
        dataStoreA._root.set("dataStoreB", dataStoreB.handle);
        const dataStoreC = await requestFluidObject<ITestDataObject>(
            await dataStoreA._context.containerRuntime.createDataStore(TestDataObjectType), "");
        dataStoreA._root.set("dataStoreC", dataStoreC.handle);

        // Summarize and validate that all data store entries are trees since this is the first summary.
        dataStoreSummaryTypesMap.set(dataStoreA._context.id, SummaryType.Tree);
        dataStoreSummaryTypesMap.set(dataStoreB._context.id, SummaryType.Tree);
        dataStoreSummaryTypesMap.set(dataStoreC._context.id, SummaryType.Tree);
        await validateIncrementalSummary(summarizer1, dataStoreSummaryTypesMap);

        // Remove the reference to dataStoreB.
        dataStoreA._root.delete("dataStoreB");

        // Summarize and validate that both dataStoreA and dataStoreB are trees. dataStoreA because it has a new
        // op and dataStoreB because its reference state changed from referenced -> unreferenced.
        dataStoreSummaryTypesMap.set(dataStoreC._context.id, SummaryType.Handle);
        let summaryVersion = await validateIncrementalSummary(summarizer1, dataStoreSummaryTypesMap);

        // Close existing summarizer and load a new summarizer from the summary generated above.
        summarizer1.close();
        const summarizer2 = await createSummarizer(provider, mainContainer, summaryVersion);

        // Add back the reference to dataStoreB.
        dataStoreA._root.set("dataStoreB", dataStoreB.handle);

        // Summarize the new client and validate that both dataStoreA and dataStoreB are trees. dataStoreA because it
        // has a new op and dataStoreB because its reference state changed from unreferenced -> referenced.
        summaryVersion = await validateIncrementalSummary(summarizer2, dataStoreSummaryTypesMap);

        // Close existing summarizer and load a new summarizer from the summary generated above.
        summarizer2.close();
        const summarizer3 = await createSummarizer(provider, mainContainer, summaryVersion);

        // Validate that all data store entries are handles since none of them changed.
        dataStoreSummaryTypesMap.set(dataStoreA._context.id, SummaryType.Handle);
        dataStoreSummaryTypesMap.set(dataStoreB._context.id, SummaryType.Handle);
        await validateIncrementalSummary(summarizer3, dataStoreSummaryTypesMap);
    });
});
