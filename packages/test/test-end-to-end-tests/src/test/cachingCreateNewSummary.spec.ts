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
import { IContainer } from "@fluidframework/container-definitions";
import { ISummaryConfiguration } from "@fluidframework/protocol-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { MockLogger } from "@fluidframework/test-runtime-utils";
import { describeNoCompat } from "@fluidframework/test-version-utils";
import { IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { flattenRuntimeOptions } from "./flattenRuntimeOptions";

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
    const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
        dataObjectFactory,
        [
            [dataObjectFactory.type, Promise.resolve(dataObjectFactory)],
        ],
        undefined,
        undefined,
        flattenRuntimeOptions(runtimeOptions),
    );

    let mainContainer: IContainer;
    let mockLogger: MockLogger;

    const createContainer = async (logger): Promise<IContainer> => provider.createContainer(runtimeFactory, { logger });
    const loadContainer = async (logger): Promise<IContainer> => provider.loadContainer(runtimeFactory, { logger });

    beforeEach(function() {
        provider = getTestObjectProvider();
        // Currently, only ODSP caches new summary.
        if (provider.driver.type !== "odsp") {
            this.skip();
        }
    });

    it("should fetch from cache when second client loads the container", async () => {
        mockLogger = new MockLogger();
        // Create a Container for the first client.
        mainContainer = await createContainer(mockLogger);
        await requestFluidObject<TestDataObject>(mainContainer, "default");
        // second client load the container
        await loadContainer(mockLogger);
        await provider.ensureSynchronized();

        for (const event of mockLogger.events) {
            if (event.eventName === "fluid:telemetry:OdspDriver:ObtainSnapshot_end") {
                assert.strictEqual(event.method, "cache", `second client fetched snapshot with ${event.method} method
                    instead of from cache`);
                break;
            }
        }
    });
});
