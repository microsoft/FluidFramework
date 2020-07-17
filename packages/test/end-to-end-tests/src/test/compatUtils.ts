/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-extraneous-dependencies */

import {
    defaultComponentRuntimeRequestHandler,
    PrimedComponent,
    PrimedComponentFactory,
} from "@fluidframework/aqueduct";
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
import { IComponentFactory } from "@fluidframework/runtime-definitions";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import {
    createLocalLoader,
    OpProcessingController,
    initializeLocalContainer,
    TestFluidComponentFactory,
} from "@fluidframework/test-utils";
import * as old from "./oldVersion";

/* eslint-enable import/no-extraneous-dependencies */

const id = "fluid-test://localhost/compatibilityTest";
const codeDetails: IFluidCodeDetails = {
    package: "compatibilityTestPackage",
    config: {},
};

export class TestComponent extends PrimedComponent {
    public static readonly type = "@fluid-example/test-component";
    public get _runtime() { return this.runtime; }
    public get _root() { return this.root; }
}

export class OldTestComponent extends old.PrimedComponent {
    public static readonly type = "@fluid-example/test-component";
    public get _runtime() { return this.runtime; }
    public get _root() { return this.root; }
}

export const createPrimedComponentFactory = (): IComponentFactory => {
    return new PrimedComponentFactory(TestComponent.type, TestComponent, [], {});
};

export const createOldPrimedComponentFactory = (): old.IComponentFactory => {
    return new old.PrimedComponentFactory(OldTestComponent.type, OldTestComponent, [], {});
};

export const createTestFluidComponentFactory = (): IComponentFactory => {
    return new TestFluidComponentFactory([["mapKey", SharedMap.getFactory()]]);
};

export const createOldTestFluidComponentFactory = (): old.IComponentFactory => {
    return new old.TestFluidComponentFactory([["mapKey", old.SharedMap.getFactory()]]);
};

export const createRuntimeFactory = (
    type: string,
    componentFactory: IComponentFactory | old.IComponentFactory,
    runtimeOptions: IContainerRuntimeOptions = { initialSummarizerDelayMs: 0 },
): IRuntimeFactory => {
    const builder = new RuntimeRequestHandlerBuilder();
    builder.pushHandler(
        componentRuntimeRequestHandler,
        defaultComponentRuntimeRequestHandler("default"));

    return {
        get IRuntimeFactory() { return this; },
        instantiateRuntime: async (context: IContainerContext) => {
            const runtime = await ContainerRuntime.load(
                context,
                [[type, Promise.resolve(componentFactory as IComponentFactory)]],
                async (req, rt) => builder.handleRequest(req, rt),
                runtimeOptions,
            );
            if (!runtime.existing) {
                const componentRuntime = await runtime.createComponent("default", type);
                await componentRuntime.request({ url: "/" });
                componentRuntime.bindToContext();
            }
            return runtime;
        },
    };
};

export const createOldRuntimeFactory = (
    type: string,
    componentFactory: IComponentFactory | old.IComponentFactory,
    runtimeOptions: old.IContainerRuntimeOptions = { initialSummarizerDelayMs: 0 },
): old.IRuntimeFactory => {
    const builder = new old.RuntimeRequestHandlerBuilder();
    builder.pushHandler(
        old.componentRuntimeRequestHandler,
        old.defaultComponentRuntimeRequestHandler("default"));

    return {
        get IRuntimeFactory() { return this; },
        instantiateRuntime: async (context: old.IContainerContext) => {
            const runtime = await old.ContainerRuntime.load(
                context,
                [[type, Promise.resolve(componentFactory as old.IComponentFactory)]],
                async (req, rt) => builder.handleRequest(req, rt),
                runtimeOptions,
            );
            if (!runtime.existing) {
                const componentRuntime = await runtime.createComponent("default", type);
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

export const compatTest = (
    tests: (makeTestContainer: () => Promise<Container | old.Container>) => void,
    testFluidComponent: boolean = false,
) => {
    describe("old loader, new runtime", function() {
        let deltaConnectionServer: ILocalDeltaConnectionServer;
        const makeTestContainer = async () => createContainerWithOldLoader(
            { fluidExport: createRuntimeFactory(
                TestComponent.type,
                testFluidComponent
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
            this.deltaConnectionServer = deltaConnectionServer;

            this.opProcessingController = new OpProcessingController(this.deltaConnectionServer);
        });

        tests(makeTestContainer);

        afterEach(async function() {
            await this.deltaConnectionServer.webSocketServer.close();
        });
    });

    describe("new loader, old runtime", function() {
        let deltaConnectionServer: ILocalDeltaConnectionServer;
        const makeTestContainer = async () => createContainer(
            { fluidExport: createOldRuntimeFactory(
                OldTestComponent.type,
                testFluidComponent
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
            this.deltaConnectionServer = deltaConnectionServer;

            this.opProcessingController = new OpProcessingController(this.deltaConnectionServer);
        });

        tests(makeTestContainer);

        afterEach(async function() {
            await this.deltaConnectionServer.webSocketServer.close();
        });
    });

    describe("new ContainerRuntime, old ComponentRuntime", function() {
        let deltaConnectionServer: ILocalDeltaConnectionServer;
        const makeTestContainer = async () => createContainer(
            { fluidExport: createRuntimeFactory(
                OldTestComponent.type,
                testFluidComponent
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
            this.deltaConnectionServer = deltaConnectionServer;

            this.opProcessingController = new OpProcessingController(this.deltaConnectionServer);
        });

        tests(makeTestContainer);

        afterEach(async function() {
            await this.deltaConnectionServer.webSocketServer.close();
        });
    });
};
