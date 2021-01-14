/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-extraneous-dependencies */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import {
    IContainer,
    ILoader,
    IRuntimeFactory,
} from "@fluidframework/container-definitions";
import { IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { IFluidCodeDetails } from "@fluidframework/core-interfaces";
import { IDocumentServiceFactory, IUrlResolver } from "@fluidframework/driver-definitions";
import { LocalResolver } from "@fluidframework/local-driver";
import { IClientConfiguration } from "@fluidframework/protocol-definitions";
import { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import { ILocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import {
    ChannelFactoryRegistry,
    TestContainerRuntimeFactory,
    TestFluidObjectFactory,
    LocalTestObjectProvider,
    OpProcessingController,
    TinyliciousTestObjectProvider,
} from "@fluidframework/test-utils";
import * as oldTypes from "./oldVersionTypes";
import * as old from "./oldVersion";
import * as old2 from "./oldVersion2";

/* eslint-enable import/no-extraneous-dependencies */

export interface ITestObjectProvider {
    /**
     * Used to create a test Container.
     * In generateLocalCompatTest(), this Container and its runtime will be arbitrarily-versioned.
     */
    makeTestContainer(testContainerConfig?: ITestContainerConfig): Promise<IContainer | oldTypes.IContainer>,
    loadTestContainer(testContainerConfig?: ITestContainerConfig): Promise<IContainer | oldTypes.IContainer>,
    makeTestLoader(testContainerConfig?: ITestContainerConfig): ILoader | oldTypes.ILoader,
    documentServiceFactory: IDocumentServiceFactory | oldTypes.IDocumentServiceFactory,
    urlResolver: IUrlResolver | oldTypes.IUrlResolver,
    defaultCodeDetails: IFluidCodeDetails | oldTypes.IFluidCodeDetails,
    opProcessingController: OpProcessingController | oldTypes.OpProcessingController,
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
    urlResolver: LocalResolver | oldTypes.LocalResolver,
    reset(): Promise<void>,
}

export interface ITestOptions {
    serviceConfiguration?: Partial<IClientConfiguration>,
    tinylicious?: boolean,

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

export const V1 = "0.1.0";
export const V2 = "0.2.0";

export class TestDataObject extends DataObject {
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

export const createTestFluidDataStoreFactory = (registry: ChannelFactoryRegistry = []): IFluidDataStoreFactory => {
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
    tests: (compatArgs: ILocalTestObjectProvider, oldApi: oldTypes.OldApi) => void,
    options: ITestOptions = {},
) => {
    // Run against all currently supported versions by default
    const oldApis = options.oldApis ?? [old, old2];
    oldApis.forEach((oldApi: oldTypes.OldApi) => {
        describe("compat - old loader, new runtime", function() {
            const localTestObjectProvider = oldApi.createLocalTestObjectProvider(
                true, /* oldLoader */
                false, /* oldContainerRuntime */
                false, /* oldDataStoreRuntime */
                TestDataObject.type,
                options.serviceConfiguration,
            );

            tests(localTestObjectProvider, oldApi);

            afterEach(async function() {
                await localTestObjectProvider.reset();
            });
        });

        describe("compat - new loader, old runtime", function() {
            const localTestObjectProvider = oldApi.createLocalTestObjectProvider(
                false, /* oldLoader */
                true, /* oldContainerRuntime */
                true, /* oldDataStoreRuntime */
                TestDataObject.type,
                options.serviceConfiguration,
            );

            tests(localTestObjectProvider, oldApi);

            afterEach(async function() {
                await localTestObjectProvider.reset();
            });
        });

        describe("compat - new ContainerRuntime, old DataStoreRuntime", function() {
            const localTestObjectProvider = oldApi.createLocalTestObjectProvider(
                false, /* oldLoader */
                false, /* oldContainerRuntime */
                true, /* oldDataStoreRuntime */
                TestDataObject.type,
                options.serviceConfiguration,
            );

            tests(localTestObjectProvider, oldApi);

            afterEach(async function() {
                await localTestObjectProvider.reset();
            });
        });

        describe("compat - old ContainerRuntime, new DataStoreRuntime", function() {
            const localTestObjectProvider = oldApi.createLocalTestObjectProvider(
                true, /* oldLoader */
                true, /* oldContainerRuntime */
                false, /* oldDataStoreRuntime */
                TestDataObject.type,
                options.serviceConfiguration,
            );

            tests(localTestObjectProvider, oldApi);

            afterEach(async function() {
                await localTestObjectProvider.reset();
            });
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
