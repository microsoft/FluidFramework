/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { IContainer } from "@fluidframework/container-definitions";
import { IFluidHandle, type FluidObject } from "@fluidframework/core-interfaces";
import type { ISharedMap } from "@fluidframework/map";
import {
	ITestObjectProvider,
	getContainerEntryPointBackCompat,
	getDataStoreEntryPointBackCompat,
	waitForContainerConnection,
} from "@fluidframework/test-utils";
import {
	describeCompat,
	ITestDataObject,
	TestDataObjectType,
} from "@fluid-private/test-version-utils";
import { ContainerRuntime } from "@fluidframework/container-runtime";
import { responseToException } from "@fluidframework/runtime-utils";

async function resolveHandleWithoutWait(
	containerRuntime: ContainerRuntime,
	id: string,
): Promise<ITestDataObject> {
	try {
		const request = {
			url: id,
			headers: { wait: false },
		};
		const response = await containerRuntime.resolveHandle(request);
		if (response.status !== 200) {
			throw responseToException(response, request);
		}
		return response.value as ITestDataObject;
	} catch (e) {
		return Promise.reject(e);
	}
}

/**
 * Creates a non-root data object and validates that it is not visible from the root of the container.
 */
async function createNonRootDataObject(
	containerRuntime: ContainerRuntime,
): Promise<ITestDataObject> {
	const dataStore = await containerRuntime.createDataStore(TestDataObjectType);
	const dataObject = await getDataStoreEntryPointBackCompat<ITestDataObject>(dataStore);
	// Non-root data stores are not visible (unreachable) from the root unless their handles are stored in a
	// visible DDS.
	await assert.rejects(
		resolveHandleWithoutWait(containerRuntime, dataObject._context.id),
		"Non root data object must not be visible from root after creation",
	);
	return dataObject;
}

/**
 * Creates a root data object and validates that it is visible from the root of the container.
 */
async function createRootDataObject(
	containerRuntime: ContainerRuntime,
	rootDataStoreId: string,
): Promise<ITestDataObject> {
	const dataStore = await containerRuntime.createDataStore(TestDataObjectType);
	await dataStore.trySetAlias(rootDataStoreId);
	// Non-root data stores are visible (reachable) from the root as soon as they are created.
	await assert.doesNotReject(
		resolveHandleWithoutWait(containerRuntime, rootDataStoreId),
		"Root data object must be visible from root after creation",
	);
	return getDataStoreEntryPointBackCompat<ITestDataObject>(dataStore);
}

async function getAndValidateDataObject(
	fromDataObject: ITestDataObject,
	key: string,
): Promise<ITestDataObject> {
	const dataObjectHandle = fromDataObject._root.get<IFluidHandle<ITestDataObject>>(key);
	assert(dataObjectHandle !== undefined, `Data object handle for key ${key} not found`);
	const dataObject = await dataObjectHandle.get();
	const runtime = dataObject._context.containerRuntime as ContainerRuntime;
	await assert.doesNotReject(
		resolveHandleWithoutWait(runtime, dataObject._context.id),
		`Data object for key ${key} must be visible`,
	);
	return dataObject;
}

/**
 * This function was added to support CrossVersion back compat scenarios for runtime versions
 * that not have `getAliasedDataStoreEntryPoint`.
 *
 * This function can be removed once we no longer support ^2.0.0-internal.7.0.0.
 */
async function getAliasedDataStoreBackCompat(
	containerRuntime: ContainerRuntime,
	id: string,
): Promise<IFluidHandle<FluidObject> | undefined> {
	if (containerRuntime.getAliasedDataStoreEntryPoint !== undefined) {
		return containerRuntime.getAliasedDataStoreEntryPoint(id);
	}
	const request = {
		url: id,
		headers: { wait: false },
	};
	const response = await (containerRuntime as any).request(request);
	if (response.status !== 200) {
		throw responseToException(response, request);
	}
	return response.value.handle as IFluidHandle;
}

/**
 * These tests validate that new Fluid objects such as data stores and DDSes become visible correctly. For example,
 * new non-root data stores should not become visible (or reachable from root) until their handles are added to a
 * visible DDS.
 */
describeCompat("New Fluid objects visibility", "FullCompat", (getTestObjectProvider, { dds }) => {
	const { SharedMap } = dds;
	let provider: ITestObjectProvider;
	let container1: IContainer;
	let containerRuntime1: ContainerRuntime;
	let dataObject1: ITestDataObject;

	/**
	 * If detachedMode is true, the test creates new data stores in detached container and validates their visibility.
	 * If detachedMode is false, the tests creates new data stores in attached container and validates their visibility.
	 */
	const tests = (detachedMode: boolean) => {
		beforeEach("setup", async function () {
			provider = getTestObjectProvider();
			if (provider.driver.type !== "local") {
				this.skip();
			}

			if (detachedMode) {
				const loader1 = provider.makeTestLoader();
				container1 = await loader1.createDetachedContainer(provider.defaultCodeDetails);
			} else {
				container1 = await provider.makeTestContainer();
				await waitForContainerConnection(container1);
			}

			dataObject1 = await getContainerEntryPointBackCompat<ITestDataObject>(container1);
			containerRuntime1 = dataObject1._context.containerRuntime as ContainerRuntime;
		});

		/**
		 * Validates that non-root data stores are not visible until their handles are added to a visible DDS.
		 * Also, they are visible in remote clients and can send ops.
		 */
		it("validates that non-root data stores become visible correctly", async function () {
			const dataObject2 = await createNonRootDataObject(containerRuntime1);
			dataObject1._root.set("dataObject2", dataObject2.handle);

			// Adding handle of the non-root data store to a visible DDS should make it visible (reachable)
			// from the root.
			await assert.doesNotReject(
				resolveHandleWithoutWait(containerRuntime1, dataObject1._context.id),
				"Data object 2 must be visible from root after its handle is added",
			);

			if (detachedMode) {
				await container1.attach(
					provider.driver.createCreateNewRequest(provider.documentId),
				);
				await waitForContainerConnection(container1);
			}

			// Load a second container and validate that the non-root data store is visible in it.
			const container2 = await provider.loadTestContainer();
			await provider.ensureSynchronized();
			const dataObject1C2 =
				await getContainerEntryPointBackCompat<ITestDataObject>(container2);
			const dataObject2C2 = await getAndValidateDataObject(dataObject1C2, "dataObject2");

			// Send ops for the data store in both local and remote container and validate that the ops are successfully
			// processed.
			dataObject2._root.set("key1", "value1");
			dataObject2C2._root.set("key2", "value2");
			await provider.ensureSynchronized();
			assert.strictEqual(dataObject2._root.get("key2"), "value2");
			assert.strictEqual(dataObject2C2._root.get("key1"), "value1");
		});

		/**
		 * Validates that non-root data stores that have other non-root data stores as dependencies are not visible
		 * until the parent data store is visible. Also, they are visible in remote clients and can send ops.
		 */
		it("validates that non-root data store and its dependencies become visible correctly", async function () {
			const dataObject2 = await createNonRootDataObject(containerRuntime1);
			const dataObject3 = await createNonRootDataObject(containerRuntime1);

			// Add the handle of dataObject3 to dataObject2's DDS. Since dataObject2 and its DDS are not visible yet,
			// dataObject2 should also be not visible (reachable).
			dataObject2._root.set("dataObject3", dataObject3.handle);
			await assert.rejects(
				resolveHandleWithoutWait(containerRuntime1, dataObject3._context.id),
				"Data object 3 must not be visible from root yet",
			);

			// Adding handle of dataObject2 to a visible DDS should make it and dataObject3 visible (reachable)
			// from the root.
			dataObject1._root.set("dataObject2", dataObject2.handle);
			await assert.doesNotReject(
				resolveHandleWithoutWait(containerRuntime1, dataObject2._context.id),
				"Data object 2 must be visible from root after its handle is added",
			);
			await assert.doesNotReject(
				resolveHandleWithoutWait(containerRuntime1, dataObject3._context.id),
				"Data object 3 must be visible from root after its parent's handle is added",
			);

			if (detachedMode) {
				await container1.attach(
					provider.driver.createCreateNewRequest(provider.documentId),
				);
				await waitForContainerConnection(container1);
			}

			// Load a second container and validate that both the non-root data stores are visible in it.
			const container2 = await provider.loadTestContainer();
			await provider.ensureSynchronized();
			const dataObject1C2 =
				await getContainerEntryPointBackCompat<ITestDataObject>(container2);
			const dataObject2C2 = await getAndValidateDataObject(dataObject1C2, "dataObject2");
			const dataObject3C2 = await getAndValidateDataObject(dataObject2C2, "dataObject3");

			// Send ops for the data stores in both local and remote container and validate that the ops are
			// successfully processed.
			dataObject2._root.set("key1", "value1");
			dataObject2C2._root.set("key2", "value2");
			dataObject3._root.set("key1", "value1");
			dataObject3C2._root.set("key2", "value2");
			await provider.ensureSynchronized();
			assert.strictEqual(dataObject2._root.get("key2"), "value2");
			assert.strictEqual(dataObject2C2._root.get("key1"), "value1");
			assert.strictEqual(dataObject3._root.get("key2"), "value2");
			assert.strictEqual(dataObject3C2._root.get("key1"), "value1");
		});

		/**
		 * Validates that root data stores that have other non-root data stores as dependencies are not visible
		 * until the parent root data store is visible. Also, they are visible in remote clients and can send ops.
		 */
		it("validates that root data stores and their dependencies become visible correctly", async () => {
			const dataObject2 = await createRootDataObject(containerRuntime1, "rootDataStore");
			const dataObject3 = await createNonRootDataObject(containerRuntime1);

			// Add the handle of the non-root data store (dataObject3) in the root data store (dataObject2)'s DDS.
			// dataObject3 should become visible (reachable) from the root since dataObject2 is visible.
			dataObject2._root.set("dataObject3", dataObject3.handle);
			await assert.doesNotReject(
				getAliasedDataStoreBackCompat(containerRuntime1, "rootDataStore"),
				"Data object 2 must be visible from root",
			);

			if (detachedMode) {
				await container1.attach(
					provider.driver.createCreateNewRequest(provider.documentId),
				);
				await waitForContainerConnection(container1);
			}

			// Load a second container and validate that the non-root data store is visible in it.
			const container2 = await provider.loadTestContainer();
			await provider.ensureSynchronized();
			const entryPoint = await getContainerEntryPointBackCompat<ITestDataObject>(container2);
			const containerRuntime2 = entryPoint._context.containerRuntime as ContainerRuntime;
			const dsEntryPoint = await getAliasedDataStoreBackCompat(
				containerRuntime2,
				"rootDataStore",
			);
			const dataObject2C2 = (await dsEntryPoint?.get()) as ITestDataObject;
			const dataObject3C2 = await getAndValidateDataObject(dataObject2C2, "dataObject3");

			// Send ops for both data stores in both local and remote container and validate that the ops are
			// successfully processed.
			dataObject2._root.set("key1", "value1");
			dataObject2C2._root.set("key2", "value2");
			dataObject3._root.set("key1", "value1");
			dataObject3C2._root.set("key2", "value2");
			await provider.ensureSynchronized();
			assert.strictEqual(dataObject2._root.get("key2"), "value2");
			assert.strictEqual(dataObject2C2._root.get("key1"), "value1");
			assert.strictEqual(dataObject3._root.get("key2"), "value2");
			assert.strictEqual(dataObject3C2._root.get("key1"), "value1");
		});

		/**
		 * Validates that DDSes created in non-root data stores become visible and can send ops when the data store
		 * becomes globally visible to all clients.
		 */
		it("validates that DDSes in non-root data stores become visible correctly", async () => {
			const dataObject2 = await createNonRootDataObject(containerRuntime1);

			// Create a DDS when data store is not visible and store its handle.
			const map1 = SharedMap.create(dataObject2._runtime);
			dataObject2._root.set("map1", map1.handle);

			dataObject1._root.set("dataObject2", dataObject2.handle);

			// Create a DDS after data store is locally visible and store its handle.
			const map2 = SharedMap.create(dataObject2._runtime);
			dataObject2._root.set("map2", map2.handle);

			if (detachedMode) {
				await container1.attach(
					provider.driver.createCreateNewRequest(provider.documentId),
				);
				await waitForContainerConnection(container1);
			}

			// Create a DDS after data store is globally visible and store its handle.
			const map3 = SharedMap.create(dataObject2._runtime);
			dataObject2._root.set("map3", map3.handle);

			// Load a second container.
			const container2 = await provider.loadTestContainer();
			await provider.ensureSynchronized();
			const dataObject1C2 =
				await getContainerEntryPointBackCompat<ITestDataObject>(container2);
			const dataObject2C2 = await getAndValidateDataObject(dataObject1C2, "dataObject2");

			// Validate that the DDSes are present in the second container.
			const map1C2 = await dataObject2C2._root.get<IFluidHandle<ISharedMap>>("map1")?.get();
			assert(map1C2 !== undefined, "map1 not found in second container");
			const map2C2 = await dataObject2C2._root.get<IFluidHandle<ISharedMap>>("map2")?.get();
			assert(map2C2 !== undefined, "map2 not found in second container");
			const map3C2 = await dataObject2C2._root.get<IFluidHandle<ISharedMap>>("map3")?.get();
			assert(map3C2 !== undefined, "map3 not found in second container");

			// Send ops for all the DDSes created above in both local and remote container and validate that the ops are
			// successfully processed.
			map1.set("key1", "value1");
			map1C2.set("key2", "value2");
			map2.set("key1", "value1");
			map2C2.set("key2", "value2");
			map3.set("key1", "value1");
			map3C2.set("key2", "value2");
			await provider.ensureSynchronized();
			assert.strictEqual(map1.get("key2"), "value2");
			assert.strictEqual(map1C2.get("key1"), "value1");
			assert.strictEqual(map2.get("key2"), "value2");
			assert.strictEqual(map2C2.get("key1"), "value1");
			assert.strictEqual(map3.get("key2"), "value2");
			assert.strictEqual(map3C2.get("key1"), "value1");
		});

		/**
		 * Validates that DDSes created in root data stores become visible and can send ops when the data store
		 * becomes globally visible to all clients.
		 */
		it("validates that DDSes in root data stores become visible correctly", async () => {
			const dataObject2 = await createRootDataObject(containerRuntime1, "rootDataStore");

			// Create a DDS after data store is locally visible and store its handle.
			const map1 = SharedMap.create(dataObject2._runtime);
			dataObject2._root.set("map1", map1.handle);

			// Adding handle of the non-root data store to a visible DDS should make it visible (reachable)
			// from the root.
			await assert.doesNotReject(
				getAliasedDataStoreBackCompat(containerRuntime1, "rootDataStore"),
				"Data object 2 must be visible from root after its handle is added",
			);

			if (detachedMode) {
				await container1.attach(
					provider.driver.createCreateNewRequest(provider.documentId),
				);
				await waitForContainerConnection(container1);
			}

			// Create a DDS after data store is globally visible and store its handle.
			const map2 = SharedMap.create(dataObject2._runtime);
			dataObject2._root.set("map2", map2.handle);

			// Load a second container.
			const container2 = await provider.loadTestContainer();
			await provider.ensureSynchronized();
			const entryPoint2 = await getContainerEntryPointBackCompat<ITestDataObject>(container2);
			const containerRuntime2 = entryPoint2._context.containerRuntime as ContainerRuntime;
			const dsEntryPoint = await getAliasedDataStoreBackCompat(
				containerRuntime2,
				"rootDataStore",
			);
			if (dsEntryPoint === undefined) {
				throw new Error("rootDataStore must exist");
			}
			const dataObject2C2 = (await dsEntryPoint.get()) as ITestDataObject;

			// Validate that the DDSes are present in the second container.
			const map1C2 = await dataObject2C2._root.get<IFluidHandle<ISharedMap>>("map1")?.get();
			assert(map1C2 !== undefined, "map1 not found in second container");
			const map2C2 = await dataObject2C2._root.get<IFluidHandle<ISharedMap>>("map2")?.get();
			assert(map2C2 !== undefined, "map2 not found in second container");

			// Send ops for all the DDSes created above in both local and remote container and validate that the ops are
			// successfully processed.
			map1.set("key1", "value1");
			map1C2.set("key2", "value2");
			map2.set("key1", "value1");
			map2C2.set("key2", "value2");
			await provider.ensureSynchronized();
			assert.strictEqual(map1.get("key2"), "value2");
			assert.strictEqual(map1C2.get("key1"), "value1");
			assert.strictEqual(map2.get("key2"), "value2");
			assert.strictEqual(map2C2.get("key1"), "value1");
		});
	};

	describe("Detached container", () => {
		tests(true /* detachedMode */);
	});

	describe("Attached container", () => {
		tests(false /* detachedMode */);
	});
});
