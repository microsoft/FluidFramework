/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    IGCRuntimeOptions,
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
    createSummarizer,
} from "@fluidframework/test-utils";
import { describeNoCompat, ITestDataObject, itExpects, TestDataObjectType } from "@fluidframework/test-version-utils";
import { delay, stringToBuffer } from "@fluidframework/common-utils";
import { IContainer, IErrorBase, LoaderHeader } from "@fluidframework/container-definitions";
import { IRequest } from "@fluidframework/core-interfaces";
import { ISummaryTree } from "@fluidframework/protocol-definitions";
import { validateAssertionError } from "@fluidframework/test-runtime-utils";
import { getGCStateFromSummary, getGCTombstoneStateFromSummary } from "./gcTestSummaryUtils";

/**
 * These tests validate that SweepReady objects are correctly marked as tombstones. Tombstones should be added to the
 * summary and changing them (sending / receiving ops, loading, etc.) is not allowed.
 */
describeNoCompat("GC tombstone tests", (getTestObjectProvider) => {
    const remainingTimeUntilSweepMs = 100;
    const sweepTimeoutMs = 200;
    assert(remainingTimeUntilSweepMs < sweepTimeoutMs, "remainingTimeUntilSweepMs should be < sweepTimeoutMs");
    const settings = {
        "Fluid.GarbageCollection.Test.Tombstone": "true",
        "Fluid.GarbageCollection.TestOverride.SweepTimeoutMs": sweepTimeoutMs,
    };

    const gcOptions: IGCRuntimeOptions = { inactiveTimeoutMs: 0 };
    const testContainerConfig: ITestContainerConfig = {
        runtimeOptions: {
            summaryOptions: {
                summaryConfigOverrides: {
                    state: "disabled",
                },
            },
            gcOptions,
        },
        loaderProps: { configProvider: mockConfigProvider(settings) },
    };

    let provider: ITestObjectProvider;

    beforeEach(async function() {
        provider = getTestObjectProvider({ syncSummarizer: true });
        if (provider.driver.type !== "local") {
            this.skip();
        }
    });

    async function loadContainer(summaryVersion: string) {
        return provider.loadTestContainer(
            testContainerConfig,
            { [LoaderHeader.version]: summaryVersion },
        );
    }

    describe("Using tombstone data stores is not allowed", () => {
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
                summaryVersion,
                gcOptions,
                mockConfigProvider(settings),
            );
        };
        const summarize = async (summarizer: ISummarizer) => {
            await provider.ensureSynchronized();
            return summarizeNow(summarizer);
        };



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
            } = await summarizationWithUnreferencedDataStoreAfterTime(sweepTimeoutMs - remainingTimeUntilSweepMs);

            // Use the request pattern to get the testDataObject - this is unsafe and no one should do this in their
            // production application - causes an inactive loaded and changed error
            const dataObject = await requestFluidObject<ITestDataObject>(summarizingContainer, unreferencedId);

            // Wait enough time so that the datastore is sweep ready
            await delay(remainingTimeUntilSweepMs);

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
        itExpects("Receive ops fails for tombstoned datastores in summarizing container loaded after sweep time",
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

            // Load this container from a summary that had not yet tombstoned the datastore so that the datastore loads.
            const container = await loadContainer(summaryVersion);
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
            } = await summarizationWithUnreferencedDataStoreAfterTime(sweepTimeoutMs - remainingTimeUntilSweepMs);

            // Setup close validation
            let closeError: IErrorBase | undefined;
            summarizingContainer.on("closed", (error) => {
                closeError = error;
            });

            // Load this container from a summary that had not yet tombstoned the datastore so that the datastore loads.
            const container = await loadContainer(summaryVersion);
            // Use the request pattern to get the testDataObject - this is unsafe and no one should do this in their
            // production application. Causes an inactiveObject loaded error
            const dataObject = await requestFluidObject<ITestDataObject>(container, unreferencedId);

            // Wait enough time so that the datastore is sweep ready
            await delay(remainingTimeUntilSweepMs);

            await sendOpToUpdateSummaryTimestampToNow(summarizingContainer);

            // The datastore should be tombstoned now
            await summarize(summarizer);

            // Send an op to be received - no sweep changed or loaded - the summarizing container does not log sweep
            // ready errors as it closes before the op is processed and the datastore is realized
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

            // Sending a signal from a testDataObject substantiated from the request pattern should fail!
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

            // Load this container from a summary that had not yet tombstoned the datastore so that the datastore loads.
            const container = await loadContainer(summaryVersion);
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
            } = await summarizationWithUnreferencedDataStoreAfterTime(sweepTimeoutMs - remainingTimeUntilSweepMs);
            // Wait enough time so that the datastore is sweep ready
            await delay(remainingTimeUntilSweepMs);

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
            } = await summarizationWithUnreferencedDataStoreAfterTime(sweepTimeoutMs - remainingTimeUntilSweepMs);
            const dataObject = await requestFluidObject<ITestDataObject>(summarizingContainer, unreferencedId);

            // Wait enough time so that the datastore is sweep ready
            await delay(remainingTimeUntilSweepMs);

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
        itExpects("Can untombstone datastores by storing a handle",
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
            } = await summarizationWithUnreferencedDataStoreAfterTime(sweepTimeoutMs - remainingTimeUntilSweepMs);
            const dataObject = await requestFluidObject<ITestDataObject>(summarizingContainer, unreferencedId);

            // Wait enough time so that the datastore is sweep ready
            await delay(remainingTimeUntilSweepMs);

            await sendOpToUpdateSummaryTimestampToNow(summarizingContainer);

            // The datastore should be tombstoned now
            await summarize(summarizer);

            // Note: if a user makes a request that looks like this, we will also think that the request is via handle
            const request: IRequest = { url: unreferencedId, headers: { [RuntimeHeaders.viaHandle]: true } };
            const response = await dataObject._context.IFluidHandleContext.resolveHandle(request);

            assert(response !== undefined, `Expecting a response!`);
            assert(response.status === 404);
            assert(response.value.startsWith(`Datastore removed by gc`));

            const mainDataObject = await requestFluidObject<ITestDataObject>(summarizingContainer, "default");
            mainDataObject._root.set("store", dataObject.handle);

            // The datastore should be untombstoned now
            const { summaryVersion } = await summarize(summarizer);
            const untombstonedDataObject =
                await requestFluidObject<ITestDataObject>(summarizingContainer, unreferencedId);
            untombstonedDataObject._root.set("can send", "op");
            untombstonedDataObject._runtime.submitSignal("can submit", "signal");
            const container = await loadContainer(summaryVersion);
            const sendDataObject = await requestFluidObject<ITestDataObject>(container, unreferencedId);
            sendDataObject._root.set("can receive", "an op");
            sendDataObject._runtime.submitSignal("can receive", "a signal");
            await provider.ensureSynchronized();
        });
    });

    describe("Tombstone information in summary", () => {
        /**
         * Validates that the give summary tree contains correct information in the tombstone blob in GC tree.
         * @param summaryTree - The summary tree that may contain the tombstone blob.
         * @param tombstones - A list of ids that should be present in the tombstone blob.
         * @param notTombstones - A list of ids that should not be present in the tombstone blob.
         */
        function validateTombstoneState(
            summaryTree: ISummaryTree,
            tombstones: string [] | undefined,
            notTombstones: string[],
        ) {
            const actualTombstones = getGCTombstoneStateFromSummary(summaryTree);
            if (tombstones === undefined) {
                assert(actualTombstones === undefined, "GC tree should not have tombstones in summary");
                return;
            }
            assert(actualTombstones !== undefined, "GC tree should have tombstones in summary");
            for (const url of tombstones) {
                assert(actualTombstones.includes(url), `${url} should be in tombstone blob`);
            }
            for (const url of notTombstones) {
                assert(!actualTombstones.includes(url), `${url} should not be in tombstone blob`);
            }
        }

        it("adds tombstone data stores information to tombstone blob in summary", async () => {
            const mainContainer = await provider.makeTestContainer(testContainerConfig);
            const mainDataStore = await requestFluidObject<ITestDataObject>(mainContainer, "default");
            const mainDataStoreUrl = `/${mainDataStore._context.id}`;
            await waitForContainerConnection(mainContainer);

            const summarizer = await createSummarizer(
                provider,
                mainContainer,
                undefined /* summaryVersion */,
                gcOptions,
                mockConfigProvider(settings),
            );

            // Create couple of data stores.
            const newDataStore = await requestFluidObject<ITestDataObject>(
                await mainDataStore._context.containerRuntime.createDataStore(TestDataObjectType), "");
            const newDataStore2 = await requestFluidObject<ITestDataObject>(
                await mainDataStore._context.containerRuntime.createDataStore(TestDataObjectType), "");
            const newDataStoreUrl = `/${newDataStore._context.id}`;
            const newDataStore2Url = `/${newDataStore2._context.id}`;

            // Add the data stores' handle so that they are live and referenced.
            mainDataStore._root.set("newDataStore", newDataStore.handle);
            mainDataStore._root.set("newDataStore2", newDataStore2.handle);

            // Remove the data stores' handle to make them unreferenced.
            mainDataStore._root.delete("newDataStore");
            mainDataStore._root.delete("newDataStore2");

            // Summarize so that the above data stores are marked unreferenced.
            await provider.ensureSynchronized();
            const summary = await summarizeNow(summarizer);
            validateTombstoneState(summary.summaryTree, undefined /* tombstones */, []);

            // Wait for sweep timeout so that the data stores are tombstoned.
            await delay(sweepTimeoutMs + 10);
            // Send an op to update the current reference timestamp that GC uses to make sweep ready objects.
            mainDataStore._root.set("key", "value");
            await provider.ensureSynchronized();

            // Summarize. The tombstoned data stores should now be part of the summary.
            const summary2 = await summarizeNow(summarizer);
            validateTombstoneState(summary2.summaryTree, [newDataStoreUrl, newDataStore2Url], [mainDataStoreUrl]);
        });

        it("adds tombstone attachment blob information to tombstone blob in summary", async () => {
            const mainContainer = await provider.makeTestContainer(testContainerConfig);
            const mainDataStore = await requestFluidObject<ITestDataObject>(mainContainer, "default");
            const mainDataStoreUrl = `/${mainDataStore._context.id}`;
            await waitForContainerConnection(mainContainer);

            const summarizer = await createSummarizer(
                provider,
                mainContainer,
                undefined /* summaryVersion */,
                gcOptions,
                mockConfigProvider(settings),
            );

            // Upload an attachment blobs and mark it referenced.
            const blobContents = "Blob contents";
            const blobHandle = await mainDataStore._context.uploadBlob(stringToBuffer(blobContents, "utf-8"));
            mainDataStore._root.set("blob", blobHandle);

            // Remove the blob's handle to make it unreferenced.
            mainDataStore._root.delete("blob");

            // Summarize so that the above attachment blob is marked unreferenced.
            await provider.ensureSynchronized();
            const summary = await summarizeNow(summarizer);
            validateTombstoneState(summary.summaryTree, undefined /* tombstones */, []);

            // Wait for sweep timeout so that the blob is tombstoned.
            await delay(sweepTimeoutMs + 10);
            // Send an op to update the current reference timestamp that GC uses to make sweep ready objects.
            mainDataStore._root.set("key", "value");
            await provider.ensureSynchronized();

            // Summarize. The tombstoned attachment blob should now be part of the tombstone blob.
            const summary2 = await summarizeNow(summarizer);
            validateTombstoneState(summary2.summaryTree, [blobHandle.absolutePath], [mainDataStoreUrl]);
        });

        itExpects("removes un-tombstoned data store and attachment blob from tombstone blob in summary",
        [
            { eventName: "fluid:telemetry:Summarizer:Running:SweepReadyObject_Revived", type: "DataStore" },
            { eventName: "fluid:telemetry:Summarizer:Running:SweepReadyObject_Revived", type: "Blob" }
        ],
        async () => {
            const mainContainer = await provider.makeTestContainer(testContainerConfig);
            const mainDataStore = await requestFluidObject<ITestDataObject>(mainContainer, "default");
            const mainDataStoreUrl = `/${mainDataStore._context.id}`;
            await waitForContainerConnection(mainContainer);

            const summarizer = await createSummarizer(
                provider,
                mainContainer,
                undefined /* summaryVersion */,
                gcOptions,
                mockConfigProvider(settings),
            );

            // Create couple of data stores.
            const newDataStore = await requestFluidObject<ITestDataObject>(
                await mainDataStore._context.containerRuntime.createDataStore(TestDataObjectType), "");
            const newDataStore2 = await requestFluidObject<ITestDataObject>(
                await mainDataStore._context.containerRuntime.createDataStore(TestDataObjectType), "");
            const newDataStoreUrl = `/${newDataStore._context.id}`;
            const newDataStore2Url = `/${newDataStore2._context.id}`;

            // Add the data stores' handle so that they are live and referenced.
            mainDataStore._root.set("newDataStore", newDataStore.handle);
            mainDataStore._root.set("newDataStore2", newDataStore2.handle);

            // Remove the data stores' handle to make them unreferenced.
            mainDataStore._root.delete("newDataStore");
            mainDataStore._root.delete("newDataStore2");

            // Upload an attachment blobs and mark it referenced.
            const blobContents = "Blob contents";
            const blobHandle = await mainDataStore._context.uploadBlob(stringToBuffer(blobContents, "utf-8"));
            mainDataStore._root.set("blob", blobHandle);

            // Remove the blob's handle to make it unreferenced.
            mainDataStore._root.delete("blob");

            // Summarize so that the above data stores and blobs are marked unreferenced.
            await provider.ensureSynchronized();
            const summary = await summarizeNow(summarizer);
            validateTombstoneState(summary.summaryTree, undefined /* tombstones */, []);

            // Wait for sweep timeout so that the data stores are tombstoned.
            await delay(sweepTimeoutMs + 10);
            // Send an op to update the current reference timestamp that GC uses to make sweep ready objects.
            mainDataStore._root.set("key", "value");
            await provider.ensureSynchronized();

            // Summarize. The tombstoned data stores should now be part of the tombstone blob.
            const summary2 = await summarizeNow(summarizer);
            validateTombstoneState(
                summary2.summaryTree, [newDataStoreUrl, newDataStore2Url, blobHandle.absolutePath], [mainDataStoreUrl]);

            // Mark one of the data stores and attachment blob as referenced so that they are not tombstones anymore.
            mainDataStore._root.set("newDataStore", newDataStore.handle);
            mainDataStore._root.set("blob", blobHandle);
            await provider.ensureSynchronized();

            // Summarize. The un-tombstoned data store and attachment blob should not be part of the tombstone blob.
            const summary3 = await summarizeNow(summarizer);
            validateTombstoneState(
                summary3.summaryTree, [newDataStore2Url], [mainDataStoreUrl, newDataStoreUrl, blobHandle.absolutePath]);
        });

        it("does not re-summarize GC state on only tombstone state changed", async () => {
            const mainContainer = await provider.makeTestContainer(testContainerConfig);
            const mainDataStore = await requestFluidObject<ITestDataObject>(mainContainer, "default");
            await waitForContainerConnection(mainContainer);

            const summarizer = await createSummarizer(
                provider,
                mainContainer,
                undefined /* summaryVersion */,
                gcOptions,
                mockConfigProvider(settings),
            );

            // Create a data store.
            const newDataStore = await requestFluidObject<ITestDataObject>(
                await mainDataStore._context.containerRuntime.createDataStore(TestDataObjectType), "");

            // Add the data store's handle so that it is live and referenced.
            mainDataStore._root.set("newDataStore", newDataStore.handle);

            // Remove the data store's handle to make it unreferenced.
            mainDataStore._root.delete("newDataStore");

            // Summarize so that the above data stores are marked unreferenced.
            await provider.ensureSynchronized();
            const summary = await summarizeNow(summarizer);
            const gcState = getGCStateFromSummary(summary.summaryTree);
            assert(gcState !== undefined, "GC state should be available and should not be a handle");

            // Wait for sweep timeout so that the data stores are tombstoned.
            await delay(sweepTimeoutMs + 10);
            // Send an op to update the current reference timestamp that GC uses to make sweep ready objects.
            mainDataStore._root.set("key", "value");
            await provider.ensureSynchronized();

            // Summarize. The tombstoned data stores should now be part of the summary.
            const summary2 = await summarizeNow(summarizer);
            assert.throws(
                () => getGCStateFromSummary(summary2.summaryTree),
                (e) => validateAssertionError(e, "GC state is not a blob"),
            );
            const tombstoneState = getGCTombstoneStateFromSummary(summary2.summaryTree);
            assert(tombstoneState !== undefined, "Tombstone state should be available and should be a blob");

            // Summarize. The tombstoned state should be a handle.
            const summary3 = await summarizeNow(summarizer);
            assert.throws(
                () => getGCTombstoneStateFromSummary(summary3.summaryTree),
                (e) => validateAssertionError(e, "GC data should be a tree"),
            );
        });

        itExpects("can mark data store from tombstone information in summary in non-summarizer container",
        [
            {
                error: "TombstonedDataStoreRequested",
                eventName: "fluid:telemetry:ContainerRuntime:TombstonedDataStoreRequested",
            },
        ],
        async () => {
            const mainContainer = await provider.makeTestContainer(testContainerConfig);
            const mainDataStore = await requestFluidObject<ITestDataObject>(mainContainer, "default");
            const mainDataStoreUrl = `/${mainDataStore._context.id}`;
            await waitForContainerConnection(mainContainer);

            const summarizer = await createSummarizer(
                provider,
                mainContainer,
                undefined /* summaryVersion */,
                gcOptions,
                mockConfigProvider(settings),
            );

            // Create a data store and mark it referenced.
            const newDataStore = await requestFluidObject<ITestDataObject>(
                await mainDataStore._context.containerRuntime.createDataStore(TestDataObjectType), "");
            const newDataStoreUrl = `/${newDataStore._context.id}`;
            mainDataStore._root.set("newDataStore", newDataStore.handle);

            // Remove the data store's handle to make it unreferenced.
            mainDataStore._root.delete("newDataStore");

            // Summarize so that the above data stores are marked unreferenced.
            await provider.ensureSynchronized();
            const summary = await summarizeNow(summarizer);
            validateTombstoneState(summary.summaryTree, undefined /* tombstones */, []);

            // Wait for sweep timeout so that the data stores are tombstoned.
            await delay(sweepTimeoutMs + 10);
            // Send an op to update the current reference timestamp that GC uses to make sweep ready objects.
            mainDataStore._root.set("key", "value");
            await provider.ensureSynchronized();

            // Summarize. The tombstoned data stores should now be part of the summary.
            const summary2 = await summarizeNow(summarizer);
            validateTombstoneState(summary2.summaryTree, [newDataStoreUrl], [mainDataStoreUrl]);

            // Load a container from the above summary. The tombstoned data store should be marked in this container.
            const container2 = await loadContainer(summary2.summaryVersion);
            const mainDataStore2 = await requestFluidObject<ITestDataObject>(container2, "default");
            // Send an op so that the container transitions to write mode.
            mainDataStore2._root.set("writeMode", "true");
            await waitForContainerConnection(container2);

            // Requesting the tombstoned data store should result in an error.
            await assert.rejects(async () => requestFluidObject<ITestDataObject>(container2, newDataStore._context.id),
                (error) => {
                    const correctErrorType = error.code === 404;
                    const correctErrorMessage = error.message.startsWith(`Datastore removed by gc`) === true;
                    return correctErrorType && correctErrorMessage;
                },
                `Should not be able to retrieve a tombstoned datastore.`,
            );
        });
    });
});
