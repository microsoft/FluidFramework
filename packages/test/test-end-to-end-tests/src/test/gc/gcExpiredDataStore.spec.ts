/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { MockLogger } from "@fluid-internal/mock-logger";
import {
    ContainerRuntimeFactoryWithDefaultDataStore,
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { TelemetryNullLogger } from "@fluidframework/common-utils";
import { ContainerRuntime, IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { Container } from "@fluidframework/container-loader";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluidframework/test-version-utils";

class TestDataObject extends DataObject {
    public get _root() {
        return this.root;
    }

    public get _context() {
        return this.context;
    }
}

describeNoCompat("GC unreferenced data store timeout expiry", (getTestObjectProvider) => {
    const dataObjectFactory = new DataObjectFactory(
        "TestDataObject",
        TestDataObject,
        [],
        []);
    const maxUnreferencedDurationMs = 2000;
    const runtimeOptions: IContainerRuntimeOptions = {
        summaryOptions: { generateSummaries: false },
        gcOptions: { gcAllowed: true, maxUnreferencedDurationMs },
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
    const expiredObjectRevivedEvent = "fluid:telemetry:expiredObjectRevived";
    const expiredObjectChangedEvent = "fluid:telemetry:expiredObjectChanged";

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

    /** Validates that none of the expired events have been logged since the last run. */
    function validateNoExpiredEvents() {
        assert(
            !mockLogger.matchAnyEvent([
                { eventName: expiredObjectRevivedEvent },
                { eventName: expiredObjectChangedEvent },
            ]),
            "expired object events should not have been logged",
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
        containerRuntime = defaultDataStore._context.containerRuntime as ContainerRuntime;
    });

    it("can generate events when unreferenced data store is accessed after timeout expires", async () => {
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
        validateNoExpiredEvents();

        // Mark dataStore1 as unreferenced, summarize and validate that no unreferenced errors were logged.
        defaultDataStore._root.delete("dataStore1");
        await provider.ensureSynchronized();
        await containerRuntime.summarize({
            runGC: true,
            fullTree: true,
            trackState: false,
            summaryLogger,
        });
        validateNoExpiredEvents();

        // Wait for 3000 ms which is > the configured maxUnreferencedDurationMs (2000). This will ensure that the
        // unreferenced data store is expired.
        await waitForTimeout(3000);

        // Make changes to the expired data store and validate that we get the expiredObjectChanged event.
        dataStore1._root.set("key", "value");
        await provider.ensureSynchronized();
        assert(
            mockLogger.matchEvents([{ eventName: expiredObjectChangedEvent, maxUnreferencedDurationMs }]),
            "expiredObjectChanged event not generated as expected",
        );

        // Revive the expired data store and validate that we get the expiredObjectRevivedEvent event.
        defaultDataStore._root.set("dataStore1", dataStore1.handle);
        await provider.ensureSynchronized();
        await containerRuntime.summarize({
            runGC: true,
            fullTree: true,
            trackState: false,
            summaryLogger,
        });
        assert(
            mockLogger.matchEvents([{ eventName: expiredObjectRevivedEvent, maxUnreferencedDurationMs }]),
            "expiredObjectRevived event not generated as expected",
        );
    }).timeout(10000);
});
