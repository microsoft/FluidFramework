/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { AttachState } from "@fluidframework/container-definitions";
import type { IFluidHandleInternal } from "@fluidframework/core-interfaces/internal";
import { ISummaryBlob } from "@fluidframework/driver-definitions";
import {
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
	MockSharedObjectServices,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";

import { ISerializableValue, IValueChanged } from "../../interfaces.js";
import {
	IMapClearLocalOpMetadata,
	IMapClearOperation,
	IMapDeleteOperation,
	IMapKeyEditLocalOpMetadata,
	IMapSetOperation,
	MapLocalOpMetadata,
} from "../../internalInterfaces.js";
import { AttributableMapClass, MapFactory } from "../../map.js";
import { IMapOperation } from "../../mapKernel.js";

function createConnectedMap(id: string, runtimeFactory: MockContainerRuntimeFactory): TestMap {
	const dataStoreRuntime = new MockFluidDataStoreRuntime();

	const containerRuntime = runtimeFactory.createContainerRuntime(dataStoreRuntime);
	const services = {
		deltaConnection: dataStoreRuntime.createDeltaConnection(),
		objectStorage: new MockStorage(),
	};

	const map = new TestMap(id, dataStoreRuntime, MapFactory.Attributes);
	map.connect(services);
	return map;
}

function createDetachedMap(id: string): TestMap {
	const dataStoreRuntime = new MockFluidDataStoreRuntime();
	const map: TestMap = new TestMap(id, dataStoreRuntime, MapFactory.Attributes);
	return map;
}

class TestMap extends AttributableMapClass {
	private lastMetadata?: MapLocalOpMetadata;
	public testApplyStashedOp(content: IMapOperation): MapLocalOpMetadata | undefined {
		this.lastMetadata = undefined;
		this.applyStashedOp(content);
		return this.lastMetadata;
	}

	public submitLocalMessage(op: IMapOperation, localOpMetadata: unknown): void {
		this.lastMetadata = localOpMetadata as MapLocalOpMetadata;
		super.submitLocalMessage(op, localOpMetadata);
	}
}

describe("Map", () => {
	describe("Local state", () => {
		let map: TestMap;

		beforeEach(async () => {
			map = createDetachedMap("testMap");
		});

		describe("API", () => {
			it("Can create a new map", () => {
				assert.ok(map, "could not create a new map");
			});

			it("Can set and get map data", async () => {
				map.set("testKey", "testValue");
				map.set("testKey2", "testValue2");
				assert.equal(map.get("testKey"), "testValue", "could not retrieve set key 1");
				assert.equal(map.get("testKey2"), "testValue2", "could not retreive set key 2");
			});

			it("should fire correct map events", async () => {
				const dummyMap = map;
				let valueChangedExpected = true;
				let clearExpected = false;
				let previousValue: unknown;

				dummyMap.on("op", (arg1, arg2, arg3) => {
					assert.fail("shouldn't receive an op event");
				});
				dummyMap.on("valueChanged", (changed, local, target) => {
					assert.equal(valueChangedExpected, true, "valueChange event not expected");
					valueChangedExpected = false;

					assert.equal(changed.key, "marco");
					assert.equal(changed.previousValue, previousValue);

					assert.equal(
						local,
						true,
						"local should be true for local action for valueChanged event",
					);
					assert.equal(target, dummyMap, "target should be the map for valueChanged event");
				});
				dummyMap.on("clear", (local, target) => {
					assert.equal(clearExpected, true, "clear event not expected");
					clearExpected = false;

					assert.equal(local, true, "local should be true for local action  for clear event");
					assert.equal(target, dummyMap, "target should be the map for clear event");
				});
				dummyMap.on("error", (error) => {
					// propagate error in the event handlers
					throw error;
				});

				// Test set
				previousValue = undefined;
				dummyMap.set("marco", "polo");
				assert.equal(valueChangedExpected, false, "missing valueChanged event");

				// Test delete
				previousValue = "polo";
				valueChangedExpected = true;
				dummyMap.delete("marco");
				assert.equal(valueChangedExpected, false, "missing valueChanged event");

				// Test clear
				clearExpected = true;
				dummyMap.clear();
				assert.equal(clearExpected, false, "missing clear event");
			});

			it("Should return undefined when a key does not exist in the map", () => {
				assert.equal(
					map.get("missing"),
					undefined,
					"get() did not return undefined for missing key",
				);
			});

			it("Should reject undefined and null key sets", () => {
				assert.throws(() => {
					map.set(undefined as unknown as string, "one");
				}, "Should throw for key of undefined");
				assert.throws(() => {
					map.set(null as unknown as string, "two");
				}, "Should throw for key of null");
			});
		});

		describe("Serialize", () => {
			it("Should serialize the map as a JSON object", () => {
				map.set("first", "second");
				map.set("third", "fourth");
				map.set("fifth", "sixth");
				const subMap = createDetachedMap("subMap");
				map.set("object", subMap.handle);

				const summaryContent = (map.getAttachSummary().summary.tree.header as ISummaryBlob)
					.content;
				const subMapHandleUrl = subMap.handle.absolutePath;
				assert.equal(
					summaryContent,
					`{"blobs":[],"content":{"first":{"type":"Plain","value":"second","attribution":{"type":"detached","id":0}},"third":{"type":"Plain","value":"fourth","attribution":{"type":"detached","id":0}},"fifth":{"type":"Plain","value":"sixth","attribution":{"type":"detached","id":0}},"object":{"type":"Plain","value":{"type":"__fluid_handle__","url":"${subMapHandleUrl}"},"attribution":{"type":"detached","id":0}}}}`,
				);
			});

			it("Should serialize an undefined value", () => {
				map.set("first", "second");
				map.set("third", "fourth");
				map.set("fifth", undefined);
				assert.ok(map.has("fifth"));
				const subMap = createDetachedMap("subMap");
				map.set("object", subMap.handle);

				const summaryContent = (map.getAttachSummary().summary.tree.header as ISummaryBlob)
					.content;
				const subMapHandleUrl = subMap.handle.absolutePath;
				assert.equal(
					summaryContent,
					`{"blobs":[],"content":{"first":{"type":"Plain","value":"second","attribution":{"type":"detached","id":0}},"third":{"type":"Plain","value":"fourth","attribution":{"type":"detached","id":0}},"fifth":{"type":"Plain","attribution":{"type":"detached","id":0}},"object":{"type":"Plain","value":{"type":"__fluid_handle__","url":"${subMapHandleUrl}"},"attribution":{"type":"detached","id":0}}}}`,
				);
			});

			it("Should serialize an object with nested handles", async () => {
				const subMap = createDetachedMap("subMap");
				const subMap2 = createDetachedMap("subMap2");
				const containingObject = {
					subMapHandle: subMap.handle,
					nestedObj: {
						subMap2Handle: subMap2.handle,
					},
				};
				map.set("object", containingObject);

				const subMapHandleUrl = subMap.handle.absolutePath;
				const subMap2HandleUrl = subMap2.handle.absolutePath;
				const summaryContent = (map.getAttachSummary().summary.tree.header as ISummaryBlob)
					.content;
				assert.equal(
					summaryContent,
					`{"blobs":[],"content":{"object":{"type":"Plain","value":{"subMapHandle":{"type":"__fluid_handle__","url":"${subMapHandleUrl}"},"nestedObj":{"subMap2Handle":{"type":"__fluid_handle__","url":"${subMap2HandleUrl}"}}},"attribution":{"type":"detached","id":0}}}}`,
				);
			});

			it("can load old serialization format", async () => {
				map.set("key", "value");

				const content = JSON.stringify({
					key: {
						type: "Plain",
						value: "value",
					},
				});

				const services = new MockSharedObjectServices({ header: content });
				const factory = new MapFactory();
				const loadedMap = await factory.load(
					new MockFluidDataStoreRuntime(),
					"mapId",
					services,
					factory.attributes,
				);
				assert(loadedMap.get("key") === "value");
			});

			it("new serialization format for small maps", async () => {
				map.set("key", "value");

				const summaryTree = map.getAttachSummary().summary;
				assert.strictEqual(
					Object.keys(summaryTree.tree).length,
					1,
					"summary tree should only have one blob",
				);
				const summaryContent = (summaryTree.tree.header as ISummaryBlob)?.content;
				const expectedContent = JSON.stringify({
					blobs: [],
					content: {
						key: {
							type: "Plain",
							value: "value",
							attribution: {
								type: "detached",
								id: 0,
							},
						},
					},
				});
				assert.strictEqual(
					summaryContent,
					expectedContent,
					"The summary content is not as expected",
				);

				const services = new MockSharedObjectServices({ header: summaryContent });
				const factory = new MapFactory();
				const loadedMap = await factory.load(
					new MockFluidDataStoreRuntime(),
					"mapId",
					services,
					factory.attributes,
				);
				assert(loadedMap.get("key") === "value");
			});

			it("new serialization format for big maps", async () => {
				map.set("key", "value");

				// 160K char string
				let longString = "01234567890";
				for (let i = 0; i < 14; i++) {
					longString = longString + longString;
				}
				map.set("longValue", longString);
				map.set("zzz", "the end");

				const summaryTree = map.getAttachSummary().summary;
				assert.strictEqual(
					Object.keys(summaryTree.tree).length,
					2,
					"There should be 2 entries in the summary tree",
				);
				const expectedContent1 = JSON.stringify({
					blobs: ["blob0"],
					content: {
						key: {
							type: "Plain",
							value: "value",
							attribution: {
								type: "detached",
								id: 0,
							},
						},
						zzz: {
							type: "Plain",
							value: "the end",
							attribution: {
								type: "detached",
								id: 0,
							},
						},
					},
				});
				const expectedContent2 = JSON.stringify({
					longValue: {
						type: "Plain",
						value: longString,
						attribution: {
							type: "detached",
							id: 0,
						},
					},
				});

				const header = summaryTree.tree.header as ISummaryBlob;
				const blob0 = summaryTree.tree.blob0 as ISummaryBlob;
				assert.strictEqual(
					header?.content,
					expectedContent1,
					"header content is not as expected",
				);
				assert.strictEqual(
					blob0?.content,
					expectedContent2,
					"blob0 content is not as expected",
				);

				const services = new MockSharedObjectServices({
					header: header.content,
					blob0: blob0.content,
				});
				const factory = new MapFactory();
				const loadedMap = await factory.load(
					new MockFluidDataStoreRuntime(),
					"mapId",
					services,
					factory.attributes,
				);
				assert(loadedMap.get("key") === "value");
				assert(loadedMap.get("longValue") === longString);
				assert(loadedMap.get("zzz") === "the end");
			});
		});

		describe("Op processing", () => {
			/**
			 * These tests test the scenario found in the following bug:
			 * {@link https://github.com/microsoft/FluidFramework/issues/2400}
			 *
			 * - A SharedMap in local state set a key.
			 *
			 * - A second SharedMap is then created from the snapshot of the first one.
			 *
			 * - The second SharedMap sets a new value to the same key.
			 *
			 * - The expected behavior is that the first SharedMap updates the key with the new value. But in the bug
			 * the first SharedMap stores the key in its pending state even though it does not send out an op. So,
			 * when it gets a remote op with the same key, it ignores it as it has a pending set with the same key.
			 */
			it("should correctly process a set operation sent in local state", async () => {
				const dataStoreRuntime1 = new MockFluidDataStoreRuntime({
					attachState: AttachState.Detached,
				});
				const map1 = new TestMap("testMap1", dataStoreRuntime1, MapFactory.Attributes);

				// Set a key in local state.
				const key = "testKey";
				const value = "testValue";
				map1.set(key, value);

				// Load a new SharedMap in connected state from the snapshot of the first one.
				const containerRuntimeFactory = new MockContainerRuntimeFactory();
				const dataStoreRuntime2 = new MockFluidDataStoreRuntime();
				containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
				const services2 = MockSharedObjectServices.createFromSummary(
					map1.getAttachSummary().summary,
				);
				services2.deltaConnection = dataStoreRuntime2.createDeltaConnection();

				const map2 = new TestMap("testMap2", dataStoreRuntime2, MapFactory.Attributes);
				await map2.load(services2);

				// Now connect the first SharedMap
				dataStoreRuntime1.setAttachState(AttachState.Attached);
				containerRuntimeFactory.createContainerRuntime(dataStoreRuntime1);
				const services1 = {
					deltaConnection: dataStoreRuntime1.createDeltaConnection(),
					objectStorage: new MockStorage(undefined),
				};
				map1.connect(services1);

				// Verify that both the maps have the key.
				assert.equal(map1.get(key), value, "The first map does not have the key");
				assert.equal(map2.get(key), value, "The second map does not have the key");

				// Set a new value for the same key in the second SharedMap.
				const newValue = "newvalue";
				map2.set(key, newValue);

				// Process the message.
				containerRuntimeFactory.processAllMessages();

				// Verify that both the maps have the new value.
				assert.equal(map1.get(key), newValue, "The first map did not get the new value");
				assert.equal(map2.get(key), newValue, "The second map did not get the new value");
			});

			it("metadata op", async () => {
				const serializable: ISerializableValue = { type: "Plain", value: "value" };
				const dataStoreRuntime1 = new MockFluidDataStoreRuntime();
				const op: IMapSetOperation = { type: "set", key: "key", value: serializable };
				const map1 = new TestMap("testMap1", dataStoreRuntime1, MapFactory.Attributes);
				const containerRuntimeFactory = new MockContainerRuntimeFactory();
				containerRuntimeFactory.createContainerRuntime(dataStoreRuntime1);
				map1.connect({
					deltaConnection: dataStoreRuntime1.createDeltaConnection(),
					objectStorage: new MockStorage(undefined),
				});
				let metadata = map1.testApplyStashedOp(op);
				assert.equal(metadata?.type, "add");
				assert.equal(metadata.pendingMessageId, 0);
				const editmetadata = map1.testApplyStashedOp(op) as IMapKeyEditLocalOpMetadata;
				assert.equal(editmetadata.type, "edit");
				assert.equal(editmetadata.pendingMessageId, 1);
				assert.equal(editmetadata.previousValue.value, "value");
				const serializable2: ISerializableValue = { type: "Plain", value: "value2" };
				const op2: IMapSetOperation = { type: "set", key: "key2", value: serializable2 };
				metadata = map1.testApplyStashedOp(op2);
				assert.equal(metadata?.type, "add");
				assert.equal(metadata.pendingMessageId, 2);
				const op3: IMapDeleteOperation = { type: "delete", key: "key2" };
				metadata = map1.testApplyStashedOp(op3) as IMapKeyEditLocalOpMetadata;
				assert.equal(metadata.type, "edit");
				assert.equal(metadata.pendingMessageId, 3);
				assert.equal(metadata.previousValue.value, "value2");
				const op4: IMapClearOperation = { type: "clear" };
				metadata = map1.testApplyStashedOp(op4) as IMapClearLocalOpMetadata;
				assert.equal(metadata.pendingMessageId, 4);
				assert.equal(metadata.type, "clear");
				assert.equal(metadata.previousMap?.get("key")?.value, "value");
				assert.equal(metadata.previousMap?.has("key2"), false);
			});
		});

		describe("Attributor", () => {
			it("should retrive proper attribution in detached state", async () => {
				map = createDetachedMap("testMap");

				map.set("key1", 1);
				map.set("key2", 2);

				assert.deepEqual(
					map.getAttribution("key1"),
					{ type: "detached", id: 0 },
					"the first entry should have detached attribution",
				);
				assert.deepEqual(
					map.getAttribution("key2"),
					{ type: "detached", id: 0 },
					"the second entry should have detached attribution",
				);

				// load a new map from the snapshot
				const services = MockSharedObjectServices.createFromSummary(
					map.getAttachSummary().summary,
				);
				const map2 = new TestMap(
					"map2",
					new MockFluidDataStoreRuntime(),
					MapFactory.Attributes,
				);
				await map2.load(services);

				assert.deepEqual(
					map2.getAttribution("key1"),
					{ type: "detached", id: 0 },
					"the first entry of the loaded map should have detached attribution",
				);
				assert.deepEqual(
					map2.getAttribution("key2"),
					{ type: "detached", id: 0 },
					"the second entry of the loaded map should have detached attribution",
				);
			});
		});
	});

	describe("Connected state", () => {
		let containerRuntimeFactory: MockContainerRuntimeFactory;
		let map1: TestMap;
		let map2: TestMap;

		beforeEach(async () => {
			containerRuntimeFactory = new MockContainerRuntimeFactory();
			// Create the first map
			map1 = createConnectedMap("map1", containerRuntimeFactory);
			// Create and connect a second map
			map2 = createConnectedMap("map2", containerRuntimeFactory);
		});

		describe("API", () => {
			describe(".get()", () => {
				it("Should be able to retrieve a key", () => {
					const value = "value";
					map1.set("test", value);

					containerRuntimeFactory.processAllMessages();

					// Verify the local SharedMap
					assert.equal(map1.get("test"), value, "could not retrieve key");

					// Verify the remote SharedMap
					assert.equal(map2.get("test"), value, "could not retrieve key from the remote map");
				});
			});

			describe(".has()", () => {
				it("Should return false when a key is not in the map", () => {
					assert.equal(
						map1.has("notInSet"),
						false,
						"has() did not return false for missing key",
					);
				});

				it("Should return true when a key is in the map", () => {
					map1.set("inSet", "value");

					containerRuntimeFactory.processAllMessages();

					// Verify the local SharedMap
					assert.equal(map1.has("inSet"), true, "could not find the key");

					// Verify the remote SharedMap
					assert.equal(map2.has("inSet"), true, "could not find the key in the remote map");
				});
			});

			describe(".set()", () => {
				it("Should set a key to a value", () => {
					const value = "value";
					map1.set("test", value);

					containerRuntimeFactory.processAllMessages();

					// Verify the local SharedMap
					assert.equal(map1.has("test"), true, "could not find the set key");
					assert.equal(map1.get("test"), value, "could not get the set key");

					// Verify the remote SharedMap
					assert.equal(map2.has("test"), true, "could not find the set key in remote map");
					assert.equal(map2.get("test"), value, "could not get the set key from remote map");
				});

				it("Should be able to set a shared object handle as a key", () => {
					const subMap = createDetachedMap("subMap");
					map1.set("test", subMap.handle);

					containerRuntimeFactory.processAllMessages();

					// Verify the local SharedMap
					const localSubMap = map1.get<IFluidHandleInternal>("test");
					assert(localSubMap);
					assert.equal(
						localSubMap.absolutePath,
						subMap.handle.absolutePath,
						"could not get the handle's path",
					);

					// Verify the remote SharedMap
					const remoteSubMap = map2.get<IFluidHandleInternal>("test");
					assert(remoteSubMap);
					assert.equal(
						remoteSubMap.absolutePath,
						subMap.handle.absolutePath,
						"could not get the handle's path in remote map",
					);
				});

				it("Should be able to set and retrieve a plain object with nested handles", async () => {
					const subMap = createDetachedMap("subMap");
					const subMap2 = createDetachedMap("subMap2");
					const containingObject = {
						subMapHandle: subMap.handle,
						nestedObj: {
							subMap2Handle: subMap2.handle,
						},
					};
					map1.set("object", containingObject);

					containerRuntimeFactory.processAllMessages();

					const retrieved = map1.get("object");
					const retrievedSubMap: unknown = await retrieved.subMapHandle.get();
					assert.equal(retrievedSubMap, subMap, "could not get nested map 1");
					const retrievedSubMap2: unknown = await retrieved.nestedObj.subMap2Handle.get();
					assert.equal(retrievedSubMap2, subMap2, "could not get nested map 2");
				});

				it("Shouldn't clear value if there is pending set", () => {
					const valuesChanged: IValueChanged[] = [];
					let clearCount = 0;

					map1.on("valueChanged", (changed, local, target) => {
						valuesChanged.push(changed);
					});
					map1.on("clear", (local, target) => {
						clearCount++;
					});

					map2.set("map2key", "value2");
					map2.clear();
					map1.set("map1Key", "value1");
					map2.clear();

					containerRuntimeFactory.processSomeMessages(2);

					assert.equal(valuesChanged.length, 3);
					assert.equal(valuesChanged[0].key, "map1Key");
					assert.equal(valuesChanged[0].previousValue, undefined);
					assert.equal(valuesChanged[1].key, "map2key");
					assert.equal(valuesChanged[1].previousValue, undefined);
					assert.equal(valuesChanged[2].key, "map1Key");
					assert.equal(valuesChanged[2].previousValue, undefined);
					assert.equal(clearCount, 1);
					assert.equal(map1.size, 1);
					assert.equal(map1.get("map1Key"), "value1");

					containerRuntimeFactory.processSomeMessages(2);

					assert.equal(valuesChanged.length, 3);
					assert.equal(clearCount, 2);
					assert.equal(map1.size, 0);
				});

				it("Shouldn't overwrite value if there is pending set", () => {
					const value1 = "value1";
					const pending1 = "pending1";
					const pending2 = "pending2";
					map1.set("test", value1);
					map2.set("test", pending1);
					map2.set("test", pending2);

					containerRuntimeFactory.processSomeMessages(1);

					// Verify the SharedMap with processed message
					assert.equal(map1.has("test"), true, "could not find the set key");
					assert.equal(map1.get("test"), value1, "could not get the set key");

					// Verify the SharedMap with 2 pending messages
					assert.equal(map2.has("test"), true, "could not find the set key in pending map");
					assert.equal(
						map2.get("test"),
						pending2,
						"could not get the set key from pending map",
					);

					containerRuntimeFactory.processSomeMessages(1);

					// Verify the SharedMap gets updated from remote
					assert.equal(map1.has("test"), true, "could not find the set key");
					assert.equal(map1.get("test"), pending1, "could not get the set key");

					// Verify the SharedMap with 1 pending message
					assert.equal(map2.has("test"), true, "could not find the set key in pending map");
					assert.equal(
						map2.get("test"),
						pending2,
						"could not get the set key from pending map",
					);
				});

				it("Shouldn't set values when pending clear", () => {
					const key = "test";
					map1.set(key, "map1value1");
					map2.set(key, "map2value2");
					map2.clear();
					map2.set(key, "map2value3");
					map2.clear();

					// map1.set(key, "map1value1");
					containerRuntimeFactory.processSomeMessages(1);

					// Verify the SharedMap with processed message
					assert.equal(map1.has("test"), true, "could not find the set key");
					assert.equal(map1.get("test"), "map1value1", "could not get the set key");

					// Verify the SharedMap with 2 pending clears
					assert.equal(map2.has("test"), false, "found the set key in pending map");

					// map2.set(key, "map2value2");
					containerRuntimeFactory.processSomeMessages(1);

					// Verify the SharedMap gets updated from remote
					assert.equal(map1.has("test"), true, "could not find the set key");
					assert.equal(map1.get("test"), "map2value2", "could not get the set key");

					// Verify the SharedMap with 2 pending clears
					assert.equal(map2.has("test"), false, "found the set key in pending map");

					// map2.clear();
					containerRuntimeFactory.processSomeMessages(1);

					// Verify the SharedMap gets updated from remote clear
					assert.equal(map1.has("test"), false, "found the set key");

					// Verify the SharedMap with 1 pending clear
					assert.equal(map2.has("test"), false, "found the set key in pending map");

					// map2.set(key, "map2value3");
					containerRuntimeFactory.processSomeMessages(1);

					// Verify the SharedMap gets updated from remote
					assert.equal(map1.has("test"), true, "could not find the set key");
					assert.equal(map1.get("test"), "map2value3", "could not get the set key");

					// Verify the SharedMap with 1 pending clear
					assert.equal(map2.has("test"), false, "found the set key in pending map");

					// map2.clear();
					containerRuntimeFactory.processSomeMessages(1);

					// Verify the SharedMap gets updated from remote clear
					assert.equal(map1.has("test"), false, "found the set key");

					// Verify the SharedMap with no more pending clear
					assert.equal(map2.has("test"), false, "found the set key in pending map");

					map1.set(key, "map1value4");
					containerRuntimeFactory.processSomeMessages(1);

					// Verify the SharedMap gets updated from local
					assert.equal(map1.has("test"), true, "could not find the set key");
					assert.equal(map1.get("test"), "map1value4", "could not get the set key");

					// Verify the SharedMap gets updated from remote
					assert.equal(map1.has("test"), true, "could not find the set key");
					assert.equal(map1.get("test"), "map1value4", "could not get the set key");
				});
			});

			describe(".delete()", () => {
				it("Can set and delete map key", async () => {
					map1.set("testKey", "testValue");
					map1.set("testKey2", "testValue2");
					map1.delete("testKey");
					map1.delete("testKey2");
					assert.equal(map1.has("testKey"), false, "could not delete key 1");
					assert.equal(map1.has("testKey2"), false, "could not delete key 2");
					map1.set("testKey", "testValue");
					map1.set("testKey2", "testValue2");
					assert.equal(
						map1.get("testKey"),
						"testValue",
						"could not retrieve set key 1 after delete",
					);
					assert.equal(
						map1.get("testKey2"),
						"testValue2",
						"could not retrieve set key 2 after delete",
					);
				});
			});

			describe(".forEach()", () => {
				it("Should iterate over all keys in the map", () => {
					// We use a set to mark the values we want to insert. When we iterate we will remove from the set
					// and then check it's empty at the end
					const set = new Set<string>();
					set.add("first");
					set.add("second");
					set.add("third");

					for (const value of set) {
						map1.set(value, value);
					}

					containerRuntimeFactory.processAllMessages();

					// Verify the local SharedMap
					for (const [key, value] of map1.entries()) {
						assert.ok(set.has(key), "the key should be present in the set");
						assert.equal(key, value, "the value should match the set value");
						assert.equal(map1.get(key), value, "could not get key");
					}

					// Verify the remote SharedMap
					for (const [key, value] of map2.entries()) {
						assert.ok(set.has(key), "the key in remote map should be present in the set");
						assert.equal(key, value, "the value should match the set value in the remote map");
						assert.equal(map2.get(key), value, "could not get key in the remote map");
						set.delete(key);
					}

					assert.equal(set.size, 0);
				});
			});
		});

		describe("Attributor", () => {
			beforeEach(() => {
				containerRuntimeFactory = new MockContainerRuntimeFactory();
				// Connect the first map with attribution enabled.
				map1 = createConnectedMap("map1", containerRuntimeFactory);
				// Create the second map with attribution enabled.
				map2 = createConnectedMap("map2", containerRuntimeFactory);
			});

			it("Can retrieve proper attribution information with set/delete key operations", () => {
				map1.set("key1", 1);
				map1.set("key2", 2);
				map2.set("key1", 3);

				containerRuntimeFactory.processSomeMessages(1);

				assert.deepEqual(
					map1.getAttribution("key1"),
					{ type: "op", seq: 1 },
					"the first entry of map1 should have correct op-based attribution",
				);
				assert.deepEqual(
					map1.getAttribution("key2"),
					{ type: "local" },
					"the second entry of map1 should have valid local attribution",
				);
				assert.deepEqual(
					map2.getAttribution("key1"),
					{ type: "local" },
					"the first entry of map2 should have valid local attribution",
				);
				assert.equal(
					map2.getAttribution("key2"),
					undefined,
					"the second entry of map2 should not have valid attribution",
				);

				containerRuntimeFactory.processSomeMessages(2);

				assert.deepEqual(
					map1.getAttribution("key1"),
					{ type: "op", seq: 3 },
					"the first entry of map1 should have correct op-based attribution",
				);
				assert.deepEqual(
					map1.getAttribution("key2"),
					{ type: "op", seq: 2 },
					"the second entry of map1 should have correct op-based attribution",
				);
				assert.deepEqual(
					map2.getAttribution("key1"),
					{ type: "op", seq: 3 },
					"the first entry of map2 should have correct op-based attribution",
				);
				assert.deepEqual(
					map2.getAttribution("key2"),
					{ type: "op", seq: 2 },
					"the second entry of map2 should have correct op-based attribution",
				);

				// Delete an entry and check the attribution
				map1.delete("key2");
				containerRuntimeFactory.processSomeMessages(1);

				assert.deepEqual(
					map1.getAttribution("key1"),
					{ type: "op", seq: 3 },
					"the first entry of map1 should have correct op-based attribution",
				);
				assert.equal(
					map1.getAttribution("key2"),
					undefined,
					"the attribution of second entry of map1 should be removed",
				);
				assert.deepEqual(
					map2.getAttribution("key1"),
					{ type: "op", seq: 3 },
					"the first entry of map2 should have correct op-based attribution",
				);
				assert.equal(
					map2.getAttribution("key2"),
					undefined,
					"the attribution of second entry of map2 should be removed",
				);
			});

			it("Can remove attribution table after the clearance", () => {
				map1.set("key1", 1);
				map1.set("key2", 2);
				map2.set("key1", 3);
				map1.delete("key2");
				map2.clear();

				containerRuntimeFactory.processAllMessages();

				assert.equal(
					map1.getAllAttribution()?.size,
					0,
					"The attribution table of map1 should be cleared",
				);
				assert.equal(
					map2.getAllAttribution()?.size,
					0,
					"The attribution table of map2 should be cleared",
				);
			});

			it("Can retrieve proper attribution information after summarization/loading", async () => {
				map1.set("key1", 1);
				map2.set("key2", 2);
				map2.set("key1", 3);

				containerRuntimeFactory.processAllMessages();

				const service = MockSharedObjectServices.createFromSummary(
					map1.getAttachSummary().summary,
				);
				const map3 = new TestMap(
					"map3",
					new MockFluidDataStoreRuntime(),
					MapFactory.Attributes,
				);
				await map3.load(service);

				assert.deepEqual(
					map3.getAttribution("key1"),
					{ type: "op", seq: 3 },
					"The loaded map should have valid op-based attribution for the first entry",
				);

				assert.deepEqual(
					map3.getAttribution("key2"),
					{ type: "op", seq: 2 },
					"The loaded map should have valid op-based attribution for the second entry",
				);
			});

			it("can update attribution properly while applying stashed ops", async () => {
				const serializable: ISerializableValue = { type: "Plain", value: "value" };
				const op: IMapSetOperation = { type: "set", key: "key", value: serializable };
				map1.testApplyStashedOp(op);
				assert.deepEqual(map1.getAttribution("key"), { type: "local" });

				const serializable2: ISerializableValue = { type: "Plain", value: "value2" };
				const op2: IMapSetOperation = { type: "set", key: "key2", value: serializable2 };
				map1.testApplyStashedOp(op2);
				assert.deepEqual(map1.getAttribution("key2"), { type: "local" });

				const op3: IMapDeleteOperation = { type: "delete", key: "key2" };
				map1.testApplyStashedOp(op3);
				assert.equal(map1.getAttribution("key2"), undefined);

				const op4: IMapClearOperation = { type: "clear" };
				map1.testApplyStashedOp(op4);
				assert.equal(map1.getAllAttribution()?.size, 0);
			});
		});
	});
});
