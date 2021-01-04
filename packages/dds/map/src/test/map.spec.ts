/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { ISummaryBlob } from "@fluidframework/protocol-definitions";
import { IGCTestProvider, runGCTests } from "@fluid-internal/test-dds-utils";
import {
    MockFluidDataStoreRuntime,
    MockContainerRuntimeFactory,
    MockSharedObjectServices,
    MockStorage,
} from "@fluidframework/test-runtime-utils";
import { MapFactory, SharedMap } from "../map";

function createConnectedMap(id: string, runtimeFactory: MockContainerRuntimeFactory) {
    const dataStoreRuntime = new MockFluidDataStoreRuntime();
    const containerRuntime = runtimeFactory.createContainerRuntime(dataStoreRuntime);
    const services = {
        deltaConnection: containerRuntime.createDeltaConnection(),
        objectStorage: new MockStorage(),
    };
    const map = new SharedMap(id, dataStoreRuntime, MapFactory.Attributes);
    map.connect(services);
    return map;
}

function createLocalMap(id: string) {
    const map = new SharedMap(id, new MockFluidDataStoreRuntime(), MapFactory.Attributes);
    return map;
}

describe("Map", () => {
    describe("Local state", () => {
        let map: SharedMap;

        beforeEach(async () => {
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
                assert.equal(map.get("testKey2"), "testValue2", "could not retreive set key 2");
            });

            it("should fire correct map events", async () => {
                const dummyMap = map;
                let called1: boolean = false;
                let called2: boolean = false;
                dummyMap.on("op", (agr1, arg2, arg3) => called1 = true);
                dummyMap.on("valueChanged", (agr1, arg2, arg3, arg4) => called2 = true);
                dummyMap.set("marco", "polo");
                assert.equal(called1, false, "did not receive op event");
                assert.equal(called2, true, "did not receive valueChanged event");
            });

            it("Should return undefined when a key does not exist in the map", () => {
                assert.equal(map.get("missing"), undefined, "get() did not return undefined for missing key");
            });

            it("Should reject undefined and null key sets", () => {
                assert.throws(() => {
                    map.set(undefined as any, "one");
                }, "Should throw for key of undefined");
                assert.throws(() => {
                    map.set(null as any, "two");
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

                const parsed = map.getSerializableStorage();

                map.forEach((value, key) => {
                    if (!value.IFluidHandle) {
                        assert.equal(parsed[key].type, "Plain");
                        assert.equal(parsed[key].value, value);
                    } else {
                        assert.equal(parsed[key].type, "Plain");
                        assert.equal(parsed[key].value.url, subMap.handle.absolutePath);
                    }
                });
            });

            it("Should serialize an undefined value", () => {
                map.set("first", "second");
                map.set("third", "fourth");
                map.set("fifth", undefined);
                assert.ok(map.has("fifth"));
                const subMap = createLocalMap("subMap");
                map.set("object", subMap.handle);

                const parsed = map.getSerializableStorage();

                map.forEach((value, key) => {
                    if (!value || !value.IFluidHandle) {
                        assert.equal(parsed[key].type, "Plain");
                        assert.equal(parsed[key].value, value);
                    } else {
                        assert.equal(parsed[key].type, "Plain");
                        assert.equal(parsed[key].value.url, subMap.handle.absolutePath);
                    }
                });
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
                const serialized = JSON.stringify(map.getSerializableStorage());
                // eslint-disable-next-line max-len
                assert.equal(serialized, `{"object":{"type":"Plain","value":{"subMapHandle":{"type":"__fluid_handle__","url":"${subMapHandleUrl}"},"nestedObj":{"subMap2Handle":{"type":"__fluid_handle__","url":"${subMap2HandleUrl}"}}}}}`);
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
                    new MockFluidDataStoreRuntime(), "mapId", services, factory.attributes,
                );
                assert(loadedMap.get("key") === "value");
            });

            it("new serialization format for small maps", async () => {
                map.set("key", "value");

                const summaryTree = map.summarize().summary;
                assert.strictEqual(
                    Object.keys(summaryTree.tree).length, 1, "summary tree should only have one blob");
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
                assert.strictEqual(summaryContent, expectedContent, "The summary content is not as expected");

                const services = new MockSharedObjectServices({ header: summaryContent });
                const factory = new MapFactory();
                const loadedMap = await factory.load(
                    new MockFluidDataStoreRuntime(), "mapId", services, factory.attributes,
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

                const summaryTree = map.summarize().summary;
                assert.strictEqual(
                    Object.keys(summaryTree.tree).length, 2, "There should be 2 entries in the summary tree");
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
                assert.strictEqual(header?.content, expectedContent1, "header content is not as expected");
                assert.strictEqual(blob0?.content, expectedContent2, "blob0 content is not as expected");

                const services = new MockSharedObjectServices({
                    header: header.content,
                    blob0: blob0.content,
                });
                const factory = new MapFactory();
                const loadedMap = await factory.load(
                    new MockFluidDataStoreRuntime(), "mapId", services, factory.attributes,
                );
                assert(loadedMap.get("key") === "value");
                assert(loadedMap.get("longValue") === longString);
                assert(loadedMap.get("zzz") === "the end");
            });
        });

        describe("Op processing", () => {
            /**
             * These tests test the scenario found in the following bug:
             * https://github.com/microsoft/FluidFramework/issues/2400
             *
             * - A SharedMap in local state set a key.
             * - A second SharedMap is then created from the snapshot of the first one.
             * - The second SharedMap sets a new value to the same key.
             * - The expected behavior is that the first SharedMap updates the key with the new value. But in the bug
             *   the first SharedMap stores the key in its pending state even though it does not send out an op. So,
             *   when it gets a remote op with the same key, it ignores it as it has a pending set with the same key.
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
                const containerRuntime2 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
                const services2 = MockSharedObjectServices.createFromSummary(map1.summarize().summary);
                services2.deltaConnection = containerRuntime2.createDeltaConnection();

                const map2 = new SharedMap("testMap2", dataStoreRuntime2, MapFactory.Attributes);
                await map2.load(services2);

                // Now connect the first SharedMap
                dataStoreRuntime1.local = false;
                const containerRuntime1 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime1);
                const services1 = {
                    deltaConnection: containerRuntime1.createDeltaConnection(),
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
        });
    });

    describe("Connected state", () => {
        let containerRuntimeFactory: MockContainerRuntimeFactory;
        let map1: SharedMap;
        let map2: SharedMap;

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
                    assert.equal(map1.has("notInSet"), false, "has() did not return false for missing key");
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
                    assert.equal(map2.get("test"), value, "could note get the set key from remote map");
                });

                it("Should be able to set a shared object handle as a key", () => {
                    const subMap = createLocalMap("subMap");
                    map1.set("test", subMap.handle);

                    containerRuntimeFactory.processAllMessages();

                    // Verify the local SharedMap
                    const localSubMap = map1.get<IFluidHandle>("test");
                    assert.equal(
                        localSubMap.absolutePath, subMap.handle.absolutePath, "could not get the handle's path");

                    // Verify the remote SharedMap
                    const remoteSubMap = map2.get<IFluidHandle>("test");
                    assert.equal(
                        remoteSubMap.absolutePath,
                        subMap.handle.absolutePath,
                        "could not get the handle's path in remote map");
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

                    const retrieved = map1.get("object");
                    const retrievedSubMap = await retrieved.subMapHandle.get();
                    assert.equal(retrievedSubMap, subMap, "could not get nested map 1");
                    const retrievedSubMap2 = await retrieved.nestedObj.subMap2Handle.get();
                    assert.equal(retrievedSubMap2, subMap2, "could not get nested map 2");
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
                    map1.forEach((value, key) => {
                        assert.ok(set.has(key), "the key should be present in the set");
                        assert.equal(key, value, "the value should match the set value");
                        assert.equal(map1.get(key), value, "could not get key");
                    });

                    // Verify the remote SharedMap
                    map2.forEach((value, key) => {
                        assert.ok(set.has(key), "the key in remote map should be present in the set");
                        assert.equal(key, value, "the value should match the set value in the remote map");
                        assert.equal(map2.get(key), value, "could not get key in the remote map");
                        set.delete(key);
                    });

                    assert.equal(set.size, 0);
                });
            });

            describe(".wait()", () => {
                it("Should resolve returned promise for existing keys", async () => {
                    map1.set("test", "resolved");
                    assert.ok(map1.has("test"));

                    containerRuntimeFactory.processAllMessages();

                    // Verify the local SharedMap
                    assert.equal(await map1.wait("test"), "resolved", "promise not resolved for existing key");

                    // Verify the remote SharedMap
                    assert.equal(
                        await map2.wait("test"), "resolved", "promise not resolved for existing key in remote map");
                });

                it("Should resolve returned promise once unavailable key is available", async () => {
                    assert.ok(!map1.has("test"));

                    const waitP = map1.wait("test");
                    const waitP2 = map2.wait("test");

                    map1.set("test", "resolved");

                    containerRuntimeFactory.processAllMessages();

                    // Verify the local SharedMap
                    assert.equal(await waitP, "resolved", "promise not resolved after key is available");

                    // Verify the remote SharedMap
                    assert.equal(await waitP2, "resolved", "promise not resolved after key is available in remote map");
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

            constructor() {
                this.containerRuntimeFactory = new MockContainerRuntimeFactory();
                this.map1 = createConnectedMap("map1", this.containerRuntimeFactory);
                this.map2 = createConnectedMap("map2", this.containerRuntimeFactory);
            }

            public get sharedObject() {
                // Return the remote SharedMap because we want to verify its summary data.
                return this.map2;
            }

            public get expectedOutboundRoutes() {
                return this._expectedRoutes;
            }

            public async addOutboundRoutes() {
                const newSubMapId = `subMap-${++this.subMapCount}`;
                const subMap = createLocalMap(newSubMapId);
                this.map1.set(newSubMapId, subMap.handle);
                this._expectedRoutes.push(subMap.handle.absolutePath);
                this.containerRuntimeFactory.processAllMessages();
            }

            public async deleteOutboundRoutes() {
                // Delete the last handle that was added.
                const subMapId = `subMap-${this.subMapCount}`;
                const deletedHandle = this.map1.get<IFluidHandle>(subMapId);
                assert(deletedHandle, "Route must be added before deleting");

                this.map1.delete(subMapId);
                // Remove deleted handle's route from expected routes.
                this._expectedRoutes = this._expectedRoutes.filter((route) => route !== deletedHandle.absolutePath);
                this.containerRuntimeFactory.processAllMessages();
            }

            public async addNestedHandles() {
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
