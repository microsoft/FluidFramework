/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-extraneous-dependencies */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import {
    IFluidCodeDetails,
    IFluidModule,
    IProxyLoaderFactory,
    IRuntimeFactory,
} from "@fluidframework/container-definitions";
import { Container, Loader } from "@fluidframework/container-loader";
import { IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { LocalDocumentServiceFactory, LocalResolver } from "@fluidframework/local-driver";
import { SharedMap, SharedDirectory } from "@fluidframework/map";
import { ISummaryConfiguration } from "@fluidframework/protocol-definitions";
import { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import { SharedString } from "@fluidframework/sequence";
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
    makeTestContainer: (testFluidComponentFactoryRegistry?) => Promise<Container | old.Container>,
    deltaConnectionServer?: ILocalDeltaConnectionServer,
    documentServiceFactory?: LocalDocumentServiceFactory | old.LocalDocumentServiceFactory,
}

export interface ICompatTestOptions {
    /**
     * Use TestFluidComponent instead of PrimedComponent
     */
    testFluidComponent?: boolean,
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
            case SharedDirectory.getFactory().type: oldRegistry.push([key, old.SharedDirectory.getFactory()]); break;
            default: throw Error("Invalid or unimplemented channel factory");
        }
    }

    return oldRegistry;
}

export class TestComponent extends DataObject {
    public static readonly type = "@fluid-example/test-component";
    public get _runtime() { return this.runtime; }
    public get _root() { return this.root; }
}

export class OldTestComponent extends old.DataObject {
    public static readonly type = "@fluid-example/test-component";
    public get _runtime() { return this.runtime; }
    public get _root() { return this.root; }
}

export const createPrimedComponentFactory = (): IFluidDataStoreFactory => {
    return new DataObjectFactory(TestComponent.type, TestComponent, [], {});
};

export const createOldPrimedComponentFactory = (): old.IFluidDataStoreFactory => {
    return new old.DataObjectFactory(OldTestComponent.type, OldTestComponent, [], {});
};

export const createTestFluidComponentFactory = (registry: ChannelFactoryRegistry = []): IFluidDataStoreFactory => {
    return new TestFluidObjectFactory(registry);
};

export const createOldTestFluidComponentFactory = (registry?: ChannelFactoryRegistry): old.IFluidDataStoreFactory => {
    return new old.TestFluidComponentFactory(convertRegistry(registry));
};

export const createRuntimeFactory = (
    type: string,
    componentFactory: IFluidDataStoreFactory | old.IFluidDataStoreFactory,
    runtimeOptions: IContainerRuntimeOptions = { initialSummarizerDelayMs: 0 },
): IRuntimeFactory => {
    return new TestContainerRuntimeFactory(type, componentFactory as IFluidDataStoreFactory, runtimeOptions);
};

// TODO: once 0.25 is released this can import the old version of TestContainerRuntimeFactory used above
export const createOldRuntimeFactory = (
    type: string,
    componentFactory: IFluidDataStoreFactory | old.IFluidDataStoreFactory,
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
                [[type, Promise.resolve(componentFactory as old.IFluidDataStoreFactory)]],
                async (req, rt) => builder.handleRequest(req, rt),
                runtimeOptions,
            );
            if (!runtime.existing) {
                const componentRuntime = await runtime._createDataStore("default", type);
                await componentRuntime.request({ url: "/" });
                componentRuntime.bindToContext();
            }
            return runtime;
        },
    };
};

export async function createContainer(
    fluidModule: IFluidModule | old.IFluidModule,
    documentServiceFactory: LocalDocumentServiceFactory,
): Promise<Container> {
    const urlResolver = new LocalResolver();
    const codeLoader = new LocalCodeLoader([[codeDetails, fluidModule as IFluidModule]]);

    const loader = new Loader(
        urlResolver,
        documentServiceFactory,
        codeLoader,
        {},
        {},
        new Map<string, IProxyLoaderFactory>());
    return initializeLocalContainer(id, loader, codeDetails);
}

export async function createContainerWithOldLoader(
    fluidModule: IFluidModule | old.IFluidModule,
    documentServiceFactory: old.LocalDocumentServiceFactory,
): Promise<old.Container> {
    const urlResolver = new old.LocalResolver();
    const codeLoader = new old.LocalCodeLoader([[codeDetails, fluidModule as old.IFluidModule]]);

    const loader = new old.Loader(
        urlResolver,
        documentServiceFactory,
        codeLoader,
        {},
        {},
        new Map<string, old.IProxyLoaderFactory>());
    return old.initializeLocalContainer(id, loader, codeDetails);
}

export const compatTest = (
    tests: (compatArgs: ICompatTestArgs) => void,
    options: ICompatTestOptions = {},
) => {
    describe("old loader, new runtime", function() {
        let deltaConnectionServer: ILocalDeltaConnectionServer;
        let documentServiceFactory: old.LocalDocumentServiceFactory;
        const makeTestContainer = async (registry?: ChannelFactoryRegistry) => createContainerWithOldLoader(
            {
                fluidExport: createRuntimeFactory(
                    TestComponent.type,
                    options.testFluidComponent
                        ? createTestFluidComponentFactory(registry)
                        : createPrimedComponentFactory(),
                ),
            },
            documentServiceFactory,
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
            makeTestContainer,
            // These are getters because tests() is called before the beforeEach()
            // callback, at which point these are undefined.
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
        const makeTestContainer = async (registry: ChannelFactoryRegistry) => createContainer(
            {
                fluidExport: createOldRuntimeFactory(
                    OldTestComponent.type,
                    options.testFluidComponent
                        ? createOldTestFluidComponentFactory(registry)
                        : createOldPrimedComponentFactory(),
                ),
            },
            documentServiceFactory,
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
            makeTestContainer,
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
        const makeTestContainer = async (registry: ChannelFactoryRegistry) => createContainer(
            {
                fluidExport: createRuntimeFactory(
                    OldTestComponent.type,
                    options.testFluidComponent
                        ? createOldTestFluidComponentFactory(registry)
                        : createOldPrimedComponentFactory(),
                ),
            },
            documentServiceFactory,
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
            makeTestContainer,
            get deltaConnectionServer() { return deltaConnectionServer; },
            get documentServiceFactory() { return documentServiceFactory; },
        });

        afterEach(async function() {
            await deltaConnectionServer.webSocketServer.close();
        });
    });
};
