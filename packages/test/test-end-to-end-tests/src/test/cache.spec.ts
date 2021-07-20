/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// import assert from "assert";
import {
    ContainerRuntimeFactoryWithDefaultDataStore,
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
// import { TelemetryNullLogger } from "@fluidframework/common-utils";
// import { ITelemetryBaseEvent } from "@fluidframework/common-definitions";
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
    // let mainDataStore: TestDataObject;
    let mockLogger: MockLogger;

    const createContainer = async (logger): Promise<IContainer> => provider.createContainer(runtimeFactory, { logger });
    const loadContainer = async (logger): Promise<IContainer> => provider.loadContainer(runtimeFactory, { logger });
    beforeEach(async () => {
        provider = getTestObjectProvider();
        mockLogger = new MockLogger();
        // Create a Container for the first client.
        mainContainer = await createContainer(mockLogger);

        // Set an initial key. The Container is in read-only mode so the first op it sends will get nack'd and is
        // re-sent. Do it here so that the extra events don't mess with rest of the test.
        await requestFluidObject<TestDataObject>(mainContainer, "default");
        await loadContainer(mockLogger);

        await provider.ensureSynchronized();
    });
    it("should generate correct summary stats with summarizing once", async () => {
        console.log(mockLogger.events);
    });
});
