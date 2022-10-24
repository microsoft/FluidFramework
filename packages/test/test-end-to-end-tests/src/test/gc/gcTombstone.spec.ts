/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    ISummarizer,
} from "@fluidframework/container-runtime";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
    ITestObjectProvider,
    createSummarizerWithContainer,
    summarizeNow,
    waitForContainerConnection,
    mockConfigProvider,
    ITestContainerConfig,
} from "@fluidframework/test-utils";
import { describeNoCompat, ITestDataObject, itExpects, TestDataObjectType } from "@fluidframework/test-version-utils";
import { delay } from "@fluidframework/common-utils";
import { IErrorBase } from "@fluidframework/container-definitions";

/**
 * When a datastore is tombstoned it should be unable to send and receive ops
 * TODO: add testing for sending and receiving signals
 */
describeNoCompat("GC DataStore Tombstoned When It Is Sweep Ready", (getTestObjectProvider) => {
    const waitLessThanSweepTimeoutMs = 100;
    const sweepTimeoutMs = 200;
    assert(waitLessThanSweepTimeoutMs < sweepTimeoutMs, "waitLessThanSweepTimeoutMs should be < sweepTimeoutMs");
    const settings = {
        "Fluid.GarbageCollection.Test.Tombstone": "true",
        "Fluid.GarbageCollection.TestOverride.SweepTimeoutMs": sweepTimeoutMs,
    };

    const testContainerConfig: ITestContainerConfig = {
        runtimeOptions: {
            summaryOptions: {
                summaryConfigOverrides: {
                    state: "disableHeuristics",
                    maxAckWaitTime: 10000,
                    maxOpsSinceLastSummary: 7000,
                    initialSummarizerDelayMs: 0,
                    summarizerClientElection: false,
                },
            },
            gcOptions: {
                gcAllowed: true,
                inactiveTimeoutMs: 0,
            },
        },
        loaderProps: {
            configProvider: mockConfigProvider(settings),
        },
    };

    let provider: ITestObjectProvider;
    let documentAbsoluteUrl: string | undefined;

    const makeContainer = async () => {
        const container = await provider.makeTestContainer(testContainerConfig);
        documentAbsoluteUrl = await container.getAbsoluteUrl("");
        return container;
    };

    const loadSummarizerAndContainer = async (summaryVersion?: string) => {
        return createSummarizerWithContainer(
            provider,
            documentAbsoluteUrl,
            testContainerConfig,
            summaryVersion);
    };
    const summarize = async (summarizer: ISummarizer) => {
        await provider.ensureSynchronized();
        return summarizeNow(summarizer);
    };

    beforeEach(async function() {
        provider = getTestObjectProvider({ syncSummarizer: true });
        if (provider.driver.type !== "local") {
            this.skip();
        }
    });

    // This function creates an unreferenced datastore and returns the datastore's id and the summary version that
    // datastore was unreferenced in.
    const getUnreferencedDataStoreIdAndSummaryVersion = async () => {
        const container = await makeContainer();
        const defaultDataObject = await requestFluidObject<ITestDataObject>(container, "default");
        await waitForContainerConnection(container);

        const handleKey = "handle";
        const dataStore = await defaultDataObject._context.containerRuntime.createDataStore(TestDataObjectType);
        const testDataObject = await requestFluidObject<ITestDataObject>(dataStore, "");
        const testDataObjectId = testDataObject._context.id;

        // Reference a datastore - important for making it live
        defaultDataObject._root.set(handleKey, testDataObject.handle);
        // Unreference a datastore
        defaultDataObject._root.delete(handleKey);

        // Summarize
        const {
            container: summarizingContainer1,
            summarizer: summarizer1,
        } = await loadSummarizerAndContainer();
        const summaryVersion = (await summarize(summarizer1)).summaryVersion;

        // TODO: trailing op test - note because of the way gc is currently structured, the error isn't logged,
        // but it is detected - it's stored in the pending queue and the container closes before the error is sent.
        testDataObject._root.set("send while unreferenced", "op");
        await provider.ensureSynchronized();

        // Close the containers as these containers would be closed by session expiry before sweep ready ever occurs
        container.close();
        summarizingContainer1.close();

        return {
            testDataObjectId,
            summaryVersion,
        };
    };

    // If this test starts failing due to runtime is closed errors try first adjusting `sweepTimeoutMs` above
    itExpects("Container loaded after sweep timeout expires can't send ops for tombstoned datastores",
    [
        {
            eventName: "fluid:telemetry:Summarizer:Running:SweepReadyObject_Loaded",
        },
    ],
    async () => {
        const { testDataObjectId, summaryVersion } = await getUnreferencedDataStoreIdAndSummaryVersion();

        // Wait a sweep worthy amount of time (all containers should have closed by now)
        await delay(sweepTimeoutMs);

        // Load a new container and summarizer based on the latest summary, summarize
        const {
            container: summarizingContainer2,
            summarizer: summarizer2,
        } = await loadSummarizerAndContainer(summaryVersion);

        // Use the request pattern to get the testDataObject - this is unsafe and no one should do this in their
        // production application - causes a sweep ready loaded error
        const testDataObject2 = await requestFluidObject<ITestDataObject>(summarizingContainer2, testDataObjectId);

        // The datastore should be tombstoned now
        await summarize(summarizer2);

        // Modifying a testDataObject substantiated from the request pattern should fail!
        assert.throws(() => testDataObject2._root.set("send", "op"),
            (error) => {
                const correctErrorType = error.errorType = "dataCorruptionError";
                const correctErrorMessage = error.errorMessage?.startsWith(`Context is tombstoned`) === true;
                return correctErrorType && correctErrorMessage;
            },
            `Should not be able to send ops for a tombstoned datastore.`);
    });

    // If this test starts failing due to runtime is closed errors try first adjusting `sweepTimeoutMs` above
    itExpects("Container loaded before sweep timeout expires can't send ops for tombstoned datastores",
    [
        {
            eventName: "fluid:telemetry:Summarizer:Running:InactiveObject_Loaded",
        },
        {
            eventName: "fluid:telemetry:Summarizer:Running:InactiveObject_Changed",
        },
    ],
    async () => {
        const { testDataObjectId, summaryVersion } = await getUnreferencedDataStoreIdAndSummaryVersion();

        // Wait some time, the datastore should not be sweep ready after this wait
        await delay(sweepTimeoutMs - waitLessThanSweepTimeoutMs);

        // Load a new container and summarizer based on the latest summary, summarize
        const {
            container: summarizingContainer2,
            summarizer: summarizer2,
        } = await loadSummarizerAndContainer(summaryVersion);

        // Use the request pattern to get the testDataObject - this is unsafe and no one should do this in their
        // production application - causes an inactive loaded and changed error
        const testDataObject2 = await requestFluidObject<ITestDataObject>(summarizingContainer2, testDataObjectId);
        testDataObject2._root.set("send a", "op via unreferenced content");

        // Wait enough time so that the datastore is sweep ready
        await delay(waitLessThanSweepTimeoutMs);

        // Send an op to update the currentTimestampMs to now
        const mainDataStore2 = await requestFluidObject<ITestDataObject>(summarizingContainer2, "default");
        mainDataStore2._root.set("send a", "op");

        // The datastore should be tombstoned now
        await summarize(summarizer2);

        // Sending an op from a datastore substantiated from the request pattern should fail!
        assert.throws(() => testDataObject2._root.set("send", "op"),
            (error) => {
                const correctErrorType = error.errorType = "dataCorruptionError";
                const correctErrorMessage = error.errorMessage?.startsWith(`Context is tombstoned`) === true;
                return correctErrorType && correctErrorMessage;
            },
            `Should not be able to send ops for a tombstoned datastore.`);
    });

    // If this test starts failing due to runtime is closed errors try first adjusting `sweepTimeoutMs` above
    itExpects("Container loaded after sweep timeout expires closes on receiving ops for tombstoned datastores",
    [
        {
            eventName: "fluid:telemetry:ContainerRuntime:GarbageCollector:SweepReadyObject_Loaded",
        },
        {
            eventName: "fluid:telemetry:Container:ContainerClose",
            error: "Context is tombstoned: Call site -  process!",
            errorType: "dataCorruptionError",
        },
    ],
    async () => {
        const { testDataObjectId, summaryVersion } = await getUnreferencedDataStoreIdAndSummaryVersion();

        // Wait a sweep worthy amount of time (all containers should have closed by now)
        await delay(sweepTimeoutMs);

        // Load a new container and summarizer based on the latest summary, summarize
        const {
            container: summarizingContainer2,
            summarizer: summarizer2,
        } = await loadSummarizerAndContainer(summaryVersion);
        // Setup close validation
        let closeError: IErrorBase | undefined;
        summarizingContainer2.on("closed", (error) => {
            closeError = error;
        });

        // The datastore should be tombstoned now
        await summarize(summarizer2);

        // We load this container from a summary that had not yet tombstoned the datastore so that the datastore loads.
        const container2 = await provider.loadTestContainer(testContainerConfig, { summaryVersion });
        // Use the request pattern to get the testDataObject - this is unsafe and no one should do this in their
        // production application
        // This does not cause a sweep ready changed error as the container has loaded from a summary before sweep
        // ready was set
        const testDataObject2 = await requestFluidObject<ITestDataObject>(container2, testDataObjectId);

        // Receive an op - the summarizing container does not log a sweep ready changed error as it closes before
        // the op is processed. The summarizing container does log a sweep ready loaded error and then it should
        // process the op which causes the container to close.
        testDataObject2._root.set("receive", "op");
        await provider.ensureSynchronized();
        assert(summarizingContainer2.closed === true, `Summarizing container should close.`);
        assert(closeError !== undefined, `Expecting an error!`);
        assert(closeError.errorType === "dataCorruptionError");
        assert(closeError.message === "Context is tombstoned: Call site -  process!");
    });

    // If this test starts failing due to runtime is closed errors try first adjusting `sweepTimeoutMs` above
    itExpects("Container loaded before sweep timeout expires closes on receiving ops for tombstoned datastores",
    [
        {
            eventName: "fluid:telemetry:ContainerRuntime:GarbageCollector:InactiveObject_Loaded",
        },
        {
            eventName: "fluid:telemetry:Container:ContainerClose",
            error: "Context is tombstoned: Call site -  process!",
            errorType: "dataCorruptionError",
        },
    ],
    async () => {
        const { testDataObjectId, summaryVersion } = await getUnreferencedDataStoreIdAndSummaryVersion();

        // Wait some time, the datastore should not be sweep ready after this wait
        await delay(sweepTimeoutMs - waitLessThanSweepTimeoutMs);

        // Load a new container and summarizer based on the latest summary
        const {
            container: summarizingContainer2,
            summarizer: summarizer2,
        } = await loadSummarizerAndContainer(summaryVersion);
        // Setup close validation
        let closeError: IErrorBase | undefined;
        summarizingContainer2.on("closed", (error) => {
            closeError = error;
        });

        // We load this container from a summary that had not yet tombstoned the datastore so that the datastore loads.
        const container2 = await provider.loadTestContainer(testContainerConfig, { summaryVersion });
        // Use the request pattern to get the testDataObject - this is unsafe and no one should do this in their
        // production application. Causes an inactiveObject loaded error
        const testDataObject2 = await requestFluidObject<ITestDataObject>(container2, testDataObjectId);

        // Wait enough time so that the datastore is sweep ready
        await delay(waitLessThanSweepTimeoutMs);

        // Send an op to update the currentTimestampMs to now
        const mainDataStore2 = await requestFluidObject<ITestDataObject>(summarizingContainer2, "default");
        mainDataStore2._root.set("send a", "op");

        // The datastore should be tombstoned now
        await summarize(summarizer2);

        // Send an op - no sweep changed or loaded - the summarizing container does not log sweep ready errors as it
        // closes before the op is processed and the datastore is realized
        testDataObject2._root.set("receive", "op");
        await provider.ensureSynchronized();
        assert(summarizingContainer2.closed === true, `Summarizing container should close.`);
        assert(closeError !== undefined, `Expecting an error!`);
        assert(closeError.errorType === "dataCorruptionError");
        assert(closeError.message === "Context is tombstoned: Call site -  process!");
    });
});
