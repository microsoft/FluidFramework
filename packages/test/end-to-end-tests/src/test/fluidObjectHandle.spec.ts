/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import {
    ContainerRuntimeFactoryWithDefaultDataStore,
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { IContainer, IFluidCodeDetails, ILoader } from "@fluidframework/container-definitions";
import { IUrlResolver } from "@fluidframework/driver-definitions";
import { LocalResolver } from "@fluidframework/local-driver";
import { SharedMap } from "@fluidframework/map";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import {
    createAndAttachContainer,
    createLocalLoader,
    OpProcessingController,
    TestFluidObject,
} from "@fluidframework/test-utils";

/**
 * Test data object that extends DataObject so that we can test the FluidOjectHandle created by PureDataObject.
 */
class TestSharedDataObject extends DataObject {
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

const testSharedDataObjectFactory = new DataObjectFactory(
    "TestSharedDataObject",
    TestSharedDataObject,
    [SharedMap.getFactory()],
    []);

describe("FluidObjectHandle", () => {
    const documentId = "componentHandleTest";
    const documentLoadUrl = `fluid-test://localhost/${documentId}`;
    const codeDetails: IFluidCodeDetails = {
        package: "fluidObjectHandleTestPackage",
        config: {},
    };
    const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
        "default",
        [
            ["default", Promise.resolve(testSharedDataObjectFactory)],
            ["TestSharedDataObject", Promise.resolve(testSharedDataObjectFactory)],
        ],
    );

    let deltaConnectionServer: ILocalDeltaConnectionServer;
    let urlResolver: IUrlResolver;
    let opProcessingController: OpProcessingController;
    let firstContainerObject1: TestSharedDataObject;
    let firstContainerObject2: TestSharedDataObject;
    let secondContainerObject1: TestSharedDataObject;

    async function createContainer(): Promise<IContainer> {
        const loader: ILoader = createLocalLoader([[codeDetails, runtimeFactory]], deltaConnectionServer, urlResolver);
        return createAndAttachContainer(documentId, codeDetails, loader, urlResolver);
    }

    async function loadContainer(): Promise<IContainer> {
        const loader: ILoader = createLocalLoader([[codeDetails, runtimeFactory]], deltaConnectionServer, urlResolver);
        return loader.resolve({ url: documentLoadUrl });
    }

    beforeEach(async () => {
        deltaConnectionServer = LocalDeltaConnectionServer.create();
        urlResolver = new LocalResolver();

        // Create a Container for the first client.
        const firstContainer = await createContainer();
        firstContainerObject1 = await requestFluidObject<TestSharedDataObject>(firstContainer, "default");
        firstContainerObject2 = await testSharedDataObjectFactory.createInstance(
            firstContainerObject1._context,
        ) as TestSharedDataObject;

        // Load the Container that was created by the first client.
        const secondContainer = await loadContainer();
        secondContainerObject1 = await requestFluidObject<TestSharedDataObject>(secondContainer, "default");

        opProcessingController = new OpProcessingController(deltaConnectionServer);
        opProcessingController.addDeltaManagers(
            firstContainerObject1._runtime.deltaManager, secondContainerObject1._runtime.deltaManager);

        await opProcessingController.process();
    });

    it("should generate the absolute path for ContainerRuntime correctly", () => {
        // The expected absolute path for the ContainerRuntime is empty string.
        const absolutePath = "";

        // Verify that the local client's ContainerRuntime has the correct absolute path.
        const containerRuntime1 = firstContainerObject1._context.containerRuntime.IFluidHandleContext;
        assert.equal(containerRuntime1.absolutePath, absolutePath, "The ContainerRuntime's path is incorrect");

        // Verify that the remote client's ContainerRuntime has the correct absolute path.
        const containerRuntime2 = secondContainerObject1._context.containerRuntime.IFluidHandleContext;
        assert.equal(containerRuntime2.absolutePath, absolutePath, "The remote ContainerRuntime's path is incorrect");
    });

    it("should generate the absolute path for FluidDataObjectRuntime correctly", () => {
        // The expected absolute path for the FluidDataObjectRuntime.
        const absolutePath = `/${firstContainerObject1._runtime.id}`;

        // Verify that the local client's FluidDataObjectRuntime has the correct absolute path.
        const fluidHandleContext11 = firstContainerObject1._runtime.IFluidHandleContext;
        assert.equal(fluidHandleContext11.absolutePath, absolutePath, "The FluidDataObjectRuntime's path is incorrect");

        // Verify that the remote client's FluidDataObjectRuntime has the correct absolute path.
        const fluidHandleContext12 = secondContainerObject1._runtime.IFluidHandleContext;
        assert.equal(
            fluidHandleContext12.absolutePath,
            absolutePath,
            "The remote FluidDataObjectRuntime's path is incorrect");
    });

    it("can store and retrieve a DDS from handle within same data store runtime", async () => {
        // Create a new SharedMap in `firstContainerObject1` and set a value.
        const sharedMap = SharedMap.create(firstContainerObject1._runtime);
        sharedMap.set("key1", "value1");

        const sharedMapHandle = sharedMap.handle;

        // The expected absolute path.
        const absolutePath = `/default/${sharedMap.id}`;

        // Verify that the local client's handle has the correct absolute path.
        assert.equal(sharedMapHandle.absolutePath, absolutePath, "The handle's path is incorrect");

        // Add the handle to the root DDS of `firstContainerObject1`.
        firstContainerObject1._root.set("sharedMap", sharedMapHandle);

        await opProcessingController.process();

        // Get the handle in the remote client.
        const remoteSharedMapHandle = secondContainerObject1._root.get<IFluidHandle<SharedMap>>("sharedMap");

        // Verify that the remote client's handle has the correct absolute path.
        assert.equal(remoteSharedMapHandle.absolutePath, absolutePath, "The remote handle's path is incorrect");

        // Get the SharedMap from the handle.
        const remoteSharedMap = await remoteSharedMapHandle.get();
        // Verify that it has the value that was set in the local client.
        assert.equal(remoteSharedMap.get("key1"), "value1", "The map does not have the value that was set");
    });

    it("can store and retrieve a DDS from handle in different data store runtime", async () => {
        // Create a new SharedMap in `firstContainerObject2` and set a value.
        const sharedMap = SharedMap.create(firstContainerObject2._runtime);
        sharedMap.set("key1", "value1");

        const sharedMapHandle = sharedMap.handle;

        // The expected absolute path.
        const absolutePath = `/${firstContainerObject2._runtime.id}/${sharedMap.id}`;

        // Verify that the local client's handle has the correct absolute path.
        assert.equal(sharedMapHandle.absolutePath, absolutePath, "The handle's path is incorrect");

        // Add the handle to the root DDS of `firstContainerObject1` so that the FluidDataObjectRuntime is different.
        firstContainerObject1._root.set("sharedMap", sharedMap.handle);

        await opProcessingController.process();

        // Get the handle in the remote client.
        const remoteSharedMapHandle = secondContainerObject1._root.get<IFluidHandle<SharedMap>>("sharedMap");

        // Verify that the remote client's handle has the correct absolute path.
        assert.equal(remoteSharedMapHandle.absolutePath, absolutePath, "The remote handle's path is incorrect");

        // Get the SharedMap from the handle.
        const remoteSharedMap = await remoteSharedMapHandle.get();
        // Verify that it has the value that was set in the local client.
        assert.equal(remoteSharedMap.get("key1"), "value1", "The map does not have the value that was set");
    });

    it("can store and retrieve a PureDataObject from handle in different data store runtime", async () => {
        // The expected absolute path.
        const absolutePath = `/${firstContainerObject2._runtime.id}`;

        const dataObjectHandle = firstContainerObject2.handle;

        // Verify that the local client's handle has the correct absolute path.
        assert.equal(dataObjectHandle.absolutePath, absolutePath, "The handle's absolutepath is not correct");

        // Add `firstContainerObject2's` handle to the root DDS of `firstContainerObject1` so that the
        // FluidDataObjectRuntime is different.
        firstContainerObject1._root.set("dataObject2", firstContainerObject2.handle);

        await opProcessingController.process();

        // Get the handle in the remote client.
        const remoteDataObjectHandle =
            secondContainerObject1._root.get<IFluidHandle<TestFluidObject>>("dataObject2");

        // Verify that the remote client's handle has the correct absolute path.
        assert.equal(remoteDataObjectHandle.absolutePath, absolutePath, "The remote handle's path is incorrect");

        // Get the dataObject from the handle.
        const container2DataObject2 = await remoteDataObjectHandle.get();
        // Verify that the `url` matches with that of the dataObject in container1.
        assert.equal(container2DataObject2.url, firstContainerObject2.url, "The urls do not match");
    });

    afterEach(async () => {
        await deltaConnectionServer.webSocketServer.close();
    });
});
