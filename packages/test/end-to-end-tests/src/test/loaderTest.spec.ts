/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    ContainerRuntimeFactoryWithDefaultDataStore,
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { IContainer, ILoader, LoaderHeader } from "@fluidframework/container-definitions";
import { Container } from "@fluidframework/container-loader";
import { IFluidCodeDetails } from "@fluidframework/core-interfaces";
import { IUrlResolver } from "@fluidframework/driver-definitions";
import { LocalResolver } from "@fluidframework/local-driver";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { createAndAttachContainer, createLocalLoader, OpProcessingController } from "@fluidframework/test-utils";
import { requestFluidObject } from "@fluidframework/runtime-utils";

class TestSharedDataObject1 extends DataObject {
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

class TestSharedDataObject2 extends DataObject {
    public get _root() {
        return this.root;
    }

    public get _runtime() {
        return this.runtime;
    }

    public get _context() {
        return this.context;
    }

    public get _id() {
        return this.id;
    }
}

const testSharedDataObjectFactory1 = new DataObjectFactory(
    "TestSharedDataObject1",
    TestSharedDataObject1,
    [],
    []);

const testSharedDataObjectFactory2 = new DataObjectFactory(
    "TestSharedDataObject2",
    TestSharedDataObject2,
    [],
    []);

describe("Loader.request", () => {
    const documentId = "loaderRequestTest";
    const documentLoadUrl = `fluid-test://localhost/${documentId}`;
    const codeDetails: IFluidCodeDetails = {
        package: "loaderRequestTestPackage",
        config: {},
    };

    let deltaConnectionServer: ILocalDeltaConnectionServer;
    let dataStore1: TestSharedDataObject1;
    let dataStore2: TestSharedDataObject2;
    let loader: ILoader;
    let urlResolver: IUrlResolver;
    let opProcessingController: OpProcessingController;

    async function createContainer(): Promise<IContainer> {
        const runtimeFactory =
            new ContainerRuntimeFactoryWithDefaultDataStore(
                testSharedDataObjectFactory1,
                [
                    [testSharedDataObjectFactory1.type, Promise.resolve(testSharedDataObjectFactory1)],
                    [testSharedDataObjectFactory2.type, Promise.resolve(testSharedDataObjectFactory2)],
                ],
            );
        loader = createLocalLoader([[codeDetails, runtimeFactory]], deltaConnectionServer, urlResolver);
        return createAndAttachContainer(documentId, codeDetails, loader, urlResolver);
    }

    beforeEach(async () => {
        deltaConnectionServer = LocalDeltaConnectionServer.create();
        urlResolver = new LocalResolver();

        const container = await createContainer();
        dataStore1 = await requestFluidObject(container, "default");

        dataStore2 = await testSharedDataObjectFactory2.createInstance(dataStore1._context.containerRuntime);

        // this binds dataStore2 to dataStore1
        dataStore1._root.set("key", dataStore2.handle);

        opProcessingController = new OpProcessingController(deltaConnectionServer);
        opProcessingController.addDeltaManagers(container.deltaManager);
    });

    it("can create the data objects with correct types", async () => {
        const testUrl1 = `${documentLoadUrl}/${dataStore1.id}`;
        const testDataStore1 = await requestFluidObject(loader, testUrl1);
        const testUrl2 = `${documentLoadUrl}/${dataStore2.id}`;
        const testDataStore2 = await requestFluidObject(loader, testUrl2);

        assert(testDataStore1 instanceof TestSharedDataObject1, "requestFromLoader returns the wrong type for default");
        assert(testDataStore2 instanceof TestSharedDataObject2, "requestFromLoader returns the wrong type for object2");
    });

    it("can create data object using url with second id, having correct type and id", async () => {
        const dataStore2Url = `${documentLoadUrl}/${dataStore2.id}`;
        const testDataStore = await requestFluidObject(loader, dataStore2Url);

        assert(testDataStore instanceof TestSharedDataObject2, "request returns the wrong type with long url");
        assert.equal(testDataStore.id, dataStore2.id, "id is not correct");
    });

    it("can create data object using url with second id, having distinct value from default", async () => {
        const url = `${documentLoadUrl}/${dataStore2.id}`;
        const testDataStore = await requestFluidObject<TestSharedDataObject2>(loader, url);

        dataStore1._root.set("color", "purple");
        dataStore2._root.set("color", "pink");

        assert.equal(dataStore1._root.get("color"), "purple", "datastore1 value incorrect");
        assert.equal(await testDataStore._root.wait("color"), dataStore2._root.get("color"),
            "two instances of same dataStore have different values");
    });

    it("loaded container is paused using loader pause flags", async () => {
        // load the container paused
        const container2 = await loader.resolve({ url: documentLoadUrl, headers: { [LoaderHeader.pause]: true } });
        opProcessingController.addDeltaManagers(container2.deltaManager);

        // create a new data store using the original container
        const newDataStore = await testSharedDataObjectFactory2.createInstance(dataStore1._context.containerRuntime);
        // this binds newDataStore to dataStore1
        dataStore1._root.set("key", newDataStore.handle);

        // Flush all the ops
        await opProcessingController.process();

        // the dataStore3 shouldn't exist in container2 yet.
        try {
            await requestFluidObject(container2, {
                url: newDataStore.id,
                headers: { wait: false },   // data store load default wait to true currently
            });
            assert(false, "Loader pause flags doesn't pause container op processing");
        } catch (e) {
            const topFrame: string | undefined = e?.stack.split("\n")[1].trimLeft();
            assert(topFrame?.startsWith("at DataStores.getDataStore"), "Expected an error in DataStores.getDataStore");
        }

        (container2 as Container).resume();

        // Flush all the ops
        await opProcessingController.process();

        const newDataStore2 = await requestFluidObject(container2, {
            url: newDataStore.id,
            headers: { wait: false },   // data store load default wait to true currently
        });
        assert(newDataStore2 instanceof TestSharedDataObject2, "requestFromLoader returns the wrong type for object2");
    });

    afterEach(async () => {
        await deltaConnectionServer.webSocketServer.close();
    });
});
