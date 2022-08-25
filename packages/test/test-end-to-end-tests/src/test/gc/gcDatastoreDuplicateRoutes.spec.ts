/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IContainer } from "@fluidframework/container-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
    ITestObjectProvider,
    createSummarizer,
    summarizeNow,
    waitForContainerConnection,
    mockConfigProvider,
    ITestContainerConfig,
} from "@fluidframework/test-utils";
import { describeNoCompat, ITestDataObject } from "@fluidframework/test-version-utils";
import { gcBlobPrefix, gcTreeKey, ISummarizer } from "@fluidframework/container-runtime";
import { ISummaryBlob, SummaryType } from "@fluidframework/protocol-definitions";
import { SharedMap } from "@fluidframework/map";
import { IGarbageCollectionState } from "@fluidframework/runtime-definitions";
import { defaultGCConfig } from "./gcTestConfigs";

/**
 * Validates this scenario: When two DDSes in the same datastore has one change, gets summarized, and then gc is called
 * from loading a new container. We do not want to allow duplicate GC routes to be created in this scenario.
 */
describeNoCompat("GC Data Store Duplicates", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    let mainContainer: IContainer;
    let mainDataStore: ITestDataObject;

    async function waitForSummary(summarizer: ISummarizer) {
        await provider.ensureSynchronized();
        return summarizeNow(summarizer);
    }

    beforeEach(async () => {
        provider = getTestObjectProvider({ syncSummarizer: true });
    });

    it("DDS changes do not create new GC blobs", async () => {
        mainContainer = await provider.makeTestContainer(defaultGCConfig);
        mainDataStore = await requestFluidObject<ITestDataObject>(mainContainer, "default");
        await waitForContainerConnection(mainContainer);

        const dds = SharedMap.create(mainDataStore._runtime);
        mainDataStore._root.set("dds", dds.handle);

        const summarizer1 = await createSummarizer(provider, mainContainer);
        let summaryResult = await waitForSummary(summarizer1);

        // Change ds1 but not the root dds
        dds.set("change", "change1");

        summarizer1.close();
        const summarizer2 = await createSummarizer(provider, mainContainer, summaryResult.summaryVersion);
        summaryResult = await waitForSummary(summarizer2);
        const gcObject = summaryResult.summaryTree.tree[gcTreeKey];
        assert(gcObject !== undefined, "Expected a gc blob!");
        assert(gcObject.type === SummaryType.Handle, "Expected a handle!");
        assert(gcObject.handleType === SummaryType.Tree, "Expected a gc tree handle!");
    });

    it("Back routes added by GC are removed when passed from data stores to DDSes", async () => {
        const settings = {};
        const configProvider = mockConfigProvider(settings);
        const newConfig: ITestContainerConfig = {
            runtimeOptions: defaultGCConfig.runtimeOptions,
            loaderProps: { configProvider },
        };
        settings["Fluid.GarbageCollection.TrackGCState"] = "false";
        mainContainer = await provider.makeTestContainer(newConfig);
        mainDataStore = await requestFluidObject<ITestDataObject>(mainContainer, "default");
        await waitForContainerConnection(mainContainer);

        const dds = SharedMap.create(mainDataStore._runtime);
        mainDataStore._root.set("dds", dds.handle);

        const summarizer1 = await createSummarizer(provider, mainContainer, undefined, undefined, configProvider);
        let summaryResult = await waitForSummary(summarizer1);

        // Change ds1 but not the root dds
        dds.set("change", "change1");

        summarizer1.close();
        const summarizer2 = await createSummarizer(
            provider,
            mainContainer,
            summaryResult.summaryVersion,
            undefined,
            configProvider,
        );

        // Get GC State
        summaryResult = await waitForSummary(summarizer2);
        const gcTree = summaryResult.summaryTree.tree[gcTreeKey];
        assert(gcTree !== undefined, "Expected a gc blob!");
        assert(gcTree.type === SummaryType.Tree, "Expected a Tree!");
        const gcBlob = gcTree.tree[`${gcBlobPrefix}_root`] as ISummaryBlob;
        const gcState = JSON.parse(gcBlob.content as string) as IGarbageCollectionState;

        // Validate GC State
        for (const [_, gcData] of Object.entries(gcState.gcNodes)) {
            const seenRoutes = new Set<string>();
            gcData.outboundRoutes.forEach((route) => {
                assert(!seenRoutes.has(route), `There should be no duplicate routes! Duplicate Route: ${route}`);
                seenRoutes.add(route);
            });
        }
    });
});
