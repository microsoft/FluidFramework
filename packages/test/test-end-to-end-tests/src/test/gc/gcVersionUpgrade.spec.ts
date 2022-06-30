/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct";
import {
    IContainer,
    IContainerContext,
    IRuntime,
} from "@fluidframework/container-definitions";
import { IContainerRuntimeOptions, ISummarizer } from "@fluidframework/container-runtime";
import {
    ISummaryTree,
    SummaryType,
} from "@fluidframework/protocol-definitions";
import { channelsTreeName, IContainerRuntimeBase } from "@fluidframework/runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
    ITestFluidObject,
    ITestObjectProvider,
    TestFluidObjectFactory,
} from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluidframework/test-version-utils";
import { IRequest } from "@fluidframework/core-interfaces";
import { createSummarizerFromFactory, summarizeNow, waitForContainerConnection } from "./gcTestSummaryUtils";

/**
 * Runtime dataObjectFactory that increments the current GC version of the container runtime it creates. This is used
 * to simulate scenario where the GC version upgrades and we have to regenerate the GC data and summary.
 */
class ContainerRuntimeFactoryWithGC extends ContainerRuntimeFactoryWithDefaultDataStore {
    public async instantiateRuntime(
        context: IContainerContext,
    ): Promise<IRuntime> {
        const runtime = await super.instantiateRuntime(context);
        // A hack to update the currentGCVersion.
        (runtime as any).garbageCollector.currentGCVersion += 1;
        return runtime;
    }
}

/**
 * Validates that when the runtime GC version changes, we re-run GC and summary. Basically, when we update the GC
 * version due to either bugs or changes in the implementation, we re-run GC and regenerate summary based on the
 * new GC code.
 */
describeNoCompat("GC version upgrade", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    const dataObjectFactory = new TestFluidObjectFactory([]);
    const runtimeOptions: IContainerRuntimeOptions = {
        summaryOptions: {
            disableSummaries: true,
            summaryConfigOverrides: {
                state: "disabled",
            },
         },
        gcOptions: { gcAllowed: true },
    };

    const innerRequestHandler = async (request: IRequest, runtime: IContainerRuntimeBase) =>
        runtime.IFluidHandleContext.resolveHandle(request);

    const defaultRuntimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
        dataObjectFactory,
        [
            [dataObjectFactory.type, Promise.resolve(dataObjectFactory)],
        ],
        undefined,
        [innerRequestHandler],
        runtimeOptions,
    );

    let mainContainer: IContainer;
    let dataStore1Id: string;
    let dataStore2Id: string;
    let dataStore3Id: string;

    /**
     * Generates a summary and validates that the data store's summary is of correct type - tree or handle.
     * The data stores ids in dataStoresAsHandles should have their summary as handles. All other data stores
     * should have their summary as tree.
     */
    async function summarizeAndValidateDataStoreState(
        summarizer: ISummarizer,
        dataStoresAsHandles: string[],
    ) {
        await provider.ensureSynchronized();
        const summaryResult = await summarizeNow(summarizer);

        const dataStoreTrees = (summaryResult.summaryTree.tree[channelsTreeName] as ISummaryTree).tree;
        for (const [key, value] of Object.entries(dataStoreTrees)) {
            if (dataStoresAsHandles.includes(key)) {
                assert(value.type === SummaryType.Handle, `The summary for data store ${key} should be a handle`);
            } else {
                assert(value.type === SummaryType.Tree, `The summary for data store ${key} should be a tree`);
            }
        }
        return summaryResult.summaryVersion;
    }

    beforeEach(async () => {
        provider = getTestObjectProvider({ syncSummarizer: true });
        mainContainer = await provider.createContainer(defaultRuntimeFactory);
        const dataStore1 = await requestFluidObject<ITestFluidObject>(mainContainer, "default");
        dataStore1Id = dataStore1.context.id;

        // Create couple more data stores and mark them as referenced.
        const dataStore2 = await requestFluidObject<ITestFluidObject>(
            await dataStore1.context.containerRuntime.createDataStore(dataObjectFactory.type), "");
        dataStore1.root.set("dataStore2", dataStore2.handle);
        const dataStore3 = await requestFluidObject<ITestFluidObject>(
            await dataStore1.context.containerRuntime.createDataStore(dataObjectFactory.type), "");
        dataStore1.root.set("dataStore3", dataStore3.handle);
        dataStore2Id = dataStore2.context.id;
        dataStore3Id = dataStore3.context.id;

        await waitForContainerConnection(mainContainer);
    });

    it("should regenerate summary and GC data when GC version updates", async () => {
        // Stores the ids of data stores whose summary tree should be handles.
        let dataStoresAsHandles: string[] = [];

        // Create a summarizer client.
        const summarizer1 = await createSummarizerFromFactory(provider, mainContainer, dataObjectFactory);

        // Generate a summary and validate that all data store summaries are trees.
        await summarizeAndValidateDataStoreState(summarizer1, dataStoresAsHandles);

        // Generate another summary in which the summaries for all data stores are handles.
        dataStoresAsHandles.push(dataStore1Id, dataStore2Id, dataStore3Id);
        const summaryVersion = await summarizeAndValidateDataStoreState(summarizer1, dataStoresAsHandles);

        // Create a new summarizer with a new GC version and the latest summary that has been generated.
        summarizer1.close();
        const summarizer2 = await createSummarizerFromFactory(
            provider, mainContainer, dataObjectFactory, summaryVersion, ContainerRuntimeFactoryWithGC);

        // Validate that there aren't any handles in the summary generated by the new mainContainer runtime since the
        // GC version got updated.
        dataStoresAsHandles = [];
        await summarizeAndValidateDataStoreState(summarizer2, dataStoresAsHandles);
    });
});
