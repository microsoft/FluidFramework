/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    ContainerRuntimeFactoryWithDefaultDataStore,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { IContainer } from "@fluidframework/container-definitions";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluidframework/test-version-utils";
import { IContainerRuntimeOptions } from "@fluidframework/container-runtime";
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
            runSweep: true,
            testMode: true,
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

    const createContainer = async (): Promise<IContainer> => provider.createContainer(runtimeFactory);

    beforeEach(async () => {
        provider = getTestObjectProvider();

        // Create a Container for the first client. Because testmode is true, the container should close immediately
        container1 = await createContainer();
        await provider.ensureSynchronized();
    });

    it("Container should be closed", async () => {
        assert(container1.closed === true, "Container should be closed");
    });
});
