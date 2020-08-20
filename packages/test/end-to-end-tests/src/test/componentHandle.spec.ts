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
import { IFluidCodeDetails } from "@fluidframework/container-definitions";
import { Container } from "@fluidframework/container-loader";
import { SharedMap } from "@fluidframework/map";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import {
    createLocalLoader,
    OpProcessingController,
    initializeLocalContainer,
    TestFluidObject,
} from "@fluidframework/test-utils";

/**
 * Test dataStore that extends DataObject so that we can test the FluidOjectHandle created by PureDataObject.
 */
class TestSharedDataStore extends DataObject {
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

const TestSharedDataStoreFactory = new DataObjectFactory(
    "TestSharedDataStore",
    TestSharedDataStore,
    [SharedMap.getFactory()],
    []);

describe("FluidOjectHandle", () => {
    const id = "fluid-test://localhost/dataStoreHandleTest";
    const codeDetails: IFluidCodeDetails = {
        package: "dataStoreHandleTestPackage",
        config: {},
    };

    let deltaConnectionServer: ILocalDeltaConnectionServer;
    let opProcessingController: OpProcessingController;
    let firstContainerDataStore1: TestSharedDataStore;
    let firstContainerDataStore2: TestSharedDataStore;
    let secondContainerDataStore1: TestSharedDataStore;

    async function requestFluidObject(dataStoreId: string, container: Container): Promise<TestSharedDataStore> {
        const response = await container.request({ url: dataStoreId });
        if (response.status !== 200 || response.mimeType !== "fluid/object") {
            throw new Error(`DataStore with id: ${dataStoreId} not found`);
        }
        return response.value as TestSharedDataStore;
    }

    async function createContainer(): Promise<Container> {
        const runtimeFactory =
            new ContainerRuntimeFactoryWithDefaultDataStore(
                "default",
                [
                    ["default", Promise.resolve(TestSharedDataStoreFactory)],
                    ["TestSharedDataStore", Promise.resolve(TestSharedDataStoreFactory)],
                ],
            );

        const loader = createLocalLoader([[codeDetails, runtimeFactory]], deltaConnectionServer);
        return initializeLocalContainer(id, loader, codeDetails);
    }

    beforeEach(async () => {
        deltaConnectionServer = LocalDeltaConnectionServer.create();

        const firstContainer = await createContainer();
        firstContainerDataStore1 = await requestFluidObject("default", firstContainer);
        firstContainerDataStore2 =
            await TestSharedDataStoreFactory.createInstance(firstContainerDataStore1._context) as TestSharedDataStore;

        const secondContainer = await createContainer();
        secondContainerDataStore1 = await requestFluidObject("default", secondContainer);

        opProcessingController = new OpProcessingController(deltaConnectionServer);
        opProcessingController.addDeltaManagers(
            firstContainerDataStore1._runtime.deltaManager, secondContainerDataStore1._runtime.deltaManager);

        await opProcessingController.process();
    });

    it("should generate the absolute path for ContainerRuntime correctly", () => {
        // The expected absolute path for the ContainerRuntime is empty string.
        const absolutePath = "";

        // Verify that the local client's ContainerRuntime has the correct absolute path.
        const containerRuntime1 = firstContainerDataStore1._context.containerRuntime.IFluidHandleContext;
        assert.equal(containerRuntime1.absolutePath, absolutePath, "The ContainerRuntime's path is incorrect");

        // Verify that the remote client's ContainerRuntime has the correct absolute path.
        const containerRuntime2 = secondContainerDataStore1._context.containerRuntime.IFluidHandleContext;
        assert.equal(containerRuntime2.absolutePath, absolutePath, "The remote ContainerRuntime's path is incorrect");
    });

    it("should generate the absolute path for FluidDataStoreRuntime correctly", () => {
        // The expected absolute path for the FluidDataStoreRuntime.
        const absolutePath = `/${firstContainerDataStore1._runtime.id}`;

        // Verify that the local client's FluidDataStoreRuntime has the correct absolute path.
        const dataStoreRuntime1 = firstContainerDataStore1._runtime.IFluidHandleContext;
        assert.equal(dataStoreRuntime1.absolutePath, absolutePath, "The FluidDataStoreRuntime's path is incorrect");

        // Verify that the remote client's FluidDataStoreRuntime has the correct absolute path.
        const dataStoreRuntime2 = secondContainerDataStore1._runtime.IFluidHandleContext;
        assert.equal(
            dataStoreRuntime2.absolutePath,
            absolutePath,
            "The remote FluidDataStoreRuntime's path is incorrect");
    });

    it("can store and retrieve a DDS from handle within same data store runtime", async () => {
        // Create a new SharedMap in `firstContainerDataStore1` and set a value.
        const sharedMap = SharedMap.create(firstContainerDataStore1._runtime);
        sharedMap.set("key1", "value1");

        const sharedMapHandle = sharedMap.handle;

        // The expected absolute path.
        const absolutePath = `/default/${sharedMap.id}`;

        // Verify that the local client's handle has the correct absolute path.
        assert.equal(sharedMapHandle.absolutePath, absolutePath, "The handle's path is incorrect");

        // Add the handle to the root DDS of `firstContainerDataStore1`.
        firstContainerDataStore1._root.set("sharedMap", sharedMapHandle);

        await opProcessingController.process();

        // Get the handle in the remote client.
        const remoteSharedMapHandle = secondContainerDataStore1._root.get<IFluidHandle<SharedMap>>("sharedMap");

        // Verify that the remote client's handle has the correct absolute path.
        assert.equal(remoteSharedMapHandle.absolutePath, absolutePath, "The remote handle's path is incorrect");

        // Get the SharedMap from the handle.
        const remoteSharedMap = await remoteSharedMapHandle.get();
        // Verify that it has the value that was set in the local client.
        assert.equal(remoteSharedMap.get("key1"), "value1", "The map does not have the value that was set");
    });

    it("can store and retrieve a DDS from handle in different data store runtime", async () => {
        // Create a new SharedMap in `firstContainerDataStore2` and set a value.
        const sharedMap = SharedMap.create(firstContainerDataStore2._runtime);
        sharedMap.set("key1", "value1");

        const sharedMapHandle = sharedMap.handle;

        // The expected absolute path.
        const absolutePath = `/${firstContainerDataStore2._runtime.id}/${sharedMap.id}`;

        // Verify that the local client's handle has the correct absolute path.
        assert.equal(sharedMapHandle.absolutePath, absolutePath, "The handle's path is incorrect");

        // Add the handle to the root DDS of `firstContainerDataStore1` so that the FluidDataStoreRuntime is different.
        firstContainerDataStore1._root.set("sharedMap", sharedMap.handle);

        await opProcessingController.process();

        // Get the handle in the remote client.
        const remoteSharedMapHandle = secondContainerDataStore1._root.get<IFluidHandle<SharedMap>>("sharedMap");

        // Verify that the remote client's handle has the correct absolute path.
        assert.equal(remoteSharedMapHandle.absolutePath, absolutePath, "The remote handle's path is incorrect");

        // Get the SharedMap from the handle.
        const remoteSharedMap = await remoteSharedMapHandle.get();
        // Verify that it has the value that was set in the local client.
        assert.equal(remoteSharedMap.get("key1"), "value1", "The map does not have the value that was set");
    });

    it("can store and retrieve a PureDataObject from handle in different data store runtime", async () => {
        // The expected absolute path.
        const absolutePath = `/${firstContainerDataStore2._runtime.id}`;

        const dataStoreHandle = firstContainerDataStore2.handle;

        // Verify that the local client's handle has the correct absolute path.
        assert.equal(dataStoreHandle.absolutePath, absolutePath, "The handle's absolutepath is not correct");

        // Add `firstContainerDataStore2's` handle to the root DDS of `firstContainerDataStore1` so that the
        // FluidDataStoreRuntime is different.
        firstContainerDataStore1._root.set("dataStore2", firstContainerDataStore2.handle);

        await opProcessingController.process();

        // Get the handle in the remote client.
        const remoteDataStoreHandle =
            secondContainerDataStore1._root.get<IFluidHandle<TestFluidObject>>("dataStore2");

        // Verify that the remote client's handle has the correct absolute path.
        assert.equal(remoteDataStoreHandle.absolutePath, absolutePath, "The remote handle's path is incorrect");

        // Get the dataStore from the handle.
        const container2DataStore2 = await remoteDataStoreHandle.get();
        // Verify that the `url` matches with that of the dataStore in container1.
        assert.equal(container2DataStore2.url, firstContainerDataStore2.url, "The urls do not match");
    });

    afterEach(async () => {
        await deltaConnectionServer.webSocketServer.close();
    });
});
