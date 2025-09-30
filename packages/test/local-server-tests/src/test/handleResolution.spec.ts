/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	createDetachedContainer,
	loadExistingContainer,
	rehydrateDetachedContainer,
} from "@fluidframework/container-loader/internal";
import type { FluidObject, IFluidHandle } from "@fluidframework/core-interfaces";
import { LocalResolver } from "@fluidframework/local-driver/internal";
import { type IContainerRuntimeBase } from "@fluidframework/runtime-definitions/internal";
import { LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import {
	LoaderContainerTracker,
	getContainerEntryPointBackCompat,
	waitForContainerConnection,
	type ITestFluidObject,
} from "@fluidframework/test-utils/internal";

import { createLoader } from "../utils";

/**
 * Creates a non-root data object and validates that it is not visible from the root of the container.
 */
async function createNonRootDataObject(
	containerRuntime: IContainerRuntimeBase,
): Promise<ITestFluidObject> {
	const dataStore = await containerRuntime.createDataStore("default");
	const maybeTestDo: FluidObject<ITestFluidObject> = await dataStore.entryPoint.get();
	assert(maybeTestDo.ITestFluidObject !== undefined, "Failed to get ITestFluidObject");
	return maybeTestDo.ITestFluidObject;
}

async function getAndValidateDataObject(
	fromDataObject: ITestFluidObject,
	key: string,
): Promise<ITestFluidObject> {
	const dataObjectHandle = fromDataObject.root.get<IFluidHandle<ITestFluidObject>>(key);
	assert(dataObjectHandle !== undefined, `Data object handle for key ${key} not found`);
	const dataObject = await dataObjectHandle.get();
	assert(dataObject !== undefined, `Data object for key ${key} must be visible`);
	return dataObject;
}

/**
 * Validates that handles in a non-root data store and its dependencies resolve correctly across different container attach states.
 * Also, ensure handles are accessible in remote clients and can send ops.
 */
describe("Multi-level handle access", () => {
	const documentId = "objectVisibilityTest";
	const documentLoadUrl = `https://localhost/${documentId}`;
	const urlResolver = new LocalResolver();

	it("validates that handles in a non-root data store and its dependencies resolve correctly when a detached container attaches", async () => {
		const loaderContainerTracker = new LoaderContainerTracker();
		const deltaConnectionServer = LocalDeltaConnectionServer.create();

		const loader = createLoader({
			deltaConnectionServer,
		});
		const container1 = await createDetachedContainer(loader);

		const dataObject1 = await getContainerEntryPointBackCompat<ITestFluidObject>(container1);
		const containerRuntime1 = dataObject1.context.containerRuntime;

		const dataObject2 = await createNonRootDataObject(containerRuntime1);
		const dataObject3 = await createNonRootDataObject(containerRuntime1);

		// Add the handle of dataObject3 to dataObject2's DDS.
		dataObject2.root.set("dataObject3", dataObject3.handle);

		// Add the handle of dataObject2 to root.
		dataObject1.root.set("dataObject2", dataObject2.handle);
		// Ensure that handles can be accessed while detached without waiting for the handle to be resolved.
		await assert.doesNotReject(
			dataObject2.handle.get(),
			"Must be able to access data object 2 handle while detached",
		);
		await assert.doesNotReject(
			dataObject3.handle.get(),
			"Must be able to access data object 3 handle while detached",
		);

		// Attach the container.
		await container1.attach(urlResolver.createCreateNewRequest(documentId));
		await waitForContainerConnection(container1);
		loaderContainerTracker.addContainer(container1);
		await loaderContainerTracker.ensureSynchronized();

		// Validate that the data objects are visible from root after attach.
		await assert.doesNotReject(
			dataObject2.handle.get(),
			"Must be able to access data object 2 handle after attach",
		);
		await assert.doesNotReject(
			dataObject3.handle.get(),
			"Must be able to access data object 3 handle after attach",
		);

		// Load a second container and validate that both the non-root data stores are accessible in it.
		const loader2 = createLoader({
			deltaConnectionServer,
		});
		const container2 = await loadExistingContainer({
			...loader2.loaderProps,
			request: { url: documentLoadUrl },
		});
		loaderContainerTracker.addContainer(container2);
		await loaderContainerTracker.ensureSynchronized();

		const dataObject1C2 = await getContainerEntryPointBackCompat<ITestFluidObject>(container2);
		const dataObject2C2 = await getAndValidateDataObject(dataObject1C2, "dataObject2");
		const dataObject3C2 = await getAndValidateDataObject(dataObject2C2, "dataObject3");

		// Validate that the data objects are accessible from the root of the second container.
		await assert.doesNotReject(
			dataObject2C2.handle.get(),
			"Must be able to access data object 2 handle in container 2",
		);
		await assert.doesNotReject(
			dataObject3C2.handle.get(),
			"Must be able to access data object 3 handle in container 2",
		);

		await loaderContainerTracker.ensureSynchronized();

		// Send ops for the data stores in both local and remote container and validate that the ops are
		// successfully processed.
		dataObject2.root.set("key1", "value1");
		dataObject2C2.root.set("key2", "value2");
		dataObject3.root.set("key1", "value1");
		dataObject3C2.root.set("key2", "value2");
		await loaderContainerTracker.ensureSynchronized();
		assert.strictEqual(dataObject2.root.get("key2"), "value2");
		assert.strictEqual(dataObject2C2.root.get("key1"), "value1");
		assert.strictEqual(dataObject3.root.get("key2"), "value2");
		assert.strictEqual(dataObject3C2.root.get("key1"), "value1");
	});

	it("validates that handles in a non-root data store and its dependencies resolve correctly when initial container is attached", async () => {
		const loaderContainerTracker = new LoaderContainerTracker();
		const deltaConnectionServer = LocalDeltaConnectionServer.create();

		const loader = createLoader({
			deltaConnectionServer,
		});

		const container1 = await createDetachedContainer(loader);
		await container1.attach(urlResolver.createCreateNewRequest(documentId));

		await waitForContainerConnection(container1);
		loaderContainerTracker.addContainer(container1);

		const dataObject1 = await getContainerEntryPointBackCompat<ITestFluidObject>(container1);
		const containerRuntime1 = dataObject1.context.containerRuntime;

		const dataObject2 = await createNonRootDataObject(containerRuntime1);
		const dataObject3 = await createNonRootDataObject(containerRuntime1);

		// Add the handle of dataObject3 to dataObject2's DDS.
		dataObject2.root.set("dataObject3", dataObject3.handle);

		// Add the handle of dataObject2 to root.
		dataObject1.root.set("dataObject2", dataObject2.handle);

		// Validate that the data objects are accessible from the root of the attached container.
		await assert.doesNotReject(
			dataObject2.handle.get(),
			"Must be able to access data object 2 handle while attached",
		);
		await assert.doesNotReject(
			dataObject3.handle.get(),
			"Must be able to access data object 3 handle while attached",
		);

		// Load a second container and validate that both the non-root data stores are accessible in it.
		const loader2 = createLoader({
			deltaConnectionServer,
		});
		const container2 = await loadExistingContainer({
			...loader2.loaderProps,
			request: { url: documentLoadUrl },
		});
		loaderContainerTracker.addContainer(container2);
		await loaderContainerTracker.ensureSynchronized();

		const dataObject1C2 = await getContainerEntryPointBackCompat<ITestFluidObject>(container2);
		const dataObject2C2 = await getAndValidateDataObject(dataObject1C2, "dataObject2");
		const dataObject3C2 = await getAndValidateDataObject(dataObject2C2, "dataObject3");

		// Validate that the data objects are accessible from the root of the second container.
		await assert.doesNotReject(
			dataObject2C2.handle.get(),
			"Must be able to access data object 2 handle in container 2",
		);
		await assert.doesNotReject(
			dataObject3C2.handle.get(),
			"Must be able to access data object 3 handle in container 2",
		);
		await loaderContainerTracker.ensureSynchronized();

		// Send ops for the data stores in both local and remote container and validate that the ops are
		// successfully processed.
		dataObject2.root.set("key1", "value1");
		dataObject2C2.root.set("key2", "value2");
		dataObject3.root.set("key1", "value1");
		dataObject3C2.root.set("key2", "value2");
		await loaderContainerTracker.ensureSynchronized();
		assert.strictEqual(dataObject2.root.get("key2"), "value2");
		assert.strictEqual(dataObject2C2.root.get("key1"), "value1");
		assert.strictEqual(dataObject3.root.get("key2"), "value2");
		assert.strictEqual(dataObject3C2.root.get("key1"), "value1");
	});

	it("validates that handles in a non-root data store and its dependencies resolve correctly after container close and rehydrate", async () => {
		const loaderContainerTracker = new LoaderContainerTracker();
		const deltaConnectionServer = LocalDeltaConnectionServer.create();

		const loader = createLoader({
			deltaConnectionServer,
		});
		const container1 = await createDetachedContainer(loader);
		loaderContainerTracker.addContainer(container1);

		const dataObject1 = await getContainerEntryPointBackCompat<ITestFluidObject>(container1);
		const containerRuntime1 = dataObject1.context.containerRuntime;

		const dataObject2 = await createNonRootDataObject(containerRuntime1);
		const dataObject3 = await createNonRootDataObject(containerRuntime1);

		// Add the handle of dataObject3 to dataObject2's DDS.
		dataObject2.root.set("dataObject3", dataObject3.handle);

		// Add the handle of dataObject2 to root.
		dataObject1.root.set("dataObject2", dataObject2.handle);
		// Ensure that handles can be accessed while detached without waiting for the handle to be resolved.
		await assert.doesNotReject(
			dataObject2.handle.get(),
			"Must be able to access data object 2 handle while detached",
		);
		await assert.doesNotReject(
			dataObject3.handle.get(),
			"Must be able to access data object 3 handle while detached",
		);

		// Rehydrate a second container from the snapshot of the first container to validate the accessibility of the non-root data stores.
		const loader2 = createLoader({
			deltaConnectionServer,
		});
		const snapshot = container1.serialize();
		container1.close();

		const container2 = await rehydrateDetachedContainer({
			...loader2.loaderProps,
			serializedState: snapshot,
		});
		await container2.attach(urlResolver.createCreateNewRequest(documentId));
		await waitForContainerConnection(container2);
		loaderContainerTracker.addContainer(container2);

		const dataObjectC2 = await getContainerEntryPointBackCompat<ITestFluidObject>(container2);
		const dataObject2C2 = await getAndValidateDataObject(dataObjectC2, "dataObject2");
		const dataObject3C2 = await getAndValidateDataObject(dataObject2C2, "dataObject3");

		// Validate that the data objects are accessible from the root of the rehydrated container.
		await assert.doesNotReject(
			dataObject2C2.handle.get(),
			"Must be able to access data object 2 handle in container 2 after rehydrate",
		);
		await assert.doesNotReject(
			dataObject3C2.handle.get(),
			"Must be able to access data object 3 handle in container 2 after rehydrate",
		);
	});
});
