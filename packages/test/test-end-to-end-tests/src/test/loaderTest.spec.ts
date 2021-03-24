/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { parse } from "url";
import {
    ContainerRuntimeFactoryWithDefaultDataStore,
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { IContainer, IHostLoader, LoaderHeader } from "@fluidframework/container-definitions";
import { Container } from "@fluidframework/container-loader";
import { IFluidCodeDetails, IRequest, IResponse } from "@fluidframework/core-interfaces";
import {
    createAndAttachContainer,
    createDocumentId,
    createLoader,
    ITestObjectProvider,
    OpProcessingController,
} from "@fluidframework/test-utils";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { describeNoCompat } from "@fluidframework/test-version-utils";
import { ChildLogger } from "@fluidframework/telemetry-utils";

class TestSharedDataObject1 extends DataObject {
    public inspectRequest: boolean = false;

    public get _root() {
        return this.root;
    }

    public get _runtime() {
        return this.runtime;
    }

    public get _context() {
        return this.context;
    }

    // Returns query params (if any) in the request.
    // Used in tests that verify query params work correctly with loader.request
    public async request(request: IRequest): Promise<IResponse> {
        const url = request.url;
        const parsed = parse(url, true);
        if (this.inspectRequest) {
            // returning query params instead of the data object for testing purposes
            return { mimeType: "text/plain", status: 200, value: `${parsed.search}` };
        } else if (parsed?.pathname === "/") {
            return { value: this, status: 200, mimeType: "fluid/object" };
        } else {
            return super.request(request);
        }
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

    public async request(request: IRequest): Promise<IResponse> {
        const url = request.url;
        const parsed = parse(url, true);
        if (parsed?.pathname === "/") {
            return { value: this, status: 200, mimeType: "fluid/object" };
        } else {
            return super.request(request);
        }
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

// REVIEW: enable compat testing?
describeNoCompat("Loader.request", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    const codeDetails: IFluidCodeDetails = {
        package: "loaderRequestTestPackage",
        config: {},
    };

    let dataStore1: TestSharedDataObject1;
    let dataStore2: TestSharedDataObject2;
    let loader: IHostLoader;
    let opProcessingController: OpProcessingController;

    async function createContainer(documentId: string): Promise<IContainer> {
        const runtimeFactory =
            new ContainerRuntimeFactoryWithDefaultDataStore(
                testSharedDataObjectFactory1,
                [
                    [testSharedDataObjectFactory1.type, Promise.resolve(testSharedDataObjectFactory1)],
                    [testSharedDataObjectFactory2.type, Promise.resolve(testSharedDataObjectFactory2)],
                ],
            );
        loader = createLoader(
            [[codeDetails, runtimeFactory]],
            provider.documentServiceFactory,
            provider.urlResolver,
            ChildLogger.create(getTestLogger?.(), undefined, { all: { driverType: provider.driver?.type } }),
        );
        return createAndAttachContainer(
            codeDetails, loader, provider.driver.createCreateNewRequest(documentId));
    }
    let container: IContainer;
    beforeEach(async () => {
        provider = getTestObjectProvider();
        const documentId = createDocumentId();
        container = await createContainer(documentId);
        dataStore1 = await requestFluidObject(container, "default");

        dataStore2 = await testSharedDataObjectFactory2.createInstance(dataStore1._context.containerRuntime);

        // this binds dataStore2 to dataStore1
        dataStore1._root.set("key", dataStore2.handle);

        opProcessingController = provider.opProcessingController;
        opProcessingController.addDeltaManagers(container.deltaManager);
    });

    it("can create the data objects with correct types", async () => {
        const testUrl1 = await container.getAbsoluteUrl(dataStore1.handle.absolutePath);
        assert(testUrl1, "dataStore1 url is undefined");
        const testDataStore1 = await requestFluidObject(loader, testUrl1);
        const testUrl2 = await container.getAbsoluteUrl(dataStore2.handle.absolutePath);
        assert(testUrl2, "dataStore2 url is undefined");
        const testDataStore2 = await requestFluidObject(loader, testUrl2);

        assert(testDataStore1 instanceof TestSharedDataObject1, "requestFromLoader returns the wrong type for default");
        assert(testDataStore2 instanceof TestSharedDataObject2, "requestFromLoader returns the wrong type for object2");
    });

    it("can create data object using url with second id, having correct type and id", async () => {
        const dataStore2Url = await container.getAbsoluteUrl(dataStore2.handle.absolutePath);
        assert(dataStore2Url, "dataStore2 url is undefined");
        const testDataStore = await requestFluidObject(loader, dataStore2Url);

        assert(testDataStore instanceof TestSharedDataObject2, "request returns the wrong type with long url");
        assert.equal(testDataStore.id, dataStore2.id, "id is not correct");
    });

    it("can create data object using url with second id, having distinct value from default", async () => {
        const url = await container.getAbsoluteUrl(dataStore2.handle.absolutePath);
        assert(url, "dataStore2 url is undefined");
        const testDataStore = await requestFluidObject<TestSharedDataObject2>(loader, url);

        dataStore1._root.set("color", "purple");
        dataStore2._root.set("color", "pink");

        assert.equal(dataStore1._root.get("color"), "purple", "datastore1 value incorrect");
        assert.equal(await testDataStore._root.wait("color"), dataStore2._root.get("color"),
            "two instances of same dataStore have different values");
    });

    it("loaded container is paused using loader pause flags", async () => {
        // load the container paused
        const headers = {
            [LoaderHeader.cache]: false,
            [LoaderHeader.pause]: true,
        };
        const url = await container.getAbsoluteUrl("");
        assert(url, "url is undefined");
        const container2 = await loader.resolve({ url, headers });
        opProcessingController.addDeltaManagers(container2.deltaManager);

        // create a new data store using the original container
        const newDataStore = await testSharedDataObjectFactory2.createInstance(dataStore1._context.containerRuntime);
        // this binds newDataStore to dataStore1
        dataStore1._root.set("key", newDataStore.handle);

        // the dataStore3 shouldn't exist in container2 yet (because the loader isn't caching the container)
        let success = true;
        try {
            await requestFluidObject(container2, {
                url: newDataStore.id,
                headers: { wait: false },   // data store load default wait to true currently
            });
            success = false;
        } catch (e) {
        }
        assert(success, "Loader pause flags doesn't pause container op processing");

        (container2 as Container).resume();

        // Flush all the ops
        await provider.ensureSynchronized();

        const newDataStore2 = await requestFluidObject(container2, { url: newDataStore.id });
        assert(newDataStore2 instanceof TestSharedDataObject2, "requestFromLoader returns the wrong type for object2");
    });

    it("caches the loaded container across multiple requests as expected", async () => {
        const url = await container.getAbsoluteUrl("");
        assert(url, "url is undefined");
        // load the containers paused
        const container1 = await loader.resolve({ url, headers: { [LoaderHeader.pause]: true } });
        opProcessingController.addDeltaManagers(container1.deltaManager);
        const container2 = await loader.resolve({ url, headers: { [LoaderHeader.pause]: true } });

        assert.strictEqual(container1, container2, "container not cached across multiple loader requests");

        // create a new data store using the original container
        const newDataStore = await testSharedDataObjectFactory2.createInstance(dataStore1._context.containerRuntime);
        // this binds newDataStore to dataStore1
        dataStore1._root.set("key", newDataStore.handle);

        (container1 as Container).resume();

        // Flush all the ops
        await provider.ensureSynchronized();

        const sameDataStore1 = await requestFluidObject(container1, {
            url: newDataStore.id,
            headers: { wait: false },   // data store load default wait to true currently
        });
        const sameDataStore2 = await requestFluidObject(container2, {
            url: newDataStore.id,
            headers: { wait: false },   // data store load default wait to true currently
        });
        assert.strictEqual(sameDataStore1, sameDataStore2,
            "same containers do not return same data store for same request");
    });

    it("can handle url with query params", async () => {
        dataStore1.inspectRequest = true;
        const url = await container.getAbsoluteUrl("");
        assert(url, "url is undefined");
        const testUrl = `${url}${url.includes("?") ? "&query1=1&query2=2" : "?query1=1&query2=2"}`;

        const response = await loader.request({ url: testUrl });
        const searchParams = new URLSearchParams(response.value);
        assert.strictEqual(searchParams.get("query1"), "1", "request did not pass the right query to the data store");
        assert.strictEqual(searchParams.get("query2"), "2", "request did not pass the right query to the data store");
    });
});
