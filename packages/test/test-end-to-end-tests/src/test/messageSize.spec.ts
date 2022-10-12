/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SharedMap } from "@fluidframework/map";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
    ITestFluidObject,
    ChannelFactoryRegistry,
    ITestObjectProvider,
    ITestContainerConfig,
    DataObjectFactoryType,
} from "@fluidframework/test-utils";
import { describeNoCompat, itExpects } from "@fluidframework/test-version-utils";
import { IContainer, IErrorBase } from "@fluidframework/container-definitions";
import { ConfigTypes, IConfigProviderBase } from "@fluidframework/telemetry-utils";
import { GenericError } from "@fluidframework/container-utils";
import { FlushMode } from "@fluidframework/runtime-definitions";

describeNoCompat("Message size", (getTestObjectProvider) => {
    const mapId = "mapId";
    const registry: ChannelFactoryRegistry = [
        [mapId, SharedMap.getFactory()],
    ];
    const testContainerConfig: ITestContainerConfig = {
        fluidDataObjectType: DataObjectFactoryType.Test,
        registry,
    };

    let provider: ITestObjectProvider;
    beforeEach(() => {
        provider = getTestObjectProvider();
    });
    afterEach(async () => provider.reset());

    let container1: IContainer;
    let dataObject1: ITestFluidObject;
    let dataObject2: ITestFluidObject;
    let dataObject1map: SharedMap;
    let dataObject2map: SharedMap;

    const configProvider = ((settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
        getRawConfig: (name: string): ConfigTypes => settings[name],
    }));

    const setupContainers = async (
        containerConfig: ITestContainerConfig,
        featureGates: Record<string, ConfigTypes> = {},
    ) => {
        const configWithFeatureGates = {
            ...containerConfig,
            loaderProps: { configProvider: configProvider(featureGates) },
        };

        // Create a Container for the first client.
        container1 = await provider.makeTestContainer(configWithFeatureGates);
        dataObject1 = await requestFluidObject<ITestFluidObject>(container1, "default");
        dataObject1map = await dataObject1.getSharedObject<SharedMap>(mapId);

        // Load the Container that was created by the first client.
        const container2 = await provider.loadTestContainer(testContainerConfig);
        dataObject2 = await requestFluidObject<ITestFluidObject>(container2, "default");
        dataObject2map = await dataObject2.getSharedObject<SharedMap>(mapId);

        await provider.ensureSynchronized();
    };

    const generateStringOfSize = (sizeInBytes: number): string => new Array(sizeInBytes + 1).join("0");
    const setMapKeys = (map: SharedMap, count: number, item: string): void => {
        for (let i = 0; i < count; i++) {
            map.set(`key${i}`, item);
        }
    };

    const assertMapValues = (map: SharedMap, count: number, expected: string): void => {
        for (let i = 0; i < count; i++) {
            const value = dataObject2map.get(`key${i}`);
            assert.strictEqual(value, expected, `Wrong value for key${i}`);
        }
    };

    const containerError = async (container: IContainer) =>
        new Promise<IErrorBase | undefined>((resolve) => container.once("closed", (error) => { resolve(error); }));

    itExpects("A large op will close the container", [
        { eventName: "fluid:telemetry:Container:ContainerClose", error: "BatchTooLarge" },
    ], async () => {
        const maxMessageSizeInBytes = 1024 * 1024; // 1Mb
        await setupContainers(testContainerConfig, {});
        const errorEvent = containerError(container1);

        const largeString = generateStringOfSize(maxMessageSizeInBytes + 1);
        const messageCount = 1;
        try {
            setMapKeys(dataObject1map, messageCount, largeString);
            assert(false, "should throw");
        } catch {
        }

        const error = await errorEvent;
        assert.ok(error instanceof GenericError);
        assert.ok(error.getTelemetryProperties().opSize ?? 0 > maxMessageSizeInBytes);

        // Limit has to be around 1Mb, but we should not assume here precise number.
        const limit = error.getTelemetryProperties().limit as number;
        assert(limit > maxMessageSizeInBytes / 2);
        assert(limit < maxMessageSizeInBytes * 2);
    });

    it("A large batch (smaller than 1MB) will not close the container if there is no batch size limit", async () => {
        await setupContainers({ ...testContainerConfig, runtimeOptions: { maxBatchSizeInBytes: Infinity } }, {});
        // 950 * 1024 is the default max batch size limit
        const largeString = generateStringOfSize(950 * 1024 / 2);
        const messageCount = 2;
        setMapKeys(dataObject1map, messageCount, largeString);
        await provider.ensureSynchronized();

        assertMapValues(dataObject2map, messageCount, largeString);
    });

    it("Small ops will pass", async () => {
        const maxMessageSizeInBytes = 800 * 1024; // slightly below 1Mb
        await setupContainers(testContainerConfig, {});
        const largeString = generateStringOfSize(maxMessageSizeInBytes / 10);
        const messageCount = 10;
        setMapKeys(dataObject1map, messageCount, largeString);
        await provider.ensureSynchronized();

        assertMapValues(dataObject2map, messageCount, largeString);
    });

    it("Large ops passes when smaller than the max op size", async () => {
        await setupContainers(testContainerConfig, {});
        // Max op size is 768000, round down to account for some overhead
        const largeString = generateStringOfSize(750000);
        const messageCount = 1;
        setMapKeys(dataObject1map, messageCount, largeString);
        await provider.ensureSynchronized();

        assertMapValues(dataObject2map, messageCount, largeString);
    });

    it("Batched small ops pass when batch is larger than max op size", async function() {
        // flush mode is not applicable for the local driver
        if (provider.driver.type === "local") {
            this.skip();
        }
        await setupContainers({ ...testContainerConfig, runtimeOptions: { flushMode: FlushMode.Immediate } }, {});
        const largeString = generateStringOfSize(500000);
        const messageCount = 10;
        setMapKeys(dataObject1map, messageCount, largeString);
        await provider.ensureSynchronized();

        assertMapValues(dataObject2map, messageCount, largeString);
    });
});
