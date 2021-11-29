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

class TestDataObject extends DataObject {
    public get _root() {
        return this.root;
    }
}
export namespace global{
    export const navigator = {
        deviceMemory: 10,
        hardwareConcurrency: 8,
    };
}
describeNoCompat("Hardware Stats", (getTestObjectProvider) => {
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
    const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
        dataObjectFactory,
        [
            [dataObjectFactory.type, Promise.resolve(dataObjectFactory)],
        ],
        undefined,
        undefined,
        runtimeOptions,
    );

    let mainContainer: IContainer;
    let mainDataStore: TestDataObject;
    const mockLogger: MockLogger = new MockLogger();
    let containerStatsEvents: ITelemetryBaseEvent[];

    const getContainerLoadStatsEvents = (): ITelemetryBaseEvent[] =>
        mockLogger.events.filter((event) => event.eventName === "fluid:telemetry:ContainerLoadStats");

    const createContainer = async (logger): Promise<IContainer> => provider.createContainer(runtimeFactory, { logger });

    beforeEach(async () => {
    });

    it("should generate correct hardware stats", async () => {
        provider = getTestObjectProvider();
        // Create a Container for the first client.
        mainContainer = await createContainer(mockLogger);

        // Set an initial key. The Container is in read-only mode so the first op it sends will get nack'd and is
        // re-sent. Do it here so that the extra events don't mess with rest of the test.
        mainDataStore = await requestFluidObject<TestDataObject>(mainContainer, "default");
        mainDataStore._root.set("test", "value");

        await provider.ensureSynchronized();

        // Get all the containerLoadStats events
        containerStatsEvents = getContainerLoadStatsEvents();
        assert(containerStatsEvents !== undefined, "container load stats event is undefined");
    });
});
