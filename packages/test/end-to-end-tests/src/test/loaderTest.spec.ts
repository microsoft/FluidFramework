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

const testSharedDataStoreFactory = new DataObjectFactory(
    "TestSharedDataStore",
    TestSharedDataStore,
    [],
    []);

describe("Cell", () => {
    const id = "fluid-test://localhost/cellTest";
    const codeDetails: IFluidCodeDetails = {
        package: "sharedCellTestPackage",
        config: {},
    };

    let deltaConnectionServer: ILocalDeltaConnectionServer;
    let dataStore1: TestSharedDataStore;
    let dataStore2: TestSharedDataStore;
    let loader: ILoader;

    async function requestObject(url: string) {
        const response = await loader.request({ url });
        if (response.status !== 200 || response.mimeType !== "fluid/object") {
            throw new Error(`Data Store with id: ${url} not found`);
        }
        return response.value;
    }
    async function requestFromLoader(myurl: string): Promise<TestSharedDataStore> {
        const runtimeFactory =
            new ContainerRuntimeFactoryWithDefaultDataStore(
                "default",
                [
                    ["default", Promise.resolve(testSharedDataStoreFactory)],
                    ["TestSharedDataStore", Promise.resolve(testSharedDataStoreFactory)],
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

        dataStore2 = await testSharedDataStoreFactory.createInstance(dataStore1._context) as TestSharedDataStore;

        dataStore1._root.set("key",dataStore2.handle);
        dataStore1._root.set("test_value","a");
        dataStore2._root.set("test_value","b");
    });

    it("return type is correct", async () => {
        assert(dataStore1 instanceof TestSharedDataStore, "requestFromLoader returns the right type");
        assert(dataStore2 instanceof TestSharedDataStore, "requestFromLoader returns the right type");
    });

    it("returns correct type with new url", async () => {
        const url = `${id}/${dataStore2.id}`;
        const myDataStore = await requestObject(url);

        assert(myDataStore instanceof TestSharedDataStore, "requestFromLoader returns the wrong type");
        assert.equal(myDataStore.id, dataStore2.id, "id is not correct");
    });

    it("returns correct value with new url", async () => {
        const url = `${id}/${dataStore2.id}`;
        const myDataStore = await requestObject(url);

        assert.equal(dataStore1._root.get("test_value"), "a", "datastore1 value incorrect");
        assert.equal(myDataStore._root.get("test_value"), dataStore2._root.get("test_value"), "values do not match");
    });
    // test for different types

    afterEach(async () => {
        await deltaConnectionServer.webSocketServer.close();
    });
});
