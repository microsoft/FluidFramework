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
import { IRequest } from "@fluidframework/core-interfaces";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeFullCompat } from "@fluidframework/test-version-utils";
import {
    IContainerRuntimeOptions,
} from "@fluidframework/container-runtime";
import { IContainerRuntimeBase } from "@fluidframework/runtime-definitions";
import { TestDataObject } from "./mockSummarizerClient";
import { mockConfigProvider } from "./mockConfigProivder";

/**
 * Validates this scenario: When a datastore is aliased that it is considered a root datastore and always referenced
 */
describeFullCompat("GC Data Store Aliased", (getTestObjectProvider) => {
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
        },
    };
    const innerRequestHandler = async (request: IRequest, runtime: IContainerRuntimeBase) =>
        runtime.IFluidHandleContext.resolveHandle(request);
    const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
        dataObjectFactory,
        [
            [dataObjectFactory.type, Promise.resolve(dataObjectFactory)],
        ],
        undefined,
        [innerRequestHandler],
        runtimeOptions,
    );

    // Enable config provider setting to write GC data at the root.
    const settings = { "Fluid.GarbageCollection.LogUnknownOutboundRoutes": "true" };
    const configProvider = mockConfigProvider(settings);

    let container1: IContainer;
    let container2: IContainer;
    let mainDataStore1: TestDataObject;
    let mainDataStore2: TestDataObject;

     async function summarizeOnContainer(container: IContainer) {
        const dataStore = await requestFluidObject<TestDataObject>(container, "default");
        return dataStore.containerRuntime.summarize({runGC: true, trackState: false});
    }

    const createContainer = async (): Promise<IContainer> => {
        return provider.createContainer(runtimeFactory, { configProvider });
    };
    const loadContainer = async (): Promise<IContainer> => {
        return provider.loadContainer(runtimeFactory, { configProvider });
    };
    beforeEach(async () => {
        provider = getTestObjectProvider();

        // Create a Container for the first client.
        container1 = await createContainer();
        container2 = await loadContainer();

        mainDataStore1 = await requestFluidObject<TestDataObject>(container1, "default");
        mainDataStore2 = await requestFluidObject<TestDataObject>(container2, "default");
        await provider.ensureSynchronized();
    });

    // TODO: fully validate that GC is notified. Currently this tests the race condition
    // where a remote datastore is summarized before the alias op arrives when trySetAlias is called.
    it("GC is notified when datastores are aliased.", async () => {
        await summarizeOnContainer(container2);
        const containerRuntime1 = mainDataStore1.containerRuntime;
        const aliasableDataStore1 = await containerRuntime1.createDataStore("TestDataObject");

        (aliasableDataStore1 as any).fluidDataStoreChannel.bindToContext();
        await provider.ensureSynchronized();

        // We run the summary so await this.getInitialSnapshotDetails() is called before the datastore is aliased
        // and after the datastore is attached. This sets the isRootDataStore. This should be passing as there is
        // further GC work that will require this test to pass https://github.com/microsoft/FluidFramework/issues/8859
        await summarizeOnContainer(container2);

        // Alias a datastore
        const alias = "alias";
        const aliasResult1 = await aliasableDataStore1.trySetAlias(alias);
        assert(aliasResult1 === "Success", `Expected an successful aliasing. Got: ${aliasResult1}`);
        await provider.ensureSynchronized();

        // Should be able to retrieve root datastore from remote
        const containerRuntime2 = mainDataStore2.containerRuntime;
        const aliasableDataStore2 = await containerRuntime2.getRootDataStore(alias);
        const aliasedDataStoreResponse2 = await aliasableDataStore2.request({url:"/"});
        const aliasedDataStore2 = aliasedDataStoreResponse2.value as TestDataObject;
        assert(aliasedDataStore2._context.baseSnapshot?.unreferenced !== true, "datastore should be referenced");

        await summarizeOnContainer(container2);
        // TODO: Check GC is notified
    });
});
