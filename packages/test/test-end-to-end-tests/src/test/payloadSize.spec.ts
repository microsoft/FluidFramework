/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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

describeNoCompat("Payload size", (getTestObjectProvider) => {
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
    let dataObject1map1: SharedMap;

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

        container1 = await provider.makeTestContainer(configWithFeatureGates);
        dataObject1 = await requestFluidObject<ITestFluidObject>(container1, "default");
        dataObject1map1 = await dataObject1.getSharedObject<SharedMap>(mapId);

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

    // In ODSP/t9s this test should catch the close event with error, as the retries would exhaust the retries.
    // This cannot be enabled until #8888 is resolved, as locally, there are no payload limits. Note that the timeout
    // must be increased for this test to more than 10 seconds, which makes enabling this test locally very problematic
    // in terms of developer experience.
    it.skip("Cannot send payloads larger than 1MB", async () => {
        await setupContainers(testContainerConfig, {});
        const errorEvent = containerError(container1);
        // Total payload size: 16 * 1000 * 65 = 1040000
        const largeString = generateStringOfSize(16 * 1000);
        const messageCount = 65;

        dataObject1.context.containerRuntime
            .orderSequentially(() => setMapKeys(dataObject1map1, messageCount, largeString));

        await errorEvent;
    });
});
