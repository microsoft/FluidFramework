/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IFluidHandle } from "@fluidframework/core-interfaces";

import { ContainerRuntime } from "@fluidframework/container-runtime";
import { ISharedMap, IValueChanged, SharedMapIncremental } from "@fluidframework/map";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ConfigTypes, IConfigProviderBase } from "@fluidframework/telemetry-utils";
import {
	createSummarizerWithTestContainerConfig,
	ITestObjectProvider,
	ITestContainerConfig,
	DataObjectFactoryType,
	ChannelFactoryRegistry,
	ITestFluidObject,
	summarizeNow,
} from "@fluidframework/test-utils";
import { describeNoCompat } from "@fluid-internal/test-version-utils";
import { IContainer, LoaderHeader } from "@fluidframework/container-definitions";
import { SummaryType } from "@fluidframework/protocol-definitions";

const mapId = "mapKey";
const registry: ChannelFactoryRegistry = [[mapId, SharedMapIncremental.getFactory()]];
const testContainerConfig: ITestContainerConfig = {
	fluidDataObjectType: DataObjectFactoryType.Test,
	registry,
};

describeNoCompat("SharedMap", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;
	beforeEach(() => {
		provider = getTestObjectProvider();
	});

	let dataObject1: ITestFluidObject;
	let sharedMap1: ISharedMap;
	let sharedMap2: ISharedMap;
	let sharedMap3: ISharedMap;

	beforeEach(async () => {
		const container1 = await provider.makeTestContainer(testContainerConfig);
		dataObject1 = await requestFluidObject<ITestFluidObject>(container1, "default");
		sharedMap1 = await dataObject1.getSharedObject<SharedMapIncremental>(mapId);

		const container2 = await provider.loadTestContainer(testContainerConfig);
		const dataObject2 = await requestFluidObject<ITestFluidObject>(container2, "default");
		sharedMap2 = await dataObject2.getSharedObject<SharedMapIncremental>(mapId);

		const container3 = await provider.loadTestContainer(testContainerConfig);
		const dataObject3 = await requestFluidObject<ITestFluidObject>(container3, "default");
		sharedMap3 = await dataObject3.getSharedObject<SharedMapIncremental>(mapId);

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
		const newSharedMap1 = SharedMapIncremental.create(dataObject1.runtime);

		// Set a value while in local state.
		newSharedMap1.set("newKey", "newValue");

		// Now add the handle to an attached map so the new map gets attached too.
		sharedMap1.set("newSharedMap", newSharedMap1.handle);

		await provider.ensureSynchronized();

		// The new map should be available in the remote client and it should contain that key that was
		// set in local state.
		const newSharedMap2 = await sharedMap2
			.get<IFluidHandle<SharedMapIncremental>>("newSharedMap")
			?.get();
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
		const detachedMap1: ISharedMap = SharedMapIncremental.create(dataObject1.runtime);
		const detachedMap2: ISharedMap = SharedMapIncremental.create(dataObject1.runtime);

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

describeNoCompat("SharedMap orderSequentially", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;
	beforeEach(() => {
		provider = getTestObjectProvider();
	});

	let container: IContainer;
	let dataObject: ITestFluidObject;
	let sharedMap: SharedMapIncremental;

	let containerRuntime: ContainerRuntime;
	let clearEventCount: number;
	let changedEventData: IValueChanged[];

	const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
		getRawConfig: (name: string): ConfigTypes => settings[name],
	});
	const errorMessage = "callback failure";

	beforeEach(async () => {
		const configWithFeatureGates = {
			...testContainerConfig,
			loaderProps: {
				configProvider: configProvider({
					"Fluid.ContainerRuntime.EnableRollback": true,
				}),
			},
		};

		container = await provider.makeTestContainer(configWithFeatureGates);
		dataObject = await requestFluidObject<ITestFluidObject>(container, "default");
		sharedMap = await dataObject.getSharedObject<SharedMapIncremental>(mapId);
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

describeNoCompat("SharedMapIncremental", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;
	let container: IContainer;
	let dataObject: ITestFluidObject;
	let sharedMap: SharedMapIncremental;

	let containerRuntime: ContainerRuntime;

	const summaryTestContainerConfig: ITestContainerConfig = {
		...testContainerConfig,
		runtimeOptions: {
			summaryOptions: { summaryConfigOverrides: { state: "disabled" } },
		},
	};

	beforeEach(async () => {
		provider = getTestObjectProvider();
		container = await provider.makeTestContainer(summaryTestContainerConfig);
		dataObject = await requestFluidObject<ITestFluidObject>(container, "default");
		sharedMap = await dataObject.getSharedObject<SharedMapIncremental>(mapId);
		containerRuntime = dataObject.context.containerRuntime as ContainerRuntime;
	});

	it("Should be able to get and retrieve", async () => {
		const { summarizer } = await createSummarizerWithTestContainerConfig(
			provider,
			container,
			summaryTestContainerConfig,
		);
		await provider.ensureSynchronized();
		await summarizeNow(summarizer);

		sharedMap.set("0", "A boat load of data hopefully and we will keep on adding 123456789123");
		sharedMap.set("1", "A boat load of data hopefully and we will keep on adding 123456789123");
		sharedMap.set("2", "A boat load of data hopefully and we will keep on adding 123456789123");
		sharedMap.set("3", "A boat load of data hopefully and we will keep on adding 123456789123");
		sharedMap.set("4", "A boat load of data hopefully and we will keep on adding 123456789123");
		sharedMap.set("5", "A boat load of data hopefully and we will keep on adding 123456789123");
		sharedMap.set("6", "A boat load of data hopefully and we will keep on adding 123456789123");
		sharedMap.set("7", "A boat load of data hopefully and we will keep on adding 123456789123");
		sharedMap.set("8", "A boat load of data hopefully and we will keep on adding 123456789123");
		sharedMap.set("9", "A boat load of data hopefully and we will keep on adding 123456789123");

		await provider.ensureSynchronized();
		const summary1 = await summarizeNow(summarizer);
		const tree1 = (summary1.summaryTree as any).tree[".channels"].tree.default.tree[".channels"]
			.tree.mapKey.tree;
		assert.notEqual(tree1, undefined);

		sharedMap.set("9", "test change");
		await provider.ensureSynchronized();
		const summary2 = await summarizeNow(summarizer);
		const tree2 = (summary2.summaryTree as any).tree[".channels"].tree.default.tree[".channels"]
			.tree.mapKey.tree;
		assert.notEqual(tree2, undefined);
		const tree1Blob0Serialized = JSON.stringify(tree1.blob0);
		const tree2Blob0Serialized = JSON.stringify(tree2.blob0);
		assert.equal(tree1.blob0.type, SummaryType.Blob);
		assert.equal(tree2.blob0.type, SummaryType.Handle);
		console.log(tree1Blob0Serialized);
		console.log(tree2Blob0Serialized);

		assert.notEqual(tree1Blob0Serialized, tree2Blob0Serialized);
		const container2 = await provider.loadTestContainer(summaryTestContainerConfig, {
			[LoaderHeader.version]: summary2.summaryVersion,
		});
		const dataObject2 = await requestFluidObject<ITestFluidObject>(container2, "default");
		const sharedMap2 = await dataObject2.getSharedObject<SharedMapIncremental>(mapId);

		assert.equal(sharedMap.get("0"), sharedMap2.get("0"));
		assert.equal(sharedMap.get("1"), sharedMap2.get("1"));
		assert.equal(sharedMap.get("2"), sharedMap2.get("2"));
		assert.equal(sharedMap.get("3"), sharedMap2.get("3"));
		assert.equal(sharedMap.get("4"), sharedMap2.get("4"));
		assert.equal(sharedMap.get("5"), sharedMap2.get("5"));
		assert.equal(sharedMap.get("6"), sharedMap2.get("6"));
		assert.equal(sharedMap.get("7"), sharedMap2.get("7"));
		assert.equal(sharedMap.get("8"), sharedMap2.get("8"));
		assert.equal(sharedMap.get("9"), sharedMap2.get("9"));
	});
});
