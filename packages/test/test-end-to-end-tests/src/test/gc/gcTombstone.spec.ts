/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IContainer } from "@fluidframework/container-definitions";
import {
    ContainerRuntime,
    IContainerRuntimeOptions,
    IGCRuntimeOptions,
    ISummarizer,
} from "@fluidframework/container-runtime";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
    ITestObjectProvider,
    createSummarizerWithContainer,
    summarizeNow,
    waitForContainerConnection,
    mockConfigProvider,
} from "@fluidframework/test-utils";
import { describeNoCompat, itExpects } from "@fluidframework/test-version-utils";
import { DataObject, DataObjectFactory, ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct";
import { delay } from "@fluidframework/common-utils";
import { IRequest } from "@fluidframework/core-interfaces";
import { IContainerRuntimeBase } from "@fluidframework/runtime-definitions";

class TestDataObject extends DataObject {
    public get _root() {
        return this.root;
    }

    public get _context() {
        return this.context;
    }

    public get containerRuntime() {
        return this.context.containerRuntime as ContainerRuntime;
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
    const sessionExpiryTimeoutMs = 200;
    const sweepTimeoutMs = sessionExpiryTimeoutMs + 10;

    const gcOptions: IGCRuntimeOptions = {
        gcAllowed: true,
        sweepAllowed: true,
        sessionExpiryTimeoutMs,
        snapshotCacheExpiryMs: 0,
        inactiveTimeoutMs,
    };

    const runtimeOptions: IContainerRuntimeOptions = {
        summaryOptions: {
            summaryConfigOverrides: {
                state: "disableHeuristics",
                maxAckWaitTime: 10000,
                maxOpsSinceLastSummary: 7000,
                initialSummarizerDelayMs: 0,
                summarizerClientElection: false,
            },
        },
        gcOptions,
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

    const settings = {
        "Fluid.GarbageCollection.RunSessionExpiry": "true",
        "Fluid.GarbageCollection.Test.Tombstone": "true",
        "Fluid.GarbageCollection.TestOverride.SweepTimeoutMs": sweepTimeoutMs,
    };
    const configProvider = mockConfigProvider(settings);
    const createContainer = async () => provider.createContainer(runtimeFactory, { configProvider });
    const loadSummarizerAndContainer = async (summaryVersion?: string) => {
        const absoluteUrl = await mainContainer.getAbsoluteUrl("");
        return createSummarizerWithContainer(provider, absoluteUrl, runtimeFactory, { configProvider }, summaryVersion);
    };
    const summarize = async (summarizer: ISummarizer) => {
        await provider.ensureSynchronized();
        return summarizeNow(summarizer);
    };

    let mainContainer: IContainer;
    let mainDataStore: TestDataObject;

    beforeEach(async () => {
        provider = getTestObjectProvider({ syncSummarizer: true });
        mainContainer = await createContainer();
        mainDataStore = await requestFluidObject<TestDataObject>(mainContainer, "default");
        await waitForContainerConnection(mainContainer);
    });

    // If this test starts failing due to runtime is closed errors try first adjusting `sessionExpiryTimeoutMs` above
    itExpects("GC tombstones datastores when they are sweep ready.",
    [
        {
            eventName: "fluid:telemetry:Container:ContainerClose",
            errorType: "clientSessionExpiredError",
        },
        {
            eventName: "fluid:telemetry:Container:ContainerClose",
            errorType: "clientSessionExpiredError",
        },
    ],
    async () => {
        const handleKey = "handle";
        const testDataObject = await dataObjectFactory.createInstance(mainDataStore.containerRuntime);
        const testDataObjectId = testDataObject.id;

        // Reference a datastore and summarize
        mainDataStore._root.set(handleKey, testDataObject.handle);
        const summarizer = (await loadSummarizerAndContainer()).summarizer;
        await summarize(summarizer);

        // Unreference a datastore and summarize
        mainDataStore._root.delete(handleKey);
        const summaryVersion = (await summarize(summarizer)).summaryVersion;

        // Wait a sweep worthy amount of time (all containers should have closed by now)
        await delay(sweepTimeoutMs);

        // Load a new container and summarizer based on the latest summary, summarize
        const {
            container: container2,
            summarizer: closingSummarizer,
        } = await loadSummarizerAndContainer(summaryVersion);

        // Use the request pattern to get the testDataObject - this is unsafe and no one should do this in their
        // production application
        const testDataObject2 = await requestFluidObject<TestDataObject>(container2, testDataObjectId);

        // The datastore should be tombstoned now
        await summarize(closingSummarizer);

        // The request pattern should fail!
        assert.throws(() => testDataObject2._root.set("send", "op"),
            (error) => {
                const correctErrorType = error.errorType = "dataCorruptionError";
                const correctErrorMessage = error.errorMessage?.startsWith(`Context was tombstoned`) === true;
                return correctErrorType && correctErrorMessage;
            },
            `Should not be able to send ops for a tombstoned datastore.`);
    });
});
