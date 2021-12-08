/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    ContainerRuntimeFactoryWithDefaultDataStore,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { TelemetryNullLogger } from "@fluidframework/common-utils";
import { IContainer } from "@fluidframework/container-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluidframework/test-version-utils";
import { ContainerRuntime, IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { TestDataObject } from "./mockSummarizerClient";

/**
 * Validates this scenario: When a data store is shared with an external app, if the data store becomes unreferenced
 * by the time it is requested via this external app, we return a failure (404).
 * Basically, for data stores that are unreferenced in the base snapshot that a container loads from, we return a
 * failure (404) when they are requested with "externalRequest" flag in the request header.
 */
 describeNoCompat("GC ContainerRuntime Expiry", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    const dataObjectFactory = new DataObjectFactory(
        "TestDataObject",
        TestDataObject,
        [],
        []);

    const runtimeOptions: IContainerRuntimeOptions = {
        summaryOptions: {
            disableSummaries: true,
        },
        gcOptions: {
            gcAllowed: true,
            fastExpire: true,
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

    let container1: IContainer;
    let containerRuntime: ContainerRuntime;
    let mainDataStore1: TestDataObject;

    const createContainer = async (): Promise<IContainer> => provider.createContainer(runtimeFactory);

    beforeEach(async () => {
        provider = getTestObjectProvider();

        // Create a Container for the first client.
        container1 = await createContainer();

        // Set an initial key. The Container is in read-only mode so the first op it sends will get nack'd and is
        // re-sent. Do it here so that the extra events don't mess with rest of the test.
        mainDataStore1 = await requestFluidObject<TestDataObject>(container1, "/");
        containerRuntime = mainDataStore1.containerRuntime;
        await provider.ensureSynchronized();
    });

    it("datastore should not be able to make changes", async () => {
        mainDataStore1._root.set("test", "value");
        await provider.ensureSynchronized();
        (containerRuntime as any).setReadOnly();
        mainDataStore1._root.set("test", "value2");
        await containerRuntime.summarize({
            runGC: true,
            fullTree: true,
            trackState: false,
            summaryLogger: new TelemetryNullLogger(),
        });
        assert(mainDataStore1._root.get("test") === "value", "mainDataStore1 should be readonly!.");
    });
});