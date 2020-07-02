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
import { IComponentHandle } from "@fluidframework/component-core-interfaces";
import { IFluidCodeDetails } from "@fluidframework/container-definitions";
import { Container } from "@fluidframework/container-loader";
import { DocumentDeltaEventManager } from "@fluidframework/local-driver";
import { SharedMap } from "@fluidframework/map";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import {
    createLocalLoader,
    initializeLocalContainer,
    TestFluidComponent,
} from "@fluidframework/test-utils";

/**
 * Test component that extends PrimedComponent so that we can test the ComponentHandle created by SharedComponent.
 */
class TestSharedComponent extends PrimedComponent {
    public get _root() {
        return this.root;
    }

    public get _runtime() {
        return this.runtime;
    }

    public get _context() {
        return this.context;
    }
}

const TestSharedComponentFactory = new PrimedComponentFactory(
    "TestSharedComponent",
    TestSharedComponent,
    [SharedMap.getFactory()],
    []);

describe("ComponentHandle", () => {
    const id = "fluid-test://localhost/componentHandleTest";
    const codeDetails: IFluidCodeDetails = {
        package: "componentHandleTestPackage",
        config: {},
    };

    let deltaConnectionServer: ILocalDeltaConnectionServer;
    let containerDeltaEventManager: DocumentDeltaEventManager;
    let container1Component1: TestSharedComponent;
    let container1Component2: TestSharedComponent;
    let container2Component1: TestSharedComponent;

    async function getComponent(componentId: string, container: Container): Promise<TestSharedComponent> {
        const response = await container.request({ url: componentId });
        if (response.status !== 200 || response.mimeType !== "fluid/component") {
            throw new Error(`Component with id: ${componentId} not found`);
        }
        return response.value as TestSharedComponent;
    }

    async function createContainer(): Promise<Container> {
        const runtimeFactory =
            new ContainerRuntimeFactoryWithDefaultComponent(
                "default",
                [
                    ["default", Promise.resolve(TestSharedComponentFactory)],
                    ["TestSharedComponent", Promise.resolve(TestSharedComponentFactory)],
                ],
            );

        const loader = createLocalLoader([[codeDetails, runtimeFactory]], deltaConnectionServer);
        return initializeLocalContainer(id, loader, codeDetails);
    }

    beforeEach(async () => {
        deltaConnectionServer = LocalDeltaConnectionServer.create();

        const container1 = await createContainer();
        container1Component1 = await getComponent("default", container1);
        container1Component2 =
            await TestSharedComponentFactory.createComponent(container1Component1._context) as TestSharedComponent;

        const container2 = await createContainer();
        container2Component1 = await getComponent("default", container2);

        containerDeltaEventManager = new DocumentDeltaEventManager(deltaConnectionServer);
        containerDeltaEventManager.registerDocuments(container1Component1._runtime, container2Component1._runtime);

        await containerDeltaEventManager.process();
    });

    it("should generate the absolute path for ContainerRuntime correctly", () => {
        // The expected absolute path for the ContainerRuntime is empty string.
        const absolutePath = "";

        // Verify that the local client's ContainerRuntime has the correct absolute path.
        const containerRuntime1 = container1Component1._context.containerRuntime.IComponentHandleContext;
        assert.equal(containerRuntime1.absolutePath, absolutePath, "The ContainerRuntime's path is incorrect");

        // Verify that the remote client's ContainerRuntime has the correct absolute path.
        const containerRuntime2 = container2Component1._context.containerRuntime.IComponentHandleContext;
        assert.equal(containerRuntime2.absolutePath, absolutePath, "The remote ContainerRuntime's path is incorrect");
    });

    it("should generate the absolute path for ComponentRuntime correctly", () => {
        // The expected absolute path for the ComponentRuntime.
        const absolutePath = `/${container1Component1._runtime.id}`;

        // Verify that the local client's ComponentRuntime has the correct absolute path.
        const componentRuntime1 = container1Component1._runtime.IComponentHandleContext;
        assert.equal(componentRuntime1.absolutePath, absolutePath, "The ComponentRuntime's path is incorrect");

        // Verify that the remote client's ComponentRuntime has the correct absolute path.
        const componentRuntime2 = container2Component1._runtime.IComponentHandleContext;
        assert.equal(componentRuntime2.absolutePath, absolutePath, "The remote ComponentRuntime's path is incorrect");
    });

    it("can store and retrieve a DDS from handle within same component runtime", async () => {
        // Create a new SharedMap in `container1Component1` and set a value.
        const sharedMap = SharedMap.create(container1Component1._runtime);
        sharedMap.set("key1", "value1");

        const sharedMapHandle = sharedMap.handle;

        // The expected absolute path.
        const absolutePath = `/default/${sharedMap.id}`;

        // Verify that the local client's handle has the correct absolute path.
        assert.equal(sharedMapHandle.absolutePath, absolutePath, "The handle's path is incorrect");

        // Add the handle to the root DDS of `container1Component1`.
        container1Component1._root.set("sharedMap", sharedMapHandle);

        await containerDeltaEventManager.process();

        // Get the handle in the remote client.
        const remoteSharedMapHandle = container2Component1._root.get<IComponentHandle<SharedMap>>("sharedMap");

        // Verify that the remote client's handle has the correct absolute path.
        assert.equal(remoteSharedMapHandle.absolutePath, absolutePath, "The remote handle's path is incorrect");

        // Get the SharedMap from the handle.
        const remoteSharedMap = await remoteSharedMapHandle.get();
        // Verify that it has the value that was set in the local client.
        assert.equal(remoteSharedMap.get("key1"), "value1", "The map does not have the value that was set");
    });

    it("can store and retrieve a DDS from handle in different component runtime", async () => {
        // Create a new SharedMap in `container1Component2` and set a value.
        const sharedMap = SharedMap.create(container1Component2._runtime);
        sharedMap.set("key1", "value1");

        const sharedMapHandle = sharedMap.handle;

        // The expected absolute path.
        const absolutePath = `/${container1Component2._runtime.id}/${sharedMap.id}`;

        // Verify that the local client's handle has the correct absolute path.
        assert.equal(sharedMapHandle.absolutePath, absolutePath, "The handle's path is incorrect");

        // Add the handle to the root DDS of `container1Component1` so that the ComponentRuntime is different.
        container1Component1._root.set("sharedMap", sharedMap.handle);

        await containerDeltaEventManager.process();

        // Get the handle in the remote client.
        const remoteSharedMapHandle = container2Component1._root.get<IComponentHandle<SharedMap>>("sharedMap");

        // Verify that the remote client's handle has the correct absolute path.
        assert.equal(remoteSharedMapHandle.absolutePath, absolutePath, "The remote handle's path is incorrect");

        // Get the SharedMap from the handle.
        const remoteSharedMap = await remoteSharedMapHandle.get();
        // Verify that it has the value that was set in the local client.
        assert.equal(remoteSharedMap.get("key1"), "value1", "The map does not have the value that was set");
    });

    it("can store and retrieve a SharedComponent from handle in different component runtime", async () => {
        // The expected absolute path.
        const absolutePath = `/${container1Component2._runtime.id}`;

        const componentHandle = container1Component2.handle;

        // Verify that the local client's handle has the correct absolute path.
        assert.equal(componentHandle.absolutePath, absolutePath, "The handle's absolutepath is not correct");

        // Add `container1Component2's` handle to the root DDS of `container1Component1` so that the ComponentRuntime
        // is different.
        container1Component1._root.set("component2", container1Component2.handle);

        await containerDeltaEventManager.process();

        // Get the handle in the remote client.
        const remoteComponentHandle =
            container2Component1._root.get<IComponentHandle<TestFluidComponent>>("component2");

        // Verify that the remote client's handle has the correct absolute path.
        assert.equal(remoteComponentHandle.absolutePath, absolutePath, "The remote handle's path is incorrect");

        // Get the component from the handle.
        const container2Component2 = await remoteComponentHandle.get();
        // Verify that the `url` matches with that of the component in container1.
        assert.equal(container2Component2.url, container1Component2.url, "The urls do not match");
    });

    afterEach(async () => {
        await deltaConnectionServer.webSocketServer.close();
    });
});
