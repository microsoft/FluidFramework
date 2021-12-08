/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { SharedMap } from "@fluidframework/map";
import { FlushMode, IContainerRuntimeBase } from "@fluidframework/runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
    ITestFluidObject,
    ChannelFactoryRegistry,
    timeoutPromise,
    ITestObjectProvider,
    ITestContainerConfig,
    DataObjectFactoryType,
} from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluidframework/test-version-utils";
import { IContainer } from "@fluidframework/container-definitions";

const map1Id = "map1Key";
const registry: ChannelFactoryRegistry = [
    [map1Id, SharedMap.getFactory()],
];
const testContainerConfig: ITestContainerConfig = {
    fluidDataObjectType: DataObjectFactoryType.Test,
    registry,
};

const getMockStore = ((store: Record<string, string>): Storage => {
    return {
        getItem: (key: string): string | null => store[key],
        length: Object.keys(store).length,
        clear: () => { },
        // eslint-disable-next-line no-null/no-null
        key: (_index: number): string | null => null,
        removeItem: (_key: string) => { },
        setItem: (_key: string, _value: string) => { },
    };
});

const settings: Record<string, string> = {};
global.localStorage = getMockStore(settings);

// This test, ran against real services, should serve as a canary for socket.io
//  or other communication level limitations between clients with regards
// to the op size or total payload size
describeNoCompat("Payload size", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    beforeEach(() => {
        provider = getTestObjectProvider();
    });

    let container1: IContainer;
    let dataObject1: ITestFluidObject;
    let dataObject2: ITestFluidObject;
    let dataObject1map1: SharedMap;
    let dataObject2map1: SharedMap;

    // eslint-disable-next-line prefer-arrow/prefer-arrow-functions
    async function waitForCleanContainers(...dataStores: ITestFluidObject[]) {
        return Promise.all(dataStores.map(async (dataStore) => {
            const runtime = dataStore.context.containerRuntime as IContainerRuntime;
            while (runtime.isDirty) {
                await timeoutPromise((resolve) => runtime.once("batchEnd", resolve));
            }
        }));
    }

    beforeEach(async () => {
        // Create a Container for the first client.
        container1 = await provider.makeTestContainer(testContainerConfig);
        dataObject1 = await requestFluidObject<ITestFluidObject>(container1, "default");
        dataObject1.context.containerRuntime.setFlushMode(FlushMode.TurnBased);
        dataObject1map1 = await dataObject1.getSharedObject<SharedMap>(map1Id);

        // Load the Container that was created by the first client.
        const container2 = await provider.loadTestContainer(testContainerConfig);
        dataObject2 = await requestFluidObject<ITestFluidObject>(container2, "default");
        dataObject2.context.containerRuntime.setFlushMode(FlushMode.TurnBased);
        dataObject2map1 = await dataObject2.getSharedObject<SharedMap>(map1Id);

        await waitForCleanContainers(dataObject1, dataObject2);
        await provider.ensureSynchronized();
    });

    const generateStringOfSize = (sizeInBytes: number): string => new Array(sizeInBytes + 1).join("0");
    const setMapKeys = (containerRuntime: IContainerRuntimeBase, count: number, item: string): void => {
        containerRuntime.orderSequentially(() => {
            for (let i = 0; i < count; i++) {
                dataObject1map1.set(`key${i}`, item);
            }
        });
    };

    it("Can send 60 messages of 16k", async () => {
        const largeString = generateStringOfSize(16 * 1000);
        const messageCount = 60;
        // The limit is from socket.io seems to be 1MB
        // as experimentally, a payload of 979774 bytes pass, while a
        // a payload of 996103 bytes does not. Which is also an argument
        // that the message is stringified again. This will also explain
        // why the size varies slightly based on the string content
        // of the message.
        setMapKeys(dataObject1.context.containerRuntime, messageCount, largeString);

        // Wait for the ops to get processed by both the containers.
        await provider.ensureSynchronized();

        for (let i = 0; i < messageCount; i++) {
            const value = dataObject2map1.get(`key${i}`);
            assert.strictEqual(value, largeString, `Wrong value for key${i}`);
        }
    });

    it("Cannot send large batches with feature gate enabled", async () => {
        settings.FluidEnablePayloadSizeLimit = "1";
        const largeString = generateStringOfSize(16 * 1000);
        const messageCount = 100;
        let error: Error | undefined;
        try {
            setMapKeys(dataObject1.context.containerRuntime, messageCount, largeString);
        } catch (err) {
            error = err as Error;
        }

        assert(error);
    });

    it("Can send large batches with feature gate disabled", async () => {
        settings.FluidEnablePayloadSizeLimit = "";
        const largeString = generateStringOfSize(16 * 1000);
        const messageCount = 100;
        setMapKeys(dataObject1.context.containerRuntime, messageCount, largeString);

        // Wait for the ops to get processed by both the containers.
        await provider.ensureSynchronized();

        for (let i = 0; i < messageCount; i++) {
            const value = dataObject2map1.get(`key${i}`);
            assert.strictEqual(value, largeString, `Wrong value for key${i}`);
        }
    });
});
