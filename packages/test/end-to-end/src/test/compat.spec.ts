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
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@microsoft/fluid-server-local-server";
import { createLocalLoader, initializeLocalContainer } from "@microsoft/fluid-test-utils";
import * as old from "./previousMinorVersion";

class TestComponent extends PrimedComponent {
    public static readonly type = "@chaincode/test-component";

    public static getFactory() { return TestComponent.factory; }
    private static readonly factory = new PrimedComponentFactory(TestComponent.type, TestComponent, [], {});

    public static getRuntimeFactory() { return TestComponent.runtimeFactory; }
    private static readonly runtimeFactory = new ContainerRuntimeFactoryWithDefaultComponent(
        TestComponent.type,
        [[TestComponent.type, Promise.resolve(TestComponent.getFactory())]],
    );

    public get _runtime() { return this.runtime; }
    public get _root() { return this.root; }
}

class OldTestComponent extends old.PrimedComponent {
    public static readonly type = "@chaincode/old-test-component";

    public static getFactory() { return OldTestComponent.factory; }
    private static readonly factory = new old.PrimedComponentFactory(OldTestComponent.type, OldTestComponent, [], {});

    public static getRuntimeFactory() { return OldTestComponent.runtimeFactory; }
    private static readonly runtimeFactory = new old.ContainerRuntimeFactoryWithDefaultComponent(
        OldTestComponent.type,
        [[OldTestComponent.type, Promise.resolve(OldTestComponent.getFactory())]],
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

    let deltaConnectionServer: ILocalDeltaConnectionServer;
    let containerDeltaEventManager: DocumentDeltaEventManager;

    async function createContainer(factory: IRuntimeFactory): Promise<Container> {
        const loader: ILoader = createLocalLoader([[ codeDetails, factory ]], deltaConnectionServer);
        return initializeLocalContainer(id, loader, codeDetails);
    }

    async function createOldContainer(factory: IRuntimeFactory): Promise<old.Container> {
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

    describe("old loader, new runtime", () => {
        let container: old.Container;
        let component: TestComponent;

        beforeEach(async () => {
            deltaConnectionServer = LocalDeltaConnectionServer.create();
            containerDeltaEventManager = new DocumentDeltaEventManager(deltaConnectionServer);
            container = await createOldContainer(TestComponent.getRuntimeFactory());
            component = await getComponent<TestComponent>("default", container as unknown as Container);
            containerDeltaEventManager.registerDocuments(component._runtime);
        });

        afterEach(async () => {
            await deltaConnectionServer.webSocketServer.close();
        });

        it("loads", async () => {
            await containerDeltaEventManager.process();
        });

        it("can do stuff", async () => {
            const test = ["fluid is", "pretty neat!"];
            component._root.set(test[0], test[1]);
            assert.strictEqual(await component._root.wait(test[0]), test[1]);
        });
    });

    describe("new loader, old runtime", () => {
        let container: Container;
        let component: OldTestComponent;

        beforeEach(async () => {
            deltaConnectionServer = LocalDeltaConnectionServer.create();
            containerDeltaEventManager = new DocumentDeltaEventManager(deltaConnectionServer);
            container = await createContainer(OldTestComponent.getRuntimeFactory() as unknown as IRuntimeFactory);
            component = await getComponent<OldTestComponent>("default", container);
            containerDeltaEventManager.registerDocuments(component._runtime);
        });

        afterEach(async () => {
            await deltaConnectionServer.webSocketServer.close();
        });

        it("loads", async () => {
            await containerDeltaEventManager.process();
        });

        it("can do stuff", async () => {
            const test = ["fluid", "is amazing"];
            component._root.set(test[0], test[1]);
            assert.strictEqual(await component._root.wait(test[0]), test[1]);
        });
    });
});
