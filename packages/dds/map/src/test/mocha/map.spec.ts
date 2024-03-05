/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { ISummaryBlob } from "@fluidframework/protocol-definitions";
import { IGCTestProvider, runGCTests } from "@fluid-private/test-dds-utils";
import {
	MockFluidDataStoreRuntime,
	MockContainerRuntimeFactory,
	MockSharedObjectServices,
	MockStorage,
} from "@fluidframework/test-runtime-utils";
import { AttachState } from "@fluidframework/container-definitions";
import { ISerializableValue, IValueChanged } from "../../interfaces.js";
import {
	IMapSetOperation,
	IMapDeleteOperation,
	IMapClearOperation,
	IMapKeyEditLocalOpMetadata,
	IMapClearLocalOpMetadata,
	MapLocalOpMetadata,
} from "../../internalInterfaces.js";
import { MapFactory, SharedMap } from "../../map.js";
import { IMapOperation } from "../../mapKernel.js";

function createConnectedMap(id: string, runtimeFactory: MockContainerRuntimeFactory): SharedMap {
	const dataStoreRuntime = new MockFluidDataStoreRuntime();
	const containerRuntime = runtimeFactory.createContainerRuntime(dataStoreRuntime);
	const services = {
		deltaConnection: dataStoreRuntime.createDeltaConnection(),
		objectStorage: new MockStorage(),
	};
	const map = new SharedMap(id, dataStoreRuntime, MapFactory.Attributes);
	map.connect(services);
	return map;
}

function createLocalMap(id: string): SharedMap {
	const map = new SharedMap(id, new MockFluidDataStoreRuntime(), MapFactory.Attributes);
	return map;
}

class TestSharedMap extends SharedMap {
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
		let map: SharedMap;

		beforeEach("createLocalMap", async () => {
			map = createLocalMap("testMap");
		});

		describe("API", () => {
			it("Can create a new map", () => {
				assert.ok(map, "could not create a new map");
			});

			it("Can set and get map data", async () => {
				map.set("testKey", "testValue");
				map.set("testKey2", "testValue2");
				assert.equal(map.get("testKey"), "testValue", "could not retrieve set key 1");
				assert.equal(map.get("testKey2"), "testValue2", "could not retrieve set key 2");
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
					assert.equal(
						target,
						dummyMap,
						"target should be the map for valueChanged event",
					);
				});
				dummyMap.on("clear", (local, target) => {
					assert.equal(clearExpected, true, "clear event not expected");
					clearExpected = false;

					assert.equal(
						local,
						true,
						"local should be true for local action  for clear event",
					);
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
					// eslint-disable-next-line unicorn/no-null
					map.set(null as unknown as string, "two");
				}, "Should throw for key of null");
			});
		});

		describe("Serialize", () => {
			it("Should serialize the map as a JSON object", () => {
				map.set("first", "second");
				map.set("third", "fourth");
				map.set("fifth", "sixth");
				const subMap = createLocalMap("subMap");
				map.set("object", subMap.handle);

				const summaryContent = (map.getAttachSummary().summary.tree.header as ISummaryBlob)
					.content;
				const subMapHandleUrl = subMap.handle.absolutePath;
				assert.equal(
					summaryContent,
					`{"blobs":[],"content":{"first":{"type":"Plain","value":"second"},"third":{"type":"Plain","value":"fourth"},"fifth":{"type":"Plain","value":"sixth"},"object":{"type":"Plain","value":{"type":"__fluid_handle__","url":"${subMapHandleUrl}"}}}}`,
				);
			});

			it("Should serialize an undefined value", () => {
				map.set("first", "second");
				map.set("third", "fourth");
				map.set("fifth", undefined);
				assert.ok(map.has("fifth"));
				const subMap = createLocalMap("subMap");
				map.set("object", subMap.handle);

				const summaryContent = (map.getAttachSummary().summary.tree.header as ISummaryBlob)
					.content;
				const subMapHandleUrl = subMap.handle.absolutePath;
				assert.equal(
					summaryContent,
					`{"blobs":[],"content":{"first":{"type":"Plain","value":"second"},"third":{"type":"Plain","value":"fourth"},"fifth":{"type":"Plain"},"object":{"type":"Plain","value":{"type":"__fluid_handle__","url":"${subMapHandleUrl}"}}}}`,
				);
			});

			it("Should serialize an object with nested handles", async () => {
				const subMap = createLocalMap("subMap");
				const subMap2 = createLocalMap("subMap2");
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
					`{"blobs":[],"content":{"object":{"type":"Plain","value":{"subMapHandle":{"type":"__fluid_handle__","url":"${subMapHandleUrl}"},"nestedObj":{"subMap2Handle":{"type":"__fluid_handle__","url":"${subMap2HandleUrl}"}}}}}}`,
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

				// 40K char string
				let longString = "01234567890";
				for (let i = 0; i < 12; i++) {
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
						},
						zzz: {
							type: "Plain",
							value: "the end",
						},
					},
				});
				const expectedContent2 = JSON.stringify({
					longValue: {
						type: "Plain",
						value: longString,
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
				const dataStoreRuntime1 = new MockFluidDataStoreRuntime();
				const map1 = new SharedMap("testMap1", dataStoreRuntime1, MapFactory.Attributes);

				// Set a key in local state.
				const key = "testKey";
				const value = "testValue";
				map1.set(key, value);

				// Load a new SharedMap in connected state from the snapshot of the first one.
				const containerRuntimeFactory = new MockContainerRuntimeFactory();
				const dataStoreRuntime2 = new MockFluidDataStoreRuntime();
				const containerRuntime2 =
					containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
				const services2 = MockSharedObjectServices.createFromSummary(
					map1.getAttachSummary().summary,
				);
				services2.deltaConnection = dataStoreRuntime2.createDeltaConnection();

				const map2 = new SharedMap("testMap2", dataStoreRuntime2, MapFactory.Attributes);
				await map2.load(services2);

				// Now connect the first SharedMap
				dataStoreRuntime1.setAttachState(AttachState.Attached);
				const containerRuntime1 =
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
				const newValue = "newValue";
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
				const map1 = new TestSharedMap(
					"testMap1",
					dataStoreRuntime1,
					MapFactory.Attributes,
				);
				const containerRuntimeFactory = new MockContainerRuntimeFactory();
				containerRuntimeFactory.createContainerRuntime(dataStoreRuntime1);
				map1.connect({
					deltaConnection: dataStoreRuntime1.createDeltaConnection(),
					objectStorage: new MockStorage(undefined),
				});
				let metadata = map1.testApplyStashedOp(op);
				assert.equal(metadata?.type, "add");
				assert.equal(metadata.pendingMessageId, 0);
				const editMetadata = map1.testApplyStashedOp(op) as IMapKeyEditLocalOpMetadata;
				assert.equal(editMetadata.type, "edit");
				assert.equal(editMetadata.pendingMessageId, 1);
				assert.equal(editMetadata.previousValue.value, "value");
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
	});

	describe("Connected state", () => {
		let containerRuntimeFactory: MockContainerRuntimeFactory;
		let map1: SharedMap;
		let map2: SharedMap;

		beforeEach("createConnectedMaps", async () => {
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
					assert.equal(
						map2.get("test"),
						value,
						"could not retrieve key from the remote map",
					);
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
					assert.equal(
						map2.has("inSet"),
						true,
						"could not find the key in the remote map",
					);
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
					assert.equal(
						map2.has("test"),
						true,
						"could not find the set key in remote map",
					);
					assert.equal(
						map2.get("test"),
						value,
						"could not get the set key from remote map",
					);
				});

				it("Should be able to set a shared object handle as a key", () => {
					const subMap = createLocalMap("subMap");
					map1.set("test", subMap.handle);

					containerRuntimeFactory.processAllMessages();

					// Verify the local SharedMap
					const localSubMap = map1.get<IFluidHandle>("test");
					assert(localSubMap);
					assert.equal(
						localSubMap.absolutePath,
						subMap.handle.absolutePath,
						"could not get the handle's path",
					);

					// Verify the remote SharedMap
					const remoteSubMap = map2.get<IFluidHandle>("test");
					assert(remoteSubMap);
					assert.equal(
						remoteSubMap.absolutePath,
						subMap.handle.absolutePath,
						"could not get the handle's path in remote map",
					);
				});

				it("Should be able to set and retrieve a plain object with nested handles", async () => {
					const subMap = createLocalMap("subMap");
					const subMap2 = createLocalMap("subMap2");
					const containingObject = {
						subMapHandle: subMap.handle,
						nestedObj: {
							subMap2Handle: subMap2.handle,
						},
					};
					map1.set("object", containingObject);

					containerRuntimeFactory.processAllMessages();

					const retrieved = map1.get("object") as typeof containingObject;
					const retrievedSubMap: unknown = await retrieved.subMapHandle.get();
					assert.equal(retrievedSubMap, subMap, "could not get nested map 1");
					const retrievedSubMap2: unknown = await retrieved.nestedObj.subMap2Handle.get();
					assert.equal(retrievedSubMap2, subMap2, "could not get nested map 2");
				});

				it("Shouldn't clear value remotely if there is pending set", () => {
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

				it("Shouldn't keep the old pending set after a local clear", () => {
					map1.set("1", 1);
					map1.set("2", 2);
					map1.set("3", 3);
					map1.clear();
					map1.set("1", 2);

					containerRuntimeFactory.processAllMessages();

					assert.equal(map1.get("1"), 2);
					assert.equal(map1.get("2"), undefined);
					assert.equal(map1.get("3"), undefined);
					assert.equal(map2.get("1"), 2);
					assert.equal(map2.get("2"), undefined);
					assert.equal(map2.get("3"), undefined);
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
					assert.equal(
						map2.has("test"),
						true,
						"could not find the set key in pending map",
					);
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
					assert.equal(
						map2.has("test"),
						true,
						"could not find the set key in pending map",
					);
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

				/**
				 * It is an unusual scenario, the client of map1 executes an invalid delete (since "foo" does not exist in its keys),
				 * but it can remotely delete the "foo" which is locally inserted in map2 but not ack'd yet.
				 *
				 * This merge outcome might be undesirable: this test case is mostly here to document Map's behavior.
				 * Please communicate any concerns about the merge outcome to the DDS team.
				 */
				it("Can remotely delete a key which should be unknown to the local client", () => {
					map1.set("foo", 1);
					containerRuntimeFactory.processAllMessages();
					map1.delete("foo");
					map2.set("foo", 2);
					map1.delete("foo");
					containerRuntimeFactory.processAllMessages();

					assert.equal(map1.get("foo"), undefined);
					assert.equal(map2.get("foo"), undefined);
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
						assert.ok(
							set.has(key),
							"the key in remote map should be present in the set",
						);
						assert.equal(
							key,
							value,
							"the value should match the set value in the remote map",
						);
						assert.equal(map2.get(key), value, "could not get key in the remote map");
						set.delete(key);
					}

					assert.equal(set.size, 0);
				});
			});

			describe(".size", () => {
				it("shouldn't count keys deleted concurrent to a clear op", () => {
					map1.clear();
					map2.delete("dummy");
					containerRuntimeFactory.processAllMessages();
					assert.equal(map1.size, 0);
					assert.equal(map2.size, 0);
				});

				it("should count the key with undefined value concurrent to a clear op", () => {
					map1.clear();
					map2.set("1", undefined);

					containerRuntimeFactory.processSomeMessages(1);
					assert.equal(map1.size, 0);
					assert.equal(map2.size, 1);

					containerRuntimeFactory.processSomeMessages(1);
					assert.equal(map1.size, 1);
					assert.equal(map2.size, 1);
				});

				it("should count keys correctly after local operations", () => {
					map1.set("1", 1);
					map1.set("2", 1);
					map2.set("3", 1);

					assert.equal(map1.size, 2);
					assert.equal(map2.size, 1);

					map1.set("2", 2);
					map1.delete("1");
					map2.set("2", 1);

					assert.equal(map1.size, 1);
					assert.equal(map2.size, 2);

					map1.delete("1");
					map2.clear();

					assert.equal(map1.size, 1);
					assert.equal(map2.size, 0);
				});

				it("should count keys correctly after remote operations", () => {
					map1.set("1", 1);
					map1.set("2", 1);
					map2.set("3", 1);

					containerRuntimeFactory.processSomeMessages(2);
					assert.equal(map1.size, 2);
					assert.equal(map2.size, 3);

					containerRuntimeFactory.processSomeMessages(1);
					assert.equal(map1.size, 3);
					assert.equal(map2.size, 3);

					map1.delete("3");
					map2.clear();

					containerRuntimeFactory.processSomeMessages(1);
					assert.equal(map1.size, 2);
					assert.equal(map2.size, 0);

					containerRuntimeFactory.processSomeMessages(1);
					assert.equal(map1.size, 0);
					assert.equal(map2.size, 0);
				});
			});
		});
	});

	describe("Garbage Collection", () => {
		class GCSharedMapProvider implements IGCTestProvider {
			private subMapCount = 0;
			private _expectedRoutes: string[] = [];
			private readonly map1: SharedMap;
			private readonly map2: SharedMap;
			private readonly containerRuntimeFactory: MockContainerRuntimeFactory;

			public constructor() {
				this.containerRuntimeFactory = new MockContainerRuntimeFactory();
				this.map1 = createConnectedMap("map1", this.containerRuntimeFactory);
				this.map2 = createConnectedMap("map2", this.containerRuntimeFactory);
			}

			/**
			 * {@inheritDoc @fluid-private/test-dds-utils#IGCTestProvider.sharedObject}
			 */
			public get sharedObject(): SharedMap {
				// Return the remote SharedMap because we want to verify its summary data.
				return this.map2;
			}

			/**
			 * {@inheritDoc @fluid-private/test-dds-utils#IGCTestProvider.expectedOutboundRoutes}
			 */
			public get expectedOutboundRoutes(): string[] {
				return this._expectedRoutes;
			}

			/**
			 * {@inheritDoc @fluid-private/test-dds-utils#IGCTestProvider.addOutboundRoutes}
			 */
			public async addOutboundRoutes(): Promise<void> {
				const newSubMapId = `subMap-${++this.subMapCount}`;
				const subMap = createLocalMap(newSubMapId);
				this.map1.set(newSubMapId, subMap.handle);
				this._expectedRoutes.push(subMap.handle.absolutePath);
				this.containerRuntimeFactory.processAllMessages();
			}

			/**
			 * {@inheritDoc @fluid-private/test-dds-utils#IGCTestProvider.deleteOutboundRoutes}
			 */
			public async deleteOutboundRoutes(): Promise<void> {
				// Delete the last handle that was added.
				const subMapId = `subMap-${this.subMapCount}`;
				const deletedHandle = this.map1.get<IFluidHandle>(subMapId);
				assert(deletedHandle, "Route must be added before deleting");

				this.map1.delete(subMapId);
				// Remove deleted handle's route from expected routes.
				this._expectedRoutes = this._expectedRoutes.filter(
					(route) => route !== deletedHandle.absolutePath,
				);
				this.containerRuntimeFactory.processAllMessages();
			}

			/**
			 * {@inheritDoc @fluid-private/test-dds-utils#IGCTestProvider.addNestedHandles}
			 */
			public async addNestedHandles(): Promise<void> {
				const subMapId1 = `subMap-${++this.subMapCount}`;
				const subMapId2 = `subMap-${++this.subMapCount}`;
				const subMap = createLocalMap(subMapId1);
				const subMap2 = createLocalMap(subMapId2);
				const containingObject = {
					subMapHandle: subMap.handle,
					nestedObj: {
						subMap2Handle: subMap2.handle,
					},
				};
				this.map1.set(subMapId2, containingObject);
				this._expectedRoutes.push(subMap.handle.absolutePath, subMap2.handle.absolutePath);
				this.containerRuntimeFactory.processAllMessages();
			}
		}

		runGCTests(GCSharedMapProvider);
	});
});
