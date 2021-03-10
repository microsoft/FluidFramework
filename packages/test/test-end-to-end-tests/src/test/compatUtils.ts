/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainer, ILoader } from "@fluidframework/container-definitions";
import { Loader } from "@fluidframework/container-loader";
import { IContainerRuntimeOptions, ContainerRuntime } from "@fluidframework/container-runtime";
import { IFluidLoadable, IFluidCodeDetails } from "@fluidframework/core-interfaces";
import { IDocumentServiceFactory, IUrlResolver } from "@fluidframework/driver-definitions";
import { IClientConfiguration } from "@fluidframework/protocol-definitions";
import { IFluidDataStoreContext } from "@fluidframework/runtime-definitions";
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
import { getLoaderApi, getContainerRuntimeApi, getDataRuntimeApi, DataRuntimeApiType } from "./testApi";

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

export interface ITestOptions {
    serviceConfiguration?: Partial<IClientConfiguration>,
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

function createGetDataStoreFactoryFunction(api: DataRuntimeApiType) {
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

    return function(containerOptions?: ITestContainerConfig) {
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

export function createTestObjectProvider(
    type: string,
    driver: ITestDriver,
    LoaderConstructor = Loader,
    ContainerRuntimeConstructor = ContainerRuntime,
    getDataStoreFactoryFn = getDataStoreFactory,
): ITestObjectProvider {
    const containerFactoryFn = (containerOptions?: ITestContainerConfig) => {
        const dataStoreFactory = getDataStoreFactoryFn(containerOptions);
        const factoryCtor = createTestContainerRuntimeFactory(ContainerRuntimeConstructor);
        return new factoryCtor(type, dataStoreFactory, containerOptions?.runtimeOptions);
    };

    return new TestObjectProvider(LoaderConstructor, driver, containerFactoryFn);
}

export const generateNonCompatTest = (
    tests: (compatArgsFactory: () => ITestObjectProvider) => void,
) => {
    describe("non-compat", () => {
        tests(() => {
            // Run with all current versions
            const driver = getFluidTestDriver();
            return createTestObjectProvider(TestDataObjectType, driver as any);
        });
    });
};

export const generateCompatTest = (
    tests: (compatArgsFactory: () => ITestObjectProvider) => void,
    options: ITestOptions = {},
) => {
    // Run against all currently supported versions by default
    const compatVersions = [-1, -2];
    compatVersions.forEach((compatVersion: number) => {
        let oldLoaderApi: ReturnType<typeof getLoaderApi>;
        let oldContainerRuntimeApi: ReturnType<typeof getContainerRuntimeApi>;
        let oldDataRuntimeApi: ReturnType<typeof getDataRuntimeApi>;
        before(async () => {
            oldLoaderApi = getLoaderApi(compatVersion);
            oldContainerRuntimeApi = getContainerRuntimeApi(compatVersion);
            oldDataRuntimeApi = getDataRuntimeApi(compatVersion);
        });
        describe(`compat N${compatVersion} - old loader, new runtime`, function() {
            tests(() => {
                const driver = getFluidTestDriver();
                return createTestObjectProvider(
                    TestDataObjectType,
                    driver as any,
                    oldLoaderApi.Loader,
                );
            });
        });

        describe(`compat N${compatVersion} - new loader, old runtime`, function() {
            tests(() => {
                const driver = getFluidTestDriver();
                return createTestObjectProvider(
                    TestDataObjectType,
                    driver as any,
                    Loader,
                    oldContainerRuntimeApi.ContainerRuntime,
                    createGetDataStoreFactoryFunction(oldDataRuntimeApi),
                );
            });
        });

        describe(`compat N${compatVersion} - new ContainerRuntime, old DataStoreRuntime`, function() {
            tests(() => {
                const driver = getFluidTestDriver();
                return createTestObjectProvider(
                    TestDataObjectType,
                    driver as any,
                    Loader,
                    ContainerRuntime,
                    createGetDataStoreFactoryFunction(oldDataRuntimeApi),
                );
            });
        });

        describe(`compat N${compatVersion} - old ContainerRuntime, new DataStoreRuntime`, function() {
            tests(() => {
                const driver = getFluidTestDriver();
                return createTestObjectProvider(
                    TestDataObjectType,
                    driver as any,
                    oldLoaderApi.Loader,
                    oldContainerRuntimeApi.ContainerRuntime,
                    getDataStoreFactory,
                );
            });
        });
    });
};

export const generateTest = (
    tests: (compatArgsFactory: () => ITestObjectProvider) => void,
    options: ITestOptions = {},
) => {
    describe("test", () => {
        generateNonCompatTest(tests);
        generateCompatTest(tests, options);
    });
};
