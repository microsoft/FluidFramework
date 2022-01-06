/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SinonFakeTimers, useFakeTimers } from "sinon";
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
    const timeoutMs = 100;
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
            gcTestSessionTimeoutMs: timeoutMs,
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
    const loadContainer = async (): Promise<IContainer> => provider.loadContainer(runtimeFactory);
    let clock: SinonFakeTimers;

    before(() => {
        clock = useFakeTimers();
    });

    afterEach(() => {
        clock.reset();
    });

    after(() => {
        clock.restore();
    });

    beforeEach(async () => {
        provider = getTestObjectProvider();
        container1 = await createContainer();
        container1.on("closed", (error) => {
            assert.strictEqual(error?.errorType, "clientSessionExpiredError");
        });
    });

    it("Container should be closed with a ClientSessionExpired error after the gcSessionExpiryTime is up", async () => {
        await provider.ensureSynchronized();
        clock.tick(timeoutMs - 1);
        assert(container1.closed === false, "Container1 should not be closed");
        clock.tick(1);
        assert(container1.closed, "Container should be closed");
    });

    it("Containers should have the same expiry time for the same document", async () => {
        clock.tick(timeoutMs / 2);
        const container2 = await loadContainer();
        assert(container1.closed === false, "Container1 should not be closed");
        clock.tick(timeoutMs / 2);
        assert(container1.closed, "Container1 should be closed");
        assert(container2.closed === false, "Container2 should not be closed");
        clock.tick(timeoutMs / 2);
        assert(container2.closed, "Container2 should be closed");
    });
});
