/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IFluidHandle, IRequest } from "@fluidframework/core-interfaces";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { describeFullCompat, ITestDataObject, TestDataObjectType } from "@fluidframework/test-version-utils";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ContainerRuntimeFactoryWithDefaultDataStore, DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { IContainerRuntimeBase } from "@fluidframework/runtime-definitions";
import { IDataStoreWithBindToContext_Deprecated } from "@fluidframework/container-runtime-definitions";

class InnerDataObject extends DataObject implements ITestDataObject {
    public get _root() {
        return this.root;
    }

    public get _context() {
        return this.context;
    }

    public get _runtime() {
        return this.runtime;
    }
}
const innerDataObjectFactory = new DataObjectFactory(
    "InnerDataObject",
    InnerDataObject,
    [],
    [],
);

class OuterDataObject extends DataObject implements ITestDataObject {
    public get _root() {
        return this.root;
    }

    public get _context() {
        return this.context;
    }

    public get _runtime() {
        return this.runtime;
    }

    private readonly innerDataStoreKey = "innerDataStore";

    protected async initializingFirstTime(): Promise<void> {
        const innerDataStoreRouter = await this._context.containerRuntime.createDataStore(innerDataObjectFactory.type);
        const innerDataStore = await requestFluidObject<ITestDataObject>(innerDataStoreRouter, "");

        this.root.set(this.innerDataStoreKey, innerDataStore.handle);

        // IMPORTANT: Without calling bindToContext, requesting this inner object deadlocks (handle.get is fine)
        (innerDataStoreRouter as IDataStoreWithBindToContext_Deprecated)?.fluidDataStoreChannel?.bindToContext?.();
    }

    protected async hasInitialized(): Promise<void> {
        const innerDataStoreHandle = this.root.get<IFluidHandle<InnerDataObject>>(this.innerDataStoreKey);
        assert(innerDataStoreHandle !== undefined, "inner data store handle is missing");

        const innerDataStore =
            await this._context.containerRuntime.request({ url: innerDataStoreHandle.absolutePath });
        assert(innerDataStore.status === 200, "could not load inner data store");
    }
}
const outerDataObjectFactory = new DataObjectFactory(
    "OuterDataObject",
    OuterDataObject,
    [],
    [],
);

describeFullCompat("bindToContext tests", (getTestObjectProvider) => {
    let provider: ITestObjectProvider;
    const innerRequestHandler = async (request: IRequest, runtime: IContainerRuntimeBase) =>
        runtime.IFluidHandleContext.resolveHandle(request);

    beforeEach(() => {
        provider = getTestObjectProvider();
    });

    it("_createDataStoreWithProps returns something castable to IDataStoreWithBindToContext_Deprecated", async () => {
        const loader = provider.makeTestLoader();
        const container = await loader.createDetachedContainer(provider.defaultCodeDetails);
        // Get the default (root) dataStore from the detached container.
        const mainDataStore = await requestFluidObject<ITestDataObject>(container, "/");

        const newDataStore =
            await mainDataStore._context.containerRuntime._createDataStoreWithProps(TestDataObjectType);

        const bindToContext =
            (newDataStore as IDataStoreWithBindToContext_Deprecated)?.fluidDataStoreChannel?.bindToContext;
        assert.equal(typeof bindToContext, "function", "Expected to find bindToContext function");
    });

    it("Requesting not bound data stores in detached container", async () => {
        const request = provider.driver.createCreateNewRequest(provider.documentId);
        const loader = provider.makeTestLoader();
        const container = await loader.createDetachedContainer(provider.defaultCodeDetails);
        // Get the default (root) dataStore from the detached container.
        const mainDataStore = await requestFluidObject<ITestDataObject>(container, "/");

        // Create another data store and bind it by adding its handle in the root data store's DDS.
        const dataStore2 = await requestFluidObject<ITestDataObject>(
            await mainDataStore._context.containerRuntime.createDataStore(TestDataObjectType), "");
        mainDataStore._root.set("dataStore2", dataStore2.handle);

        // Request the new data store via the request API on the container.
        const dataStore2Response = await container.request({ url: dataStore2.handle.absolutePath });
        assert(
            dataStore2Response.mimeType === "fluid/object" && dataStore2Response.status === 200,
            "Unable to load bound data store in detached container",
        );
        await container.attach(request);
    });

    it("Requesting data store during before outer data store completes initialization", async () => {
        const containerRuntimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
            outerDataObjectFactory,
            [
                [outerDataObjectFactory.type, Promise.resolve(outerDataObjectFactory)],
                [innerDataObjectFactory.type, Promise.resolve(innerDataObjectFactory)],
            ],
            undefined,
            [innerRequestHandler],
        );
        const request = provider.driver.createCreateNewRequest(provider.documentId);
        const loader = provider.createLoader([[provider.defaultCodeDetails, containerRuntimeFactory]]);

        const container = await loader.createDetachedContainer(provider.defaultCodeDetails);
        // Get the outer dataStore from the detached container.
        const outerDataStore = await requestFluidObject<ITestDataObject>(container, "/");
        assert(outerDataStore !== undefined, "Could not load outer data store");

        await container.attach(request);
    });

    it("Requesting data store during before outer data store (non-root) completes initialization", async () => {
        const containerRuntimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
            innerDataObjectFactory,
            [
                [outerDataObjectFactory.type, Promise.resolve(outerDataObjectFactory)],
                [innerDataObjectFactory.type, Promise.resolve(innerDataObjectFactory)],
            ],
            undefined,
            [innerRequestHandler],
        );
        const request = provider.driver.createCreateNewRequest(provider.documentId);
        const loader = provider.createLoader([[provider.defaultCodeDetails, containerRuntimeFactory]]);

        const container = await loader.createDetachedContainer(provider.defaultCodeDetails);

        // Get the default dataStore from the detached container.
        const defaultDataStore = await requestFluidObject<ITestDataObject>(container, "/");

        // Create another data store and bind it by adding its handle in the root data store's DDS.
        const dataStore2 = await outerDataObjectFactory.createInstance(defaultDataStore._context.containerRuntime);
        defaultDataStore._root.set("dataStore2", dataStore2.handle);

        await container.attach(request);
    });
});
