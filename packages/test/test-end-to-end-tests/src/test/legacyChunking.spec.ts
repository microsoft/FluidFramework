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
    TestFluidObjectFactory,
} from "@fluidframework/test-utils";
import { installVersionsDescribe, getContainerRuntimeApi } from "@fluidframework/test-version-utils";
import { IContainer } from "@fluidframework/container-definitions";
import { FlushMode, IContainerRuntimeBase } from "@fluidframework/runtime-definitions";
import { IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { IRequest } from "@fluidframework/core-interfaces";

const versionWithChunking = "0.56.0";

installVersionsDescribe(
    {
        absolute: [versionWithChunking],
    }
)(
    "Legacy chunking",
    (getTestObjectProvider) => {
        let provider: ITestObjectProvider;
        let oldDataObject: ITestFluidObject;
        let newDataObject: ITestFluidObject;
        let oldMap: SharedMap;
        let newMap: SharedMap;
        beforeEach(() => {
            provider = getTestObjectProvider();
        });
        afterEach(async () => provider.reset());

        const innerRequestHandler = async (request: IRequest, runtime: IContainerRuntimeBase) =>
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            runtime.IFluidHandleContext.resolveHandle(request);
        const mapId = "map";
        const factory: TestFluidObjectFactory = new TestFluidObjectFactory(
            [
                [mapId, SharedMap.getFactory()],
            ],
            "default",
        );
        const registry: ChannelFactoryRegistry = [
            [mapId, SharedMap.getFactory()],
        ];
        const testContainerConfig: ITestContainerConfig = {
            fluidDataObjectType: DataObjectFactoryType.Test,
            registry,
        };

        const oldContainerRuntimeOptions: IContainerRuntimeOptions = {
            // Chunking did not work with FlushMode.TurnBased,
            // as it was breaking batching semantics
            flushMode: FlushMode.Immediate,
            gcOptions: {
                gcAllowed: true,
            },
        };

        const createOldContainer = async (oldVersion: string): Promise<IContainer> => {
            const oldContainerRuntimeFactoryWithDefaultDataStore =
                getContainerRuntimeApi(oldVersion).ContainerRuntimeFactoryWithDefaultDataStore;
            const oldRuntimeFactory =
                new oldContainerRuntimeFactoryWithDefaultDataStore(
                    factory,
                    [
                        [factory.type, Promise.resolve(factory)],
                    ],
                    undefined,
                    [innerRequestHandler],
                    oldContainerRuntimeOptions,
                );

            return provider.createContainer(oldRuntimeFactory);
        };

        const setupContainers = async (
            containerConfig: ITestContainerConfig,
        ) => {
            // Create a Container for the first client.
            const oldContainer = await createOldContainer(versionWithChunking);
            oldDataObject = await requestFluidObject<ITestFluidObject>(oldContainer, "default");
            oldMap = await oldDataObject.getSharedObject<SharedMap>(mapId);

            const container2 = await provider.loadTestContainer(containerConfig);
            newDataObject = await requestFluidObject<ITestFluidObject>(container2, "default");
            newMap = await newDataObject.getSharedObject<SharedMap>(mapId);

            await provider.ensureSynchronized();
        };

        const generateStringOfSize = (sizeInBytes: number): string => new Array(sizeInBytes + 1).join("0");

        it("An old container sends a large chunked op, a new container is able to process it successfully", async () => {
            await setupContainers(testContainerConfig);
            // Ops larger than 16k will end up chunked
            const messageSizeInBytes = 100 * 1024;
            const value = generateStringOfSize(messageSizeInBytes);
            oldMap.set("key", value);

            await provider.ensureSynchronized();
            assert.strictEqual(newMap.get("key"), value, "Wrong value found in the new map");
        });
    });
