/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ContainerRuntimeFactoryWithDefaultDataStore,
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { assert, TelemetryNullLogger } from "@fluidframework/common-utils";
import { IContainer } from "@fluidframework/container-definitions";
import { ContainerRuntime } from "@fluidframework/container-runtime";
import { Container } from "@fluidframework/container-loader";
import { IFluidCodeDetails } from "@fluidframework/core-interfaces";
import { SummaryType } from "@fluidframework/protocol-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
    createAndAttachContainer,
    createDocumentId,
    createLoader,
    ITestObjectProvider,
} from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluidframework/test-version-utils";
import { ChildLogger } from "@fluidframework/telemetry-utils";

class TestDataObject extends DataObject {
    public get _root() {
        return this.root;
    }

    public get _context() {
        return this.context;
    }
}

// REVIEW: enable compat testing?
describeNoCompat("GC in summary", (getTestObjectProvider) => {
    let documentId: string;
    const codeDetails: IFluidCodeDetails = {
        package: "garbageCollectionTestPackage",
        config: {},
    };
    const dataObjectFactory = new DataObjectFactory(
        "TestDataObject",
        TestDataObject,
        [],
        []);
    const runtimeOptions = {
        generateSummaries: false,
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

    let provider: ITestObjectProvider;
    let containerRuntime: ContainerRuntime;
    let defaultDataStore: TestDataObject;

    async function createContainer(): Promise<IContainer> {
        const loader = createLoader(
            [[codeDetails, runtimeFactory]],
            provider.documentServiceFactory,
            provider.urlResolver,
            ChildLogger.create(getTestLogger?.(), undefined, { all: { driverType: provider.driver?.type } }),
        );
        return createAndAttachContainer(
            codeDetails, loader, provider.driver.createCreateNewRequest(documentId));
    }

    // Summarizes the container and validates that the data store's reference state is correct in the summary.
    async function validateDataStoreReferenceState(dataStoreId: string, referenced: boolean) {
        await provider.ensureSynchronized();
        const { summary } = await containerRuntime.summarize({
            runGC: true,
            fullTree: true,
            trackState: false,
            summaryLogger: new TelemetryNullLogger(),
        });

        // For unreferenced nodes, the unreferenced flag in its summary tree is undefined.
        const expectedUnreferenced = referenced ? undefined : true;
        let found = false;
        for (const [id, summaryObject] of Object.entries(summary.tree)) {
            if (id === dataStoreId) {
                assert(summaryObject.type === SummaryType.Tree, `Data store ${dataStoreId}'s entry is not a tree`);
                assert(
                    summaryObject.unreferenced === expectedUnreferenced,
                    `Data store ${dataStoreId} should be ${referenced ? "referenced" : "unreferenced"}`,
                );
                found = true;
                break;
            }
        }
        assert(found, `Data store ${dataStoreId} is not in the summary!`);
    }

    beforeEach(async () => {
        provider = getTestObjectProvider();
        documentId = createDocumentId();

        const container = await createContainer() as Container;
        defaultDataStore = await requestFluidObject<TestDataObject>(container, "/");
        containerRuntime = defaultDataStore._context.containerRuntime as ContainerRuntime;
        provider.opProcessingController.addDeltaManagers(containerRuntime.deltaManager);

        // Wait for the Container to get connected.
        if (!container.connected) {
            await new Promise<void>((resolve) => container.on("connected", () => resolve()));
        }
    });

    it("marks default data store as referenced", async () => {
        await validateDataStoreReferenceState(defaultDataStore.id, true /* referenced */);
    });

    it("marks root data stores as referenced", async () => {
        const rootDataStore = await dataObjectFactory.createRootInstance("rootDataStore", containerRuntime);
        await validateDataStoreReferenceState(rootDataStore.id, true /* referenced */);
    });

    it("marks non-root data stores as referenced / unreferenced correctly", async () => {
        const dataStore = await dataObjectFactory.createInstance(containerRuntime);
        // Add data store's handle in root component and verify its marked as referenced.
        {
            defaultDataStore._root.set("nonRootDS", dataStore.handle);
            await validateDataStoreReferenceState(dataStore.id, true /* referenced */);
        }

        // Remove its handle and verify its marked as unreferenced.
        {
            defaultDataStore._root.delete("nonRootDS");
            await validateDataStoreReferenceState(dataStore.id, false /* referenced */);
        }

        // Add data store's handle back in root component and verify its marked as referenced.
        {
            defaultDataStore._root.set("nonRootDS", dataStore.handle);
            await validateDataStoreReferenceState(dataStore.id, true /* referenced */);
        }
    });

    it("marks non-root data stores with handle in unreferenced data stores as unreferenced", async () => {
        const dataStore1 = await dataObjectFactory.createInstance(containerRuntime);
        // Add data store's handle in root component and verify its marked as referenced.
        {
            defaultDataStore._root.set("nonRootDS1", dataStore1.handle);
            await validateDataStoreReferenceState(dataStore1.id, true /* referenced */);
        }

        // Remove its handle and verify its marked as unreferenced.
        {
            defaultDataStore._root.delete("nonRootDS1");
            await validateDataStoreReferenceState(dataStore1.id, false /* referenced */);
        }

        // Create another non-root data store.
        const dataStore2 = await dataObjectFactory.createInstance(containerRuntime);
        // Add data store's handle in root component and verify its marked as referenced.
        {
            defaultDataStore._root.set("nonRootDS2", dataStore2.handle);
            await validateDataStoreReferenceState(dataStore2.id, true /* referenced */);
        }

        // Remove its handle from root component and add to dataStore1 (which is unreferenced).
        {
            defaultDataStore._root.delete("nonRootDS2");
            dataStore1._root.set("nonRootDS2", dataStore2.handle);
            await validateDataStoreReferenceState(dataStore2.id, false /* referenced */);
        }
    });
});
