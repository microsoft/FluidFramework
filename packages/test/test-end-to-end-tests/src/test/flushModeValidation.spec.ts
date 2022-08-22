/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { Container } from "@fluidframework/container-loader";
import { SharedMap } from "@fluidframework/map";
import { FlushMode } from "@fluidframework/runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
    ITestFluidObject,
    ChannelFactoryRegistry,
    ITestObjectProvider,
    ITestContainerConfig,
    DataObjectFactoryType,
    ensureContainerConnected,
} from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluidframework/test-version-utils";

/**
 * This test validates that changing the FlushMode does not hit any validation errors in PendingStateManager.
 * It also validates the scenario in this bug - https://github.com/microsoft/FluidFramework/issues/9398.
 */
describeNoCompat("Flush mode validation", (getTestObjectProvider) => {
    const map1Id = "map1Key";
    const registry: ChannelFactoryRegistry = [
        [map1Id, SharedMap.getFactory()],
    ];
    const testContainerConfig: ITestContainerConfig = {
        fluidDataObjectType: DataObjectFactoryType.Test,
        registry,
    };

    let provider: ITestObjectProvider;
    let dataObject1: ITestFluidObject;
    let dataObject1map1: SharedMap;

    before(function() {
        provider = getTestObjectProvider();
        if (provider.driver.type !== "local") {
            this.skip();
        }
    });

    beforeEach(async () => {
        // Create a Container for the first client.
        const container1 = await provider.makeTestContainer(testContainerConfig) as Container;
        dataObject1 = await requestFluidObject<ITestFluidObject>(container1, "default");
        dataObject1map1 = await dataObject1.getSharedObject<SharedMap>(map1Id);
        // Send an op in container1 so that it switches to "write" mode and wait for it to be connected.
        dataObject1map1.set("key", "value");
        await ensureContainerConnected(container1);
        await provider.ensureSynchronized();
    });

    it("can set flush mode to Immediate and send ops", async () => {
        dataObject1.context.containerRuntime.setFlushMode(FlushMode.Immediate);
        dataObject1map1.set("flushMode", "Immediate");
        await provider.ensureSynchronized();

        assert.strictEqual(dataObject1map1.get("flushMode"), "Immediate", "container1's map did not get updated");
    });

    it("can set flush mode to TurnBased and send ops", async () => {
        dataObject1.context.containerRuntime.setFlushMode(FlushMode.TurnBased);
        dataObject1map1.set("flushMode", "TurnBased");
        await provider.ensureSynchronized();

        assert.strictEqual(dataObject1map1.get("flushMode"), "TurnBased", "container1's map did not get updated");
    });

    it("can set alternate flush modes and send ops", async () => {
        dataObject1.context.containerRuntime.setFlushMode(FlushMode.Immediate);
        dataObject1map1.set("flushMode", "Immediate");
        await provider.ensureSynchronized();

        assert.strictEqual(dataObject1map1.get("flushMode"), "Immediate", "container1's map did not get updated");

        dataObject1.context.containerRuntime.setFlushMode(FlushMode.TurnBased);
        dataObject1map1.set("flushMode", "TurnBased");
        await provider.ensureSynchronized();

        assert.strictEqual(dataObject1map1.get("flushMode"), "TurnBased", "container1's map did not get updated");

        dataObject1.context.containerRuntime.setFlushMode(FlushMode.Immediate);
        dataObject1map1.set("flushMode", "Immediate");
        await provider.ensureSynchronized();

        assert.strictEqual(dataObject1map1.get("flushMode"), "Immediate", "container1's map did not get updated");
    });

    it("can set alternate flush modes without ops in between", async () => {
        dataObject1.context.containerRuntime.setFlushMode(FlushMode.Immediate);
        dataObject1.context.containerRuntime.setFlushMode(FlushMode.TurnBased);
        dataObject1.context.containerRuntime.setFlushMode(FlushMode.Immediate);
        dataObject1.context.containerRuntime.setFlushMode(FlushMode.TurnBased);

        dataObject1map1.set("flushMode", "TurnBased");
        await provider.ensureSynchronized();

        assert.strictEqual(dataObject1map1.get("flushMode"), "TurnBased", "container1's map did not get updated");
    });
});
