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
import { IFluidCodeDetails, ILoader } from "@fluidframework/container-definitions";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import {
    createLocalLoader,
    initializeLocalContainer,
} from "@fluidframework/test-utils";

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
}

const testSharedDataObjectFactory1 = new DataObjectFactory(
    "TestSharedDataObject",
    TestSharedDataObject1,
    [],
    []);

const testSharedDataObjectFactory2 = new DataObjectFactory(
    "TestSharedDataObject",
    TestSharedDataObject2,
    [],
    []);

describe("Loader.request", () => {
    const id = "fluid-test://localhost/cellTest";
    const codeDetails: IFluidCodeDetails = {
        package: "sharedCellTestPackage",
        config: {},
    };

    let deltaConnectionServer: ILocalDeltaConnectionServer;
    let dataStore1: TestSharedDataObject1;
    let dataStore2: TestSharedDataObject2;
    let loader: ILoader;

    async function requestObject(url: string) {
        const response = await loader.request({ url });
        if (response.status !== 200 || response.mimeType !== "fluid/object") {
            throw new Error(`Data Store with id: ${url} not found`);
        }
        return response.value;
    }
    async function requestFromLoader(myurl: string): Promise<TestSharedDataObject1> {
        const runtimeFactory =
            new ContainerRuntimeFactoryWithDefaultDataStore(
                "default",
                [
                    ["default", Promise.resolve(testSharedDataObjectFactory1)],
                    ["TestSharedDataObject", Promise.resolve(testSharedDataObjectFactory1)],
                ],
            );
        loader = createLocalLoader([[codeDetails, runtimeFactory]], deltaConnectionServer);
        await initializeLocalContainer(id, loader, codeDetails);
        return requestObject(myurl);
    }

    beforeEach(async () => {
        deltaConnectionServer = LocalDeltaConnectionServer.create();

        const url = `${id}/default`;
        dataStore1 = await requestFromLoader(url);

        dataStore2 = await testSharedDataObjectFactory2.createInstance(dataStore1._context) as TestSharedDataObject2;
        // this binds dataStore2 to dataStore1
        dataStore1._root.set("key",dataStore2.handle);
    });

    it("can create the data objects with correct types", async () => {
        assert(dataStore1 instanceof TestSharedDataObject1, "requestFromLoader returns the wrong type");
        assert(dataStore2 instanceof TestSharedDataObject2, "requestFromLoader returns the wrong type");
    });

    it("can create data object using url with second id, having correct type and id", async () => {
        const url = `${id}/${dataStore2.id}`;
        const myDataStore = await requestObject(url);

        assert(myDataStore instanceof TestSharedDataObject2, "requestFromLoader returns the wrong type");
        assert.equal(myDataStore.id, dataStore2.id, "id is not correct");
    });

    it("can create data object using url with second id, having distinct value from default", async () => {
        const url = `${id}/${dataStore2.id}`;
        const myDataStore = await requestObject(url);

        dataStore1._root.set("test_value","a");
        dataStore2._root.set("test_value","b");

        assert.equal(dataStore1._root.get("test_value"), "a", "datastore1 value incorrect");
        assert.equal(myDataStore._root.get("test_value"), dataStore2._root.get("test_value"), "values do not match");
    });
    // test for different types

    afterEach(async () => {
        await deltaConnectionServer.webSocketServer.close();
    });
});
