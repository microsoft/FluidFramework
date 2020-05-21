/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import {
    ContainerRuntimeFactoryWithDefaultComponent,
    PrimedComponent,
    PrimedComponentFactory,
} from "@fluidframework/aqueduct";
import { IFluidCodeDetails, ILoader, IRuntimeFactory } from "@fluidframework/container-definitions";
import { Container } from "@fluidframework/container-loader";
import { DocumentDeltaEventManager } from "@fluidframework/local-driver";
import { IComponentFactory } from "@fluidframework/runtime-definitions";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { createLocalLoader, initializeLocalContainer } from "@fluidframework/test-utils";
import * as old from "./oldVersion";

class TestComponent extends PrimedComponent {
    public static readonly type = "@fluid-example/test-component";

    public static readonly componentFactory = new PrimedComponentFactory(TestComponent.type, TestComponent, [], {});

    public static readonly runtimeFactory = new ContainerRuntimeFactoryWithDefaultComponent(
        TestComponent.type,
        [[TestComponent.type, Promise.resolve(TestComponent.componentFactory)]],
    );

    public get _runtime() { return this.runtime; }
    public get _root() { return this.root; }
}

// This class represents an old-version component used for testing
// loader-runtime compatibility. This class should only be changed when the old
// dependencies are updated as part of a minor version bump. Otherwise, changes
// between loader and runtime should be backwards-compatible and changing this
// class should not be necessary.
class OldTestComponent extends old.PrimedComponent {
    public static readonly type = "@fluid-example/old-test-component";

    public static readonly componentFactory = new old.PrimedComponentFactory(
        OldTestComponent.type,
        OldTestComponent,
        [],
        {},
    );

    public static readonly runtimeFactory = new old.ContainerRuntimeFactoryWithDefaultComponent(
        OldTestComponent.type,
        [[OldTestComponent.type, Promise.resolve(OldTestComponent.componentFactory)]],
    );

    public get _runtime() { return this.runtime; }
    public get _root() { return this.root; }
}

describe("loader/runtime compatibility", () => {
    const id = "fluid-test://localhost/compatibilityTest";
    const codeDetails: IFluidCodeDetails = {
        package: "compatibilityTestPackage",
        config: {},
    };

    async function createContainer(
        factory: IRuntimeFactory | IComponentFactory,
        deltaConnectionServer: ILocalDeltaConnectionServer,
    ): Promise<Container> {
        const loader: ILoader = createLocalLoader([[ codeDetails, factory ]], deltaConnectionServer);
        return initializeLocalContainer(id, loader, codeDetails);
    }

    async function createOldContainer(
        factory: IRuntimeFactory | IComponentFactory,
        deltaConnectionServer: ILocalDeltaConnectionServer,
    ): Promise<old.Container> {
        const loader = old.createLocalLoader([[ codeDetails, factory ]] as any, deltaConnectionServer);
        return old.initializeLocalContainer(id, loader, codeDetails);
    }

    async function getComponent<T>(componentId: string, container: Container): Promise<T> {
        const response = await container.request({ url: componentId });
        if (response.status !== 200 || response.mimeType !== "fluid/component") {
            throw new Error(`Component with id: ${componentId} not found`);
        }
        return response.value as T;
    }

    const tests = function() {
        it("loads", async function() {
            await this.containerDeltaEventManager.process();
        });

        it("can do stuff", async function() {
            const test = ["fluid is", "pretty neat!"];
            this.component._root.set(test[0], test[1]);
            assert.strictEqual(await this.component._root.wait(test[0]), test[1]);
        });
    };

    describe("old loader, new runtime", function() {
        beforeEach(async function() {
            this.deltaConnectionServer = LocalDeltaConnectionServer.create();
            this.containerDeltaEventManager = new DocumentDeltaEventManager(this.deltaConnectionServer);
            this.container = await createOldContainer(TestComponent.runtimeFactory, this.deltaConnectionServer);
            this.component = await getComponent<TestComponent>("default", this.container as unknown as Container);
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
                OldTestComponent.runtimeFactory as unknown as IRuntimeFactory,
                this.deltaConnectionServer);
            this.component = await getComponent<OldTestComponent>("default", this.container);
            this.containerDeltaEventManager.registerDocuments(this.component._runtime);
        });

        tests();

        afterEach(async function() {
            await this.deltaConnectionServer.webSocketServer.close();
        });
    });

    /* TODO: Reenable this test in 0.18. The functionality it tests is not working as of 0.17
    describe("old ContainerRuntime, new ComponentRuntime", function() {
        beforeEach(async function() {
            this.deltaConnectionServer = LocalDeltaConnectionServer.create();
            this.containerDeltaEventManager = new DocumentDeltaEventManager(this.deltaConnectionServer);
            this.container = await createOldContainer(
                TestComponent.componentFactory,
                this.deltaConnectionServer);
            this.component = await getComponent<OldTestComponent>("default", this.container);
            this.containerDeltaEventManager.registerDocuments(this.component._runtime);
        });

        tests();

        afterEach(async function() {
            await this.deltaConnectionServer.webSocketServer.close();
        });
    });
    */

    describe("new ContainerRuntime, old ComponentRuntime", function() {
        beforeEach(async function() {
            this.deltaConnectionServer = LocalDeltaConnectionServer.create();
            this.containerDeltaEventManager = new DocumentDeltaEventManager(this.deltaConnectionServer);
            this.container = await createContainer(
                OldTestComponent.componentFactory as unknown as IComponentFactory,
                this.deltaConnectionServer);
            this.component = await getComponent<OldTestComponent>("default", this.container);
            this.containerDeltaEventManager.registerDocuments(this.component._runtime);
        });

        tests();

        afterEach(async function() {
            await this.deltaConnectionServer.webSocketServer.close();
        });
    });
});
