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
import { MockLogger } from "@fluidframework/telemetry-utils";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluidframework/test-version-utils";
import { TestDataObject } from "./mockSummarizerClient";

/**
 * Validates this scenario: When a data store becomes inactive (has been unreferenced for a given amount of time),
 * using that data store results in an error telemetry.
 */
describeNoCompat("GC inactive data store tests", (getTestObjectProvider) => {
    const dataObjectFactory = new DataObjectFactory(
        "TestDataObject",
        TestDataObject,
        [],
        []);
    const deleteTimeoutMs = 2000;
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
    const inactiveObjectRevivedEvent = "fluid:telemetry:ContainerRuntime:GarbageCollector:inactiveObjectRevived";
    const inactiveObjectChangedEvent = "fluid:telemetry:ContainerRuntime:GarbageCollector:inactiveObjectChanged";

    let provider: ITestObjectProvider;
    let containerRuntime: ContainerRuntime;
    let defaultDataStore: TestDataObject;
    let mockLogger: MockLogger;

    const createContainer = async (logger: MockLogger) => provider.createContainer(runtimeFactory, { logger });

    /** Waits for the given amount of time to be passed. */
    async function waitForTimeout(timeout: number): Promise<void> {
        await new Promise<void>((resolve) => {
            setTimeout(resolve, timeout);
        });
    }

    /** Validates that none of the inactive events have been logged since the last run. */
    function validateNoInactiveEvents() {
        assert(
            !mockLogger.matchAnyEvent([
                { eventName: inactiveObjectRevivedEvent },
                { eventName: inactiveObjectChangedEvent },
            ]),
            "inactive object events should not have been logged",
        );
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
        const container = await createContainer(mockLogger) as Container;
        defaultDataStore = await requestFluidObject<TestDataObject>(container, "/");
        containerRuntime = defaultDataStore.containerRuntime;
    });

    it("can generate events when unreferenced data store is accessed after it's inactive", async () => {
        const dataStore1 = await dataObjectFactory.createInstance(containerRuntime);
        defaultDataStore._root.set("dataStore1", dataStore1.handle);

        // Summarize with dataStore1 as referenced and validate that no unreferneced errors were logged.
        await provider.ensureSynchronized();
        await containerRuntime.summarize({
            runGC: true,
            fullTree: true,
            trackState: false,
            summaryLogger,
        });
        validateNoInactiveEvents();

        // Mark dataStore1 as unreferenced, summarize and validate that no unreferenced errors were logged.
        defaultDataStore._root.delete("dataStore1");
        await provider.ensureSynchronized();
        await containerRuntime.summarize({
            runGC: true,
            fullTree: true,
            trackState: false,
            summaryLogger,
        });
        validateNoInactiveEvents();

        // Wait for 3000 ms which is > the configured maxUnreferencedDurationMs (2000). This will ensure that the
        // unreferenced data store is inactive.
        await waitForTimeout(3000);

        // Make changes to the inactive data store and validate that we get the inactiveObjectChanged event.
        dataStore1._root.set("key", "value");
        await provider.ensureSynchronized();
        assert(
            mockLogger.matchEvents([
                {
                    eventName: inactiveObjectChangedEvent,
                    timeout: deleteTimeoutMs,
                    id: `/${dataStore1.id}`,
                },
            ]),
            "inactiveObjectChanged event not generated as expected",
        );

        // Make a change again and validate that we don't get another inactiveObjectChanged event as we only log it
        // once per data store per session.
        dataStore1._root.set("key2", "value2");
        await provider.ensureSynchronized();
        validateNoInactiveEvents();

        // Revive the inactive data store and validate that we get the inactiveObjectRevivedEvent event.
        defaultDataStore._root.set("dataStore1", dataStore1.handle);
        await provider.ensureSynchronized();
        await containerRuntime.summarize({
            runGC: true,
            fullTree: true,
            trackState: false,
            summaryLogger,
        });
        assert(
            mockLogger.matchEvents([
                {
                    eventName: inactiveObjectRevivedEvent,
                    timeout: deleteTimeoutMs,
                    id: `/${dataStore1.id}`,
                },
            ]),
            "inactiveObjectRevived event not generated as expected",
        );
    }).timeout(10000);
});
