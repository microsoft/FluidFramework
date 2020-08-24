/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-extraneous-dependencies */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { SharedCell } from "@fluidframework/cell";
import {
    IFluidCodeDetails,
    IFluidModule,
    ILoader,
    IProxyLoaderFactory,
    IRuntimeFactory,
} from "@fluidframework/container-definitions";
import { Container, Loader } from "@fluidframework/container-loader";
import { IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { IUrlResolver } from "@fluidframework/driver-definitions";
import { Ink } from "@fluidframework/ink";
import { LocalDocumentServiceFactory, LocalResolver } from "@fluidframework/local-driver";
import { SharedDirectory, SharedMap } from "@fluidframework/map";
import { SharedMatrix } from "@fluidframework/matrix";
import { ConsensusQueue } from "@fluidframework/ordered-collection";
import { ISummaryConfiguration } from "@fluidframework/protocol-definitions";
import { ConsensusRegisterCollection } from "@fluidframework/register-collection";
import { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import { SharedString, SparseMatrix } from "@fluidframework/sequence";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import {
    ChannelFactoryRegistry,
    initializeLocalContainer,
    LocalCodeLoader,
    TestContainerRuntimeFactory,
    TestFluidObjectFactory,
} from "@fluidframework/test-utils";
import * as old from "./oldVersion";

/* eslint-enable import/no-extraneous-dependencies */

const id = "fluid-test://localhost/detachedContainerTest";
const codeDetails: IFluidCodeDetails = {
    package: "detachedContainerTestPackage",
    config: {},
};

/**
 * Arguments given to the function passed into compatTest()
 */
export interface ICompatTestArgs {
    /**
     * Used to create a test Container. In compatTest(), this Container and its runtime will be arbitrarily-versioned.
     */
    makeTestContainer?: (testFluidDataStoreFactoryRegistry?) => Promise<Container | old.Container>,
    makeTestLoader?: (testFluidDataStoreFactoryRegistry?, urlResolver?: IUrlResolver) => ILoader | old.ILoader,
    deltaConnectionServer?: ILocalDeltaConnectionServer,
    documentServiceFactory?: LocalDocumentServiceFactory | old.LocalDocumentServiceFactory,
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
            default: throw Error(`Invalid or unimplemented channel factory: ${factory.type}`);
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
    return new old.ContainerRuntimeFactoryWithDefaultDataStore(
        "default",
        [["default", Promise.resolve(dataStoreFactory as old.IFluidDataStoreFactory)]]);
    // const builder = new old.RuntimeRequestHandlerBuilder();
    // builder.pushHandler(
    //     old.dataStoreRuntimeRequestHandler,
    //     old.defaultDataStoreRuntimeRequestHandler("default"));

    // return {
    //     get IRuntimeFactory() { return this; },
    //     instantiateRuntime: async (context: old.IContainerContext) => {
    //         const runtime = await old.ContainerRuntime.load(
    //             context,
    //             [
    //                 ["default", Promise.resolve(dataStoreFactory as old.IFluidDataStoreFactory)],
    //                 [type, Promise.resolve(dataStoreFactory as old.IFluidDataStoreFactory)],
    //             ],
    //             async (req, rt) => builder.handleRequest(req, rt),
    //             runtimeOptions,
    //         );
    //         if (!runtime.existing) {
    //             const dataStoreRuntime = await runtime._createDataStore("default", type);
    //             await dataStoreRuntime.request({ url: "/" });
    //             dataStoreRuntime.bindToContext();
    //         }
    //         return runtime;
    //     },
    // };
};

export const createContainer = async (loader: ILoader): Promise<Container> => {
    return initializeLocalContainer(id, loader, codeDetails);
};

export const createContainerWithOldLoader = async (loader: old.ILoader): Promise<old.Container> => {
    return old.initializeLocalContainer(id, loader, codeDetails);
};

export function createLoader(
    fluidModule: IFluidModule | old.IFluidModule,
    documentServiceFactory: LocalDocumentServiceFactory,
    urlResolver: IUrlResolver = new LocalResolver(),
): ILoader {
    // return createLocalLoader([[codeDetails, fluidModule as IFluidModule]], deltaConnectionServer);
    const codeLoader = new LocalCodeLoader([[codeDetails, fluidModule as IFluidModule]]);

    return new Loader(
        urlResolver,
        documentServiceFactory,
        codeLoader,
        {},
        {},
        new Map<string, IProxyLoaderFactory>());
}

export function createOldLoader(
    fluidModule: IFluidModule | old.IFluidModule,
    documentServiceFactory: old.LocalDocumentServiceFactory,
    urlResolver: IUrlResolver = new old.LocalResolver(),
): old.ILoader {
    // return old.createLocalLoader(
    //     [[codeDetails, fluidModule as old.IFluidModule]],
    //     deltaConnectionServer as any
    // );
    const codeLoader = new old.LocalCodeLoader([[codeDetails, fluidModule as old.IFluidModule]]);

    return new old.Loader(
        urlResolver,
        documentServiceFactory,
        codeLoader,
        {},
        {},
        new Map<string, old.IProxyLoaderFactory>());
}

export const compatTest = (
    tests: (compatArgs: ICompatTestArgs) => void,
    options: ICompatTestOptions = {},
) => {
    describe("old loader, new runtime", function() {
        let deltaConnectionServer: ILocalDeltaConnectionServer;
        let documentServiceFactory: old.LocalDocumentServiceFactory;

        const makeTestLoader = (registry?: ChannelFactoryRegistry, urlResolver?: IUrlResolver) => createOldLoader(
            {
                fluidExport: createRuntimeFactory(
                    TestDataStore.type,
                    options.testFluidDataStore
                        ? createTestFluidDataStoreFactory(registry)
                        : createPrimedDataStoreFactory(),
                ),
            },
            documentServiceFactory,
            urlResolver,
        );

        beforeEach(async function() {
            deltaConnectionServer = LocalDeltaConnectionServer.create(
                undefined,
                // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
                { summary: { maxOps: 1 } as ISummaryConfiguration },
            );
            documentServiceFactory = new old.LocalDocumentServiceFactory(deltaConnectionServer);
        });

        tests({
            makeTestLoader,
            makeTestContainer: async (registry?) => createContainerWithOldLoader(makeTestLoader(registry)),
            // This is a getter because tests() is called before the beforeEach()
            // callback, at which point deltaConnectionServer is undefined.
            get deltaConnectionServer() { return deltaConnectionServer; },
            get documentServiceFactory() { return documentServiceFactory; },
        });

        afterEach(async function() {
            await deltaConnectionServer.webSocketServer.close();
        });
    });

    describe("new loader, old runtime", function() {
        let deltaConnectionServer: ILocalDeltaConnectionServer;
        let documentServiceFactory: LocalDocumentServiceFactory;
        const makeTestLoader = (registry: ChannelFactoryRegistry, urlResolver?: IUrlResolver) => createLoader(
            {
                fluidExport: createOldRuntimeFactory(
                    OldTestDataStore.type,
                    options.testFluidDataStore
                        ? createOldTestFluidDataStoreFactory(registry)
                        : createOldPrimedDataStoreFactory(),
                ),
            },
            documentServiceFactory,
            urlResolver,
        );

        beforeEach(async function() {
            deltaConnectionServer = LocalDeltaConnectionServer.create(
                undefined,
                // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
                { summary: { maxOps: 1 } as ISummaryConfiguration },
            );
            documentServiceFactory = new LocalDocumentServiceFactory(deltaConnectionServer);
        });

        tests({
            makeTestLoader,
            makeTestContainer: async (registry?) => createContainer(makeTestLoader(registry)),
            get deltaConnectionServer() { return deltaConnectionServer; },
            get documentServiceFactory() { return documentServiceFactory; },
        });

        afterEach(async function() {
            await deltaConnectionServer.webSocketServer.close();
        });
    });

    describe("new ContainerRuntime, old DataStoreRuntime", function() {
        let deltaConnectionServer: ILocalDeltaConnectionServer;
        let documentServiceFactory: LocalDocumentServiceFactory;
        const makeTestLoader = (registry: ChannelFactoryRegistry, urlResolver?: IUrlResolver) => createLoader(
            {
                fluidExport: createRuntimeFactory(
                    OldTestDataStore.type,
                    options.testFluidDataStore
                        ? createOldTestFluidDataStoreFactory(registry)
                        : createOldPrimedDataStoreFactory(),
                ),
            },
            documentServiceFactory,
            urlResolver,
        );

        beforeEach(async function() {
            deltaConnectionServer = LocalDeltaConnectionServer.create(
                undefined,
                // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
                { summary: { maxOps: 1 } as ISummaryConfiguration },
            );
            documentServiceFactory = new LocalDocumentServiceFactory(deltaConnectionServer);
        });

        tests({
            makeTestLoader,
            makeTestContainer: async (registry?) => createContainer(makeTestLoader(registry)),
            get deltaConnectionServer() { return deltaConnectionServer; },
            get documentServiceFactory() { return documentServiceFactory; },
        });

        afterEach(async function() {
            await deltaConnectionServer.webSocketServer.close();
        });

        after(async function() {
            await new Promise(() => null);
        });
    });
};
