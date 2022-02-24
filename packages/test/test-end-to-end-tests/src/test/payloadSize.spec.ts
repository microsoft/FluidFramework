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
import { describeNoCompat } from "@fluidframework/test-version-utils";
import { IContainer, IErrorBase } from "@fluidframework/container-definitions";
import { ConfigTypes, IConfigProviderBase } from "@fluidframework/telemetry-utils";

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
    let dataObject1map1: SharedMap;
    let dataObject2map1: SharedMap;

    const configProvider = ((settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
        getRawConfig: (name: string): ConfigTypes => settings[name],
    }));

    const setupContainers = async (
        containerConfig: ITestContainerConfig,
        featureGates: Record<string, ConfigTypes> = {},
    ) => {
        const configWithFeatureGates = {
            ...containerConfig,
            loaderProps: { configProvider: configProvider(featureGates) }
        };

        // Create a Container for the first client.
        container1 = await provider.makeTestContainer(configWithFeatureGates);
        dataObject1 = await requestFluidObject<ITestFluidObject>(container1, "default");
        dataObject1map1 = await dataObject1.getSharedObject<SharedMap>(mapId);

        // Load the Container that was created by the first client.
        const container2 = await provider.loadTestContainer(testContainerConfig);
        dataObject2 = await requestFluidObject<ITestFluidObject>(container2, "default");
        dataObject2map1 = await dataObject2.getSharedObject<SharedMap>(mapId);

        await provider.ensureSynchronized();
    };

    const generateStringOfSize = (sizeInBytes: number): string => new Array(sizeInBytes + 1).join("0");
    const setMapKeys = (map: SharedMap, count: number, item: string): void => {
        for (let i = 0; i < count; i++) {
            map.set(`key${i}`, item);
        }
    };

    const containerError = async (container: IContainer) =>
        new Promise<IErrorBase | undefined>((resolve) => container.once("closed", (error) => { resolve(error); }));

    it("Can send 60 messages of 16k", async () => {
        await setupContainers(testContainerConfig, {});
        const errorEvent = containerError(container1);
        // Total payload size: 16 * 1000 * 65 = 960000
        const largeString = generateStringOfSize(16 * 1000);
        const messageCount = 65;
        // The limit is from socket.io seems to be 1MB
        // as experimentally, a payload of 979774 bytes pass, while a
        // a payload of 996103 bytes does not. Which is also an argument
        // that the message is stringified again. This will also explain
        // why the size varies slightly based on the string content
        // of the message.
        setMapKeys(dataObject1map1, messageCount, largeString);

        await errorEvent;
        // Wait for the ops to get processed by both the containers.
        await provider.ensureSynchronized();

        for (let i = 0; i < messageCount; i++) {
            const value = dataObject2map1.get(`key${i}`);
            assert.strictEqual(value, largeString, `Wrong value for key${i}`);
        }
    });
});
