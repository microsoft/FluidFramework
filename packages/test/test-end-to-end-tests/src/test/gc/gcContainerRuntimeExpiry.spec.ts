/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    ContainerRuntimeFactoryWithDefaultDataStore,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { IContainer } from "@fluidframework/container-definitions";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluidframework/test-version-utils";
import { IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { TestDataObject } from "./mockSummarizerClient";

/**
 * Validates this scenario: When a client session expires, that the container throws the ClientSessionExpiry error
 * when GC sweep is running.
 */
 describeNoCompat("GC Session Expiry", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    const dataObjectFactory = new DataObjectFactory(
        "TestDataObject",
        TestDataObject,
        [],
        []);

    const runtimeOptions: IContainerRuntimeOptions = {
        summaryOptions: {
            disableSummaries: true,
        },
        gcOptions: {
            gcAllowed: true,
            gcSessionTimeoutEnabled: true,
            gcTestSessionTimeoutMs: 0,
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

    let container1: IContainer;

    const createContainer = async (): Promise<IContainer> => provider.createContainer(runtimeFactory);

    beforeEach(async () => {
        provider = getTestObjectProvider();
    });

    it("Container should be closed with a ClientSessionExpired error after the gcSessionExpiryTime is up", async () => {
        container1 = await createContainer();
        container1.on("closed", (error) => {
            assert.strictEqual(error?.errorType, "clientSessionExpiredError");
        });

        await provider.ensureSynchronized();
        const delay = async (ms: number) => new Promise((res) => setTimeout(res, ms));
        await delay(100);
        assert(container1.closed === true, "Container should be closed");
    });
});
