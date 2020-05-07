/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import {
    ContainerRuntimeFactoryWithDefaultComponent,
    PrimedComponent,
    PrimedComponentFactory,
} from "@microsoft/fluid-aqueduct";
import { IFluidCodeDetails, ILoader, IRuntimeFactory } from "@microsoft/fluid-container-definitions";
import { Container } from "@microsoft/fluid-container-loader";
import { DocumentDeltaEventManager } from "@microsoft/fluid-local-driver";
import { IComponentFactory } from "@microsoft/fluid-runtime-definitions";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@microsoft/fluid-server-local-server";
import { createLocalLoader, initializeLocalContainer } from "@microsoft/fluid-test-utils";
import * as old from "./oldVersion";

class TestComponent extends PrimedComponent {
    public static readonly type = "@chaincode/test-component";

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
    public static readonly type = "@chaincode/old-test-component";

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

    async function getComponent<T>(componentId: string, container: Container | old.Container): Promise<T> {
        const response = await container.request({ url: componentId });
        if (response.status !== 200 || response.mimeType !== "fluid/component") {
            throw new Error(`Component with id: ${componentId} not found`);
        }
        return response.value as T;
    }

    const tests = function(
        createSecondContainer: (server: ILocalDeltaConnectionServer) => Promise<Container | old.Container>,
    ) {
        it("loads", async function() {
            await this.containerDeltaEventManager.process();
        });

        it("can set/get on root directory", async function() {
            const test = ["fluid is", "pretty neat!"];
            this.component._root.set(test[0], test[1]);
            assert.strictEqual(await this.component._root.wait(test[0]), test[1]);
        });

        it("can load existing", async function() {
            const test = ["prague is", "also neat"];
            this.component._root.set(test[0], test[1]);
            assert.strictEqual(await this.component._root.wait(test[0]), test[1]);
            const container2 = await createSecondContainer(this.deltaConnectionServer);
            const component2 = await getComponent<TestComponent | OldTestComponent>("default", container2);
            assert.strictEqual(await component2._root.wait(test[0]), test[1]);
        });
    };

    describe("old loader, new runtime", function() {
        const makeContainer = async (server: ILocalDeltaConnectionServer) => createOldContainer(
            TestComponent.runtimeFactory,
            server,
        );

        beforeEach(async function() {
            this.deltaConnectionServer = LocalDeltaConnectionServer.create();
            this.containerDeltaEventManager = new DocumentDeltaEventManager(this.deltaConnectionServer);
            this.container = await makeContainer(this.deltaConnectionServer);
            this.component = await getComponent<TestComponent>("default", this.container);
            this.containerDeltaEventManager.registerDocuments(this.component._runtime);
        });

        tests(makeContainer);

        afterEach(async function() {
            await this.deltaConnectionServer.webSocketServer.close();
        });
    });

    describe("new loader, old runtime", function() {
        const makeContainer = async (server: ILocalDeltaConnectionServer) => createContainer(
            OldTestComponent.runtimeFactory as unknown as IRuntimeFactory,
            server,
        );

        beforeEach(async function() {
            this.deltaConnectionServer = LocalDeltaConnectionServer.create();
            this.containerDeltaEventManager = new DocumentDeltaEventManager(this.deltaConnectionServer);
            this.container = await makeContainer(this.deltaConnectionServer);
            this.component = await getComponent<OldTestComponent>("default", this.container);
            this.containerDeltaEventManager.registerDocuments(this.component._runtime);
        });

        tests(makeContainer);

        afterEach(async function() {
            await this.deltaConnectionServer.webSocketServer.close();
        });
    });

    describe("old ContainerRuntime, new ComponentRuntime", function() {
        const makeContainer = async (server: ILocalDeltaConnectionServer) => createOldContainer(
            TestComponent.componentFactory,
            server,
        );

        beforeEach(async function() {
            this.deltaConnectionServer = LocalDeltaConnectionServer.create();
            this.containerDeltaEventManager = new DocumentDeltaEventManager(this.deltaConnectionServer);
            this.container = await makeContainer(this.deltaConnectionServer);
            this.component = await getComponent<OldTestComponent>("default", this.container);
            this.containerDeltaEventManager.registerDocuments(this.component._runtime);
        });

        tests(makeContainer);

        afterEach(async function() {
            await this.deltaConnectionServer.webSocketServer.close();
        });
    });

    describe("new ContainerRuntime, old ComponentRuntime", function() {
        const makeContainer = async (server: ILocalDeltaConnectionServer) => createContainer(
            OldTestComponent.componentFactory as unknown as IComponentFactory,
            server,
        );

        beforeEach(async function() {
            this.deltaConnectionServer = LocalDeltaConnectionServer.create();
            this.containerDeltaEventManager = new DocumentDeltaEventManager(this.deltaConnectionServer);
            this.container = await makeContainer(this.deltaConnectionServer);
            this.component = await getComponent<OldTestComponent>("default", this.container);
            this.containerDeltaEventManager.registerDocuments(this.component._runtime);
        });

        tests(makeContainer);

        afterEach(async function() {
            await this.deltaConnectionServer.webSocketServer.close();
        });
    });
});
