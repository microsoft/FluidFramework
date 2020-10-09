/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-extraneous-dependencies */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { SharedCell } from "@fluidframework/cell";
import {
    IContainer,
    IFluidCodeDetails,
    ILoader,
    IRuntimeFactory,
} from "@fluidframework/container-definitions";
import { IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { IDocumentServiceFactory } from "@fluidframework/driver-definitions";
import { Ink } from "@fluidframework/ink";
import { LocalResolver } from "@fluidframework/local-driver";
import { SharedDirectory, SharedMap } from "@fluidframework/map";
import { SharedMatrix } from "@fluidframework/matrix";
import { ConsensusQueue } from "@fluidframework/ordered-collection";
import { ISummaryConfiguration } from "@fluidframework/protocol-definitions";
import { ConsensusRegisterCollection } from "@fluidframework/register-collection";
import { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import { SharedString, SparseMatrix } from "@fluidframework/sequence";
import { ILocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import {
    ChannelFactoryRegistry,
    TestContainerRuntimeFactory,
    TestFluidObjectFactory,
    LocalTestObjectProvider,
} from "@fluidframework/test-utils";
import * as old from "./oldVersion";

/* eslint-enable import/no-extraneous-dependencies */

/**
 * Arguments given to the function passed into compatTest()
 */
export interface ICompatLocalTestObjectProvider {
    /**
     * Used to create a test Container. In compatTest(), this Container and its runtime will be arbitrarily-versioned.
     */
    makeTestContainer(registry?: ChannelFactoryRegistry): Promise<IContainer | old.IContainer>,
    loadTestContainer(registry?: ChannelFactoryRegistry): Promise<IContainer | old.IContainer>,
    makeTestLoader(registry?: ChannelFactoryRegistry): ILoader | old.ILoader,
    deltaConnectionServer: ILocalDeltaConnectionServer
    documentServiceFactory: IDocumentServiceFactory | old.IDocumentServiceFactory,
    urlResolver: LocalResolver | old.LocalResolver,
    defaultCodeDetails: IFluidCodeDetails | old.IFluidCodeDetails,
}

export interface ICompatTestOptions {
    /**
     * Use TestFluidDataObject instead of PrimedDataStore
     */
    testFluidDataObject?: boolean
}

// convert a channel factory registry for TestFluidDataStoreFactory to one with old channel factories
function convertRegistry(registry: ChannelFactoryRegistry = []): old.ChannelFactoryRegistry {
    const oldRegistry = [];
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
            default:
                throw Error(`Invalid or unimplemented channel factory: ${factory.type}`);
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return oldRegistry;
}

export class TestDataObject extends DataObject {
    public static readonly type = "@fluid-example/test-dataStore";
    public get _runtime() { return this.runtime; }
    public get _root() { return this.root; }
}

export class OldTestDataObject extends old.DataObject {
    public static readonly type = "@fluid-example/test-dataStore";
    public get _runtime() { return this.runtime; }
    public get _root() { return this.root; }
}

export const createPrimedDataStoreFactory = (): IFluidDataStoreFactory => {
    return new DataObjectFactory(TestDataObject.type, TestDataObject, [], {});
};

export const createOldPrimedDataStoreFactory = (): old.IFluidDataStoreFactory => {
    return new old.DataObjectFactory(OldTestDataObject.type, OldTestDataObject, [], {});
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

export const generateTest = (
    tests: (compatArgs: ICompatLocalTestObjectProvider) => void,
    options: ICompatTestOptions = {},
) => {
    // Run with all current versions
    const localTestObjectProvider = new LocalTestObjectProvider(
        (registry: ChannelFactoryRegistry = []) =>
            options.testFluidDataObject
                ? createTestFluidDataStoreFactory(registry)
                : createPrimedDataStoreFactory(),
    );

    tests(localTestObjectProvider);

    afterEach(async () => {
        await localTestObjectProvider.reset();
    });
};

export const generateCompatTest = (
    tests: (compatArgs: ICompatLocalTestObjectProvider) => void,
    options: ICompatTestOptions = {},
) => {
    describe("compatibility", () => {
        describe("old loader, new runtime", function() {
            const runtimeFactory = (registry?: ChannelFactoryRegistry) => createRuntimeFactory(
                TestDataObject.type,
                options.testFluidDataObject
                    ? createTestFluidDataStoreFactory(registry)
                    : createPrimedDataStoreFactory(),
            ) as any as old.IRuntimeFactory;

            const localTestObjectProvider = new old.LocalTestObjectProvider(
                runtimeFactory,
                // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
                { summary: { maxOps: 1 } as ISummaryConfiguration },
            );

            tests(localTestObjectProvider);

            afterEach(async function() {
                await localTestObjectProvider.reset();
            });
        });

        describe("new loader, old runtime", function() {
            const runtimeFactory = (registry?: ChannelFactoryRegistry) => createOldRuntimeFactory(
                OldTestDataObject.type,
                options.testFluidDataObject
                    ? createOldTestFluidDataStoreFactory(registry)
                    : createOldPrimedDataStoreFactory(),
            ) as any as IRuntimeFactory;

            const localTestObjectProvider = new LocalTestObjectProvider(
                runtimeFactory,
                // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
                { summary: { maxOps: 1 } as ISummaryConfiguration },
            );

            tests(localTestObjectProvider);

            afterEach(async function() {
                await localTestObjectProvider.reset();
            });
        });

        describe("new ContainerRuntime, old DataStoreRuntime", function() {
            const runtimeFactory = (registry?: ChannelFactoryRegistry) => createRuntimeFactory(
                OldTestDataObject.type,
                options.testFluidDataObject
                    ? createOldTestFluidDataStoreFactory(registry)
                    : createOldPrimedDataStoreFactory(),
            );

            const localTestObjectProvider = new LocalTestObjectProvider(
                runtimeFactory,
                // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
                { summary: { maxOps: 1 } as ISummaryConfiguration },
            );

            tests(localTestObjectProvider);

            afterEach(async function() {
                await localTestObjectProvider.reset();
            });
        });
    });
};

export const generateTestWithCompat = (
    tests: (compatArgs: ICompatLocalTestObjectProvider) => void,
    options: ICompatTestOptions = {},
) => {
    generateTest(tests, options);
    generateCompatTest(tests, options);
};
