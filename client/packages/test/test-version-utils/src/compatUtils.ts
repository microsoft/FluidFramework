/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidLoadable, IRequest } from "@fluidframework/core-interfaces";
import {
    IContainerRuntimeBase,
    IFluidDataStoreContext,
    IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import { IFluidDataStoreRuntime, IChannelFactory } from "@fluidframework/datastore-definitions";
import { ISharedDirectory } from "@fluidframework/map";
import { unreachableCase } from "@fluidframework/common-utils";
import {
    ITestContainerConfig,
    DataObjectFactoryType,
    ChannelFactoryRegistry,
    createTestContainerRuntimeFactory,
    TestObjectProvider,
} from "@fluidframework/test-utils";
import { TestDriverTypes } from "@fluidframework/test-driver-definitions";
import { FluidTestDriverConfig, createFluidTestDriver } from "@fluidframework/test-drivers";
import { pkgVersion } from "./packageVersion";
import { getLoaderApi, getContainerRuntimeApi, getDataRuntimeApi, getDriverApi } from "./testApi";

export const TestDataObjectType = "@fluid-example/test-dataStore";

export interface ITestDataObject extends IFluidLoadable {
    _context: IFluidDataStoreContext;
    _runtime: IFluidDataStoreRuntime;
    _root: ISharedDirectory;
}

function createGetDataStoreFactoryFunction(api: ReturnType<typeof getDataRuntimeApi>) {
    class TestDataObject extends api.DataObject implements ITestDataObject {
        public get _context() { return this.context; }
        public get _runtime() { return this.runtime; }
        public get _root() { return this.root; }
    }

    const registryMapping = {};
    for (const value of Object.values(api.dds)) {
        registryMapping[value.getFactory().type] = value.getFactory();
    }

    function convertRegistry(registry: ChannelFactoryRegistry = []): ChannelFactoryRegistry {
        const oldRegistry: [string | undefined, IChannelFactory][] = [];
        for (const [key, factory] of registry) {
            const oldFactory = registryMapping[factory.type];
            if (oldFactory === undefined) {
                throw Error(`Invalid or unimplemented channel factory: ${factory.type}`);
            }
            oldRegistry.push([key, oldFactory]);
        }

        return oldRegistry;
    }

    return function(containerOptions?: ITestContainerConfig): IFluidDataStoreFactory {
        const registry = convertRegistry(containerOptions?.registry);
        const fluidDataObjectType = containerOptions?.fluidDataObjectType;
        switch (fluidDataObjectType) {
            case undefined:
            case DataObjectFactoryType.Primed:
                return new api.DataObjectFactory(
                    TestDataObjectType,
                    TestDataObject,
                    [...registry].map((r) => r[1]),
                    {});
            case DataObjectFactoryType.Test:
                return new api.TestFluidObjectFactory(registry);
            default:
                unreachableCase(fluidDataObjectType,
                    `Unknown data store factory type ${fluidDataObjectType}`);
        }
    };
}

// Only support current version, not baseVersion support
export const getDataStoreFactory = createGetDataStoreFactoryFunction(getDataRuntimeApi(pkgVersion));

async function createVersionedFluidTestDriver(
    baseVersion: string,
    driverConfig?: {
        type?: TestDriverTypes;
        config?: FluidTestDriverConfig;
        version?: number | string;
    },
) {
    const driverApi = getDriverApi(baseVersion, driverConfig?.version);
    return createFluidTestDriver(
        driverConfig?.type ?? "local",
        driverConfig?.config,
        driverApi,
    );
}

export async function getVersionedTestObjectProvider(
    baseVersion: string,
    loaderVersion?: number | string,
    driverConfig?: {
        type?: TestDriverTypes;
        config?: FluidTestDriverConfig;
        version?: number | string;
    },
    runtimeVersion?: number | string,
    dataRuntimeVersion?: number | string,
): Promise<TestObjectProvider> {
    const loaderApi = getLoaderApi(baseVersion, loaderVersion);
    const containerRuntimeApi = getContainerRuntimeApi(baseVersion, runtimeVersion);
    const dataRuntimeApi = getDataRuntimeApi(baseVersion, dataRuntimeVersion);
    const driver = await createVersionedFluidTestDriver(baseVersion, driverConfig);
    const innerRequestHandler = async (request: IRequest, runtime: IContainerRuntimeBase) =>
        runtime.IFluidHandleContext.resolveHandle(request);

    const getDataStoreFactoryFn = createGetDataStoreFactoryFunction(dataRuntimeApi);
    const containerFactoryFn = (containerOptions?: ITestContainerConfig) => {
        const dataStoreFactory = getDataStoreFactoryFn(containerOptions);
        const factoryCtor = createTestContainerRuntimeFactory(containerRuntimeApi.ContainerRuntime);
        return new factoryCtor(TestDataObjectType, dataStoreFactory, containerOptions?.runtimeOptions,
            [innerRequestHandler]);
    };

    return new TestObjectProvider(loaderApi.Loader, driver, containerFactoryFn);
}
