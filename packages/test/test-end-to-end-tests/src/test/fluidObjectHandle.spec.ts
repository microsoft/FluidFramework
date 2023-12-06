/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { SharedMap } from "@fluidframework/map";
import {
	TestFluidObject,
	ITestObjectProvider,
	getContainerEntryPointBackCompat,
	getDataStoreEntryPointBackCompat,
} from "@fluidframework/test-utils";
import {
	describeCompat,
	ITestDataObject,
	TestDataObjectType,
} from "@fluid-private/test-version-utils";
import { ContainerRuntime } from "@fluidframework/container-runtime";

describeCompat("FluidObjectHandle", "FullCompat", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;
	beforeEach(function () {
		provider = getTestObjectProvider();
	});

	let firstContainerObject1: ITestDataObject;
	let firstContainerObject2: ITestDataObject;
	let secondContainerObject1: ITestDataObject;

	beforeEach(async () => {
		// Create a Container for the first client.
		const firstContainer = await provider.makeTestContainer();
		firstContainerObject1 =
			await getContainerEntryPointBackCompat<ITestDataObject>(firstContainer);
		const containerRuntime1 = firstContainerObject1._context.containerRuntime;
		const dataStore = await containerRuntime1.createDataStore(TestDataObjectType);
		firstContainerObject2 = await getDataStoreEntryPointBackCompat<ITestDataObject>(dataStore);

		// Load the Container that was created by the first client.
		const secondContainer = await provider.loadTestContainer();
		secondContainerObject1 =
			await getContainerEntryPointBackCompat<ITestDataObject>(secondContainer);

		await provider.ensureSynchronized();
	});

	it("should generate the absolute path for ContainerRuntime correctly", () => {
		// The expected absolute path for the ContainerRuntime is empty string.
		const absolutePath = "";

		// Verify that the local client's ContainerRuntime has the correct absolute path.
		const containerRuntime1 = (
			firstContainerObject1._context.containerRuntime as ContainerRuntime
		).IFluidHandleContext;
		assert.equal(
			containerRuntime1.absolutePath,
			absolutePath,
			"The ContainerRuntime's path is incorrect",
		);

		// Verify that the remote client's ContainerRuntime has the correct absolute path.
		const containerRuntime2 = (
			secondContainerObject1._context.containerRuntime as ContainerRuntime
		).IFluidHandleContext;
		assert.equal(
			containerRuntime2.absolutePath,
			absolutePath,
			"The remote ContainerRuntime's path is incorrect",
		);
	});

	it("should generate the absolute path for FluidDataObjectRuntime correctly", function () {
		// The expected absolute path for the FluidDataObjectRuntime.
		const absolutePath = `/${firstContainerObject1._runtime.id}`;

		// Verify that the local client's FluidDataObjectRuntime has the correct absolute path.
		const fluidHandleContext11 = firstContainerObject1._runtime.rootRoutingContext;
		assert.equal(
			fluidHandleContext11.absolutePath,
			absolutePath,
			"The FluidDataObjectRuntime's path is incorrect",
		);

		// Verify that the remote client's FluidDataObjectRuntime has the correct absolute path.
		const fluidHandleContext12 = secondContainerObject1._runtime.rootRoutingContext;
		assert.equal(
			fluidHandleContext12.absolutePath,
			absolutePath,
			"The remote FluidDataObjectRuntime's path is incorrect",
		);
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

		await provider.ensureSynchronized();

		// Get the handle in the remote client.
		const remoteSharedMapHandle =
			secondContainerObject1._root.get<IFluidHandle<SharedMap>>("sharedMap");
		assert(remoteSharedMapHandle);

		// Verify that the remote client's handle has the correct absolute path.
		assert.equal(
			remoteSharedMapHandle.absolutePath,
			absolutePath,
			"The remote handle's path is incorrect",
		);

		// Get the SharedMap from the handle.
		const remoteSharedMap = await remoteSharedMapHandle.get();
		// Verify that it has the value that was set in the local client.
		assert.equal(
			remoteSharedMap.get("key1"),
			"value1",
			"The map does not have the value that was set",
		);
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

		await provider.ensureSynchronized();

		// Get the handle in the remote client.
		const remoteSharedMapHandle =
			secondContainerObject1._root.get<IFluidHandle<SharedMap>>("sharedMap");
		assert(remoteSharedMapHandle);

		// Verify that the remote client's handle has the correct absolute path.
		assert.equal(
			remoteSharedMapHandle.absolutePath,
			absolutePath,
			"The remote handle's path is incorrect",
		);

		// Get the SharedMap from the handle.
		const remoteSharedMap = await remoteSharedMapHandle.get();
		// Verify that it has the value that was set in the local client.
		assert.equal(
			remoteSharedMap.get("key1"),
			"value1",
			"The map does not have the value that was set",
		);
	});

	it("can store and retrieve a PureDataObject from handle in different data store runtime", async () => {
		// The expected absolute path.
		const absolutePath = `/${firstContainerObject2._runtime.id}`;

		const dataObjectHandle = firstContainerObject2.handle;

		// Verify that the local client's handle has the correct absolute path.
		assert.equal(
			dataObjectHandle.absolutePath,
			absolutePath,
			"The handle's absolutepath is not correct",
		);

		// Add `firstContainerObject2's` handle to the root DDS of `firstContainerObject1` so that the
		// FluidDataObjectRuntime is different.
		firstContainerObject1._root.set("dataObject2", firstContainerObject2.handle);

		await provider.ensureSynchronized();

		// Get the handle in the remote client.
		const remoteDataObjectHandle =
			secondContainerObject1._root.get<IFluidHandle<TestFluidObject>>("dataObject2");
		assert(remoteDataObjectHandle);

		// Verify that the remote client's handle has the correct absolute path.
		assert.equal(
			remoteDataObjectHandle.absolutePath,
			absolutePath,
			"The remote handle's path is incorrect",
		);

		// Get the dataObject from the handle.
		const container2DataObject2 = await remoteDataObjectHandle.get();
		// Verify that the `url` matches with that of the dataObject in container1.
		assert.equal(
			container2DataObject2.handle.absolutePath,
			firstContainerObject2.handle.absolutePath,
			"The urls do not match",
		);
	});
});
