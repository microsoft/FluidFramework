/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IContainer } from "@fluidframework/container-definitions";
import { ContainerRuntime } from "@fluidframework/container-runtime";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeNoCompat, ITestDataObject, TestDataObjectType } from "@fluidframework/test-version-utils";
import { defaultGCConfig } from "./gcTestConfigs";
import { getGCStateFromSummary, waitForContainerConnection } from "./gcTestSummaryUtils";

/**
 * Validates this scenario: When a datastore is aliased that it is considered a root datastore and always referenced
 */
describeNoCompat("GC Data Store Aliased", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    let container1: IContainer;
    let container2: IContainer;
    let mainDataStore1: ITestDataObject;
    let mainDataStore2: ITestDataObject;

    async function waitForSummary(container: IContainer) {
        const dataStore = await requestFluidObject<ITestDataObject>(container, "default");
        return (dataStore._context.containerRuntime as ContainerRuntime).summarize({ runGC: true, trackState: false });
    }

    beforeEach(async () => {
        provider = getTestObjectProvider({ syncSummarizer: true });
        container1 = await provider.makeTestContainer(defaultGCConfig);
        container2 = await provider.loadTestContainer(defaultGCConfig);
        mainDataStore1 = await requestFluidObject<ITestDataObject>(container1, "default");
        mainDataStore2 = await requestFluidObject<ITestDataObject>(container2, "default");
        await waitForContainerConnection(container1);
        await waitForContainerConnection(container2);
    });

    it("GC is notified when datastores are aliased.", async () => {
        const aliasableDataStore1 = await mainDataStore1._context.containerRuntime.createDataStore(TestDataObjectType);
        const ds1 = await requestFluidObject<ITestDataObject>(aliasableDataStore1, "");

        (aliasableDataStore1 as any).fluidDataStoreChannel.bindToContext();
        await provider.ensureSynchronized();

        // We run the summary so await this.getInitialSnapshotDetails() is called before the datastore is aliased
        // and after the datastore is attached. This sets the isRootDataStore to false.
        let summaryWithStats = await waitForSummary(container2);
        let gcState = getGCStateFromSummary(summaryWithStats.summary);
        assert(gcState?.gcNodes[ds1.handle.absolutePath].unreferencedTimestampMs !== undefined,
            "AliasableDataStore1 should be unreferenced as it is not aliased and not root!");

        // Alias a datastore
        const alias = "alias";
        const aliasResult1 = await aliasableDataStore1.trySetAlias(alias);
        assert(aliasResult1 === "Success", `Expected an successful aliasing. Got: ${aliasResult1}`);
        await provider.ensureSynchronized();

        // Should be able to retrieve root datastore from remote
        const containerRuntime2 = mainDataStore2._context.containerRuntime as IContainerRuntime;
        assert.doesNotThrow(async () => containerRuntime2.getRootDataStore(alias),
            "Aliased datastore should be root as it is aliased!");
        summaryWithStats = await waitForSummary(container2);
        gcState = getGCStateFromSummary(summaryWithStats.summary);
        assert(gcState?.gcNodes[ds1.handle.absolutePath].unreferencedTimestampMs === undefined,
            "AliasableDataStore1 should be referenced as it is aliased and thus a root datastore!");
    });
});
