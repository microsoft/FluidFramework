/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    ContainerRuntimeFactoryWithDefaultDataStore,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { stringToBuffer, TelemetryNullLogger } from "@fluidframework/common-utils";
import { ContainerRuntime, IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { Container } from "@fluidframework/container-loader";
import { IFluidHandle, IRequest } from "@fluidframework/core-interfaces";
import { IContainerRuntimeBase } from "@fluidframework/runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { MockLogger, TelemetryDataTag } from "@fluidframework/telemetry-utils";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeNoCompat, itExpects } from "@fluidframework/test-version-utils";
import { loadSummarizer, TestDataObject } from "../mockSummarizerClient";

/**
 * Validates this scenario: When a GC node (data store or attachment blob) becomes inactive, i.e, it has been
 * unreferenced for a certain amount of time, using the node results in an error telemetry.
 */
describeNoCompat("GC inactive nodes tests", (getTestObjectProvider) => {
    const pkg = "TestDataObject";
    const dataObjectFactory = new DataObjectFactory(
        pkg,
        TestDataObject,
        [],
        []);
    const inactiveTimeoutMs = 100;
    const runtimeOptions: IContainerRuntimeOptions = {
        summaryOptions: { disableSummaries: true },
        gcOptions: { gcAllowed: true, inactiveTimeoutMs },
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
    const summaryLogger = new TelemetryNullLogger();
    const revivedEvent = "fluid:telemetry:ContainerRuntime:GarbageCollector:inactiveObject_Revived";
    const changedEvent = "fluid:telemetry:ContainerRuntime:GarbageCollector:inactiveObject_Changed";
    const loadedEvent = "fluid:telemetry:ContainerRuntime:GarbageCollector:inactiveObject_Loaded";

    let provider: ITestObjectProvider;
    let summarizerRuntime: ContainerRuntime;
    let defaultDataStore: TestDataObject;
    let summarizerDefaultDataStore: TestDataObject;
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

    async function summarize() {
        await provider.ensureSynchronized();
        return summarizerRuntime.summarize({
            runGC: true,
            fullTree: true,
            trackState: false,
            summaryLogger,
        });
    }

    before(function() {
        provider = getTestObjectProvider();
        // These tests validate the end-to-end behavior of GC features by generating ops and summaries. However, it does
        // not post these summaries or download them. So, it doesn't need to run against real services.
        if (provider.driver.type !== "local") {
            this.skip();
        }
    });

    beforeEach(async () => {
        mockLogger = new MockLogger();
        const container = await provider.createContainer(runtimeFactory) as Container;
        defaultDataStore = await requestFluidObject<TestDataObject>(container, "/");

        await provider.ensureSynchronized();
        const summarizerClient = await loadSummarizer(
            provider,
            runtimeFactory,
            container.deltaManager.lastSequenceNumber,
            undefined /* summaryVersion */,
            { logger: mockLogger },
        );
        summarizerRuntime = summarizerClient.containerRuntime;
        summarizerDefaultDataStore = await requestFluidObject<TestDataObject>(summarizerRuntime, "/");
    });

    itExpects("can generate events when unreferenced data store is accessed after it's inactive", [
        { eventName: changedEvent, timeout: inactiveTimeoutMs },
        { eventName: loadedEvent, timeout: inactiveTimeoutMs },
        { eventName: revivedEvent, timeout: inactiveTimeoutMs },
    ], async () => {
        const dataStore1 = await dataObjectFactory.createInstance(defaultDataStore.containerRuntime);
        defaultDataStore._root.set("dataStore1", dataStore1.handle);

        // Make changes to the data store - send an op and load it.
        dataStore1._root.set("key", "value1");
        await summarizerRuntime.resolveHandle({ url: `/${dataStore1.id}` });

        // Summarize and validate that no unreferenced errors were logged.
        await summarize();
        validateNoInactiveEvents();

        // Mark dataStore1 as unreferenced, send an op and load it.
        defaultDataStore._root.delete("dataStore1");
        dataStore1._root.set("key", "value2");
        await summarizerRuntime.resolveHandle({ url: `/${dataStore1.id}` });

        // Summarize and validate that no unreferenced errors were logged.
        await summarize();
        validateNoInactiveEvents();

        // Wait for inactive timeout. This will ensure that the unreferenced data store is inactive.
        await waitForInactiveTimeout();

        // Make changes to the inactive data store and validate that we get the changedEvent.
        dataStore1._root.set("key", "value");
        await provider.ensureSynchronized();
        assert(
            mockLogger.matchEvents([
                {
                    eventName: changedEvent,
                    timeout: inactiveTimeoutMs,
                    id: `/${dataStore1.id}`,
                    pkg: { value: `/${pkg}`, tag: TelemetryDataTag.PackageData },
                },
            ]),
            "changed event not generated as expected",
        );

        // Load the data store and validate that we get loadedEvent.
        await summarizerRuntime.resolveHandle({ url: `/${dataStore1.id}` });
        assert(
            mockLogger.matchEvents([
                {
                    eventName: loadedEvent,
                    timeout: inactiveTimeoutMs,
                    id: `/${dataStore1.id}`,
                },
            ]),
            "loaded event not generated as expected",
        );

        // Make a change again and validate that we don't get another changedEvent as we only log it
        // once per data store per session.
        dataStore1._root.set("key2", "value2");
        await provider.ensureSynchronized();
        validateNoInactiveEvents();

        // Revive the inactive data store and validate that we get the revivedEvent event.
        defaultDataStore._root.set("dataStore1", dataStore1.handle);
        await provider.ensureSynchronized();
        assert(
            mockLogger.matchEvents([
                {
                    eventName: revivedEvent,
                    timeout: inactiveTimeoutMs,
                    id: `/${dataStore1.id}`,
                    pkg: { value: `/${pkg}`, tag: TelemetryDataTag.PackageData },
                },
            ]),
            "revived event not generated as expected",
        );
    });

    itExpects("can generate events when unreferenced attachment blob is accessed after it's inactive", [
        { eventName: loadedEvent, timeout: inactiveTimeoutMs },
        { eventName: revivedEvent, timeout: inactiveTimeoutMs },
    ], async () => {
        // Upload an attachment blobs and mark them referenced.
        const blobContents = "Blob contents";
        const blobHandle = await defaultDataStore._context.uploadBlob(stringToBuffer(blobContents, "utf-8"));
        defaultDataStore._root.set("blob", blobHandle);

        await provider.ensureSynchronized();

        // Get the blob handle in the summarizer client. Don't retrieve the underlying blob yet. We will do that after
        // the blob node is inactive.
        const summarizerBlobHandle = summarizerDefaultDataStore._root.get<IFluidHandle<ArrayBufferLike>>("blob");
        assert(summarizerBlobHandle !== undefined, "Blob handle not sync'd to summarizer client");

        // Summarize and validate that no unreferenced errors were logged.
        await summarize();
        validateNoInactiveEvents();

        // Mark blob as unreferenced, summarize and validate that no unreferenced errors are logged yet.
        defaultDataStore._root.delete("blob");
        await summarize();
        validateNoInactiveEvents();

        // Wait for inactive timeout. This will ensure that the unreferenced blob is inactive.
        await waitForInactiveTimeout();

        // Retrieve the blob in the summarizer client now and validate that we get the loadedEvent.
        await summarizerBlobHandle.get();
        assert(
            mockLogger.matchEvents([
                {
                    eventName: loadedEvent,
                    timeout: inactiveTimeoutMs,
                    id: summarizerBlobHandle.absolutePath,
                },
            ]),
            "updated event not generated as expected for attachment blobs",
        );

        // Add the handle back, summarize and validate that we get the revivedEvent.
        defaultDataStore._root.set("blob", blobHandle);
        await provider.ensureSynchronized();
        assert(
            mockLogger.matchEvents([
                {
                    eventName: revivedEvent,
                    timeout: inactiveTimeoutMs,
                    id: summarizerBlobHandle.absolutePath,
                },
            ]),
            "revived event not generated as expected for attachment blobs",
        );
    });
});
