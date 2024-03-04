/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	ConfigTypes,
	IConfigProviderBase,
	IErrorBase,
	IFluidHandle,
} from "@fluidframework/core-interfaces";

import { ContainerRuntime } from "@fluidframework/container-runtime";
import type { ISharedMap, IValueChanged } from "@fluidframework/map";
import {
	ITestObjectProvider,
	ITestContainerConfig,
	DataObjectFactoryType,
	ChannelFactoryRegistry,
	ITestFluidObject,
	getContainerEntryPointBackCompat,
} from "@fluidframework/test-utils";
import { describeCompat } from "@fluid-private/test-version-utils";
import { IContainer } from "@fluidframework/container-definitions";
import { FluidDataStoreRuntime } from "@fluidframework/datastore";

describeCompat("SharedMap", "FullCompat", (getTestObjectProvider, apis) => {
	const { SharedMap } = apis.dds;
	const mapId = "mapKey";
	const registry: ChannelFactoryRegistry = [[mapId, SharedMap.getFactory()]];
	const testContainerConfig: ITestContainerConfig = {
		fluidDataObjectType: DataObjectFactoryType.Test,
		registry,
	};

	let provider: ITestObjectProvider;
	beforeEach("getTestObjectProvider", () => {
		provider = getTestObjectProvider();
	});

	let dataObject1: ITestFluidObject;
	let sharedMap1: ISharedMap;
	let sharedMap2: ISharedMap;
	let sharedMap3: ISharedMap;

	beforeEach("createContainers", async () => {
		const container1 = await provider.makeTestContainer(testContainerConfig);
		dataObject1 = await getContainerEntryPointBackCompat<ITestFluidObject>(container1);
		sharedMap1 = await dataObject1.getSharedObject<ISharedMap>(mapId);

		const container2 = await provider.loadTestContainer(testContainerConfig);
		const dataObject2 = await getContainerEntryPointBackCompat<ITestFluidObject>(container2);
		sharedMap2 = await dataObject2.getSharedObject<ISharedMap>(mapId);

		const container3 = await provider.loadTestContainer(testContainerConfig);
		const dataObject3 = await getContainerEntryPointBackCompat<ITestFluidObject>(container3);
		sharedMap3 = await dataObject3.getSharedObject<ISharedMap>(mapId);

		sharedMap1.set("testKey1", "testValue");

		await provider.ensureSynchronized();
	});

	function expectAllValues(msg, key, value1, value2, value3) {
		const user1Value = sharedMap1.get(key);
		assert.equal(user1Value, value1, `Incorrect value for ${key} in container 1 ${msg}`);
		const user2Value = sharedMap2.get(key);
		assert.equal(user2Value, value2, `Incorrect value for ${key} in container 2 ${msg}`);
		const user3Value = sharedMap3.get(key);
		assert.equal(user3Value, value3, `Incorrect value for ${key} in container 3 ${msg}`);
	}

	function expectAllBeforeValues(key, value1, value2, value3) {
		expectAllValues("before process", key, value1, value2, value3);
	}

	function expectAllAfterValues(key, value) {
		expectAllValues("after process", key, value, value, value);
	}

	function expectAllSize(size) {
		const keys1 = Array.from(sharedMap1.keys());
		assert.equal(keys1.length, size, "Incorrect number of Keys in container 1");
		const keys2 = Array.from(sharedMap2.keys());
		assert.equal(keys2.length, size, "Incorrect number of Keys in container 2");
		const keys3 = Array.from(sharedMap3.keys());
		assert.equal(keys3.length, size, "Incorrect number of Keys in container 3");

		assert.equal(sharedMap1.size, size, "Incorrect map size in container 1");
		assert.equal(sharedMap2.size, size, "Incorrect map size in container 2");
		assert.equal(sharedMap3.size, size, "Incorrect map size in container 3");
	}

	it("should set key value in three containers correctly", async () => {
		expectAllAfterValues("testKey1", "testValue");
	});

	it("should set key value to undefined in three containers correctly", async () => {
		sharedMap2.set("testKey1", undefined);
		sharedMap2.set("testKey2", undefined);

		await provider.ensureSynchronized();

		expectAllAfterValues("testKey1", undefined);
		expectAllAfterValues("testKey2", undefined);
	});

	it("Should delete values in 3 containers correctly", async () => {
		sharedMap2.delete("testKey1");

		await provider.ensureSynchronized();

		const hasKey1 = sharedMap1.has("testKey1");
		assert.equal(hasKey1, false, "testKey1 not deleted in container 1");

		const hasKey2 = sharedMap2.has("testKey1");
		assert.equal(hasKey2, false, "testKey1 not deleted in container 1");

		const hasKey3 = sharedMap3.has("testKey1");
		assert.equal(hasKey3, false, "testKey1 not deleted in container 1");
	});

	it("Should check if three containers has same number of keys", async () => {
		sharedMap3.set("testKey3", true);

		await provider.ensureSynchronized();

		expectAllSize(2);
	});

	it("Should update value and trigger onValueChanged on other two containers", async () => {
		let user1ValueChangedCount: number = 0;
		let user2ValueChangedCount: number = 0;
		let user3ValueChangedCount: number = 0;
		sharedMap1.on("valueChanged", (changed, local) => {
			if (!local) {
				assert.equal(
					changed.key,
					"testKey1",
					"Incorrect value for testKey1 in container 1",
				);
				user1ValueChangedCount = user1ValueChangedCount + 1;
			}
		});
		sharedMap2.on("valueChanged", (changed, local) => {
			if (!local) {
				assert.equal(
					changed.key,
					"testKey1",
					"Incorrect value for testKey1 in container 2",
				);
				user2ValueChangedCount = user2ValueChangedCount + 1;
			}
		});
		sharedMap3.on("valueChanged", (changed, local) => {
			if (!local) {
				assert.equal(
					changed.key,
					"testKey1",
					"Incorrect value for testKey1 in container 3",
				);
				user3ValueChangedCount = user3ValueChangedCount + 1;
			}
		});

		sharedMap1.set("testKey1", "updatedValue");

		await provider.ensureSynchronized();

		assert.equal(
			user1ValueChangedCount,
			0,
			"Incorrect number of valueChanged op received in container 1",
		);
		assert.equal(
			user2ValueChangedCount,
			1,
			"Incorrect number of valueChanged op received in container 2",
		);
		assert.equal(
			user3ValueChangedCount,
			1,
			"Incorrect number of valueChanged op received in container 3",
		);

		expectAllAfterValues("testKey1", "updatedValue");
	});

	it("Simultaneous set should reach eventual consistency with the same value", async () => {
		sharedMap1.set("testKey1", "value1");
		sharedMap2.set("testKey1", "value2");
		sharedMap3.set("testKey1", "value0");

		// drain the outgoing so that the next set will come after
		await provider.opProcessingController.processOutgoing();

		sharedMap3.set("testKey1", "value3");

		expectAllBeforeValues("testKey1", "value1", "value2", "value3");

		await provider.ensureSynchronized();

		expectAllAfterValues("testKey1", "value3");
	});

	it("Simultaneous delete/set should reach eventual consistency with the same value", async () => {
		// set after delete
		sharedMap1.set("testKey1", "value1.1");
		sharedMap2.delete("testKey1");

		// drain the outgoing so that the next set will come after
		await provider.opProcessingController.processOutgoing();

		sharedMap3.set("testKey1", "value1.3");

		expectAllBeforeValues("testKey1", "value1.1", undefined, "value1.3");

		await provider.ensureSynchronized();

		expectAllAfterValues("testKey1", "value1.3");
	});

	it("Simultaneous delete/set on same map should reach eventual consistency with the same value", async () => {
		// delete and then set on the same map
		sharedMap1.set("testKey2", "value2.1");
		sharedMap2.delete("testKey2");
		sharedMap3.set("testKey2", "value2.3");

		// drain the outgoing so that the next set will come after
		await provider.opProcessingController.processOutgoing();

		sharedMap2.set("testKey2", "value2.2");
		expectAllBeforeValues("testKey2", "value2.1", "value2.2", "value2.3");

		await provider.ensureSynchronized();

		expectAllAfterValues("testKey2", "value2.2");
	});

	it("Simultaneous set/delete should reach eventual consistency with the same value", async () => {
		// delete after set
		sharedMap1.set("testKey3", "value3.1");
		sharedMap2.set("testKey3", "value3.2");

		// drain the outgoing so that the next set will come after
		await provider.opProcessingController.processOutgoing();

		sharedMap3.delete("testKey3");

		expectAllBeforeValues("testKey3", "value3.1", "value3.2", undefined);

		await provider.ensureSynchronized();

		expectAllAfterValues("testKey3", undefined);
	});

	it("Simultaneous set/clear on a key should reach eventual consistency with the same value", async () => {
		// clear after set
		sharedMap1.set("testKey1", "value1.1");
		sharedMap2.set("testKey1", "value1.2");

		// drain the outgoing so that the next set will come after
		await provider.opProcessingController.processOutgoing();

		sharedMap3.clear();
		expectAllBeforeValues("testKey1", "value1.1", "value1.2", undefined);
		assert.equal(sharedMap3.size, 0, "Incorrect map size after clear");

		await provider.ensureSynchronized();

		expectAllAfterValues("testKey1", undefined);
		expectAllSize(0);
	});

	it("Simultaneous clear/set on same map should reach eventual consistency with the same value", async () => {
		// set after clear on the same map
		sharedMap1.set("testKey2", "value2.1");
		sharedMap2.clear();
		sharedMap3.set("testKey2", "value2.3");

		// drain the outgoing so that the next set will come after
		await provider.opProcessingController.processOutgoing();

		sharedMap2.set("testKey2", "value2.2");
		expectAllBeforeValues("testKey2", "value2.1", "value2.2", "value2.3");

		await provider.ensureSynchronized();

		expectAllAfterValues("testKey2", "value2.2");
		expectAllSize(1);
	});

	it("Simultaneous clear/set should reach eventual consistency and resolve to the same value", async () => {
		// set after clear
		sharedMap1.set("testKey3", "value3.1");
		sharedMap2.clear();

		// drain the outgoing so that the next set will come after
		await provider.opProcessingController.processOutgoing();

		sharedMap3.set("testKey3", "value3.3");
		expectAllBeforeValues("testKey3", "value3.1", undefined, "value3.3");

		await provider.ensureSynchronized();

		expectAllAfterValues("testKey3", "value3.3");
		expectAllSize(1);
	});

	it("should load new map with data from local state and can then process ops", async () => {
		/**
		 * This tests test the scenario found in the following bug:
		 * https://github.com/microsoft/FluidFramework/issues/2400
		 *
		 * - A SharedMap in local (detached) state set a key.
		 *
		 * - The map is then attached so that it is available to remote clients.
		 *
		 * - One of the remote clients sets a new value to the same key.
		 *
		 * - The expected behavior is that the first SharedMap updates the key with the new value. But in the bug
		 * the first SharedMap stores the key in its pending state even though it does not send out an op. So,
		 * when it gets a remote op with the same key, it ignores it as it has a pending set with the same key.
		 */

		// Create a new map in local (detached) state.
		const newSharedMap1 = SharedMap.create(dataObject1.runtime);

		// Set a value while in local state.
		newSharedMap1.set("newKey", "newValue");

		// Now add the handle to an attached map so the new map gets attached too.
		sharedMap1.set("newSharedMap", newSharedMap1.handle);

		await provider.ensureSynchronized();

		// The new map should be available in the remote client and it should contain that key that was
		// set in local state.
		const newSharedMap2 = await sharedMap2.get<IFluidHandle<ISharedMap>>("newSharedMap")?.get();
		assert(newSharedMap2);
		assert.equal(
			newSharedMap2.get("newKey"),
			"newValue",
			"The data set in local state is not available in map 2",
		);

		// Set a new value for the same key in the remote map.
		newSharedMap2.set("newKey", "anotherNewValue");

		await provider.ensureSynchronized();

		// Verify that the new value is updated in both the maps.
		assert.equal(
			newSharedMap2.get("newKey"),
			"anotherNewValue",
			"The new value is not updated in map 2",
		);
		assert.equal(
			newSharedMap1.get("newKey"),
			"anotherNewValue",
			"The new value is not updated in map 1",
		);
	});

	it("attaches if referring SharedMap becomes attached or is already attached", async () => {
		const detachedMap1: ISharedMap = SharedMap.create(dataObject1.runtime);
		const detachedMap2: ISharedMap = SharedMap.create(dataObject1.runtime);

		// When an unattached map refers to another unattached map, both remain unattached
		detachedMap1.set("newSharedMap", detachedMap2.handle);
		assert.equal(sharedMap1.isAttached(), true, "sharedMap1 should be attached");
		assert.equal(detachedMap1.isAttached(), false, "detachedMap1 should not be attached");
		assert.equal(detachedMap2.isAttached(), false, "detachedMap2 should not be attached");

		// When referring map becomes attached, the referred map becomes attached
		// and the attachment transitively passes to a second referred map
		sharedMap1.set("newSharedMap", detachedMap1.handle);
		assert.equal(sharedMap1.isAttached(), true, "sharedMap1 should be attached");
		assert.equal(detachedMap1.isAttached(), true, "detachedMap1 should be attached");
		assert.equal(detachedMap2.isAttached(), true, "detachedMap2 should be attached");
	});
});

describeCompat("SharedMap orderSequentially", "NoCompat", (getTestObjectProvider, apis) => {
	const { SharedMap } = apis.dds;
	const mapId = "mapKey";
	const registry: ChannelFactoryRegistry = [[mapId, SharedMap.getFactory()]];
	const testContainerConfig: ITestContainerConfig = {
		fluidDataObjectType: DataObjectFactoryType.Test,
		registry,
	};

	let provider: ITestObjectProvider;
	beforeEach("getTestObjectProvider", () => {
		provider = getTestObjectProvider();
	});

	let container: IContainer;
	let dataObject: ITestFluidObject;
	let sharedMap: ISharedMap;

	let containerRuntime: ContainerRuntime;
	let clearEventCount: number;
	let changedEventData: IValueChanged[];

	const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
		getRawConfig: (name: string): ConfigTypes => settings[name],
	});
	const errorMessage = "callback failure";

	beforeEach("setup", async () => {
		const configWithFeatureGates = {
			...testContainerConfig,
			loaderProps: {
				configProvider: configProvider({
					"Fluid.ContainerRuntime.EnableRollback": true,
				}),
			},
		};

		container = await provider.makeTestContainer(configWithFeatureGates);
		dataObject = await getContainerEntryPointBackCompat<ITestFluidObject>(container);
		sharedMap = await dataObject.getSharedObject<ISharedMap>(mapId);
		containerRuntime = dataObject.context.containerRuntime as ContainerRuntime;
		clearEventCount = 0;
		changedEventData = [];
		sharedMap.on("valueChanged", (changed, local, target) => {
			changedEventData.push(changed);
		});
		sharedMap.on("clear", (local, target) => {
			clearEventCount++;
		});
	});

	it("Should rollback set", async () => {
		let error: Error | undefined;
		try {
			containerRuntime.orderSequentially(() => {
				sharedMap.set("key", 0);
				throw new Error(errorMessage);
			});
		} catch (err) {
			error = err as Error;
		}

		assert.notEqual(error, undefined, "No error");
		assert.equal(error?.message, errorMessage, "Unexpected error message");
		assert.equal(containerRuntime.disposed, false);
		assert.equal(sharedMap.size, 0);
		assert.equal(sharedMap.has("key"), false);
		assert.equal(clearEventCount, 0);
		assert.equal(changedEventData.length, 2);
		assert.equal(changedEventData[0].key, "key");
		assert.equal(changedEventData[0].previousValue, undefined);
		// rollback
		assert.equal(changedEventData[1].key, "key");
		assert.equal(changedEventData[1].previousValue, 0);
	});

	it("Should rollback set to prior value", async () => {
		sharedMap.set("key", "old");
		let error: Error | undefined;
		try {
			containerRuntime.orderSequentially(() => {
				sharedMap.set("key", "new");
				sharedMap.set("key", "last");
				throw new Error("callback failure");
			});
		} catch (err) {
			error = err as Error;
		}

		assert.notEqual(error, undefined, "No error");
		assert.equal(error?.message, errorMessage, "Unexpected error message");
		assert.equal(containerRuntime.disposed, false);
		assert.equal(sharedMap.size, 1);
		assert.equal(sharedMap.get("key"), "old", `Unexpected value ${sharedMap.get("key")}`);
		assert.equal(clearEventCount, 0);
		assert.equal(changedEventData.length, 5);
		assert.equal(changedEventData[0].key, "key");
		assert.equal(changedEventData[0].previousValue, undefined);
		assert.equal(changedEventData[1].key, "key");
		assert.equal(changedEventData[1].previousValue, "old");
		assert.equal(changedEventData[2].key, "key");
		assert.equal(changedEventData[2].previousValue, "new");
		// rollback
		assert.equal(changedEventData[3].key, "key");
		assert.equal(changedEventData[3].previousValue, "last");
		assert.equal(changedEventData[4].key, "key");
		assert.equal(changedEventData[4].previousValue, "new");
	});

	it("Should rollback delete", async () => {
		sharedMap.set("key", "old");
		let error: Error | undefined;
		try {
			containerRuntime.orderSequentially(() => {
				sharedMap.delete("key");
				throw new Error("callback failure");
			});
		} catch (err) {
			error = err as Error;
		}

		assert.notEqual(error, undefined, "No error");
		assert.equal(error?.message, errorMessage, "Unexpected error message");
		assert.equal(containerRuntime.disposed, false);
		assert.equal(sharedMap.size, 1);
		assert.equal(sharedMap.get("key"), "old", `Unexpected value ${sharedMap.get("key")}`);
		assert.equal(clearEventCount, 0);
		assert.equal(changedEventData.length, 3);
		assert.equal(changedEventData[0].key, "key");
		assert.equal(changedEventData[0].previousValue, undefined);
		assert.equal(changedEventData[1].key, "key");
		assert.equal(changedEventData[1].previousValue, "old");
		// rollback
		assert.equal(changedEventData[2].key, "key");
		assert.equal(changedEventData[2].previousValue, undefined);
	});

	it("Should rollback clear", async () => {
		sharedMap.set("key1", "old1");
		sharedMap.set("key2", "old2");
		let error: Error | undefined;
		try {
			containerRuntime.orderSequentially(() => {
				sharedMap.clear();
				throw new Error("callback failure");
			});
		} catch (err) {
			error = err as Error;
		}

		assert.notEqual(error, undefined, "No error");
		assert.equal(error?.message, errorMessage, "Unexpected error message");
		assert.equal(containerRuntime.disposed, false);
		assert.equal(sharedMap.size, 2);
		assert.equal(sharedMap.get("key1"), "old1", `Unexpected value ${sharedMap.get("key1")}`);
		assert.equal(sharedMap.get("key2"), "old2", `Unexpected value ${sharedMap.get("key2")}`);
		assert.equal(changedEventData.length, 4);
		assert.equal(changedEventData[0].key, "key1");
		assert.equal(changedEventData[0].previousValue, undefined);
		assert.equal(changedEventData[1].key, "key2");
		assert.equal(changedEventData[1].previousValue, undefined);
		assert.equal(clearEventCount, 1);
		// rollback
		assert.equal(changedEventData[2].key, "key1");
		assert.equal(changedEventData[2].previousValue, undefined);
		assert.equal(changedEventData[3].key, "key2");
		assert.equal(changedEventData[3].previousValue, undefined);
	});
});

describeCompat(
	"addChannel() tests for the SharedMap",
	"NoCompat",
	(getTestObjectProvider, apis) => {
		const { SharedMap } = apis.dds;
		const mapId = "mapKey";
		const registry: ChannelFactoryRegistry = [[mapId, SharedMap.getFactory()]];
		const testContainerConfig: ITestContainerConfig = {
			fluidDataObjectType: DataObjectFactoryType.Test,
			registry,
		};

		let provider: ITestObjectProvider;
		beforeEach("getTestObjectProvider", () => {
			provider = getTestObjectProvider();
		});

		let container1: IContainer;
		let dataObject1: ITestFluidObject;
		let dataObject2: ITestFluidObject;
		let sharedMap1: ISharedMap;
		let sharedMap2: ISharedMap;
		let containerRuntime: ContainerRuntime;

		beforeEach("setup", async () => {
			container1 = await provider.makeTestContainer(testContainerConfig);
			dataObject1 = await getContainerEntryPointBackCompat<ITestFluidObject>(container1);
			sharedMap1 = await dataObject1.getSharedObject<ISharedMap>(mapId);
			containerRuntime = dataObject1.context.containerRuntime as ContainerRuntime;

			const container2 = await provider.loadTestContainer(testContainerConfig);
			dataObject2 = await getContainerEntryPointBackCompat<ITestFluidObject>(container2);
			sharedMap2 = await dataObject2.getSharedObject<ISharedMap>(mapId);
		});

		it("addChannel should add the channel successfully to the runtime", async () => {
			// Create a new map in local (detached) state.
			const newSharedMap1 = new SharedMap(
				"newSharedMapId",
				dataObject1.runtime,
				SharedMap.getFactory().attributes,
			);

			// Set a value while in local state.
			newSharedMap1.set("newKey", "newValue");

			(dataObject1.runtime as FluidDataStoreRuntime).addChannel(newSharedMap1);
			// Now add the handle to an attached map so the new map gets attached too.
			sharedMap1.set("newSharedMap", newSharedMap1.handle);

			await provider.ensureSynchronized();

			// The new map should be available in the remote client and it should contain that key that was
			// set in local state.
			const newSharedMap2 = await sharedMap2
				.get<IFluidHandle<ISharedMap>>("newSharedMap")
				?.get();
			assert(newSharedMap2);
			assert(newSharedMap2.get("newKey") === newSharedMap1.get("newKey"));
		});

		it("should create error when channel created with different runtime is added to different runtime", async () => {
			// Create a new map in local (detached) state.
			const newSharedMap1 = new SharedMap(
				"newSharedMapId",
				dataObject1.runtime,
				SharedMap.getFactory().attributes,
			);

			// Set a value while in local state.
			newSharedMap1.set("newKey", "newValue");

			// Add channel to different runtime
			(dataObject2.runtime as FluidDataStoreRuntime).addChannel(newSharedMap1);

			// Now try to add this handle to another map from same runtime on which addChannel was called
			assert.throws(
				() => sharedMap2.set("newSharedMap", newSharedMap1.handle),
				(e: IErrorBase) => e.message === "0x17b",
			);
		});
	},
);
