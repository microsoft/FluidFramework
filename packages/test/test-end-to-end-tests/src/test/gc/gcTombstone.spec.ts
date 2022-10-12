/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IContainer } from "@fluidframework/container-definitions";
import { ContainerRuntime } from "@fluidframework/container-runtime";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ITestObjectProvider, waitForContainerConnection } from "@fluidframework/test-utils";
import { describeNoCompat, ITestDataObject } from "@fluidframework/test-version-utils";
import { defaultGCConfig } from "./gcTestConfigs";

/**
 * Validates this scenario: When a datastore is aliased that it is considered a root datastore and always referenced
 */
describeNoCompat("GC DataStore Tombstoned", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    let mainContainer: IContainer;
    let mainDataStore: ITestDataObject;

    async function waitForSummary(container: IContainer) {
        const dataStore = await requestFluidObject<ITestDataObject>(container, "default");
        return (dataStore._context.containerRuntime as ContainerRuntime).summarize(
            { runGC: true, trackState: false, runSweep: true },
        );
    }

    beforeEach(async () => {
        provider = getTestObjectProvider({ syncSummarizer: true });
        mainContainer = await provider.makeTestContainer(defaultGCConfig);
        mainDataStore = await requestFluidObject<ITestDataObject>(mainContainer, "default");
        await waitForContainerConnection(mainContainer);
    });

    it("GC is notified when datastores are aliased.", async () => {
        // Set a test value for the main root.
        mainDataStore._root.set("testValue", "test");

        await provider.ensureSynchronized();
        // We run the summary so await this.getInitialSnapshotDetails() is called before the datastore is aliased
        // and after the datastore is attached. This sets the isRootDataStore to false.
        await waitForSummary(mainContainer);
        mainDataStore._root.set("testValue2", "test2");
        await provider.ensureSynchronized();
        (mainDataStore._context as any).tombstone();
        await assert.doesNotReject(
            async () => { await waitForSummary(mainContainer); }, `Should be able to summarize a tombstoned datastore`);
        assert.throws(() => mainDataStore._root.set("testValue2", "test"),
            `Should not be able to send ops for a tombstoned datastore.`);
    });
});
