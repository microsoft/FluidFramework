/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import {
    ContainerRuntimeFactoryWithDefaultDataStore,
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { TelemetryNullLogger } from "@fluidframework/common-utils";
import { ITelemetryBaseEvent } from "@fluidframework/common-definitions";
import { IContainer } from "@fluidframework/container-definitions";
import { ISummaryConfiguration } from "@fluidframework/protocol-definitions";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluidframework/test-version-utils";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { IContainerRuntimeOptions, SummaryCollection } from "@fluidframework/container-runtime";
import { MockLogger } from "@fluidframework/telemetry-utils";
import { IRequest } from "@fluidframework/core-interfaces";
import { IContainerRuntimeBase } from "@fluidframework/runtime-definitions";

class TestDataObject extends DataObject {
    public get _root() {
        return this.root;
    }
}

describeNoCompat("Generate Summary Stats", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    const dataObjectFactory = new DataObjectFactory(
        "TestDataObject",
        TestDataObject,
        [],
        []);

    const IdleDetectionTime = 100;
    const summaryConfigOverrides: Partial<ISummaryConfiguration> = {
        idleTime: IdleDetectionTime,
        maxTime: IdleDetectionTime * 12,
    };
    const runtimeOptions: IContainerRuntimeOptions = {
        summaryOptions: {
            generateSummaries: true,
            initialSummarizerDelayMs: 10,
            summaryConfigOverrides,
        },
        gcOptions: {
            gcAllowed: true,
        },
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

    let mainContainer: IContainer;
    let mainDataStore: TestDataObject;
    let summaryCollection: SummaryCollection;
    const mockLogger: MockLogger = new MockLogger();
    let containerStatsEvents: ITelemetryBaseEvent[];

    /**
     * Waits for a summary with the current state of the document (including all in-flight changes). It basically
     * synchronizes all containers and waits for a summary that contains the last processed sequence number.
     * @returns the sequence number of the summary
     */
     async function waitForSummary(): Promise<number> {
        await provider.ensureSynchronized();
        const sequenceNumber = mainContainer.deltaManager.lastSequenceNumber;
        await summaryCollection.waitSummaryAck(sequenceNumber);
        return sequenceNumber;
    }

    const getContainerLoadStatsEvents = (): ITelemetryBaseEvent[] =>
        mockLogger.events.filter((event) => event.eventName === "fluid:telemetry:ContainerLoadStats");

    const createContainer = async (logger): Promise<IContainer> => provider.createContainer(runtimeFactory, { logger });

    beforeEach(async () => {
    });

    it("should generate correct container load stats with two summarizer containers", async function() {
        provider = getTestObjectProvider();
        // GitHub issue: #9534
        if (provider.driver.type === "odsp") {
            this.skip();
        }

        // Create a Container for the first client.
        mainContainer = await createContainer(mockLogger);

        // Set an initial key. The Container is in read-only mode so the first op it sends will get nack'd and is
        // re-sent. Do it here so that the extra events don't mess with rest of the test.
        mainDataStore = await requestFluidObject<TestDataObject>(mainContainer, "default");
        mainDataStore._root.set("test", "value");

        // Create and setup a summary collection that will be used to track and wait for summaries.
        summaryCollection = new SummaryCollection(mainContainer.deltaManager, new TelemetryNullLogger());

        // Wait for summary that contains the above set.
        await waitForSummary();

        // Trigger the telemetry event so it logs the new summary count
        await provider.loadContainer(runtimeFactory, { logger: mockLogger });
        await provider.ensureSynchronized();

        // Get all the containerLoadStats events
        containerStatsEvents = getContainerLoadStatsEvents();
        assert(containerStatsEvents !== undefined, "container load stats event is undefined");

        // Checking all the stats
        assert.strictEqual(containerStatsEvents.length, 3, "wrong number of containerLoadStats events");
        assert.strictEqual(containerStatsEvents[0].containerLoadDataStoreCount, 0, "dataStore count should be 0");
        assert.strictEqual(containerStatsEvents[0].referencedDataStoreCount, 0,
            "summarized dataStore count should be 0");
        assert.strictEqual(containerStatsEvents[2].containerLoadDataStoreCount, 1, "data store count should be 1");
        assert.strictEqual(containerStatsEvents[2].referencedDataStoreCount, 1,
            "summarized data store count should be 1");
        assert.strictEqual(containerStatsEvents[1].summaryCount, undefined, "summary count should be 0");
        assert.strictEqual(containerStatsEvents[2].summaryCount, 1, "summary count should be 1");

        // close the current summarizer and start a new summarizer container
        // this is to test summaryCount will still increment instead of reset
        mainContainer.close();
        mainContainer = await provider.loadContainer(runtimeFactory, { logger: mockLogger });
        mainDataStore = await requestFluidObject<TestDataObject>(mainContainer, "default");
        mainDataStore._root.set("test", "value");
        summaryCollection = new SummaryCollection(mainContainer.deltaManager, new TelemetryNullLogger());
        await waitForSummary();
        await provider.loadContainer(runtimeFactory, { logger: mockLogger });

        containerStatsEvents = getContainerLoadStatsEvents();
        assert.strictEqual(containerStatsEvents.length, 6, "wrong number of containerLoadStats events");

        // createContainerTimestamp and runtimeVersio should be consistent
        assert(containerStatsEvents.every((event) =>
            event.createContainerTimestamp === containerStatsEvents[0].createContainerTimestamp),
            "create container timestamp is inconsistent");
        assert(containerStatsEvents.every((event) =>
            event.createContainerRuntimeVersion === containerStatsEvents[0].createContainerRuntimeVersion),
            "create container runtime version is inconsistent");

        // summary count should increment instead of reset to 0
        assert.strictEqual(containerStatsEvents[4].summaryCount, 1, "summary count should still be 1");
        assert.strictEqual(containerStatsEvents[5].summaryCount, 2, "summary count should be 2");
    });
});
