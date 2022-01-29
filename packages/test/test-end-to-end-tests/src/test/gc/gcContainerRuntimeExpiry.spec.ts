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
        assert(container1.closed === false, "Container1 should not be closed, it should be 1 tick away from expiring.");
        clock.tick(1);
        assert(container1.closed, "Container1 should be closed, it has should have reached its session expiry timeout");
    });

    it("Containers should have the same expiry time for the same document", async () => {
        // Container1 should expire in one tick
        clock.tick(timeoutMs - 1);
        // Load the two other containers
        const container2 = await loadContainer();
        const container3 = await loadContainer();
        assert(container1.closed === false, "Container1 should not be closed, it should be 1 tick away from expiring.");
        assert(container2.closed === false, "Container2 should not be closed, it should not expire on load.");
        assert(container3.closed === false, "Container3 should not be closed, it should not expire on load.");
        // Ticking one more should expire the first container
        clock.tick(1);
        assert(container1.closed, "Container1 should be closed as it has reached its expiry.");
        // Containers 2 & 3 should be one tick in.
        assert(container2.closed === false, "Container2 should not be closed, as it has not reached expiry.");
        assert(container3.closed === false, "Container3 should not be closed, as it has not reached expiry.");
        // Containers 2 & 3 should be one tick away from expiring
        clock.tick(timeoutMs - 2);
        assert(container2.closed === false, "Container2 should not be closed, it should only expire on the next tick.");
        assert(container3.closed === false, "Container3 should not be closed, it should only expire on the next tick.");
        // This one tick should expire both containers at the same time as they were created in the same time
        clock.tick(1);
        assert(container2.closed, "Container2 should be closed as it has reached its expiry.");
        assert(container3.closed, "Container3 should be closed as it has reached its expiry.");
    });
});
