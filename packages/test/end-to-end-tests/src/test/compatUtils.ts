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
import { IFluidCodeDetails, IFluidObject, IFluidLoadable } from "@fluidframework/core-interfaces";
import { IDocumentServiceFactory } from "@fluidframework/driver-definitions";
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
} from "@fluidframework/test-utils";
import { IFluidDependencyProvider } from "@fluidframework/synthesize";

import * as old from "./oldVersion";

/* eslint-enable import/no-extraneous-dependencies */

/**
 * Arguments given to the function passed into generateTest, generateCompatTest or generateTestWithCompat
 */
export interface ICompatLocalTestObjectProvider {
    /**
     * Used to create a test Container.
     * In generateCompatTest(), this Container and its runtime will be arbitrarily-versioned.
     */
    makeTestContainer(testContainerConfig?: ITestContainerConfig): Promise<IContainer | old.IContainer>,
    loadTestContainer(testContainerConfig?: ITestContainerConfig): Promise<IContainer | old.IContainer>,
    makeTestLoader(testContainerConfig?: ITestContainerConfig): ILoader | old.ILoader,
    deltaConnectionServer: ILocalDeltaConnectionServer
    documentServiceFactory: IDocumentServiceFactory | old.IDocumentServiceFactory,
    urlResolver: LocalResolver | old.LocalResolver,
    defaultCodeDetails: IFluidCodeDetails | old.IFluidCodeDetails,
    opProcessingController: OpProcessingController | old.OpProcessingController,
}

export interface ICompatTestOptions {
    serviceConfiguration?: Partial<IServiceConfiguration>,
}

export enum DataObjectFactoryType {
    Primed, // default
    PrimedWithDependency,
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

declare module "@fluidframework/core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IFluidObject extends Readonly<Partial<IProvideArgument>> { }
}

export const IArgument: keyof IProvideArgument = "IArgument";

export interface IProvideArgument {
    readonly IArgument: IArgument;
}

/**
 * A Fluid object that implements a collection of Fluid objects.  Typically, the
 * Fluid objects in the collection would be like-typed.
 */
export interface IArgument extends IProvideArgument {
    data: string;
}

export interface IArgumentLoadable extends IArgument, IFluidLoadable {
}

export class TestDataObjectCore<O extends IFluidObject> extends DataObject<O> {
    public static readonly type = "@fluid-example/test-dataStore";
    public get _context() { return this.context; }
    public get _runtime() { return this.runtime; }
    public get _root() { return this.root; }
    public get _providers() {
        return this.providers as { IArgument: Promise<IArgument> | undefined };
    }

    async createSubObject(subName: string, dependencies?: IFluidDependencyProvider) {
        const factory = await this._context.IFluidDataStoreRegistry?.get(subName) as
            DataObjectFactory<TestDataObject>;
        return factory.createChildInstance(this.context, undefined, dependencies);
    }
}

// eslint-disable-next-line @typescript-eslint/ban-types
export class TestDataObject extends TestDataObjectCore<object> {
    async preInitialize() {
        const arg: IArgument = {
            data: "data",
            get IArgument() { return this; },
        };
        this.createLoadableObject("argument", arg);
    }
}

export class TestDataObjectWithDependency extends TestDataObjectCore<IArgument> {
}

export class OldTestDataObject extends old.DataObject {
    public static readonly type = "@fluid-example/test-dataStore";
    public get _context() { return this.context; }
    public get _runtime() { return this.runtime; }
    public get _root() { return this.root; }
}

export const createPrimedDataStoreFactoryWithDependency = (
    registry: ChannelFactoryRegistry | undefined,
    countDependencies: number,
    type: string): [string, IFluidDataStoreFactory] =>
{
    const count = countDependencies - 1;
    return [type, new DataObjectFactory(
        type,
        TestDataObjectWithDependency,
        [... registry ?? []].map((r)=>r[1]),
        { IArgument },
        count < 0 ? [] : [
            createPrimedDataStoreFactoryWithDependency(registry, count, "dependency"),
            createPrimedDataStoreFactory(registry, count, "default"),
        ])];
};

export const createPrimedDataStoreFactory = (
    registry?: ChannelFactoryRegistry,
    countDependencies: number = 0,
    type = TestDataObject.type): [string, IFluidDataStoreFactory] =>
{
    const count = countDependencies - 1;
    return [type, new DataObjectFactory(
        type,
        TestDataObject,
        [... registry ?? []].map((r)=>r[1]),
        {},
        count < 0 ? [] : [
            createPrimedDataStoreFactoryWithDependency(registry, count, "dependency"),
            createPrimedDataStoreFactory(registry, count, "default"),
        ])];
};

export const createOldPrimedDataStoreFactory =
    (registry?: ChannelFactoryRegistry): old.IFluidDataStoreFactory => {
    return new old.DataObjectFactory(
        OldTestDataObject.type,
        OldTestDataObject,
        [... convertRegistry(registry)].map((r)=>r[1]),
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
            return createPrimedDataStoreFactory(containerOptions?.registry, 2)[1];
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

export const generateTest = (
    tests: (compatArgs: ICompatLocalTestObjectProvider) => void,
    options: ICompatTestOptions = {},
) => {
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
};

export const generateCompatTest = (
    tests: (compatArgs: ICompatLocalTestObjectProvider) => void,
    options: ICompatTestOptions = {},
) => {
    describe("compatibility", () => {
        describe("old loader, new runtime", function() {
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

        describe("new loader, old runtime", function() {
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

        describe("new ContainerRuntime, old DataStoreRuntime", function() {
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
    });
};

export const generateTestWithCompat = (
    tests: (compatArgs: ICompatLocalTestObjectProvider) => void,
    options: ICompatTestOptions = {},
) => {
    generateTest(tests, options);
    generateCompatTest(tests, options);
};
