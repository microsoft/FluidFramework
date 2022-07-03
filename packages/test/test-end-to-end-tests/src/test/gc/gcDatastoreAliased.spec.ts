/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IContainer } from "@fluidframework/container-definitions";
import { ContainerRuntime } from "@fluidframework/container-runtime";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeNoCompat, ITestDataObject, TestDataObjectType } from "@fluidframework/test-version-utils";
import { defaultGCConfig } from "./gcTestConfigs";
import { getGCStateFromSummary, waitForContainerConnection } from "./gcTestSummaryUtils";

/**
 * Validates this scenario: When a datastore is aliased that it is considered a root datastore and always referenced
 */
describeNoCompat("GC Data Store Aliased", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    let container1: IContainer;
    let container2: IContainer;
    let mainDataStore1: ITestDataObject;
    let mainDataStore2: ITestDataObject;

    async function waitForSummary(container: IContainer) {
        const dataStore = await requestFluidObject<ITestDataObject>(container, "default");
        return (dataStore._context.containerRuntime as ContainerRuntime).summarize({ runGC: true, trackState: false });
    }

    beforeEach(async () => {
        provider = getTestObjectProvider({ syncSummarizer: true });
        container1 = await provider.makeTestContainer(defaultGCConfig);
        container2 = await provider.loadTestContainer(defaultGCConfig);
        mainDataStore1 = await requestFluidObject<ITestDataObject>(container1, "default");
        mainDataStore2 = await requestFluidObject<ITestDataObject>(container2, "default");
        await waitForContainerConnection(container1);
        await waitForContainerConnection(container2);
    });
});
