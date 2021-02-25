/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import {
    IContainer,
    ILoader,
    IRuntimeFactory,
} from "@fluidframework/container-definitions";
import { Loader } from "@fluidframework/container-loader";
import { IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { IFluidCodeDetails } from "@fluidframework/core-interfaces";
import { IDocumentServiceFactory, IUrlResolver } from "@fluidframework/driver-definitions";
import { IClientConfiguration } from "@fluidframework/protocol-definitions";
import { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import {
    ChannelFactoryRegistry,
    TestContainerRuntimeFactory,
    TestFluidObjectFactory,
    OpProcessingController,
    TestObjectProvider,
} from "@fluidframework/test-utils";
import { ITestDriver } from "@fluidframework/test-driver-definitions";
import * as oldTypes from "./oldVersionTypes";
import * as old from "./oldVersion";
import * as old2 from "./oldVersion2";

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

    // The old apis to use if running against an older version
    oldApis?: oldTypes.OldApi[],
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

export class TestDataObject extends DataObject {
    public static readonly type = "@fluid-example/test-dataStore";
    public get _context() { return this.context; }
    public get _runtime() { return this.runtime; }
    public get _root() { return this.root; }
}

const createPrimedDataStoreFactory = (registry?: ChannelFactoryRegistry): IFluidDataStoreFactory => {
    return new DataObjectFactory(
        TestDataObject.type,
        TestDataObject,
        [...registry ?? []].map((r) => r[1]),
        {});
};

const createTestFluidDataStoreFactory = (registry: ChannelFactoryRegistry = []): IFluidDataStoreFactory => {
    return new TestFluidObjectFactory(registry);
};

export const createRuntimeFactory = (
    type: string,
    dataStoreFactory: IFluidDataStoreFactory | oldTypes.IFluidDataStoreFactory,
    runtimeOptions: IContainerRuntimeOptions = { initialSummarizerDelayMs: 0 },
): IRuntimeFactory => {
    return new TestContainerRuntimeFactory(type, dataStoreFactory as IFluidDataStoreFactory, runtimeOptions);
};

export function getDataStoreFactory(containerOptions?: ITestContainerConfig) {
    switch (containerOptions?.fluidDataObjectType) {
        case undefined:
        case DataObjectFactoryType.Primed:
            return createPrimedDataStoreFactory(containerOptions?.registry);
        case DataObjectFactoryType.Test:
            return createTestFluidDataStoreFactory(containerOptions?.registry);
        default:
            throw new Error("unknown data store factory type");
    }
}

export function createTestObjectProvider(
    type: string,
    driver: ITestDriver,
    LoaderConstructor = Loader,
    createRuntimeFactoryFn = createRuntimeFactory,
    getDataStoreFactoryFn = getDataStoreFactory,
): ITestObjectProvider {
    const containerFactoryFn = (containerOptions?: ITestContainerConfig) => {
        const dataStoreFactory = getDataStoreFactoryFn(containerOptions);
        return createRuntimeFactoryFn(type, dataStoreFactory, containerOptions?.runtimeOptions);
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
            return createTestObjectProvider(TestDataObject.type, driver as any);
        });
    });
};

export const generateCompatTest = (
    tests: (compatArgsFactory: () => ITestObjectProvider, oldApi: oldTypes.OldApi) => void,
    options: ITestOptions = {},
) => {
    // Run against all currently supported versions by default
    const oldApis = options.oldApis ?? [old, old2];
    oldApis.forEach((oldApi: oldTypes.OldApi) => {
        describe(`compat ${oldApi.versionString} - old loader, new runtime`, function() {
            tests(() => {
                const driver = getFluidTestDriver();
                return createTestObjectProvider(
                    TestDataObject.type,
                    driver as any,
                    oldApi.Loader as any,
                );
            }, oldApi);
        });

        describe(`compat ${oldApi.versionString} - new loader, old runtime`, function() {
            tests(() => {
                const driver = getFluidTestDriver();
                return createTestObjectProvider(
                    TestDataObject.type,
                    driver as any,
                    Loader,
                    oldApi.createRuntimeFactory as any,
                    oldApi.getDataStoreFactory as any,
                );
            }, oldApi);
        });

        describe(`compat ${oldApi.versionString} - new ContainerRuntime, old DataStoreRuntime`, function() {
            tests(() => {
                const driver = getFluidTestDriver();
                return createTestObjectProvider(
                    TestDataObject.type,
                    driver as any,
                    Loader,
                    createRuntimeFactory,
                    oldApi.getDataStoreFactory as any,
                );
            }, oldApi);
        });

        describe(`compat ${oldApi.versionString} - old ContainerRuntime, new DataStoreRuntime`, function() {
            tests(() => {
                const driver = getFluidTestDriver();
                return createTestObjectProvider(
                    TestDataObject.type,
                    driver as any,
                    oldApi.Loader as any,
                    oldApi.createRuntimeFactory as any,
                    getDataStoreFactory,
                );
            }, oldApi);
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
