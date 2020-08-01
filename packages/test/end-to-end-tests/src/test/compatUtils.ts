/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-extraneous-dependencies */

import { DataObject, DataObjectFactory, defaultDataStoreRuntimeRequestHandler } from "@fluidframework/aqueduct";
import {
    IContainerContext,
    IFluidCodeDetails,
    IFluidModule,
    ILoader,
    IRuntimeFactory,
} from "@fluidframework/container-definitions";
import { Container } from "@fluidframework/container-loader";
import { ContainerRuntime, IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { SharedMap } from "@fluidframework/map";
import { ISummaryConfiguration } from "@fluidframework/protocol-definitions";
import { componentRuntimeRequestHandler, RuntimeRequestHandlerBuilder } from "@fluidframework/request-handler";
import { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import { SharedString } from "@fluidframework/sequence";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { createLocalLoader, initializeLocalContainer, TestFluidComponentFactory } from "@fluidframework/test-utils";
import * as old from "./oldVersion";

/* eslint-enable import/no-extraneous-dependencies */

const id = "fluid-test://localhost/compatibilityTest";
const codeDetails: IFluidCodeDetails = {
    package: "compatibilityTestPackage",
    config: {},
};

export const enum testFluidObjectKeys {
    map = "mapKey",
    sharedString = "sharedStringKey",
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

export const createTestFluidComponentFactory = (): IFluidDataStoreFactory => {
    return new TestFluidComponentFactory([
        [testFluidObjectKeys.map, SharedMap.getFactory()],
        [testFluidObjectKeys.sharedString, SharedString.getFactory()],
    ]);
};

export const createOldTestFluidComponentFactory = (): old.IFluidDataStoreFactory => {
    return new old.TestFluidComponentFactory([
        [testFluidObjectKeys.map, old.SharedMap.getFactory()],
        [testFluidObjectKeys.sharedString, old.SharedString.getFactory()],
    ]);
};

export const createRuntimeFactory = (
    type: string,
    componentFactory: IFluidDataStoreFactory | old.IFluidDataStoreFactory,
    runtimeOptions: IContainerRuntimeOptions = { initialSummarizerDelayMs: 0 },
): IRuntimeFactory => {
    const builder = new RuntimeRequestHandlerBuilder();
    builder.pushHandler(
        componentRuntimeRequestHandler,
        defaultDataStoreRuntimeRequestHandler("default"));

    return {
        get IRuntimeFactory() { return this; },
        instantiateRuntime: async (context: IContainerContext) => {
            const runtime = await ContainerRuntime.load(
                context,
                [[type, Promise.resolve(componentFactory as IFluidDataStoreFactory)]],
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

export const createOldRuntimeFactory = (
    type: string,
    componentFactory: IFluidDataStoreFactory | old.IFluidDataStoreFactory,
    runtimeOptions: old.IContainerRuntimeOptions = { initialSummarizerDelayMs: 0 },
): old.IRuntimeFactory => {
    const builder = new old.RuntimeRequestHandlerBuilder();
    builder.pushHandler(
        old.componentRuntimeRequestHandler,
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

export interface ICompatTestArgs {
    /**
     * Used to create a test Container. In compatTest(), this Container and its runtime will be arbitrarily-versioned.
     */
    makeTestContainer: () => Promise<Container | old.Container>,
    deltaConnectionServer?: ILocalDeltaConnectionServer,
}

export interface ICompatTestOptions {
    /**
     * Use TestFluidComponent instead of PrimedComponent
     */
    testFluidComponent?: boolean,
}

export const compatTest = (
    tests: (compatArgs: ICompatTestArgs) => void,
    options: ICompatTestOptions = {},
) => {
    describe("old loader, new runtime", function() {
        let deltaConnectionServer: ILocalDeltaConnectionServer;
        const makeTestContainer = async () => createContainerWithOldLoader(
            { fluidExport: createRuntimeFactory(
                TestComponent.type,
                options.testFluidComponent
                    ? createTestFluidComponentFactory()
                    : createPrimedComponentFactory(),
            ) },
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
        const makeTestContainer = async () => createContainer(
            { fluidExport: createOldRuntimeFactory(
                OldTestComponent.type,
                options.testFluidComponent
                    ? createOldTestFluidComponentFactory()
                    : createOldPrimedComponentFactory(),
            ) },
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
        const makeTestContainer = async () => createContainer(
            { fluidExport: createRuntimeFactory(
                OldTestComponent.type,
                options.testFluidComponent
                    ? createOldTestFluidComponentFactory()
                    : createOldPrimedComponentFactory(),
            ) },
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
