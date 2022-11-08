/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    ISummarizer, RuntimeHeaders,
} from "@fluidframework/container-runtime";
import {
    requestFluidObject } from "@fluidframework/runtime-utils";
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
import { IContainer, IErrorBase } from "@fluidframework/container-definitions";
import { IRequest } from "@fluidframework/core-interfaces";

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
    const summarizationWithUnreferencedDataStoreAfterTime =
    async (approximateUnreferenceTimestampMs: number) => {
        const container = await makeContainer();
        const defaultDataObject = await requestFluidObject<ITestDataObject>(container, "default");
        await waitForContainerConnection(container);

        const handleKey = "handle";
        const dataStore = await defaultDataObject._context.containerRuntime.createDataStore(TestDataObjectType);
        const testDataObject = await requestFluidObject<ITestDataObject>(dataStore, "");
        const unreferencedId = testDataObject._context.id;

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

        // Wait some time, the datastore can be in many different unreference states
        await delay(approximateUnreferenceTimestampMs);

        // Load a new container and summarizer based on the latest summary, summarize
        const {
            container: summarizingContainer2,
            summarizer: summarizer2,
        } = await loadSummarizerAndContainer(summaryVersion);

        return {
            unreferencedId,
            summarizingContainer: summarizingContainer2,
            summarizer: summarizer2,
            summaryVersion,
        };
    };

    const sendOpToUpdateSummaryTimestampToNow = async (container: IContainer) => {
        const defaultDataObject = await requestFluidObject<ITestDataObject>(container, "default");
        defaultDataObject._root.set("send a", "op");
    };

    // If this test starts failing due to runtime is closed errors try first adjusting `sweepTimeoutMs` above
    itExpects("Send ops fails for tombstoned datastores in summarizing container loaded after sweep timeout",
    [
        { eventName: "fluid:telemetry:Summarizer:Running:SweepReadyObject_Loaded" },
    ],
    async () => {
        const {
            unreferencedId,
            summarizingContainer,
            summarizer,
        } = await summarizationWithUnreferencedDataStoreAfterTime(sweepTimeoutMs);

        // Use the request pattern to get the testDataObject - this is unsafe and no one should do this in their
        // production application - causes a sweep ready loaded error
        const dataObject = await requestFluidObject<ITestDataObject>(summarizingContainer, unreferencedId);

        // The datastore should be tombstoned now
        await summarize(summarizer);

        // Modifying a testDataObject substantiated from the request pattern should fail!
        assert.throws(() => dataObject._root.set("send", "op"),
            (error) => {
                const correctErrorType = error.errorType === "dataCorruptionError";
                const correctErrorMessage = error.errorMessage?.startsWith(`Context is tombstoned`) === true;
                return correctErrorType && correctErrorMessage;
            },
            `Should not be able to send ops for a tombstoned datastore.`,
        );
    });

    // If this test starts failing due to runtime is closed errors try first adjusting `sweepTimeoutMs` above
    itExpects("Send ops fails for tombstoned datastores in summarizing container loaded before sweep timeout",
    [
        { eventName: "fluid:telemetry:Summarizer:Running:InactiveObject_Loaded" },
    ],
    async () => {
        const {
            unreferencedId,
            summarizingContainer,
            summarizer,
        } = await summarizationWithUnreferencedDataStoreAfterTime(sweepTimeoutMs - waitLessThanSweepTimeoutMs);

        // Use the request pattern to get the testDataObject - this is unsafe and no one should do this in their
        // production application - causes an inactive loaded and changed error
        const dataObject = await requestFluidObject<ITestDataObject>(summarizingContainer, unreferencedId);

        // Wait enough time so that the datastore is sweep ready
        await delay(waitLessThanSweepTimeoutMs);

        await sendOpToUpdateSummaryTimestampToNow(summarizingContainer);

        // The datastore should be tombstoned now
        await summarize(summarizer);

        // Sending an op from a datastore substantiated from the request pattern should fail!
        assert.throws(() => dataObject._root.set("send", "op"),
            (error) => {
                const correctErrorType = error.errorType === "dataCorruptionError";
                const correctErrorMessage = error.errorMessage?.startsWith(`Context is tombstoned`) === true;
                return correctErrorType && correctErrorMessage;
            },
            `Should not be able to send ops for a tombstoned datastore.`,
        );
    });

    // If this test starts failing due to runtime is closed errors try first adjusting `sweepTimeoutMs` above
    itExpects("Receive ops fails for tombstoned datastores in summarizing container loaded after sweep timeout",
    [
        { eventName: "fluid:telemetry:ContainerRuntime:GarbageCollector:SweepReadyObject_Loaded" },
        {
            eventName: "fluid:telemetry:Container:ContainerClose",
            error: "Context is tombstoned! Call site [process]",
            errorType: "dataCorruptionError",
        },
    ],
    async () => {
        const {
            unreferencedId,
            summarizingContainer,
            summarizer,
            summaryVersion,
        } = await summarizationWithUnreferencedDataStoreAfterTime(sweepTimeoutMs);
        // Setup close validation
        let closeError: IErrorBase | undefined;
        summarizingContainer.on("closed", (error) => {
            closeError = error;
        });

        // The datastore should be tombstoned now
        await summarize(summarizer);

        // We load this container from a summary that had not yet tombstoned the datastore so that the datastore loads.
        const container = await provider.loadTestContainer(testContainerConfig, { summaryVersion });
        // Use the request pattern to get the testDataObject - this is unsafe and no one should do this in their
        // production application
        // This does not cause a sweep ready changed error as the container has loaded from a summary before sweep
        // ready was set
        const dataObject = await requestFluidObject<ITestDataObject>(container, unreferencedId);

        // Receive an op - the summarizing container does not log a sweep ready changed error as it closes before
        // the op is processed. The summarizing container does log a sweep ready loaded error and then it should
        // process the op which causes the container to close.
        dataObject._root.set("send an op to be received", "op");
        await provider.ensureSynchronized();
        assert(summarizingContainer.closed === true, `Summarizing container should close.`);
        assert(closeError !== undefined, `Expecting an error!`);
        assert(closeError.errorType === "dataCorruptionError");
        assert(closeError.message === "Context is tombstoned! Call site [process]");
    });

    // If this test starts failing due to runtime is closed errors try first adjusting `sweepTimeoutMs` above
    itExpects("Receive ops fails for tombstoned datastores in summarizing container loaded before sweep timeout",
    [
        { eventName: "fluid:telemetry:ContainerRuntime:GarbageCollector:InactiveObject_Loaded" },
        {
            eventName: "fluid:telemetry:Container:ContainerClose",
            error: "Context is tombstoned! Call site [process]",
            errorType: "dataCorruptionError",
        },
    ],
    async () => {
        const {
            unreferencedId,
            summarizingContainer,
            summarizer,
            summaryVersion,
        } = await summarizationWithUnreferencedDataStoreAfterTime(sweepTimeoutMs - waitLessThanSweepTimeoutMs);

        // Setup close validation
        let closeError: IErrorBase | undefined;
        summarizingContainer.on("closed", (error) => {
            closeError = error;
        });

        // We load this container from a summary that had not yet tombstoned the datastore so that the datastore loads.
        const container = await provider.loadTestContainer(testContainerConfig, { summaryVersion });
        // Use the request pattern to get the testDataObject - this is unsafe and no one should do this in their
        // production application. Causes an inactiveObject loaded error
        const dataObject = await requestFluidObject<ITestDataObject>(container, unreferencedId);

        // Wait enough time so that the datastore is sweep ready
        await delay(waitLessThanSweepTimeoutMs);

        await sendOpToUpdateSummaryTimestampToNow(summarizingContainer);

        // The datastore should be tombstoned now
        await summarize(summarizer);

        // Send an op to be received - no sweep changed or loaded - the summarizing container does not log sweep ready
        // errors as it closes before the op is processed and the datastore is realized
        dataObject._root.set("send an op to be received", "op");
        await provider.ensureSynchronized();
        assert(summarizingContainer.closed === true, `Summarizing container should close.`);
        assert(closeError !== undefined, `Expecting an error!`);
        assert(closeError.errorType === "dataCorruptionError");
        assert(closeError.message === "Context is tombstoned! Call site [process]");
    });

    // If this test starts failing due to runtime is closed errors try first adjusting `sweepTimeoutMs` above
    itExpects("Send signals fails for tombstoned datastores in summarizing container loaded after sweep timeout",
    [
        { eventName: "fluid:telemetry:Summarizer:Running:SweepReadyObject_Loaded" },
    ],
    async () => {
        const {
            unreferencedId,
            summarizingContainer,
            summarizer,
        } = await summarizationWithUnreferencedDataStoreAfterTime(sweepTimeoutMs);

        // Use the request pattern to get the testDataObject - this is unsafe and no one should do this in their
        // production application - causes a sweep ready loaded error
        const dataObject = await requestFluidObject<ITestDataObject>(summarizingContainer, unreferencedId);

        // The datastore should be tombstoned now
        await summarize(summarizer);

        // Sending a signal froma a testDataObject substantiated from the request pattern should fail!
        assert.throws(() => dataObject._runtime.submitSignal("send", "signal"),
            (error) => {
                const correctErrorType = error.errorType === "dataCorruptionError";
                const correctErrorMessage = error.errorMessage?.startsWith(`Context is tombstoned`) === true;
                return correctErrorType && correctErrorMessage;
            },
            `Should not be able to send signals for a tombstoned datastore.`,
        );
    });

    // If this test starts failing due to runtime is closed errors try first adjusting `sweepTimeoutMs` above
    itExpects("Receive signals fails for tombstoned datastores in summarizing container loaded after sweep timeout",
    [
        { eventName: "fluid:telemetry:ContainerRuntime:GarbageCollector:SweepReadyObject_Loaded" },
        {
            eventName: "fluid:telemetry:Container:ContainerClose",
            error: "Context is tombstoned! Call site [processSignal]",
            errorType: "dataCorruptionError",
        },
    ],
    async () => {
        const {
            unreferencedId,
            summarizingContainer,
            summarizer,
            summaryVersion,
        } = await summarizationWithUnreferencedDataStoreAfterTime(sweepTimeoutMs);
        // Setup close validation
        let closeError: IErrorBase | undefined;
        summarizingContainer.on("closed", (error) => {
            closeError = error;
        });

        // The datastore should be tombstoned now
        await summarize(summarizer);

        // We load this container from a summary that had not yet tombstoned the datastore so that the datastore loads.
        const container = await provider.loadTestContainer(testContainerConfig, { summaryVersion });
        // Use the request pattern to get the testDataObject - this is unsafe and no one should do this in their
        // production application
        // This does not cause a sweep ready changed error as the container has loaded from a summary before sweep
        // ready was set
        const dataObject = await requestFluidObject<ITestDataObject>(container, unreferencedId);

        // Receive a signal by sending it from another container
        dataObject._runtime.submitSignal("send a signal to be received", "signal");
        await provider.ensureSynchronized();
        assert(summarizingContainer.closed === true, `Summarizing container should close.`);
        assert(closeError !== undefined, `Expecting an error!`);
        assert(closeError.errorType === "dataCorruptionError");
        assert(closeError.message === "Context is tombstoned! Call site [processSignal]");
    });

    // If this test starts failing due to runtime is closed errors try first adjusting `sweepTimeoutMs` above
    itExpects("Requesting tombstoned datastores fails in summarizing container loaded after sweep timeout",
    [
        {
            error: "TombstonedDataStoreRequested",
            eventName: "fluid:telemetry:ContainerRuntime:TombstonedDataStoreRequested",
            viaHandle: false,
        },
    ],
    async () => {
        const {
            unreferencedId,
            summarizingContainer,
            summarizer,
        } = await summarizationWithUnreferencedDataStoreAfterTime(sweepTimeoutMs);

        await sendOpToUpdateSummaryTimestampToNow(summarizingContainer);

        // The datastore should be tombstoned now
        await summarize(summarizer);

        // Requesting a tombstoned datastore should fail!
        await assert.rejects(async () => requestFluidObject<ITestDataObject>(summarizingContainer, unreferencedId),
            (error) => {
                const correctErrorType = error.code === 404;
                const correctErrorMessage = error.message.startsWith(`Datastore removed by gc`) === true;
                return correctErrorType && correctErrorMessage;
            },
            `Should not be able to retrieve a tombstoned datastore.`,
        );
    });

    // If this test starts failing due to runtime is closed errors try first adjusting `sweepTimeoutMs` above
    itExpects("Requesting tombstoned datastores fails in summarizing container loaded before sweep timeout",
    [
        {
            error: "TombstonedDataStoreRequested",
            eventName: "fluid:telemetry:ContainerRuntime:TombstonedDataStoreRequested",
            viaHandle: false,
        },
    ],
    async () => {
        const {
            unreferencedId,
            summarizingContainer,
            summarizer,
        } = await summarizationWithUnreferencedDataStoreAfterTime(sweepTimeoutMs - waitLessThanSweepTimeoutMs);
        // Wait enough time so that the datastore is sweep ready
        await delay(waitLessThanSweepTimeoutMs);

        await sendOpToUpdateSummaryTimestampToNow(summarizingContainer);

        // The datastore should be tombstoned now
        await summarize(summarizer);

        // Requesting a tombstoned datastore should fail!
        await assert.rejects(async () => requestFluidObject<ITestDataObject>(summarizingContainer, unreferencedId),
            (error) => {
                const correctErrorType = error.code === 404;
                const correctErrorMessage = error.message.startsWith(`Datastore removed by gc`) === true;
                return correctErrorType && correctErrorMessage;
            },
            `Should not be able to retrieve a tombstoned datastore.`,
        );
    });

    // If this test starts failing due to runtime is closed errors try first adjusting `sweepTimeoutMs` above
    itExpects("Handle request for tombstoned datastores fails in summarizing container loaded after sweep timeout",
    [
        { eventName: "fluid:telemetry:Summarizer:Running:SweepReadyObject_Loaded" },
        {
            error: "TombstonedDataStoreRequested",
            eventName: "fluid:telemetry:ContainerRuntime:TombstonedDataStoreRequested",
            viaHandle: true,
        },
    ],
    async () => {
        const {
            unreferencedId,
            summarizingContainer,
            summarizer,
        } = await summarizationWithUnreferencedDataStoreAfterTime(sweepTimeoutMs);

        const dataObject = await requestFluidObject<ITestDataObject>(summarizingContainer, unreferencedId);
        await sendOpToUpdateSummaryTimestampToNow(summarizingContainer);

        // The datastore should be tombstoned now
        await summarize(summarizer);

        // Note: if a user makes a request that looks like this, we will also think that the request is via handle
        const request: IRequest = { url: unreferencedId, headers: { [RuntimeHeaders.viaHandle]: true } };
        const response = await dataObject._context.IFluidHandleContext.resolveHandle(request);

        assert(response !== undefined, `Expecting a response!`);
        assert(response.status === 404);
        assert(response.value.startsWith(`Datastore removed by gc`));
    });

    // If this test starts failing due to runtime is closed errors try first adjusting `sweepTimeoutMs` above
    itExpects("Handle request for tombstoned datastores fails in summarizing container loaded before sweep timeout",
    [
        { eventName: "fluid:telemetry:Summarizer:Running:InactiveObject_Loaded" },
        {
            error: "TombstonedDataStoreRequested",
            eventName: "fluid:telemetry:ContainerRuntime:TombstonedDataStoreRequested",
            viaHandle: true,
        },
    ],
    async () => {
        const {
            unreferencedId,
            summarizingContainer,
            summarizer,
        } = await summarizationWithUnreferencedDataStoreAfterTime(sweepTimeoutMs - waitLessThanSweepTimeoutMs);
        const dataObject = await requestFluidObject<ITestDataObject>(summarizingContainer, unreferencedId);

        // Wait enough time so that the datastore is sweep ready
        await delay(waitLessThanSweepTimeoutMs);

        await sendOpToUpdateSummaryTimestampToNow(summarizingContainer);

        // The datastore should be tombstoned now
        await summarize(summarizer);

        // Note: if a user makes a request that looks like this, we will also think that the request is via handle
        const request: IRequest = { url: unreferencedId, headers: { [RuntimeHeaders.viaHandle]: true } };
        const response = await dataObject._context.IFluidHandleContext.resolveHandle(request);

        assert(response !== undefined, `Expecting a response!`);
        assert(response.status === 404);
        assert(response.value.startsWith(`Datastore removed by gc`));
    });
});
