/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
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
import { IRequest, IResponse, IRequestHeader } from "@fluidframework/core-interfaces";
import { createAndAttachContainer, ITestObjectProvider } from "@fluidframework/test-utils";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { describeNoCompat } from "@fluidframework/test-version-utils";
import { IContainerRuntimeBase } from "@fluidframework/runtime-definitions";
import { RuntimeHeaders } from "@fluidframework/container-runtime";

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

    // Returns query params (if any) in the request.
    // Used in tests that verify query params work correctly with loader.request
    public async request(request: IRequest): Promise<IResponse> {
        const url = request.url;
        const parsed = parse(url, true);
        if (parsed.query.inspect === "1") {
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

/**
 * Data object that handles requests that have headers. It returns the headers in the request. This is
 * used to validate that headers are correctly propagated all the way in the stack.
 */
class TestDataObjectWithRequestHeaders extends DataObject {
    public async request(request: IRequest): Promise<IResponse> {
        // If the request has headers, return a specialized response with the headers in the request.
        if (request.headers !== undefined) {
            return { value: request.headers, status: 200, mimeType: "request/headers" };
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

const testFactoryWithRequestHeaders = new DataObjectFactory(
    "TestDataObjectWithRequestHeaders",
    TestDataObjectWithRequestHeaders,
    [],
    []);

// REVIEW: enable compat testing?
describeNoCompat("Loader.request", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;

    let dataStore1: TestSharedDataObject1;
    let dataStore2: TestSharedDataObject2;
    let loader: IHostLoader;
    let container: IContainer;

    const innerRequestHandler = async (request: IRequest, runtime: IContainerRuntimeBase) =>
        runtime.IFluidHandleContext.resolveHandle(request);

    const runtimeFactory =
        new ContainerRuntimeFactoryWithDefaultDataStore(
            testSharedDataObjectFactory1,
            [
                [testSharedDataObjectFactory1.type, Promise.resolve(testSharedDataObjectFactory1)],
                [testSharedDataObjectFactory2.type, Promise.resolve(testSharedDataObjectFactory2)],
                [testFactoryWithRequestHeaders.type, Promise.resolve(testFactoryWithRequestHeaders)],
            ],
            undefined,
            [innerRequestHandler],
        );

    beforeEach(async () => {
        provider = getTestObjectProvider();
        loader = provider.createLoader([[provider.defaultCodeDetails, runtimeFactory]]);
        container = await createAndAttachContainer(
            provider.defaultCodeDetails,
            loader,
            provider.driver.createCreateNewRequest(provider.documentId),
        );
        dataStore1 = await requestFluidObject(container, "default");

        dataStore2 = await testSharedDataObjectFactory2.createInstance(dataStore1._context.containerRuntime);

        // this binds dataStore2 to dataStore1
        dataStore1._root.set("key", dataStore2.handle);

        await provider.ensureSynchronized();
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

        await provider.ensureSynchronized();

        assert.equal(dataStore1._root.get("color"), "purple", "datastore1 value incorrect");
        assert.equal(testDataStore._root.get("color"), dataStore2._root.get("color"),
            "two instances of same dataStore have different values");
    });

    it("loaded container is paused using loader pause flags", async () => {
        // load the container paused
        const headers: IRequestHeader = {
            [LoaderHeader.cache]: false,
            [LoaderHeader.loadMode]: { deltaConnection: "delayed" },
        };
        const url = await container.getAbsoluteUrl("");
        assert(url, "url is undefined");
        const container2 = await loader.resolve({ url, headers });

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

        (container2 as Container).connect();

        // Flush all the ops
        await provider.ensureSynchronized();

        const newDataStore2 = await requestFluidObject(container2, { url: newDataStore.id });
        assert(newDataStore2 instanceof TestSharedDataObject2, "requestFromLoader returns the wrong type for object2");
    });

    it("caches the loaded container across multiple requests as expected", async () => {
        const url = await container.getAbsoluteUrl("");
        assert(url, "url is undefined");
        // load the containers paused
        const headers: IRequestHeader = { [LoaderHeader.loadMode]: { deltaConnection: "delayed" } };
        const container1 = await loader.resolve({ url, headers });
        const container2 = await loader.resolve({ url, headers });

        assert.strictEqual(container1, container2, "container not cached across multiple loader requests");

        // create a new data store using the original container
        const newDataStore = await testSharedDataObjectFactory2.createInstance(dataStore1._context.containerRuntime);
        // this binds newDataStore to dataStore1
        dataStore1._root.set("key", newDataStore.handle);

        (container1 as Container).connect();

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
        const url = await container.getAbsoluteUrl("");
        assert(url, "url is undefined");
        const testUrl = `${url}${url.includes("?") ? "&query1=1&query2=2&inspect=1" : "?query1=1&query2=2&inspect=1"}`;

        const response = await loader.request({ url: testUrl });
        const searchParams = new URLSearchParams(response.value);
        assert.strictEqual(searchParams.get("query1"), "1", "request did not pass the right query to the data store");
        assert.strictEqual(searchParams.get("query2"), "2", "request did not pass the right query to the data store");
    });

    it("can handle requests with headers", async () => {
        const dataStoreWithRequestHeaders =
            await testFactoryWithRequestHeaders.createInstance(dataStore1._context.containerRuntime);
        dataStore1._root.set("key", dataStoreWithRequestHeaders.handle);

        // Flush all the ops
        await provider.ensureSynchronized();

        const url = await container.getAbsoluteUrl(dataStoreWithRequestHeaders.id);
        assert(url, "Container should return absolute url");

        const headers = { wait: false, [RuntimeHeaders.externalRequest]: true };
        // Request to the newly created data store with headers.
        const response = await loader.request({ url, headers });

        assert.strictEqual(response.status, 200, "Did not return the correct status");
        assert.strictEqual(response.mimeType, "request/headers", "Did not get the correct mimeType");
        assert.deepStrictEqual(response.value, headers, "Did not get the correct headers in the response");
    });
});
