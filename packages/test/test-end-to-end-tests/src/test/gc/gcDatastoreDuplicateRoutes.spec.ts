/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IContainer } from "@fluidframework/container-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeNoCompat, ITestDataObject } from "@fluidframework/test-version-utils";
import { gcTreeKey, ISummarizer } from "@fluidframework/container-runtime";
import { SummaryType } from "@fluidframework/protocol-definitions";
import { SharedMap } from "@fluidframework/map";
import { defaultGCConfig } from "./gcTestConfigs";
import { createSummarizer, summarizeNow, waitForContainerConnection } from "./gcTestSummaryUtils";

/**
 * Validates this scenario: When two DDSs in the same datastore has one change, gets summarized, and then gc is called
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
        mainContainer = await provider.makeTestContainer(defaultGCConfig);
        mainDataStore = await requestFluidObject<ITestDataObject>(mainContainer, "default");
        await waitForContainerConnection(mainContainer);
    });

    it("Back routes added by GC are removed when passed from data stores to DDSs", async () => {
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
});
