/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-extraneous-dependencies */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import {
    IContainer,
    IFluidCodeDetails,
    IFluidModule,
    ILoader,
    IRuntimeFactory,
} from "@fluidframework/container-definitions";
import { IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { IUrlResolver } from "@fluidframework/driver-definitions";
import { LocalResolver } from "@fluidframework/local-driver";
import { SharedMap } from "@fluidframework/map";
import { ISummaryConfiguration } from "@fluidframework/protocol-definitions";
import { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import { SharedString } from "@fluidframework/sequence";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import {
    ChannelFactoryRegistry,
    createAndAttachContainer,
    createLocalLoader,
    TestContainerRuntimeFactory,
    TestFluidObjectFactory,
} from "@fluidframework/test-utils";
import * as old from "./oldVersion";

/* eslint-enable import/no-extraneous-dependencies */

const documentId = "compatibilityTest";
const documentLoadUrl = `fluid-test://localhost/${documentId}`;
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
    makeTestContainer: (testFluidDataObjectFactoryRegistry?) => Promise<IContainer | old.IContainer>,
    loadTestContainer: (testFluidDataObjectFactoryRegistry?) => Promise<IContainer | old.IContainer>,
    deltaConnectionServer?: ILocalDeltaConnectionServer,
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
            case SharedMap.getFactory().type: oldRegistry.push([key, old.SharedMap.getFactory()]); break;
            case SharedString.getFactory().type: oldRegistry.push([key, old.SharedString.getFactory()]); break;
            default: throw Error("Invalid or unimplemented channel factory");
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

// TODO: once 0.25 is released this can import the old version of TestContainerRuntimeFactory used above
export const createOldRuntimeFactory = (
    type: string,
    dataStoreFactory: IFluidDataStoreFactory | old.IFluidDataStoreFactory,
    runtimeOptions: old.IContainerRuntimeOptions = { initialSummarizerDelayMs: 0 },
): old.IRuntimeFactory => {
    return new old.TestContainerRuntimeFactory(type, dataStoreFactory as old.IFluidDataStoreFactory, runtimeOptions);
};

export async function createContainer(
    fluidModule: IFluidModule | old.IFluidModule,
    deltaConnectionServer: ILocalDeltaConnectionServer,
    urlResolver: IUrlResolver,
): Promise<IContainer> {
    const loader: ILoader = createLocalLoader(
        [[codeDetails, fluidModule as IFluidModule]],
        deltaConnectionServer,
        urlResolver);
    return createAndAttachContainer(documentId, codeDetails, loader, urlResolver);
}

export async function loadContainer(
    fluidModule: IFluidModule | old.IFluidModule,
    deltaConnectionServer: ILocalDeltaConnectionServer,
    urlResolver: IUrlResolver,
): Promise<IContainer> {
    const loader: ILoader = createLocalLoader(
        [[codeDetails, fluidModule as IFluidModule]],
        deltaConnectionServer,
        urlResolver);
    return old.initializeLocalContainer(documentLoadUrl, loader, codeDetails) as unknown as IContainer;
}

export async function createContainerWithOldLoader(
    fluidModule: IFluidModule | old.IFluidModule,
    deltaConnectionServer: ILocalDeltaConnectionServer,
): Promise<old.IContainer> {
    const loader = old.createLocalLoader(
        [[codeDetails, fluidModule as old.IFluidModule]],
        deltaConnectionServer as any);
    return old.initializeLocalContainer(documentLoadUrl, loader, codeDetails);
}

export async function loadContainerWithOldLoader(
    fluidModule: IFluidModule | old.IFluidModule,
    deltaConnectionServer: ILocalDeltaConnectionServer,
): Promise<old.IContainer> {
    const loader = old.createLocalLoader(
        [[codeDetails, fluidModule as old.IFluidModule]],
        deltaConnectionServer as any);
    return old.initializeLocalContainer(documentLoadUrl, loader, codeDetails);
}

export const compatTest = (
    tests: (compatArgs: ICompatTestArgs) => void,
    options: ICompatTestOptions = {},
) => {
    describe("old loader, new runtime", function() {
        let deltaConnectionServer: ILocalDeltaConnectionServer;
        let urlResolver: IUrlResolver;
        const runtimeFactory = (registry?: ChannelFactoryRegistry) => createRuntimeFactory(
            TestDataObject.type,
            options.testFluidDataObject
                ? createTestFluidDataStoreFactory(registry)
                : createPrimedDataStoreFactory(),
        );

        const makeTestContainer = async (registry?: ChannelFactoryRegistry) => createContainerWithOldLoader(
            {
                fluidExport: runtimeFactory(registry),
            },
            deltaConnectionServer,
        );
        const loadTestContainer = async (registry?: ChannelFactoryRegistry) => loadContainerWithOldLoader(
            {
                fluidExport: runtimeFactory(registry),
            },
            deltaConnectionServer,
        );

        beforeEach(async function() {
            deltaConnectionServer = LocalDeltaConnectionServer.create(
                undefined,
                // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
                { summary: { maxOps: 1 } as ISummaryConfiguration },
            );
            urlResolver = new LocalResolver();
        });

        tests({
            makeTestContainer,
            loadTestContainer,
            // These are getters because tests() is called before the beforeEach() callback, at which point
            // these are undefined.
            get deltaConnectionServer() { return deltaConnectionServer; },
            get urlResolver() { return urlResolver; },
        });

        afterEach(async function() {
            await deltaConnectionServer.webSocketServer.close();
        });
    });

    describe("new loader, old runtime", function() {
        let deltaConnectionServer: ILocalDeltaConnectionServer;
        let urlResolver: IUrlResolver;
        const runtimeFactory = (registry?: ChannelFactoryRegistry) => createOldRuntimeFactory(
            OldTestDataObject.type,
            options.testFluidDataObject
                ? createOldTestFluidDataStoreFactory(registry)
                : createOldPrimedDataStoreFactory(),
        );

        const makeTestContainer = async (registry: ChannelFactoryRegistry) => createContainer(
            {
                fluidExport: runtimeFactory(registry),
            },
            deltaConnectionServer,
            urlResolver,
        );
        const loadTestContainer = async (registry: ChannelFactoryRegistry) => loadContainer(
            {
                fluidExport: runtimeFactory(registry),
            },
            deltaConnectionServer,
            urlResolver,
        );

        beforeEach(async function() {
            deltaConnectionServer = LocalDeltaConnectionServer.create(
                undefined,
                // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
                { summary: { maxOps: 1 } as ISummaryConfiguration },
            );
            urlResolver = new LocalResolver();
        });

        tests({
            makeTestContainer,
            loadTestContainer,
            get deltaConnectionServer() { return deltaConnectionServer; },
            get urlResolver() { return urlResolver; },
        });

        afterEach(async function() {
            await deltaConnectionServer.webSocketServer.close();
        });
    });

    describe("new ContainerRuntime, old DataStoreRuntime", function() {
        let deltaConnectionServer: ILocalDeltaConnectionServer;
        let urlResolver: IUrlResolver;
        const runtimeFactory = (registry?: ChannelFactoryRegistry) => createRuntimeFactory(
            OldTestDataObject.type,
            options.testFluidDataObject
                ? createOldTestFluidDataStoreFactory(registry)
                : createOldPrimedDataStoreFactory(),
        );

        const makeTestContainer = async (registry: ChannelFactoryRegistry) => createContainer(
            {
                fluidExport: runtimeFactory(registry),
            },
            deltaConnectionServer,
            urlResolver,
        );
        const loadTestContainer = async (registry: ChannelFactoryRegistry) => loadContainer(
            {
                fluidExport: runtimeFactory(registry),
            },
            deltaConnectionServer,
            urlResolver,
        );

        beforeEach(async function() {
            deltaConnectionServer = LocalDeltaConnectionServer.create(
                undefined,
                // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
                { summary: { maxOps: 1 } as ISummaryConfiguration },
            );
            urlResolver = new LocalResolver();
        });

        tests({
            makeTestContainer,
            loadTestContainer,
            get deltaConnectionServer() { return deltaConnectionServer; },
            get urlResolver() { return urlResolver; },
        });

        afterEach(async function() {
            await deltaConnectionServer.webSocketServer.close();
        });
    });
};
