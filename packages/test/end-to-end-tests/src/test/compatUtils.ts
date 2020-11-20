/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-extraneous-dependencies */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { SharedCell } from "@fluidframework/cell";
import {
    IContainer,
    ILoader,
    IRuntimeFactory,
} from "@fluidframework/container-definitions";
import { IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { IFluidCodeDetails } from "@fluidframework/core-interfaces";
import { IDocumentServiceFactory, IUrlResolver } from "@fluidframework/driver-definitions";
import { Ink } from "@fluidframework/ink";
import { LocalResolver } from "@fluidframework/local-driver";
import { SharedCounter } from "@fluidframework/counter";
import { SharedDirectory, SharedMap } from "@fluidframework/map";
import { SharedMatrix } from "@fluidframework/matrix";
import { ConsensusQueue } from "@fluidframework/ordered-collection";
import { IServiceConfiguration } from "@fluidframework/protocol-definitions";
import { ConsensusRegisterCollection } from "@fluidframework/register-collection";
import { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import { SharedString, SparseMatrix } from "@fluidframework/sequence";
import { ILocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import {
    ChannelFactoryRegistry,
    TestContainerRuntimeFactory,
    TestFluidObjectFactory,
    LocalTestObjectProvider,
    OpProcessingController,
    TinyliciousTestObjectProvider,
} from "@fluidframework/test-utils";
import * as old from "./oldVersion";

/* eslint-enable import/no-extraneous-dependencies */

export interface ITestObjectProvider {
    /**
     * Used to create a test Container.
     * In generateLocalCompatTest(), this Container and its runtime will be arbitrarily-versioned.
     */
    makeTestContainer(testContainerConfig?: ITestContainerConfig): Promise<IContainer | old.IContainer>,
    loadTestContainer(testContainerConfig?: ITestContainerConfig): Promise<IContainer | old.IContainer>,
    makeTestLoader(testContainerConfig?: ITestContainerConfig): ILoader | old.ILoader,
    documentServiceFactory: IDocumentServiceFactory | old.IDocumentServiceFactory,
    urlResolver: IUrlResolver | old.IUrlResolver,
    defaultCodeDetails: IFluidCodeDetails | old.IFluidCodeDetails,
    opProcessingController: OpProcessingController | old.OpProcessingController,
}

/**
 * Arguments given to the function passed into generateTest, generateLocalCompatTest or generateTestWithCompat
 */
export interface ILocalTestObjectProvider extends ITestObjectProvider {
    /**
     * Used to create a test Container.
     * In generateLocalCompatTest(), this Container and its runtime will be arbitrarily-versioned.
     */
    deltaConnectionServer: ILocalDeltaConnectionServer,
    urlResolver: LocalResolver | old.LocalResolver,
}

export interface ITestOptions {
    serviceConfiguration?: Partial<IServiceConfiguration>,
    tinylicious?: boolean,
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

// convert a channel factory registry for TestFluidDataStoreFactory to one with old channel factories
function convertRegistry(registry: ChannelFactoryRegistry = []): old.ChannelFactoryRegistry {
    const oldRegistry: [string | undefined, old.IChannelFactory][] = [];
    for (const [key, factory] of registry) {
        switch (factory.type) {
            case SharedMap.getFactory().type:
                oldRegistry.push([key, old.SharedMap.getFactory()]); break;
            case SharedString.getFactory().type:
                oldRegistry.push([key, old.SharedString.getFactory()]); break;
            case SharedDirectory.getFactory().type:
                oldRegistry.push([key, old.SharedDirectory.getFactory()]); break;
            case ConsensusRegisterCollection.getFactory().type:
                oldRegistry.push([key, old.ConsensusRegisterCollection.getFactory()]); break;
            case SharedCell.getFactory().type:
                oldRegistry.push([key, old.SharedCell.getFactory()]); break;
            case Ink.getFactory().type:
                oldRegistry.push([key, old.Ink.getFactory()]); break;
            case SharedMatrix.getFactory().type:
                oldRegistry.push([key, old.SharedMatrix.getFactory()]); break;
            case ConsensusQueue.getFactory().type:
                oldRegistry.push([key, old.ConsensusQueue.getFactory()]); break;
            case SparseMatrix.getFactory().type:
                oldRegistry.push([key, old.SparseMatrix.getFactory()]); break;
            case SharedCounter.getFactory().type:
                oldRegistry.push([key, old.SharedCounter.getFactory()]); break;
            default:
                throw Error(`Invalid or unimplemented channel factory: ${factory.type}`);
        }
    }

    return oldRegistry;
}

export class TestDataObject extends DataObject {
    public static readonly type = "@fluid-example/test-dataStore";
    public get _context() { return this.context; }
    public get _runtime() { return this.runtime; }
    public get _root() { return this.root; }
}

export class OldTestDataObject extends old.DataObject {
    public static readonly type = "@fluid-example/test-dataStore";
    public get _context() { return this.context; }
    public get _runtime() { return this.runtime; }
    public get _root() { return this.root; }
}

export const createPrimedDataStoreFactory = (registry?: ChannelFactoryRegistry): IFluidDataStoreFactory => {
    return new DataObjectFactory(
        TestDataObject.type,
        TestDataObject,
        [...registry ?? []].map((r) => r[1]),
        {});
};

export const createOldPrimedDataStoreFactory =
    (registry?: ChannelFactoryRegistry): old.IFluidDataStoreFactory => {
        return new old.DataObjectFactory(
            OldTestDataObject.type,
            OldTestDataObject,
            [...convertRegistry(registry)].map((r) => r[1]),
            {});
    };

export const createTestFluidDataStoreFactory = (registry: ChannelFactoryRegistry = []): IFluidDataStoreFactory => {
    return new TestFluidObjectFactory(registry);
};

export const createOldTestFluidDataStoreFactory = (registry?: ChannelFactoryRegistry): old.IFluidDataStoreFactory => {
    return new old.TestFluidObjectFactory(convertRegistry(registry));
};

export const createRuntimeFactory = (
    type: string,
    dataStoreFactory: IFluidDataStoreFactory | old.IFluidDataStoreFactory,
    runtimeOptions: IContainerRuntimeOptions = { initialSummarizerDelayMs: 0 },
): IRuntimeFactory => {
    return new TestContainerRuntimeFactory(type, dataStoreFactory as IFluidDataStoreFactory, runtimeOptions);
};

export const createOldRuntimeFactory = (
    type: string,
    dataStoreFactory: IFluidDataStoreFactory | old.IFluidDataStoreFactory,
    runtimeOptions: old.IContainerRuntimeOptions = { initialSummarizerDelayMs: 0 },
): old.IRuntimeFactory => {
    // TODO: when the old version of 0.27 is released this can use the old version of TestContainerRuntimeFactory
    // with the default data store
    // return new old.TestContainerRuntimeFactory(type, dataStoreFactory as old.IFluidDataStoreFactory, runtimeOptions);
    const factory = new TestContainerRuntimeFactory(type, dataStoreFactory as IFluidDataStoreFactory, runtimeOptions);
    return factory as unknown as old.IRuntimeFactory;
};

function getDataStoreFactory(containerOptions?: ITestContainerConfig) {
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

function getOldDataStoreFactory(containerOptions?: ITestContainerConfig) {
    switch (containerOptions?.fluidDataObjectType) {
        case undefined:
        case DataObjectFactoryType.Primed:
            return createOldPrimedDataStoreFactory(containerOptions?.registry);
        case DataObjectFactoryType.Test:
            return createOldTestFluidDataStoreFactory(containerOptions?.registry);
        default:
            throw new Error("unknown data store factory type");
    }
}

export const generateLocalNonCompatTest = (
    tests: (compatArgs: ILocalTestObjectProvider) => void,
    options: ITestOptions = {},
) => {
    describe("non-compat", () => {
        // Run with all current versions
        const runtimeFactory = (containerOptions?: ITestContainerConfig) =>
            createRuntimeFactory(
                TestDataObject.type,
                getDataStoreFactory(containerOptions),
                containerOptions?.runtimeOptions,
            );

        const localTestObjectProvider = new LocalTestObjectProvider(
            runtimeFactory,
            options.serviceConfiguration,
        );

        tests(localTestObjectProvider);

        afterEach(async () => {
            await localTestObjectProvider.reset();
        });
    });
};

export const generateLocalCompatTest = (
    tests: (compatArgs: ILocalTestObjectProvider) => void,
    options: ITestOptions = {},
) => {
    describe("compat - old loader, new runtime", function() {
        const runtimeFactory = (containerOptions?: ITestContainerConfig) =>
            createRuntimeFactory(
                TestDataObject.type,
                getDataStoreFactory(containerOptions),
                containerOptions?.runtimeOptions,
            ) as any as old.IRuntimeFactory;

        const localTestObjectProvider = new old.LocalTestObjectProvider(
            runtimeFactory,
            options.serviceConfiguration,
        );

        tests(localTestObjectProvider);

        afterEach(async function() {
            await localTestObjectProvider.reset();
        });
    });

    describe("compat - new loader, old runtime", function() {
        const runtimeFactory = (containerOptions?: ITestContainerConfig) =>
            createOldRuntimeFactory(
                OldTestDataObject.type,
                getOldDataStoreFactory(containerOptions),
                containerOptions?.runtimeOptions,
            ) as any as IRuntimeFactory;

        const localTestObjectProvider = new LocalTestObjectProvider(
            runtimeFactory,
            options.serviceConfiguration,
        );

        tests(localTestObjectProvider);

        afterEach(async function() {
            await localTestObjectProvider.reset();
        });
    });

    describe("compat - new ContainerRuntime, old DataStoreRuntime", function() {
        const runtimeFactory = (containerOptions?: ITestContainerConfig) =>
            createRuntimeFactory(
                OldTestDataObject.type,
                getOldDataStoreFactory(containerOptions),
                containerOptions?.runtimeOptions,
            );

        const localTestObjectProvider = new LocalTestObjectProvider(
            runtimeFactory,
            options.serviceConfiguration,
        );

        tests(localTestObjectProvider);

        afterEach(async function() {
            await localTestObjectProvider.reset();
        });
    });

    describe("compat - old ContainerRuntime, new DataStoreRuntime", function() {
        const runtimeFactory = (containerOptions?: ITestContainerConfig) =>
            createOldRuntimeFactory(
                TestDataObject.type,
                getDataStoreFactory(containerOptions),
                containerOptions?.runtimeOptions,
            );

        const localTestObjectProvider = new old.LocalTestObjectProvider(
            runtimeFactory,
            options.serviceConfiguration,
        );

        tests(localTestObjectProvider);

        afterEach(async function() {
            await localTestObjectProvider.reset();
        });
    });
};

export const generateLocalTest = (
    tests: (compatArgs: ILocalTestObjectProvider) => void,
    options: ITestOptions = {},
) => {
    describe("local server", () => {
        generateLocalNonCompatTest(tests, options);
        generateLocalCompatTest(tests, options);
    });
};

const generateTinyliciousTest = (
    tests: (compatArgs: ITestObjectProvider) => void,
    options: ITestOptions,
) => {
    if (options.tinylicious) {
        describe("tinylicious", () => {
            // Run with all current versions
            const runtimeFactory = (containerOptions?: ITestContainerConfig) =>
                createRuntimeFactory(
                    TestDataObject.type,
                    getDataStoreFactory(containerOptions),
                    containerOptions?.runtimeOptions,
                );

            const testObjectProvider = new TinyliciousTestObjectProvider(
                runtimeFactory,
            );

            tests(testObjectProvider);

            afterEach(async () => {
                await testObjectProvider.reset();
            });
        });
    }
};

export const generateTest = (
    tests: (compatArgs: ITestObjectProvider) => void,
    options: ITestOptions = {},
) => {
    generateLocalTest(tests, options);
    generateTinyliciousTest(tests, options);
};
