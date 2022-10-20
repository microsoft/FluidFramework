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
describeNoCompat("GC DataStore Tombstoned When It Is Sweep Ready", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    const dataObjectFactory = new DataObjectFactory(
        "TestDataObject",
        TestDataObject,
        [],
        [],
    );
    const inactiveTimeoutMs = 0;
    const wait = 100;
    const sweepTimeoutMs = 200;

    const gcOptions: IGCRuntimeOptions = {
        gcAllowed: true,
        sweepAllowed: true,
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

    const createUnreferencedDataStore = async () => {
        const handleKey = "handle";
        const testDataObject = await dataObjectFactory.createInstance(mainDataStore.containerRuntime);
        const testDataObjectId = testDataObject.id;

        // Reference a datastore and summarize
        mainDataStore._root.set(handleKey, testDataObject.handle);
        const {
            container: summarizingContainer1,
            summarizer: summarizer1,
        } = await loadSummarizerAndContainer();
        await summarize(summarizer1);

        // Unreference a datastore and summarize
        mainDataStore._root.delete(handleKey);
        const summaryVersion = (await summarize(summarizer1)).summaryVersion;
        testDataObject._root.set("send while unreferenced", "op");
        await provider.ensureSynchronized();
        mainContainer.close();
        summarizingContainer1.close();

        return {
            testDataObjectId,
            summaryVersion,
        };
    };

    // If this test starts failing due to runtime is closed errors try first adjusting `sessionExpiryTimeoutMs` above
    it("Container loaded after sweep timeout expires can't send ops for tombstoned datastores", async () => {
        const { testDataObjectId, summaryVersion } = await createUnreferencedDataStore();

        // Wait a sweep worthy amount of time (all containers should have closed by now)
        await delay(sweepTimeoutMs);

        // Load a new container and summarizer based on the latest summary, summarize
        const {
            container: summarizingContainer2,
            summarizer: summarizer2,
        } = await loadSummarizerAndContainer(summaryVersion);

        // Use the request pattern to get the testDataObject - this is unsafe and no one should do this in their
        // production application
        const testDataObject2 = await requestFluidObject<TestDataObject>(summarizingContainer2, testDataObjectId);

        // The datastore should be tombstoned now
        await summarize(summarizer2);

        // The request pattern should fail!
        assert.throws(() => testDataObject2._root.set("send", "op"),
            (error) => {
                const correctErrorType = error.errorType = "dataCorruptionError";
                const correctErrorMessage = error.errorMessage?.startsWith(`Context was tombstoned`) === true;
                return correctErrorType && correctErrorMessage;
            },
            `Should not be able to send ops for a tombstoned datastore.`);
    });

    // If this test starts failing due to runtime is closed errors try first adjusting `sessionExpiryTimeoutMs` above
    it("Container loaded before sweep timeout expires can't send ops for tombstoned datastores", async () => {
        const { testDataObjectId, summaryVersion } = await createUnreferencedDataStore();

        // Wait some time, the datastore should not be sweep ready after this wait
        await delay(sweepTimeoutMs - wait);

        // Load a new container and summarizer based on the latest summary, summarize
        const {
            container: summarizingContainer2,
            summarizer: summarizer2,
        } = await loadSummarizerAndContainer(summaryVersion);

        // Use the request pattern to get the testDataObject - this is unsafe and no one should do this in their
        // production application.
        const testDataObject2 = await requestFluidObject<TestDataObject>(summarizingContainer2, testDataObjectId);

        // Wait enough time so that the datastore is sweep ready
        await delay(wait);

        // Send an op to update the currentTimestampMs to now
        const mainDataStore2 = await requestFluidObject<TestDataObject>(summarizingContainer2, "default");
        mainDataStore2._root.set("send a", "op");

        // The datastore should be tombstoned now
        await summarize(summarizer2);

        // The request pattern should fail!
        assert.throws(() => testDataObject2._root.set("send", "op"),
            (error) => {
                const correctErrorType = error.errorType = "dataCorruptionError";
                const correctErrorMessage = error.errorMessage?.startsWith(`Context was tombstoned`) === true;
                return correctErrorType && correctErrorMessage;
            },
            `Should not be able to send ops for a tombstoned datastore.`);
    });

    // If this test starts failing due to runtime is closed errors try first adjusting `sessionExpiryTimeoutMs` above
    itExpects("Container loaded after sweep timeout expires can't receive ops for tombstoned datastores",
    [
        {
            eventName: "fluid:telemetry:ContainerRuntime:GarbageCollector:SweepReadyObject_Loaded",
        },
        {
            eventName: "fluid:telemetry:Container:ContainerClose",
            error: "Context was tombstoned during call of process!",
            errorType: "dataCorruptionError",
        },
    ],
    async () => {
        const { testDataObjectId, summaryVersion } = await createUnreferencedDataStore();

        // Wait a sweep worthy amount of time (all containers should have closed by now)
        await delay(sweepTimeoutMs);

        // Load a new container and summarizer based on the latest summary, summarize
        const {
            container: summarizingContainer2,
            summarizer: summarizer2,
        } = await loadSummarizerAndContainer(summaryVersion);

        const container2 = await provider.loadContainer(runtimeFactory, { configProvider }, { summaryVersion });
        // Use the request pattern to get the testDataObject - this is unsafe and no one should do this in their
        // production application
        const testDataObject2 = await requestFluidObject<TestDataObject>(container2, testDataObjectId);

        // The datastore should be tombstoned now
        await summarize(summarizer2);

        // Receive an op
        testDataObject2._root.set("receive", "op");
        await provider.ensureSynchronized();
        assert(summarizingContainer2.closed === true, `Summarizing container should close.`);
    });

    // If this test starts failing due to runtime is closed errors try first adjusting `sessionExpiryTimeoutMs` above
    itExpects("Container loaded before sweep timeout expires can't receive ops for tombstoned datastores",
    [
        {
            eventName: "fluid:telemetry:ContainerRuntime:GarbageCollector:InactiveObject_Loaded",
        },
        {
            eventName: "fluid:telemetry:Container:ContainerClose",
            error: "Context was tombstoned during call of process!",
            errorType: "dataCorruptionError",
        },
    ],
    async () => {
        const { testDataObjectId, summaryVersion } = await createUnreferencedDataStore();

        // Wait some time, the datastore should not be sweep ready after this wait
        await delay(sweepTimeoutMs - wait);

        // Load a new container and summarizer based on the latest summary, summarize
        const {
            container: summarizingContainer2,
            summarizer: summarizer2,
        } = await loadSummarizerAndContainer(summaryVersion);

        const container2 = await provider.loadContainer(runtimeFactory, { configProvider }, { summaryVersion });
        // Use the request pattern to get the testDataObject - this is unsafe and no one should do this in their
        // production application.
        const testDataObject2 = await requestFluidObject<TestDataObject>(container2, testDataObjectId);

        // Wait enough time so that the datastore is sweep ready
        await delay(wait);

        // Send an op to update the currentTimestampMs to now
        const mainDataStore2 = await requestFluidObject<TestDataObject>(summarizingContainer2, "default");
        mainDataStore2._root.set("send a", "op");

        // The datastore should be tombstoned now
        await summarize(summarizer2);

        // Send an op
        testDataObject2._root.set("receive", "op");
        await provider.ensureSynchronized();
        assert(summarizingContainer2.closed === true, `Summarizing container should close.`);
    });
});
