/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
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
import {
    ContainerRuntime,
    IContainerRuntimeOptions,
} from "@fluidframework/container-runtime";
import { ISummaryConfiguration } from "@fluidframework/protocol-definitions";
import { IComponentFactory } from "@fluidframework/runtime-definitions";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { componentRuntimeRequestHandler, RuntimeRequestHandlerBuilder } from "@fluidframework/request-handler";
import { createLocalLoader, OpProcessingController, initializeLocalContainer } from "@fluidframework/test-utils";
import * as old from "./oldVersion";

class TestComponent extends PrimedComponent {
    public static readonly type = "@fluid-example/test-component";
    public get _runtime() { return this.runtime; }
    public get _root() { return this.root; }
}

// This class represents an old-version component used for testing
// loader-runtime compatibility. This class should only be changed when the old
// dependencies are updated as part of a minor version bump. Otherwise, changes
// between loader and runtime should be backwards-compatible and changing this
// class should not be necessary.
class OldTestComponent extends old.PrimedComponent {
    public static readonly type = "@fluid-example/test-component";
    public get _runtime() { return this.runtime; }
    public get _root() { return this.root; }
}

describe("loader/runtime compatibility", () => {
    const id = "fluid-test://localhost/compatibilityTest";
    const codeDetails: IFluidCodeDetails = {
        package: "compatibilityTestPackage",
        config: {},
    };

    const createComponentFactory = (): IComponentFactory => {
        return new PrimedComponentFactory(TestComponent.type, TestComponent, [], {});
    };

    const createOldComponentFactory = (): old.IComponentFactory => {
        return new old.PrimedComponentFactory(OldTestComponent.type, OldTestComponent, [], {});
    };

    const createRuntimeFactory = (
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
                    async (req,rt) => builder.handleRequest(req,rt),
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

    const createOldRuntimeFactory = (
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
                    async (req,rt) => builder.handleRequest(req,rt),
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

    async function createContainer(
        fluidModule: IFluidModule | old.IFluidModule,
        deltaConnectionServer: ILocalDeltaConnectionServer,
    ): Promise<Container> {
        const loader: ILoader = createLocalLoader([[codeDetails, fluidModule as IFluidModule]], deltaConnectionServer);
        return initializeLocalContainer(id, loader, codeDetails);
    }

    async function createContainerWithOldLoader(
        fluidModule: IFluidModule | old.IFluidModule,
        deltaConnectionServer: ILocalDeltaConnectionServer,
    ): Promise<old.Container> {
        const loader = old.createLocalLoader(
            [[codeDetails, fluidModule as old.IFluidModule]],
            deltaConnectionServer as any);
        return old.initializeLocalContainer(id, loader, codeDetails);
    }

    async function getComponent<T>(componentId: string, container: Container | old.Container): Promise<T> {
        const response = await container.request({ url: componentId });
        if (response.status !== 200 || response.mimeType !== "fluid/component") {
            throw new Error(`Component with id: ${componentId} not found`);
        }
        return response.value as T;
    }

    const tests = function() {
        it("loads", async function() {
            await this.opProcessingController.process();
        });

        it("can set/get on root directory", async function() {
            const test = ["fluid is", "pretty neat!"];
            this.component._root.set(test[0], test[1]);
            assert.strictEqual(await this.component._root.wait(test[0]), test[1]);
        });

        it("can summarize", async function() {
            let success = true;
            this.container.on("error", () => success = false);
            this.container.on("warning", () => success = false);
            this.container.on("closed", (error) => success = success && error === undefined);

            // wait for summary ack/nack
            await new Promise((resolve, reject) => this.container.on("op", (op) => {
                if (op.type === "summaryAck") {
                    resolve();
                } else if (op.type === "summaryNack") {
                    reject("summaryNack");
                }
            }));

            assert.strictEqual(success, true, "container error");
        });

        it("can load existing", async function() {
            const test = ["prague is", "also neat"];
            this.component._root.set(test[0], test[1]);
            assert.strictEqual(await this.component._root.wait(test[0]), test[1]);

            const containersP: Promise<Container | old.Container>[] = [
                createContainer( // new everything
                    { fluidExport: createRuntimeFactory(TestComponent.type, createComponentFactory()) },
                    this.deltaConnectionServer),
                createContainerWithOldLoader( // old loader, new container/component runtimes
                    { fluidExport: createRuntimeFactory(TestComponent.type, createComponentFactory()) },
                    this.deltaConnectionServer),
                createContainerWithOldLoader( // old everything
                    { fluidExport: createOldRuntimeFactory(TestComponent.type, createOldComponentFactory()) },
                    this.deltaConnectionServer),
                createContainer( // new loader, old container/component runtimes
                    { fluidExport: createOldRuntimeFactory(TestComponent.type, createOldComponentFactory()) },
                    this.deltaConnectionServer),
                createContainer( // new loader/container runtime, old component runtime
                    { fluidExport: createRuntimeFactory(TestComponent.type, createOldComponentFactory()) },
                    this.deltaConnectionServer),
            ];

            const components = await Promise.all(containersP.map(async (containerP) => containerP.then(
                async (container) => getComponent<TestComponent | OldTestComponent>("default", container))));

            // get initial test value from each component
            components.map(async (component) => assert.strictEqual(await component._root.wait(test[0]), test[1]));

            // set a test value from every component (besides initial)
            const test2 = [...Array(components.length).keys()].map((x) => x.toString());
            components.map(async (component, i) => (component._root as any).set(test2[i], test2[i]));

            // get every test value from every component (besides initial)
            components.map(async (component) => test2.map(
                async (testVal) => assert.strictEqual(await component._root.wait(testVal), testVal)));

            // get every value from initial component
            test2.map(async (testVal) => assert.strictEqual(await this.component._root.wait(testVal), testVal));
        });
    };

    describe("old loader, new runtime", function() {
        beforeEach(async function() {
            this.deltaConnectionServer = LocalDeltaConnectionServer.create(
                undefined,
                // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
                { summary: { maxOps: 1 } as ISummaryConfiguration },
            );
            this.opProcessingController = new OpProcessingController(this.deltaConnectionServer);
            this.container = await createContainerWithOldLoader(
                { fluidExport: createRuntimeFactory(TestComponent.type, createComponentFactory()) },
                this.deltaConnectionServer);
            this.component = await getComponent<TestComponent>("default", this.container);
            this.opProcessingController.addDeltaManagers(this.component._runtime.deltaManager);
        });

        tests();

        afterEach(async function() {
            await this.deltaConnectionServer.webSocketServer.close();
        });
    });

    describe("new loader, old runtime", function() {
        beforeEach(async function() {
            this.deltaConnectionServer = LocalDeltaConnectionServer.create(
                undefined,
                // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
                { summary: { maxOps: 1 } as ISummaryConfiguration },
            );
            this.opProcessingController = new OpProcessingController(this.deltaConnectionServer);
            this.container = await createContainer(
                { fluidExport: createOldRuntimeFactory(OldTestComponent.type, createOldComponentFactory()) },
                this.deltaConnectionServer,
            );

            this.component = await getComponent<OldTestComponent>("default", this.container);
            this.opProcessingController.addDeltaManagers(this.component._runtime.deltaManager);
        });

        tests();

        afterEach(async function() {
            await this.deltaConnectionServer.webSocketServer.close();
        });
    });

    describe("new ContainerRuntime, old ComponentRuntime", function() {
        beforeEach(async function() {
            this.deltaConnectionServer = LocalDeltaConnectionServer.create(
                undefined,
                // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
                { summary: { maxOps: 1 } as ISummaryConfiguration },
            );
            this.opProcessingController = new OpProcessingController(this.deltaConnectionServer);
            this.container = await createContainer(
                { fluidExport: createRuntimeFactory(OldTestComponent.type, createOldComponentFactory()) },
                this.deltaConnectionServer,
            );

            this.component = await getComponent<OldTestComponent>("default", this.container);
            this.opProcessingController.addDeltaManagers(this.component._runtime.deltaManager);
        });

        tests();

        afterEach(async function() {
            await this.deltaConnectionServer.webSocketServer.close();
        });
    });
});
