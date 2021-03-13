/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainer, ILoader } from "@fluidframework/container-definitions";
import { IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { IFluidLoadable, IFluidCodeDetails } from "@fluidframework/core-interfaces";
import { IDocumentServiceFactory, IUrlResolver } from "@fluidframework/driver-definitions";
import { IFluidDataStoreContext, IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import { IFluidDataStoreRuntime, IChannelFactory } from "@fluidframework/datastore-definitions";
import { ISharedDirectory } from "@fluidframework/map";
import { unreachableCase } from "@fluidframework/common-utils";

import {
    ChannelFactoryRegistry,
    createTestContainerRuntimeFactory,
    OpProcessingController,
    TestObjectProvider,
} from "@fluidframework/test-utils";
import { ITestDriver } from "@fluidframework/test-driver-definitions";

import { getLoaderApi, getContainerRuntimeApi, getDataRuntimeApi } from "./testApi";

export interface ITestObjectProvider {
    /**
     * Used to create a test Container.
     * In generateLocalCompatTest(), this Container and its runtime will be arbitrarily-versioned.
     */
    makeTestContainer(testContainerConfig?: ITestContainerConfig): Promise<IContainer>,
    loadTestContainer(testContainerConfig?: ITestContainerConfig): Promise<IContainer>,
    makeTestLoader(testContainerConfig?: ITestContainerConfig): ILoader,
    documentServiceFactory: IDocumentServiceFactory,
    urlResolver: IUrlResolver,
    defaultCodeDetails: IFluidCodeDetails,
    opProcessingController: OpProcessingController,

    ensureSynchronized(): Promise<void>;
    reset(): void,

    documentId: string,
    driver: ITestDriver;

}

export enum DataObjectFactoryType {
    Primed, // default
    Test,
}

export interface ITestContainerConfig {
    // TestFluidDataObject instead of PrimedDataStore
    fluidDataObjectType?: DataObjectFactoryType,

    // And array of channel name and DDS factory pair to create on container creation time
    registry?: ChannelFactoryRegistry,

    // Container runtime options for the container instance
    runtimeOptions?: IContainerRuntimeOptions,
}

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

export const getDataStoreFactory = createGetDataStoreFactoryFunction(getDataRuntimeApi());

export function getTestObjectProvider(
    loaderVersion?: number | string,
    runtimeVersion?: number | string,
    dataRuntimeVersion?: number | string,
): ITestObjectProvider {
    const loaderApi = getLoaderApi(loaderVersion);
    const containerRuntimeApi = getContainerRuntimeApi(runtimeVersion);
    const dataRuntimeApi = getDataRuntimeApi(dataRuntimeVersion);
    const driver = getFluidTestDriver();

    const getDataStoreFactoryFn = createGetDataStoreFactoryFunction(dataRuntimeApi);
    const containerFactoryFn = (containerOptions?: ITestContainerConfig) => {
        const dataStoreFactory = getDataStoreFactoryFn(containerOptions);
        const factoryCtor = createTestContainerRuntimeFactory(containerRuntimeApi.ContainerRuntime);
        return new factoryCtor(TestDataObjectType, dataStoreFactory, containerOptions?.runtimeOptions);
    };

    return new TestObjectProvider(loaderApi.Loader, driver, containerFactoryFn);
}
