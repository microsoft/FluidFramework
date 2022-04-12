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
import { ContainerRuntime, IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { Container } from "@fluidframework/container-loader";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { MockLogger, TelemetryDataTag } from "@fluidframework/telemetry-utils";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeNoCompat, itExpects } from "@fluidframework/test-version-utils";
import { TestDataObject } from "../mockSummarizerClient";

/**
 * Validates this scenario: When a data store becomes inactive (has been unreferenced for a given amount of time),
 * using that data store results in an error telemetry.
 */
describeNoCompat("GC inactive data store tests", (getTestObjectProvider) => {
    const pkg = "TestDataObject";
    const dataObjectFactory = new DataObjectFactory(
        pkg,
        TestDataObject,
        [],
        []);
    const deleteTimeoutMs = 100;
    const runtimeOptions: IContainerRuntimeOptions = {
        summaryOptions: { disableSummaries: true },
        gcOptions: { gcAllowed: true, deleteTimeoutMs },
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
    const summaryLogger = new TelemetryNullLogger();
    const revivedEvent = "fluid:telemetry:ContainerRuntime:GarbageCollector:inactiveObject_Revived";
    const changedEvent = "fluid:telemetry:ContainerRuntime:GarbageCollector:inactiveObject_Changed";
    const loadedEvent = "fluid:telemetry:ContainerRuntime:GarbageCollector:inactiveObject_Loaded";

    let provider: ITestObjectProvider;
    let summarizerRuntime: ContainerRuntime;
    let defaultDataStore: TestDataObject;
    let mockLogger: MockLogger;

    /** Waits for the delete timeout to expire. */
    async function waitForDeleteTimeout(): Promise<void> {
        await new Promise<void>((resolve) => {
            setTimeout(resolve, deleteTimeoutMs + 10);
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
        const summarizerContainer = await provider.loadContainer(runtimeFactory, { logger: mockLogger }) as Container;
        summarizerRuntime = (await requestFluidObject<TestDataObject>(summarizerContainer, "/")).containerRuntime;
    });

    itExpects("can generate events when unreferenced data store is accessed after it's inactive", [
        { eventName: changedEvent, timeout: deleteTimeoutMs },
        { eventName: loadedEvent, timeout: deleteTimeoutMs },
        { eventName: revivedEvent, timeout: deleteTimeoutMs },
    ], async () => {
        const dataStore1 = await dataObjectFactory.createInstance(defaultDataStore.containerRuntime);
        defaultDataStore._root.set("dataStore1", dataStore1.handle);

        // Summarize with dataStore1 as referenced and validate that no unreferneced errors were logged.
        await summarize();
        validateNoInactiveEvents();

        // Mark dataStore1 as unreferenced, summarize and validate that no unreferenced errors were logged.
        defaultDataStore._root.delete("dataStore1");
        await summarize();
        validateNoInactiveEvents();

        // Wait for delete timeout. This will ensure that the unreferenced data store is inactive.
        await waitForDeleteTimeout();

        // Make changes to the inactive data store and validate that we get the inactiveObjectChanged event.
        dataStore1._root.set("key", "value");
        await provider.ensureSynchronized();
        assert(
            mockLogger.matchEvents([
                {
                    eventName: changedEvent,
                    timeout: deleteTimeoutMs,
                    id: `/${dataStore1.id}`,
                    pkg: { value: `/${pkg}`, tag: TelemetryDataTag.PackageData },
                },
            ]),
            "inactiveObjectChanged event not generated as expected",
        );

        await summarizerRuntime.resolveHandle({ url: `/${dataStore1.id}` });
        assert(
            mockLogger.matchEvents([
                {
                    eventName: loadedEvent,
                    timeout: deleteTimeoutMs,
                    id: `/${dataStore1.id}`,
                },
            ]),
            "inactiveObjectLoaded event not generated as expected",
        );

        // Make a change again and validate that we don't get another inactiveObjectChanged event as we only log it
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
                    timeout: deleteTimeoutMs,
                    id: `/${dataStore1.id}`,
                    pkg: { value: `/${pkg}`, tag: TelemetryDataTag.PackageData },
                },
            ]),
            "inactiveObjectRevived event not generated as expected",
        );
    });
});
