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
    IFluidModule,
    ILoader,
    IProxyLoaderFactory,
    IRuntimeFactory,
} from "@fluidframework/container-definitions";
import { Loader } from "@fluidframework/container-loader";
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
    createAndAttachContainer,
    createLocalLoader,
    LocalCodeLoader,
    TestContainerRuntimeFactory,
    TestFluidObjectFactory,
} from "@fluidframework/test-utils";
import * as old from "./oldVersion";

/* eslint-enable import/no-extraneous-dependencies */

const documentId = "compatibilityTest";
const documentLoadUrl = `fluid-test://localhost/${documentId}`;
const defaultCodeDetails: IFluidCodeDetails = {
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
    makeTestContainer?: (testFluidDataStoreFactoryRegistry?) => Promise<IContainer | old.IContainer>,
    loadTestContainer?: (testFluidDataObjectFactoryRegistry?) => Promise<IContainer | old.IContainer>,
    makeTestLoader?: (testFluidDataStoreFactoryRegistry?, codeDetails?: IFluidCodeDetails, urlResolver?: IUrlResolver)
        => ILoader | old.ILoader,
    deltaConnectionServer?: ILocalDeltaConnectionServer,
    documentServiceFactory?: LocalDocumentServiceFactory | old.LocalDocumentServiceFactory,
    urlResolver?: IUrlResolver,
}

export interface ICompatTestOptions {
    /**
     * Use TestFluidDataObject instead of PrimedDataStore
     */
    testFluidDataObject?: boolean,
}

// TODO: once 0.25 is released this can be replaced with the old imported type
type OldChannelFactoryRegistry = Iterable<[string | undefined, old.IChannelFactory]>;

// convert a channel factory registry for TestFluidDataStoreFactory to one with old channel factories
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
            default:
                throw Error(`Invalid or unimplemented channel factory: ${factory.type}`);
        }
    }

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
    // TODO: once 0.26 is released this can use the old version of TestContainerRuntimeFactory:
    // return new old.TestContainerRuntimeFactory(type, dataStoreFactory as old.IFluidDataStoreFactory, runtimeOptions);
    const factory = new TestContainerRuntimeFactory(type, dataStoreFactory as IFluidDataStoreFactory, runtimeOptions);
    return factory as unknown as old.IRuntimeFactory;
};

export function createLoader(
    fluidModule: IFluidModule | old.IFluidModule,
    documentServiceFactory: LocalDocumentServiceFactory,
    codeDetails = defaultCodeDetails,
    urlResolver: IUrlResolver = new LocalResolver(),
): ILoader {
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
    codeDetails = defaultCodeDetails,
    urlResolver: IUrlResolver = new old.LocalResolver(),
): old.ILoader {
    const codeLoader = new old.LocalCodeLoader([[codeDetails, fluidModule as old.IFluidModule]]);

    return new old.Loader(
        urlResolver,
        documentServiceFactory,
        codeLoader,
        {},
        {},
        new Map<string, old.IProxyLoaderFactory>());
}

export const createContainer = async (
    loader: ILoader,
    urlResolver: IUrlResolver,
): Promise<IContainer> => {
    return createAndAttachContainer(documentId, defaultCodeDetails, loader, urlResolver);
};

export const createContainerWithOldLoader = async (
    loader: old.ILoader,
    urlResolver: IUrlResolver,
): Promise<old.IContainer> => {
    return old.createAndAttachContainer(documentId, defaultCodeDetails, loader, urlResolver);
};

export async function loadContainer(
    fluidModule: IFluidModule | old.IFluidModule,
    deltaConnectionServer: ILocalDeltaConnectionServer,
    urlResolver: IUrlResolver,
): Promise<IContainer> {
    const loader: ILoader = createLocalLoader(
        [[defaultCodeDetails, fluidModule as IFluidModule]],
        deltaConnectionServer,
        urlResolver);
    return loader.resolve({ url: documentLoadUrl });
}

export async function loadContainerWithOldLoader(
    fluidModule: IFluidModule | old.IFluidModule,
    deltaConnectionServer: ILocalDeltaConnectionServer,
    urlResolver: IUrlResolver,
): Promise<old.IContainer> {
    const loader = old.createLocalLoader(
        [[defaultCodeDetails, fluidModule as old.IFluidModule]],
        deltaConnectionServer as any,
        urlResolver);
    return loader.resolve({ url: documentLoadUrl });
}

export const compatTest = (
    tests: (compatArgs: ICompatTestArgs) => void,
    options: ICompatTestOptions = {},
) => {
    describe("old loader, new runtime", function() {
        let deltaConnectionServer: ILocalDeltaConnectionServer;
        let documentServiceFactory: old.LocalDocumentServiceFactory;
        let defaultResolver: IUrlResolver;

        const runtimeFactory = (registry?: ChannelFactoryRegistry) => createRuntimeFactory(
            TestDataObject.type,
            options.testFluidDataObject
                ? createTestFluidDataStoreFactory(registry)
                : createPrimedDataStoreFactory(),
        );

        const makeTestLoader = (
            registry?: ChannelFactoryRegistry,
            codeDetails?: IFluidCodeDetails,
            urlResolver?: IUrlResolver,
        ) => {
            return createOldLoader(
                { fluidExport: runtimeFactory(registry) },
                documentServiceFactory,
                codeDetails,
                urlResolver,
            );
        };

        const makeTestContainer = async (registry?: ChannelFactoryRegistry) => createContainerWithOldLoader(
            makeTestLoader(registry, undefined, defaultResolver),
            defaultResolver,
        );

        const loadTestContainer = async (registry?: ChannelFactoryRegistry) => loadContainerWithOldLoader(
            {
                fluidExport: runtimeFactory(registry),
            },
            deltaConnectionServer,
            defaultResolver,
        );

        beforeEach(async function() {
            deltaConnectionServer = LocalDeltaConnectionServer.create(
                undefined,
                // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
                { summary: { maxOps: 1 } as ISummaryConfiguration },
            );
            documentServiceFactory = new old.LocalDocumentServiceFactory(deltaConnectionServer);
            defaultResolver = new LocalResolver();
        });

        tests({
            makeTestLoader,
            makeTestContainer,
            loadTestContainer,
            // These are getters because tests() is called before the beforeEach() callback, at which point
            // these are undefined.
            get deltaConnectionServer() { return deltaConnectionServer; },
            get documentServiceFactory() { return documentServiceFactory; },
            get urlResolver() { return defaultResolver; },
        });

        afterEach(async function() {
            await deltaConnectionServer.webSocketServer.close();
        });
    });

    describe("new loader, old runtime", function() {
        let deltaConnectionServer: ILocalDeltaConnectionServer;
        let documentServiceFactory: LocalDocumentServiceFactory;
        let defaultResolver: IUrlResolver;

        const runtimeFactory = (registry?: ChannelFactoryRegistry) => createOldRuntimeFactory(
            OldTestDataObject.type,
            options.testFluidDataObject
                ? createOldTestFluidDataStoreFactory(registry)
                : createOldPrimedDataStoreFactory(),
        );

        const makeTestLoader = (
            registry: ChannelFactoryRegistry,
            codeDetails?: IFluidCodeDetails,
            urlResolver?: IUrlResolver,
        ) => {
            return createLoader(
                { fluidExport: runtimeFactory(registry) },
                documentServiceFactory,
                codeDetails,
                urlResolver,
            );
        };

        const makeTestContainer = async (registry: ChannelFactoryRegistry) => createContainer(
            makeTestLoader(registry, undefined, defaultResolver),
            defaultResolver,
        );

        const loadTestContainer = async (registry: ChannelFactoryRegistry) => loadContainer(
            {
                fluidExport: runtimeFactory(registry),
            },
            deltaConnectionServer,
            defaultResolver,
        );

        beforeEach(async function() {
            deltaConnectionServer = LocalDeltaConnectionServer.create(
                undefined,
                // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
                { summary: { maxOps: 1 } as ISummaryConfiguration },
            );
            documentServiceFactory = new LocalDocumentServiceFactory(deltaConnectionServer);
            defaultResolver = new LocalResolver();
        });

        tests({
            makeTestLoader,
            makeTestContainer,
            loadTestContainer,
            get deltaConnectionServer() { return deltaConnectionServer; },
            get documentServiceFactory() { return documentServiceFactory; },
            get urlResolver() { return defaultResolver; },
        });

        afterEach(async function() {
            await deltaConnectionServer.webSocketServer.close();
        });
    });

    describe("new ContainerRuntime, old DataStoreRuntime", function() {
        let deltaConnectionServer: ILocalDeltaConnectionServer;
        let documentServiceFactory: LocalDocumentServiceFactory;
        let defaultResolver: IUrlResolver;

        const runtimeFactory = (registry?: ChannelFactoryRegistry) => createRuntimeFactory(
            OldTestDataObject.type,
            options.testFluidDataObject
                ? createOldTestFluidDataStoreFactory(registry)
                : createOldPrimedDataStoreFactory(),
        );

        const makeTestLoader = (
            registry: ChannelFactoryRegistry,
            codeDetails?: IFluidCodeDetails,
            urlResolver?: IUrlResolver,
        ) => {
            return createLoader(
                { fluidExport: runtimeFactory(registry) },
                documentServiceFactory,
                codeDetails,
                urlResolver,
            );
        };

        const makeTestContainer = async (registry: ChannelFactoryRegistry) => createContainer(
            makeTestLoader(registry, undefined, defaultResolver),
            defaultResolver,
        );

        const loadTestContainer = async (registry: ChannelFactoryRegistry) => loadContainer(
            {
                fluidExport: runtimeFactory(registry),
            },
            deltaConnectionServer,
            defaultResolver,
        );

        beforeEach(async function() {
            deltaConnectionServer = LocalDeltaConnectionServer.create(
                undefined,
                // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
                { summary: { maxOps: 1 } as ISummaryConfiguration },
            );
            documentServiceFactory = new LocalDocumentServiceFactory(deltaConnectionServer);
            defaultResolver = new LocalResolver();
        });

        tests({
            makeTestLoader,
            makeTestContainer,
            loadTestContainer,
            get deltaConnectionServer() { return deltaConnectionServer; },
            get documentServiceFactory() { return documentServiceFactory; },
            get urlResolver() { return defaultResolver; },
        });

        afterEach(async function() {
            await deltaConnectionServer.webSocketServer.close();
        });
    });
};
