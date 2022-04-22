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
import { IContainer, IRuntimeFactory, LoaderHeader } from "@fluidframework/container-definitions";
import { IRequest } from "@fluidframework/core-interfaces";
import { ISummaryConfiguration } from "@fluidframework/protocol-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeFullCompat } from "@fluidframework/test-version-utils";
import {
    IAckedSummary,
    IContainerRuntimeOptions,
    RuntimeHeaders,
    SummaryCollection,
} from "@fluidframework/container-runtime";
import { IContainerRuntimeBase } from "@fluidframework/runtime-definitions";
import { TestDataObject } from "../mockSummarizerClient";

/**
 * Validates this scenario: When a data store is shared with an external app, if the data store becomes unreferenced
 * by the time it is requested via this external app, we return a failure (404).
 * Basically, for data stores that are unreferenced in the base snapshot that a container loads from, we return a
 * failure (404) when they are requested with "externalRequest" flag in the request header.
 */
describeFullCompat("GC Data Store Requests", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    const dataObjectFactory = new DataObjectFactory(
        "TestDataObject",
        TestDataObject,
        [],
        []);

    const IdleDetectionTime = 100;
    const summaryConfigOverrides: Partial<ISummaryConfiguration> = {
        idleTime: IdleDetectionTime,
        maxTime: IdleDetectionTime * 12,
    };
    const runtimeOptions: IContainerRuntimeOptions = {
        summaryOptions: {
            initialSummarizerDelayMs: 10,
            summaryConfigOverrides,
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

    let mainContainer: IContainer;
    let mainDataStore: TestDataObject;
    let summaryCollection: SummaryCollection;

    /**
     * Waits for a summary with the current state of the document (including all in-flight changes). It basically
     * synchronizes all containers and waits for a summary that contains the last processed sequence number.
     * @returns the version of this summary. This version can be used to load a Container with the summary associated
     * with it.
     */
     async function waitForSummary(): Promise<string> {
        await provider.ensureSynchronized();
        const ackedSummary: IAckedSummary =
            await summaryCollection.waitSummaryAck(mainContainer.deltaManager.lastSequenceNumber);
        return ackedSummary.summaryAck.contents.handle;
    }

    const createContainer = async (): Promise<IContainer> => provider.createContainer(runtimeFactory);
    const loadContainer = async (
        summaryVersion: string,
        factory: IRuntimeFactory = runtimeFactory,
    ): Promise<IContainer> => {
        const requestHeader = {
            [LoaderHeader.version]: summaryVersion,
        };
        return provider.loadContainer(factory, undefined /* options */, requestHeader);
    };

    beforeEach(async () => {
        provider = getTestObjectProvider();

        // Create a Container for the first client.
        mainContainer = await createContainer();

        // Set an initial key. The Container is in read-only mode so the first op it sends will get nack'd and is
        // re-sent. Do it here so that the extra events don't mess with rest of the test.
        mainDataStore = await requestFluidObject<TestDataObject>(mainContainer, "default");
        mainDataStore._root.set("test", "value");

        await provider.ensureSynchronized();

        // Create and setup a summary collection that will be used to track and wait for summaries.
        summaryCollection = new SummaryCollection(mainContainer.deltaManager, new TelemetryNullLogger());
    });

    it("should fail requests with externalRequest flag for unreferenced data stores", async () => {
        const directoryKey = "dataStore2";

        // Create a second data store (dataStore2) and add its handle to mark it as referenced.
        const dataStore2 = await dataObjectFactory.createInstance(mainDataStore.containerRuntime);
        mainDataStore._root.set(directoryKey, dataStore2.handle);

        // Wait for summary that contains the above set.
        await waitForSummary();

        // Now delete the handle so that dataStore2 is marked as unreferenced.
        mainDataStore._root.delete(directoryKey);

        // Wait for the summary that contains the above delete. Also, get this summary's version so that we can load
        // a new container with it.
        const summaryVersion = await waitForSummary();

        // Load a new container with the version of the summary above. The initial summary for dataStore2 will
        // have it marked as unreferenced.
        const container2 = await loadContainer(summaryVersion);

        // Request dataStore2 without externalRequest header and verify that we can load it.
        const request: IRequest = { url: dataStore2.id };
        let response = await container2.request(request);
        assert(
            response.status === 200 && response.mimeType === "fluid/object",
            "dataStore2 should have successfully loaded",
        );

        // Add externalRequest = true to the header and verify that we are unable to load dataStore2.
        request.headers = { [RuntimeHeaders.externalRequest]: true };
        response = await container2.request(request);
        assert(response.status === 404, "dataStore2 should have failed to load");
    });

    it("should succeed requests with externalRequest flag for data stores that are re-referenced", async () => {
        const directoryKey = "dataStore2";

        // Create a second data store (dataStore2) and add its handle to mark it as referenced.
        const dataStore2 = await dataObjectFactory.createInstance(mainDataStore.containerRuntime);
        mainDataStore._root.set(directoryKey, dataStore2.handle);

        // Wait for summary that contains the above set.
        await waitForSummary();

        // Now delete the handle so that dataStore2 is marked as unreferenced.
        mainDataStore._root.delete(directoryKey);

        // Wait for the summary that contains the above delete. Also, get this summary's version so that we can load
        // a new container with it.
        let summaryVersion = await waitForSummary();

        // Load a new container with the version of the summary above. The initial summary for dataStore2 will
        // have it marked as unreferenced.
        const container2 = await loadContainer(summaryVersion);

        // Request dataStore2 with externalRequest = true to the header and verify that we are unable to
        // load dataStore2.
        const request: IRequest = {
            url: dataStore2.id,
            headers: { [RuntimeHeaders.externalRequest]: true },
        };
        let response = await container2.request(request);
        assert(response.status === 404, "dataStore2 should have failed to load");

        // Add the handle of dataStore2 to mark it as referenced again.
        mainDataStore._root.set(directoryKey, dataStore2.handle);

        // Wait for the summary that contains the above set. Also, get this summary's version so that we can load
        // a new container with it.
        summaryVersion = await waitForSummary();

        // Load a new container with the version of the summary above. The initial summary for dataStore2 will
        // have it marked as unreferenced.
        const container3 = await loadContainer(summaryVersion);
        response = await container3.request(request);
        assert(response.status === 200, "dataStore2 should successfully load now");
    });

    it("should succced requests with externalRequest flag for unreferenced data stores with GC disabled", async () => {
        const directoryKey = "dataStore2";

        // Create a second data store (dataStore2) and add its handle to mark it as referenced.
        const dataStore2 = await dataObjectFactory.createInstance(mainDataStore.containerRuntime);
        mainDataStore._root.set(directoryKey, dataStore2.handle);

        // Wait for summary that contains the above set.
        await waitForSummary();

        // Now delete the handle so that dataStore2 is marked as unreferenced.
        mainDataStore._root.delete(directoryKey);

        // Wait for the summary that contains the above delete. Also, get this summary's version so that we can load
        // a new container with it.
        const summaryVersion = await waitForSummary();

        // Load a new container with the version of the summary above with GC disabled. The initial summary for
        // dataStore2 will have it marked as unreferenced.
        const gcDisabledRuntimeOptions: IContainerRuntimeOptions = {
            summaryOptions: {
                initialSummarizerDelayMs: 10,
                summaryConfigOverrides,
            },
            gcOptions: {
                disableGC: true,
            },
        };
        const gcDisabledRuntimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
            dataObjectFactory,
            [
                [dataObjectFactory.type, Promise.resolve(dataObjectFactory)],
            ],
            undefined,
            [innerRequestHandler],
            gcDisabledRuntimeOptions,
        );
        const container2 = await loadContainer(summaryVersion, gcDisabledRuntimeFactory);

        // Request dataStore2 with externalRequest = true to the header and verify that we are able to
        // load it even though it is marked as unreferenced in initial summary.
        const request: IRequest = {
            url: dataStore2.id,
            headers: { [RuntimeHeaders.externalRequest]: true },
        };
        const response = await container2.request(request);
        assert(
            response.status === 200 && response.mimeType === "fluid/object",
            "dataStore2 should have successfully loaded",
        );
    });
});
