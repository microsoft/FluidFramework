/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IContainer } from "@fluidframework/container-definitions";
import { ContainerRuntime, IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
    ITestObjectProvider,
    waitForContainerConnection,
    mockConfigProvider,
} from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluidframework/test-version-utils";
import { DataObject, DataObjectFactory, ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct";
import { delay } from "@fluidframework/common-utils";

class TestDataObject extends DataObject {
    public get _root() {
        return this.root;
    }

    public get _context() {
        return this.context;
    }

    public get containerRuntime() {
        return this.context.containerRuntime;
    }
}

/**
 * Validates this scenario: When a datastore should be tombstoned that tombstoned and unable to send ops
 */
describeNoCompat("GC DataStore Tombstoned", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    const dataObjectFactory = new DataObjectFactory(
        "TestDataObject",
        TestDataObject,
        [],
        [],
    );
    const inactiveTimeoutMs = 1;
    const sessionExpiryTimeoutMs = 1000;
    const sweepTimeoutMs = sessionExpiryTimeoutMs + 1000;

    const runtimeOptions: IContainerRuntimeOptions = {
        summaryOptions: { summaryConfigOverrides: { state: "disabled" } },
        gcOptions: {
            gcAllowed: true,
            sweepAllowed: true,
            sessionExpiryTimeoutMs,
            snapshotCacheExpiryMs: 0,
            inactiveTimeoutMs,
        },
    };
    const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
        dataObjectFactory,
        [
            [dataObjectFactory.type, Promise.resolve(dataObjectFactory)],
        ],
        undefined,
        undefined,
        runtimeOptions,
    );

    let mainContainer: IContainer;
    let mainDataStore: TestDataObject;

    const settings = {
        // "Fluid.GarbageCollection.RunSessionExpiry": "true",
        "Fluid.GarbageCollection.Test.Tombstone": "true",
        "Fluid.GarbageCollection.TestOverride.SweepTimeoutMs": sweepTimeoutMs,
    };
    const configProvider = mockConfigProvider(settings);
    const createContainer = async () => provider.createContainer(runtimeFactory, { configProvider });

    async function waitForSummary(container: IContainer) {
        await provider.ensureSynchronized();
        const dataStore = await requestFluidObject<TestDataObject>(container, "");
        return (dataStore._context.containerRuntime as ContainerRuntime).summarize(
            { runGC: true, trackState: false, runSweep: true },
        );
    }

    beforeEach(async () => {
        provider = getTestObjectProvider({ syncSummarizer: true });
        mainContainer = await createContainer();
        mainDataStore = await requestFluidObject<TestDataObject>(mainContainer, "");
        await waitForContainerConnection(mainContainer);
    });

    it("GC tombstones datastores when they are sweep ready.", async () => {
        const handleKey = "handle";
        const testDataObject = await dataObjectFactory.createInstance(mainDataStore.containerRuntime);
        mainDataStore._root.set(handleKey, testDataObject.handle);

        // We run the summary so await this.getInitialSnapshotDetails() is called before the datastore is aliased
        // and after the datastore is attached. This sets the isRootDataStore to false.
        await waitForSummary(mainContainer);
        mainDataStore._root.delete(handleKey);
        await delay(sweepTimeoutMs);

        await waitForSummary(mainContainer);
        await delay(10);

        await waitForSummary(mainContainer);
        assert.throws(() => testDataObject._root.set("testValue2", "test"),
            `Should not be able to send ops for a tombstoned datastore.`);
    });
});
