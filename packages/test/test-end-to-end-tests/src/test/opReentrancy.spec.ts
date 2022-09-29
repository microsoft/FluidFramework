/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { Container } from "@fluidframework/container-loader";
import { SharedMap } from "@fluidframework/map";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ConfigTypes, IConfigProviderBase } from "@fluidframework/telemetry-utils";
import {
    ChannelFactoryRegistry,
    DataObjectFactoryType,
    ITestContainerConfig,
    ITestFluidObject,
    ITestObjectProvider,
} from "@fluidframework/test-utils";
import { describeNoCompat, itExpects } from "@fluidframework/test-version-utils";

describeNoCompat("Concurrent op processing via DDS event handlers", (getTestObjectProvider) => {
    const mapId = "mapKey";
    const registry: ChannelFactoryRegistry = [[mapId, SharedMap.getFactory()]];
    const testContainerConfig: ITestContainerConfig = {
        fluidDataObjectType: DataObjectFactoryType.Test,
        registry,
    };
    let provider: ITestObjectProvider;
    let container1: Container;
    let container2: Container;
    let dataObject1: ITestFluidObject;
    let dataObject2: ITestFluidObject;
    let sharedMap1: SharedMap;
    let sharedMap2: SharedMap;

    const configProvider = ((settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
        getRawConfig: (name: string): ConfigTypes => settings[name],
    }));

    beforeEach(async () => {
        provider = getTestObjectProvider();
    });

    const setupContainers = async (
        containerConfig: ITestContainerConfig,
        featureGates: Record<string, ConfigTypes> = {},
    ) => {
        const configWithFeatureGates = {
            ...containerConfig,
            loaderProps: { configProvider: configProvider(featureGates) },
        };
        container1 = await provider.makeTestContainer(configWithFeatureGates) as Container;
        container2 = await provider.loadTestContainer(configWithFeatureGates) as Container;

        dataObject1 = await requestFluidObject<ITestFluidObject>(container1, "default");
        dataObject2 = await requestFluidObject<ITestFluidObject>(container2, "default");

        sharedMap1 = await dataObject1.getSharedObject<SharedMap>(mapId);
        sharedMap2 = await dataObject2.getSharedObject<SharedMap>(mapId);

        await provider.ensureSynchronized();
    };

    itExpects("Should close container when submitting an op while processing a batch",
        [{
            eventName: "fluid:telemetry:Container:ContainerClose",
            error: "Submission of an out of order message",
        },], async () => {
            await setupContainers(testContainerConfig);

            sharedMap1.on("valueChanged", (changed) => {
                if (changed.key !== "key2") {
                    sharedMap1.set("key2", `${sharedMap1.get("key1")} updated`);
                }
            });

            sharedMap1.set("key1", "1");
            // Force a flush
            await new Promise((resolve) => setImmediate(resolve));
            sharedMap2.set("key2", "2");
            sharedMap2.set("key3", "3");
            sharedMap2.set("key4", "4");
            await provider.ensureSynchronized();

            // The offending container is closed
            assert.ok(container1.closed);

            // The other container is fine
            assert.equal(sharedMap2.get("key1"), undefined);
            assert.equal(sharedMap2.get("key2"), "2");
            assert.equal(sharedMap2.get("key3"), "3");
            assert.equal(sharedMap2.get("key4"), "4");
        });

    it("Should NOT close the container when submitting an op while processing a batch when break-glass enabled",
        async () => {
            await setupContainers(testContainerConfig, { "Fluid.ContainerRuntime.DisableBatchBaselineCheck": true });

            sharedMap1.on("valueChanged", (changed) => {
                if (changed.key !== "key2") {
                    sharedMap1.set("key2", `${sharedMap1.get("key1")} updated`);
                }
            });

            sharedMap1.set("key1", "1");
            // Force a flush
            await new Promise((resolve) => setImmediate(resolve));
            sharedMap2.set("key3", "3");
            sharedMap2.set("key3", "4");
            sharedMap2.set("key3", "5");
            sharedMap2.set("key3", "6");
            await provider.ensureSynchronized();

            assert.equal(sharedMap2.get("key1"), "1");
            assert.equal(sharedMap2.get("key2"), "1 updated", "Not updated for container 2");

            assert.equal(sharedMap1.get("key1"), "1");
            assert.equal(sharedMap1.get("key2"), "1 updated", "Not updated for container 1");

            sharedMap1.set("key1", "2");
            await provider.ensureSynchronized();

            assert.equal(sharedMap2.get("key1"), "2");
            assert.equal(sharedMap2.get("key2"), "2 updated", "Not updated for container 2");

            assert.equal(sharedMap1.get("key1"), "2");
            assert.equal(sharedMap1.get("key2"), "2 updated", "Not updated for container 1");
        });
});
