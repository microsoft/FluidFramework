/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-extraneous-dependencies */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import {
    IFluidCodeDetails,
    IFluidModule,
    ILoader,
    IRuntimeFactory,
} from "@fluidframework/container-definitions";
import { Container } from "@fluidframework/container-loader";
import { IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { SharedMap } from "@fluidframework/map";
import { ISummaryConfiguration } from "@fluidframework/protocol-definitions";
import { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import { SharedString } from "@fluidframework/sequence";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import {
    ChannelFactoryRegistry,
    createLocalLoader,
    initializeLocalContainer,
    TestContainerRuntimeFactory,
    TestFluidObjectFactory,
} from "@fluidframework/test-utils";
import * as old from "./oldVersion";

/* eslint-enable import/no-extraneous-dependencies */

const id = "fluid-test://localhost/compatibilityTest";
const codeDetails: IFluidCodeDetails = {
    package: "compatibilityTestPackage",
    config: {},
};

/**
 * Arguments given to the function passed into compatTest()
 */
export interface ICompatTestArgs {
    /**
     * Used to create a test Container. In compatTest(), this Container and its runtime will be arbitrarily-versioned.
     */
    makeTestContainer: (testFluidDataStoreFactoryRegistry?) => Promise<Container | old.Container>,
    deltaConnectionServer?: ILocalDeltaConnectionServer,
}

export interface ICompatTestOptions {
    /**
     * Use TestFluidDataStore instead of PrimedComponent
     */
    testFluidDataStore?: boolean,
}

// TODO: once 0.25 is released this can be replaced with the old imported type
type OldChannelFactoryRegistry = Iterable<[string | undefined, old.IChannelFactory]>;

// convert a channel factory registry for TestFluidComponentFactory to one with old channel factories
function convertRegistry(registry: ChannelFactoryRegistry = []): OldChannelFactoryRegistry {
    const oldRegistry = [];
    for (const [key, factory] of registry) {
        switch (factory.type) {
            case SharedMap.getFactory().type: oldRegistry.push([key, old.SharedMap.getFactory()]); break;
            case SharedString.getFactory().type: oldRegistry.push([key, old.SharedString.getFactory()]); break;
            default: throw Error("Invalid or unimplemented channel factory");
        }
    }

    return oldRegistry;
}

export class TestDataStore extends DataObject {
    public static readonly type = "@fluid-example/test-dataStore";
    public get _runtime() { return this.runtime; }
    public get _root() { return this.root; }
}

export class OldTestDataStore extends old.DataObject {
    public static readonly type = "@fluid-example/test-dataStore";
    public get _runtime() { return this.runtime; }
    public get _root() { return this.root; }
}

export const createPrimedDataStoreFactory = (): IFluidDataStoreFactory => {
    return new DataObjectFactory(TestDataStore.type, TestDataStore, [], {});
};

export const createOldPrimedDataStoreFactory = (): old.IFluidDataStoreFactory => {
    return new old.DataObjectFactory(OldTestDataStore.type, OldTestDataStore, [], {});
};

export const createTestFluidDataStoreFactory = (registry: ChannelFactoryRegistry = []): IFluidDataStoreFactory => {
    return new TestFluidObjectFactory(registry);
};

export const createOldTestFluidDataStoreFactory = (registry?: ChannelFactoryRegistry): old.IFluidDataStoreFactory => {
    return new old.TestFluidComponentFactory(convertRegistry(registry));
};

export const createRuntimeFactory = (
    type: string,
    DataStoreFactory: IFluidDataStoreFactory | old.IFluidDataStoreFactory,
    runtimeOptions: IContainerRuntimeOptions = { initialSummarizerDelayMs: 0 },
): IRuntimeFactory => {
    return new TestContainerRuntimeFactory(type, DataStoreFactory as IFluidDataStoreFactory, runtimeOptions);
};

// TODO: once 0.25 is released this can import the old version of TestContainerRuntimeFactory used above
export const createOldRuntimeFactory = (
    type: string,
    dataStoreFactory: IFluidDataStoreFactory | old.IFluidDataStoreFactory,
    runtimeOptions: old.IContainerRuntimeOptions = { initialSummarizerDelayMs: 0 },
): old.IRuntimeFactory => {
    const builder = new old.RuntimeRequestHandlerBuilder();
    builder.pushHandler(
        old.dataStoreRuntimeRequestHandler,
        old.defaultDataStoreRuntimeRequestHandler("default"));

    return {
        get IRuntimeFactory() { return this; },
        instantiateRuntime: async (context: old.IContainerContext) => {
            const runtime = await old.ContainerRuntime.load(
                context,
                [[type, Promise.resolve(dataStoreFactory as old.IFluidDataStoreFactory)]],
                async (req, rt) => builder.handleRequest(req, rt),
                runtimeOptions,
            );
            if (!runtime.existing) {
                const dataStoreRuntime = await runtime._createDataStore("default", type);
                await dataStoreRuntime.request({ url: "/" });
                dataStoreRuntime.bindToContext();
            }
            return runtime;
        },
    };
};

export async function createContainer(
    fluidModule: IFluidModule | old.IFluidModule,
    deltaConnectionServer: ILocalDeltaConnectionServer,
): Promise<Container> {
    const loader: ILoader = createLocalLoader([[codeDetails, fluidModule as IFluidModule]], deltaConnectionServer);
    return initializeLocalContainer(id, loader, codeDetails);
}

export async function createContainerWithOldLoader(
    fluidModule: IFluidModule | old.IFluidModule,
    deltaConnectionServer: ILocalDeltaConnectionServer,
): Promise<old.Container> {
    const loader = old.createLocalLoader(
        [[codeDetails, fluidModule as old.IFluidModule]],
        deltaConnectionServer as any);
    return old.initializeLocalContainer(id, loader, codeDetails);
}

export const compatTest = (
    tests: (compatArgs: ICompatTestArgs) => void,
    options: ICompatTestOptions = {},
) => {
    describe("old loader, new runtime", function() {
        let deltaConnectionServer: ILocalDeltaConnectionServer;
        const makeTestContainer = async (registry?: ChannelFactoryRegistry) => createContainerWithOldLoader(
            {
                fluidExport: createRuntimeFactory(
                    TestDataStore.type,
                    options.testFluidDataStore
                        ? createTestFluidDataStoreFactory(registry)
                        : createPrimedDataStoreFactory(),
                ),
            },
            deltaConnectionServer,
        );

        beforeEach(async function() {
            deltaConnectionServer = LocalDeltaConnectionServer.create(
                undefined,
                // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
                { summary: { maxOps: 1 } as ISummaryConfiguration },
            );
        });

        tests({
            makeTestContainer,
            // This is a getter because tests() is called before the beforeEach()
            // callback, at which point deltaConnectionServer is undefined.
            get deltaConnectionServer() { return deltaConnectionServer; },
        });

        afterEach(async function() {
            await deltaConnectionServer.webSocketServer.close();
        });
    });

    describe("new loader, old runtime", function() {
        let deltaConnectionServer: ILocalDeltaConnectionServer;
        const makeTestContainer = async (registry: ChannelFactoryRegistry) => createContainer(
            {
                fluidExport: createOldRuntimeFactory(
                    OldTestDataStore.type,
                    options.testFluidDataStore
                        ? createOldTestFluidDataStoreFactory(registry)
                        : createOldPrimedDataStoreFactory(),
                ),
            },
            deltaConnectionServer,
        );

        beforeEach(async function() {
            deltaConnectionServer = LocalDeltaConnectionServer.create(
                undefined,
                // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
                { summary: { maxOps: 1 } as ISummaryConfiguration },
            );
        });

        tests({
            makeTestContainer,
            get deltaConnectionServer() { return deltaConnectionServer; },
        });

        afterEach(async function() {
            await deltaConnectionServer.webSocketServer.close();
        });
    });

    describe("new ContainerRuntime, old DataStoreRuntime", function() {
        let deltaConnectionServer: ILocalDeltaConnectionServer;
        const makeTestContainer = async (registry: ChannelFactoryRegistry) => createContainer(
            {
                fluidExport: createRuntimeFactory(
                    OldTestDataStore.type,
                    options.testFluidDataStore
                        ? createOldTestFluidDataStoreFactory(registry)
                        : createOldPrimedDataStoreFactory(),
                ),
            },
            deltaConnectionServer,
        );

        beforeEach(async function() {
            deltaConnectionServer = LocalDeltaConnectionServer.create(
                undefined,
                // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
                { summary: { maxOps: 1 } as ISummaryConfiguration },
            );
        });

        tests({
            makeTestContainer,
            get deltaConnectionServer() { return deltaConnectionServer; },
        });

        afterEach(async function() {
            await deltaConnectionServer.webSocketServer.close();
        });
    });
};
