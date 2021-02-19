/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { SharedMap } from "@fluidframework/map";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import {
    TestFluidObject,
} from "@fluidframework/test-utils";
import {
    generateTest,
    ITestObjectProvider,
    TestDataObject,
} from "./compatUtils";

const tests = (argsFactory: () => ITestObjectProvider) => {
    let args: ITestObjectProvider;
    beforeEach(()=>{
        args = argsFactory();
    });
    afterEach(() => {
        args.reset();
    });

    // back-compat: added in 0.35 to support old and new paths.
    // Remove in future versions by leaving path intact.
    function comparePaths(path: string, referencePath: string) {
        const path2 = path
            .replace("/_channels/", "/")
            .replace("/_channels/", "/")
            .replace("/_custom", "");
        const referencePath2 = referencePath
            .replace("/_channels/", "/")
            .replace("/_channels/", "/")
            .replace("/_custom", "");
        return path2 === referencePath2;
    }

    let firstContainerObject1: TestDataObject;
    let firstContainerObject2: TestDataObject;
    let secondContainerObject1: TestDataObject;

    beforeEach(async () => {
        // Create a Container for the first client.
        const firstContainer = await args.makeTestContainer();
        firstContainerObject1 = await requestFluidObject<TestDataObject>(firstContainer, "default");
        const containerRuntime1 = firstContainerObject1._context.containerRuntime;
        const dataStore = await containerRuntime1.createDataStore(TestDataObject.type);
        firstContainerObject2 = await requestFluidObject<TestDataObject>(dataStore, "");

        // Load the Container that was created by the first client.
        const secondContainer = await args.loadTestContainer();
        secondContainerObject1 = await requestFluidObject<TestDataObject>(secondContainer, "default");

        await args.opProcessingController.process();
    });

    it("can store and retrieve a DDS from handle within same data store runtime", async () => {
        // Create a new SharedMap in `firstContainerObject1` and set a value.
        const sharedMap = SharedMap.create(firstContainerObject1._runtime);
        sharedMap.set("key1", "value1");

        const sharedMapHandle = sharedMap.handle;

        // The expected absolute path.
        const absolutePath = `/_channels/default/_channels/${sharedMap.id}`;

        // Verify that the local client's handle has the correct absolute path.
        assert(comparePaths(sharedMapHandle.absolutePath, absolutePath), "The handle's path is incorrect");

        // Add the handle to the root DDS of `firstContainerObject1`.
        firstContainerObject1._root.set("sharedMap", sharedMapHandle);

        await args.opProcessingController.process();

        // Get the handle in the remote client.
        const remoteSharedMapHandle = secondContainerObject1._root.get<IFluidHandle<SharedMap>>("sharedMap");
        assert(remoteSharedMapHandle);

        // Verify that the remote client's handle has the correct absolute path.
        assert(
            comparePaths(remoteSharedMapHandle.absolutePath, absolutePath),
            "The remote handle's path is incorrect");

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
        const absolutePath = `/_channels/${firstContainerObject2._runtime.id}/_channels/${sharedMap.id}`;

        // Verify that the local client's handle has the correct absolute path.
        assert(comparePaths(sharedMapHandle.absolutePath, absolutePath), "The handle's path is incorrect");

        // Add the handle to the root DDS of `firstContainerObject1` so that the FluidDataObjectRuntime is different.
        firstContainerObject1._root.set("sharedMap", sharedMap.handle);

        await args.opProcessingController.process();

        // Get the handle in the remote client.
        const remoteSharedMapHandle = secondContainerObject1._root.get<IFluidHandle<SharedMap>>("sharedMap");
        assert(remoteSharedMapHandle);

        // Verify that the remote client's handle has the correct absolute path.
        assert(
            comparePaths(remoteSharedMapHandle.absolutePath, absolutePath),
            "The remote handle's path is incorrect");

        // Get the SharedMap from the handle.
        const remoteSharedMap = await remoteSharedMapHandle.get();
        // Verify that it has the value that was set in the local client.
        assert.equal(remoteSharedMap.get("key1"), "value1", "The map does not have the value that was set");
    });

    it("can store and retrieve a PureDataObject from handle in different data store runtime", async () => {
        const dataObjectHandle = firstContainerObject2.handle;

        // The expected absolute path.
        const absolutePath = `/_channels/${firstContainerObject2._runtime.id}/_custom`;

        // Verify that the local client's handle has the correct absolute path.
        assert(
            comparePaths(dataObjectHandle.absolutePath, absolutePath),
            "The handle's absolutepath is not correct");

        // Add `firstContainerObject2's` handle to the root DDS of `firstContainerObject1` so that the
        // FluidDataObjectRuntime is different.
        firstContainerObject1._root.set("dataObject2", firstContainerObject2.handle);

        await args.opProcessingController.process();

        // Get the handle in the remote client.
        const remoteDataObjectHandle =
            secondContainerObject1._root.get<IFluidHandle<TestFluidObject>>("dataObject2");
        assert(remoteDataObjectHandle);

        // Verify that the remote client's handle has the correct absolute path.
        assert(
            comparePaths(remoteDataObjectHandle.absolutePath, absolutePath),
            "The remote handle's path is incorrect");

        // Get the dataObject from the handle.
        const container2DataObject2 = await remoteDataObjectHandle.get();
        // Verify that the `url` matches with that of the dataObject in container1.
        assert.equal(
            container2DataObject2.handle.absolutePath,
            firstContainerObject2.handle.absolutePath,
            "The urls do not match");
    });
};

describe("FluidObjectHandle", () => {
    generateTest(tests);
});
