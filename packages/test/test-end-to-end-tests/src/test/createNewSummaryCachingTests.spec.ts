/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import {
    ContainerRuntimeFactoryWithDefaultDataStore,
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { describeNoCompat } from "@fluidframework/test-version-utils";
import {
    IContainerRuntimeOptions,
    ISummaryConfiguration,
    DefaultSummaryConfiguration,
} from "@fluidframework/container-runtime";
import { AttachState } from "@fluidframework/container-definitions";
import { MockLogger } from "@fluidframework/telemetry-utils";

class TestDataObject extends DataObject {
    public get _root() {
        return this.root;
    }
    public get _context() {
        return this.context;
    }
}

describeNoCompat("Cache CreateNewSummary", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    const dataObjectFactory = new DataObjectFactory(
        "TestDataObject",
        TestDataObject,
        [],
        []);

    const IdleDetectionTime = 100;
    const summaryConfigOverrides: ISummaryConfiguration = {
        ...DefaultSummaryConfiguration,
        ...{
            idleTime: IdleDetectionTime,
            maxTime: IdleDetectionTime * 12,
            initialSummarizerDelayMs: 10,
        },
    };
    const runtimeOptions: IContainerRuntimeOptions = {
        summaryOptions: {
            summaryConfigOverrides,
        },
        gcOptions: {
            gcAllowed: true,
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

    let mockLogger: MockLogger;

    beforeEach(function() {
        provider = getTestObjectProvider();
        // Currently, only ODSP caches new summary.
        if (provider.driver.type !== "odsp") {
            this.skip();
        }
    });

    it("should fetch from cache when second client loads the container", async function() {
        // GitHub issue: #9534
        if (provider.driver.type === "odsp") {
            this.skip();
        }

        mockLogger = new MockLogger();

        // Create a container for the first client.
        const mainContainer = await provider.createContainer(runtimeFactory, { logger: mockLogger });
        assert.strictEqual(mainContainer.attachState, AttachState.Attached, "container was not attached");

        // getting default data store and create a new data store
        const mainDataStore = await requestFluidObject<TestDataObject>(mainContainer, "default");
        const dataStore2 = await dataObjectFactory.createInstance(mainDataStore._context.containerRuntime);
        mainDataStore._root.set("dataStore2", dataStore2.handle);

        // second client loads the container
        const container2 = await provider.loadContainer(runtimeFactory, { logger: mockLogger });
        const defaultDataStore = await requestFluidObject<TestDataObject>(container2, "default");

        await provider.ensureSynchronized();

        // getting the non-default data store and validate it is loaded
        const handle2 = defaultDataStore._root.get("dataStore2");
        const testDataStore: TestDataObject = await handle2.get();
        assert(testDataStore !== undefined, "2nd data store within loaded container is not loaded");

        // validate the snapshot was fetched from cache
        const fetchEvent = mockLogger.events.find((event) =>
            event.eventName === "fluid:telemetry:OdspDriver:ObtainSnapshot_end");
        assert(fetchEvent !== undefined, "odsp obtain snapshot event does not exist ");
        assert.strictEqual(fetchEvent.method, "cache",
            `second client fetched snapshot with ${fetchEvent.method} method instead of from cache`);
    });

    it("should fetch from cache when second client loads the container in offline mode", async function() {
        // GitHub issue: #9534
        if (provider.driver.type === "odsp") {
            this.skip();
        }
        mockLogger = new MockLogger();

        // Create a container for the first client. While attaching the odsp driver will cache the summary
        // in persisted cache.
        const mainContainer = await provider.createContainer(runtimeFactory, { logger: mockLogger });
        assert.strictEqual(mainContainer.attachState, AttachState.Attached, "container was not attached");

        // getting default data store and create a new data store
        const mainDataStore = await requestFluidObject<TestDataObject>(mainContainer, "default");
        const dataStore2 = await dataObjectFactory.createInstance(mainDataStore._context.containerRuntime);
        mainDataStore._root.set("dataStore2", dataStore2.handle);

        // second client loads the container
        const mockDocumentServiceFactory = Object.create(provider.documentServiceFactory);
        // Mock storage token fetch to throw so that we can mock offline case.
        mockDocumentServiceFactory.getStorageToken = (options) => { throw new Error("TokenFail"); };
        provider.documentServiceFactory = mockDocumentServiceFactory;

        const container2 = await provider.loadContainer(runtimeFactory, { logger: mockLogger });
        const defaultDataStore = await requestFluidObject<TestDataObject>(container2, "default");

        await provider.ensureSynchronized();

        // getting the non-default data store and validate it is loaded
        const handle2 = defaultDataStore._root.get("dataStore2");
        const testDataStore: TestDataObject = await handle2.get();
        assert(testDataStore !== undefined, "2nd data store within loaded container is not loaded");

        // validate the snapshot was fetched from cache
        const fetchEvent = mockLogger.events.find((event) =>
            event.eventName === "fluid:telemetry:OdspDriver:ObtainSnapshot_end");
        assert(fetchEvent !== undefined, "odsp obtain snapshot event does not exist ");
        assert.strictEqual(fetchEvent.method, "cache",
            `second client fetched snapshot with ${fetchEvent.method} method instead of from cache`);
    });
});
