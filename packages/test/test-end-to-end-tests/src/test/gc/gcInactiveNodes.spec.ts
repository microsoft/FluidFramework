/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { stringToBuffer } from "@fluidframework/common-utils";
import { IContainer, LoaderHeader } from "@fluidframework/container-definitions";
import { ContainerRuntime, ISummarizer } from "@fluidframework/container-runtime";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { DriverHeader } from "@fluidframework/driver-definitions";
import { IContainerRuntimeBase } from "@fluidframework/runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { MockLogger, TelemetryDataTag } from "@fluidframework/telemetry-utils";
import {
    ITestContainerConfig,
    ITestObjectProvider,
    createSummarizer,
    summarizeNow,
    waitForContainerConnection,
} from "@fluidframework/test-utils";
import { describeNoCompat, ITestDataObject, itExpects, TestDataObjectType } from "@fluidframework/test-version-utils";

/**
 * Validates this scenario: When a GC node (data store or attachment blob) becomes inactive, i.e, it has been
 * unreferenced for a certain amount of time, using the node results in an error telemetry.
 */
describeNoCompat("GC inactive nodes tests", (getTestObjectProvider) => {
    const revivedEvent = "fluid:telemetry:ContainerRuntime:InactiveObject_Revived";
    const changedEvent = "fluid:telemetry:ContainerRuntime:InactiveObject_Changed";
    const loadedEvent = "fluid:telemetry:ContainerRuntime:InactiveObject_Loaded";
    const inactiveTimeoutMs = 100;
    const testContainerConfig: ITestContainerConfig = {
        runtimeOptions: {
            summaryOptions: { summaryConfigOverrides: { state: "disabled" } },
            gcOptions: { gcAllowed: true, inactiveTimeoutMs },
        },
    };

    let provider: ITestObjectProvider;
    let mockLogger: MockLogger;

    /** Waits for the inactive timeout to expire. */
    async function waitForInactiveTimeout(): Promise<void> {
        await new Promise<void>((resolve) => {
            setTimeout(resolve, inactiveTimeoutMs + 10);
        });
    }

    /** Validates that none of the inactive events have been logged since the last run. */
    function validateNoInactiveEvents() {
        assert(
            !mockLogger.matchAnyEvent([
                { eventName: revivedEvent },
                { eventName: changedEvent },
                { eventName: loadedEvent },
            ]),
            "inactive object events should not have been logged",
        );
    }

    /**
     * Loads a summarizer client with the given version (if any) and returns its container runtime and summary
     * collection.
     */
     async function createSummarizerClient(config: ITestContainerConfig) {
        const requestHeader = {
            [LoaderHeader.cache]: false,
            [LoaderHeader.clientDetails]: {
                capabilities: { interactive: true },
                type: "summarizer",
            },
            [DriverHeader.summarizingClient]: true,
            [LoaderHeader.reconnect]: false,
        };
        const summarizerContainer = await provider.loadTestContainer(config, requestHeader);

        const defaultDataStore = await requestFluidObject<ITestDataObject>(summarizerContainer, "default");
        return defaultDataStore._context.containerRuntime as ContainerRuntime;
    }

    async function summarize(containerRuntime: ContainerRuntime) {
        await provider.ensureSynchronized();
        return containerRuntime.summarize({
            runGC: true,
            fullTree: true,
            trackState: false,
        });
    }

    describe("Inactive timeout", () => {
        let containerRuntime: IContainerRuntimeBase;
        let mainContainer: IContainer;
        let defaultDataStore: ITestDataObject;

        beforeEach(async function() {
            provider = getTestObjectProvider({ syncSummarizer: true });
            // These tests validate the end-to-end behavior of GC features by generating ops and summaries. However,
            // it does not post these summaries or download them. So, it doesn't need to run against real services.
            if (provider.driver.type !== "local") {
                this.skip();
            }

            mockLogger = new MockLogger();
            mainContainer = await provider.makeTestContainer(testContainerConfig);
            defaultDataStore = await requestFluidObject<ITestDataObject>(mainContainer, "/");
            containerRuntime = defaultDataStore._context.containerRuntime;
            await waitForContainerConnection(mainContainer);
        });

        itExpects("can generate events when unreferenced data store is accessed after it's inactive", [
            { eventName: changedEvent, timeout: inactiveTimeoutMs },
            { eventName: loadedEvent, timeout: inactiveTimeoutMs },
            { eventName: revivedEvent, timeout: inactiveTimeoutMs },
        ], async () => {
            const summarizerRuntime = await createSummarizerClient({
                ...testContainerConfig,
                loaderProps: { logger: mockLogger },
            });
            const dataStore = await containerRuntime.createDataStore(TestDataObjectType);
            const dataObject = await requestFluidObject<ITestDataObject>(dataStore, "");
            const url = dataObject.handle.absolutePath;

            defaultDataStore._root.set("dataStore1", dataObject.handle);
            await provider.ensureSynchronized();

            // Mark dataStore1 as unreferenced, send an op and load it.
            defaultDataStore._root.delete("dataStore1");
            dataObject._root.set("key", "value2");
            await provider.ensureSynchronized();
            await summarizerRuntime.resolveHandle({ url });

            // Summarize and validate that no unreferenced errors were logged.
            await summarize(summarizerRuntime);
            validateNoInactiveEvents();

            // Wait for inactive timeout. This will ensure that the unreferenced data store is inactive.
            await waitForInactiveTimeout();

            // Make changes to the inactive data store and validate that we get the changedEvent.
            dataObject._root.set("key", "value");
            await provider.ensureSynchronized();
            // Load the data store and validate that we get loadedEvent.
            await summarizerRuntime.resolveHandle({ url });
            await summarize(summarizerRuntime);
            mockLogger.assertMatch(
                [
                    {
                        eventName: changedEvent,
                        timeout: inactiveTimeoutMs,
                        id: url,
                        pkg: { value: TestDataObjectType, tag: TelemetryDataTag.CodeArtifact },
                    },
                    {
                        eventName: loadedEvent,
                        timeout: inactiveTimeoutMs,
                        id: url,
                        pkg: { value: TestDataObjectType, tag: TelemetryDataTag.CodeArtifact },
                    },
                ],
                "changed and loaded events not generated as expected",
            );

            // Make a change again and validate that we don't get another changedEvent as we only log it
            // once per data store per session.
            dataObject._root.set("key2", "value2");
            await summarize(summarizerRuntime);
            validateNoInactiveEvents();

            // Revive the inactive data store and validate that we get the revivedEvent event.
            defaultDataStore._root.set("dataStore1", dataObject.handle);
            await summarize(summarizerRuntime);
            mockLogger.assertMatch(
                [
                    {
                        eventName: revivedEvent,
                        timeout: inactiveTimeoutMs,
                        id: url,
                        pkg: { value: TestDataObjectType, tag: TelemetryDataTag.CodeArtifact },
                        fromId: defaultDataStore._root.handle.absolutePath,
                    },
                ],
                "revived event not generated as expected",
            );
        });

        itExpects("can generate events when unreferenced attachment blob is accessed after it's inactive", [
            { eventName: loadedEvent, timeout: inactiveTimeoutMs },
            { eventName: revivedEvent, timeout: inactiveTimeoutMs },
        ], async () => {
            const summarizerRuntime = await createSummarizerClient({
                ...testContainerConfig,
                loaderProps: { logger: mockLogger },
            });
            const summarizerDefaultDataStore = await requestFluidObject<ITestDataObject>(summarizerRuntime, "/");

            // Upload an attachment blobs and mark them referenced.
            const blobContents = "Blob contents";
            const blobHandle = await defaultDataStore._context.uploadBlob(stringToBuffer(blobContents, "utf-8"));
            defaultDataStore._root.set("blob", blobHandle);

            await provider.ensureSynchronized();

            // Get the blob handle in the summarizer client. Don't retrieve the underlying blob yet. We will do that
            // after the blob node is inactive.
            const summarizerBlobHandle = summarizerDefaultDataStore._root.get<IFluidHandle<ArrayBufferLike>>("blob");
            assert(summarizerBlobHandle !== undefined, "Blob handle not sync'd to summarizer client");

            // Summarize and validate that no unreferenced errors were logged.
            await summarize(summarizerRuntime);
            validateNoInactiveEvents();

            // Mark blob as unreferenced, summarize and validate that no unreferenced errors are logged yet.
            defaultDataStore._root.delete("blob");
            await summarize(summarizerRuntime);
            validateNoInactiveEvents();

            // Wait for inactive timeout. This will ensure that the unreferenced blob is inactive.
            await waitForInactiveTimeout();

            // Retrieve the blob in the summarizer client now and validate that we get the loadedEvent.
            await summarizerBlobHandle.get();
            await summarize(summarizerRuntime);
            mockLogger.assertMatch(
            [
                    {
                        eventName: loadedEvent,
                        timeout: inactiveTimeoutMs,
                        id: summarizerBlobHandle.absolutePath,
                    },
                ],
                "updated event not generated as expected for attachment blobs",
            );

            // Add the handle back, summarize and validate that we get the revivedEvent.
            defaultDataStore._root.set("blob", blobHandle);
            await provider.ensureSynchronized();
            await summarize(summarizerRuntime);
            mockLogger.assertMatch(
                [
                    {
                        eventName: revivedEvent,
                        timeout: inactiveTimeoutMs,
                        id: summarizerBlobHandle.absolutePath,
                    },
                ],
                "revived event not generated as expected for attachment blobs",
            );
        });

        itExpects("can generate events for non-summarizer clients", [
            { eventName: "fluid:telemetry:ContainerRuntime:GarbageCollector:InactiveObject_Loaded" },
        ], async () => {
            const waitForSummary = async (summarizer: ISummarizer) => {
                await provider.ensureSynchronized();
                const summaryResult = await summarizeNow(summarizer);
                return summaryResult.summaryVersion;
            };

            // Create a summarizer client that will be used to summarize the container.
            const summarizer1 = await createSummarizer(provider, mainContainer, undefined, { inactiveTimeoutMs });

            // Create a data store, mark it as referenced and then unreferenced; summarize;
            const dataStore = await requestFluidObject<ITestDataObject>(
                await containerRuntime.createDataStore(TestDataObjectType), "");
            const url = dataStore.handle.absolutePath;
            defaultDataStore._root.set("dataStore", dataStore.handle);
            defaultDataStore._root.delete("dataStore");

            // Summarize the container. This summary will be used to load another container.
            const summaryVersion1 = await waitForSummary(summarizer1);

            // Wait for inactive timeout. This will ensure that the unreferenced data store is inactive.
            await waitForInactiveTimeout();

            // Load a non-summarizer container from the above summary that uses the mock logger.
            const container2 = await provider.loadTestContainer(
                { ...testContainerConfig, loaderProps: { logger: mockLogger } },
                { [LoaderHeader.version]: summaryVersion1 },
            );

            // Load the inactive data store. This should result in a loaded event from the non-summarizer container.
            await container2.request({ url });
            mockLogger.assertMatch(
                [
                    {
                        eventName: "fluid:telemetry:ContainerRuntime:GarbageCollector:InactiveObject_Loaded",
                        timeout: inactiveTimeoutMs,
                        id: url,
                    },
                ],
                "loaded event not generated as expected",
            );
        });

        /**
         * This test validates that we can generate inactive object events for data stores which are not loaded
         * when we identify the error. The following bug was fixed in this code path and this test covers that
         * scenario - https://github.com/microsoft/FluidFramework/pull/10237.
         *
         * Note that the namespace for "inactiveObject_Revived" is different than the tests above because it is logged
         * via the running summarizer's logger.
         */
        itExpects("can generate events for data stores that are not loaded", [
            { eventName: "fluid:telemetry:Summarizer:Running:InactiveObject_Revived", timeout: inactiveTimeoutMs },
        ], async () => {
            const waitForSummary = async (summarizer: ISummarizer) => {
                await provider.ensureSynchronized();
                const summaryResult = await summarizeNow(summarizer);
                return summaryResult.summaryVersion;
            };

            const summarizer1 = await createSummarizer(provider, mainContainer, undefined, { inactiveTimeoutMs });

            const dataStore = await requestFluidObject<ITestDataObject>(
                await containerRuntime.createDataStore(TestDataObjectType), "");

            // Mark dataStore as referenced and then unreferenced; summarize.
            defaultDataStore._root.set("dataStore", dataStore.handle);
            defaultDataStore._root.delete("dataStore");
            const summaryVersion1 = await waitForSummary(summarizer1);

            // Load a new summarizer from the above summary such that the second data store is not loaded.
            summarizer1.close();
            const summarizer2 =
                await createSummarizer(provider, mainContainer, summaryVersion1, { inactiveTimeoutMs });

            // Wait for inactive timeout. This will ensure that the unreferenced data store is inactive.
            await waitForInactiveTimeout();

            // Send an op for the deleted data store and revived it. There should not be any errors.
            dataStore._root.set("key", "value");
            defaultDataStore._root.set("dataStore", dataStore.handle);
            await provider.ensureSynchronized();

            // Summarize now. This is when the inactive object events will be logged.
            await assert.doesNotReject(waitForSummary(summarizer2), "Summary wasn't successful");
        });
    });
});
