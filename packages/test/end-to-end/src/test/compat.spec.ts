/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import {
    ContainerRuntimeFactoryWithDefaultComponent,
    PrimedComponent,
    PrimedComponentFactory,
} from "@fluidframework/aqueduct";
import { IFluidCodeDetails, IFluidModule, ILoader, IRuntimeFactory } from "@fluidframework/container-definitions";
import { Container } from "@fluidframework/container-loader";
import { DocumentDeltaEventManager } from "@fluidframework/local-driver";
import { IComponentFactory } from "@fluidframework/runtime-definitions";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { createLocalLoader, initializeLocalContainer } from "@fluidframework/test-utils";
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
    ): IRuntimeFactory => {
        return new ContainerRuntimeFactoryWithDefaultComponent(
            type,
            [[type, Promise.resolve(componentFactory as IComponentFactory)]],
        );
    };

    const createOldRuntimeFactory = (
        type: string,
        componentFactory: IComponentFactory | old.IComponentFactory,
    ): old.IRuntimeFactory => {
        return new old.ContainerRuntimeFactoryWithDefaultComponent(
            type,
            [[type, Promise.resolve(componentFactory as old.IComponentFactory)]],
        );
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
            let success = true;
            this.container.on("error", () => success = false); // back-compat: 0.19 compatTestErrorEvent
            this.container.on("closed", (error) => success = success && error === undefined);
            await this.containerDeltaEventManager.process();
            assert.strictEqual(success, true, "container error");
        });

        it("can set/get on root directory", async function() {
            let success = true;
            this.container.on("error", () => success = false); // back-compat: 0.19 compatTestErrorEvent
            this.container.on("closed", (error) => success = success && error === undefined);

            const test = ["fluid is", "pretty neat!"];
            this.component._root.set(test[0], test[1]);
            assert.strictEqual(await this.component._root.wait(test[0]), test[1]);

            await this.containerDeltaEventManager.process();
            assert.strictEqual(success, true, "container error");
        });

        it("can load existing", async function() {
            const containersP: { container: Promise<Container | old.Container>, description: string }[] = [
                {
                    description: "original container",
                    container: Promise.resolve(this.container),
                }, {
                    description: "new Loader, new ContainerRuntime, new ComponentRuntime",
                    container: createContainer(
                        { fluidExport: createRuntimeFactory(TestComponent.type, createComponentFactory()) },
                        this.deltaConnectionServer),
                }, {
                    description: "old Loader, new ContainerRuntime, new ComponentRuntime",
                    container: createContainerWithOldLoader(
                        { fluidExport: createRuntimeFactory(TestComponent.type, createComponentFactory()) },
                        this.deltaConnectionServer),
                }, {
                    description: "old Loader, old ContainerRuntime, new ComponentRuntime",
                    container:createContainerWithOldLoader(
                        { fluidExport: createOldRuntimeFactory(TestComponent.type, createComponentFactory()) },
                        this.deltaConnectionServer),
                }, {
                    description: "old Loader, old ContainerRuntime, old ComponentRuntime",
                    container: createContainerWithOldLoader(
                        { fluidExport: createOldRuntimeFactory(TestComponent.type, createOldComponentFactory()) },
                        this.deltaConnectionServer),
                }, {
                    description: "new Loader, old ContainerRuntime, new ComponentRuntime",
                    container: createContainer(
                        { fluidExport: createOldRuntimeFactory(TestComponent.type, createOldComponentFactory()) },
                        this.deltaConnectionServer),
                }, {
                    description: "new Loader, new ContainerRuntime, new ComponentRuntime",
                    container: createContainer(
                        { fluidExport: createRuntimeFactory(TestComponent.type, createOldComponentFactory()) },
                        this.deltaConnectionServer),
                },
            ];

            const success: boolean[] = Array(containersP.length).fill(true);
            containersP.map(async (containerP, i) => containerP.container.then(async (container) => {
                container.on("error", () => success[i] = false); // back-compat: 0.19 compatTestErrorEvent
                container.on("closed", (error) => success[i] = success[i] && error === undefined);
            }));

            const components = await Promise.all(containersP.map(async (containerP) => containerP.container.then(
                async (container) => getComponent<TestComponent | OldTestComponent>("default", container))));

            // set a test value from every component (besides initial)
            const test2 = [...Array(components.length).keys()].map((x) => x.toString());
            components.map(async (component, i) => (component._root as any).set(test2[i], test2[i]));

            // get every test value from every component (besides initial)
            components.map(async (component) => test2.map(
                async (testVal) => assert.strictEqual(await component._root.wait(testVal), testVal)));

            await this.containerDeltaEventManager.process();
            success.map((succeeded, i) => {
                assert.strictEqual(succeeded, true, `can't load with ${containersP[i].description}`);
            });
        });
    };

    describe("old loader, new runtime", function() {
        beforeEach(async function() {
            this.deltaConnectionServer = LocalDeltaConnectionServer.create();
            this.containerDeltaEventManager = new DocumentDeltaEventManager(this.deltaConnectionServer);
            this.container = await createContainerWithOldLoader(
                { fluidExport: createRuntimeFactory(TestComponent.type, createComponentFactory()) },
                this.deltaConnectionServer);
            this.component = await getComponent<TestComponent>("default", this.container);
            this.containerDeltaEventManager.registerDocuments(this.component._runtime);
        });

        tests();

        afterEach(async function() {
            await this.deltaConnectionServer.webSocketServer.close();
        });
    });

    describe("new loader, old runtime", function() {
        beforeEach(async function() {
            this.deltaConnectionServer = LocalDeltaConnectionServer.create();
            this.containerDeltaEventManager = new DocumentDeltaEventManager(this.deltaConnectionServer);
            this.container = await createContainer(
                { fluidExport: createOldRuntimeFactory(OldTestComponent.type, createOldComponentFactory()) },
                this.deltaConnectionServer,
            );

            this.component = await getComponent<OldTestComponent>("default", this.container);
            this.containerDeltaEventManager.registerDocuments(this.component._runtime);
        });

        tests();

        afterEach(async function() {
            await this.deltaConnectionServer.webSocketServer.close();
        });
    });

    describe("old ContainerRuntime, new ComponentRuntime", function() {
        beforeEach(async function() {
            this.deltaConnectionServer = LocalDeltaConnectionServer.create();
            this.containerDeltaEventManager = new DocumentDeltaEventManager(this.deltaConnectionServer);
            this.container = await createContainerWithOldLoader(
                { fluidExport: createOldRuntimeFactory(TestComponent.type, createComponentFactory()) },
                this.deltaConnectionServer,
            );

            this.component = await getComponent<OldTestComponent>("default", this.container);
            this.containerDeltaEventManager.registerDocuments(this.component._runtime);
        });

        tests();

        afterEach(async function() {
            await this.deltaConnectionServer.webSocketServer.close();
        });
    });

    describe("new ContainerRuntime, old ComponentRuntime", function() {
        beforeEach(async function() {
            this.deltaConnectionServer = LocalDeltaConnectionServer.create();
            this.containerDeltaEventManager = new DocumentDeltaEventManager(this.deltaConnectionServer);
            this.container = await createContainer(
                { fluidExport: createRuntimeFactory(OldTestComponent.type, createOldComponentFactory()) },
                this.deltaConnectionServer,
            );

            this.component = await getComponent<OldTestComponent>("default", this.container);
            this.containerDeltaEventManager.registerDocuments(this.component._runtime);
        });

        tests();

        afterEach(async function() {
            await this.deltaConnectionServer.webSocketServer.close();
        });
    });
});
