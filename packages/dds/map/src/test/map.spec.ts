/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { IBlob } from "@fluidframework/protocol-definitions";
import {
    MockFluidDataStoreRuntime,
    MockContainerRuntimeFactory,
    MockSharedObjectServices,
    MockStorage,
} from "@fluidframework/test-runtime-utils";
import { MapFactory, SharedMap } from "../map";

describe("Map", () => {
    let map: SharedMap;
    let factory: MapFactory;
    let componentRuntime: MockFluidDataStoreRuntime;

    beforeEach(async () => {
        componentRuntime = new MockFluidDataStoreRuntime();
        factory = new MapFactory();
        map = new SharedMap("testMap", componentRuntime, MapFactory.Attributes);
    });

    describe("SharedMap in local state", () => {
        beforeEach(() => {
            componentRuntime.local = true;
        });

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
                map.set(undefined, "one");
            }, "Should throw for key of undefined");
            assert.throws(() => {
                map.set(null, "two");
            }, "Should throw for key of null");
        });

        describe(".serialize", () => {
            it("Should serialize the map as a JSON object", () => {
                map.set("first", "second");
                map.set("third", "fourth");
                map.set("fifth", "sixth");
                const subMap = factory.create(componentRuntime, "subMap");
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
                const subMap = factory.create(componentRuntime, "subMap");
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
                const subMap = factory.create(componentRuntime, "subMap");
                const subMap2 = factory.create(componentRuntime, "subMap2");
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
                const loadedMap = await factory.load(
                    componentRuntime, "mapId", services, "branchId", factory.attributes,
                );
                assert(loadedMap.get("key") === "value");
            });

            it("new serialization format for small maps", async () => {
                map.set("key", "value");

                const tree = map.snapshot();
                assert(tree.entries.length === 1);
                const content = JSON.stringify({
                    blobs: [],
                    content: {
                        key: {
                            type: "Plain",
                            value: "value",
                        },
                    },
                });
                assert(tree.entries.length === 1);
                assert((tree.entries[0].value as IBlob).contents === content);

                const services = new MockSharedObjectServices({ header: content });
                const loadedMap = await factory.load(
                    componentRuntime, "mapId", services, "branchId", factory.attributes,
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

                const tree = map.snapshot();
                assert(tree.entries.length === 2);
                const content1 = JSON.stringify({
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
                const content2 = JSON.stringify({
                    longValue: {
                        type: "Plain",
                        value: longString,
                    },
                });

                assert(tree.entries.length === 2);
                assert(tree.entries[1].path === "header");
                assert((tree.entries[1].value as IBlob).contents === content1);

                assert(tree.entries[0].path === "blob0");
                assert((tree.entries[0].value as IBlob).contents === content2);

                const services = new MockSharedObjectServices({
                    header: content1,
                    blob0: content2,
                });
                const loadedMap = await factory.load(
                    componentRuntime, "mapId", services, "branchId", factory.attributes,
                );
                assert(loadedMap.get("key") === "value");
                assert(loadedMap.get("longValue") === longString);
                assert(loadedMap.get("zzz") === "the end");
            });
        });
    });

    describe("SharedMap op processing in local state", () => {
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
            // Set the component runtime to local.
            componentRuntime.local = true;

            // Set a key in local state.
            const key = "testKey";
            const value = "testValue";
            map.set(key, value);

            // Load a new SharedMap in connected state from the snapshot of the first one.
            const containerRuntimeFactory = new MockContainerRuntimeFactory();
            const componentRuntime2 = new MockFluidDataStoreRuntime();
            const containerRuntime2 = containerRuntimeFactory.createContainerRuntime(componentRuntime2);
            const services2 = MockSharedObjectServices.createFromTree(map.snapshot());
            services2.deltaConnection = containerRuntime2.createDeltaConnection();

            const map2 = new SharedMap("testMap2", componentRuntime2, MapFactory.Attributes);
            await map2.load("branchId", services2);

            // Now connect the first SharedMap
            componentRuntime.local = false;
            const containerRuntime1 = containerRuntimeFactory.createContainerRuntime(componentRuntime);
            const services1 = {
                deltaConnection: containerRuntime1.createDeltaConnection(),
                objectStorage: new MockStorage(undefined),
            };
            map.connect(services1);

            // Verify that both the maps have the key.
            assert.equal(map.get(key), value, "The first map does not have the key");
            assert.equal(map2.get(key), value, "The second map does not have the key");

            // Set a new value for the same key in the second SharedMap.
            const newValue = "newvalue";
            map2.set(key, newValue);

            // Process the message.
            containerRuntimeFactory.processAllMessages();

            // Verify that both the maps have the new value.
            assert.equal(map.get(key), newValue, "The first map did not get the new value");
            assert.equal(map2.get(key), newValue, "The second map did not get the new value");
        });
    });

    describe("SharedMap in connected state with a remote SharedMap", () => {
        let containerRuntimeFactory: MockContainerRuntimeFactory;
        let map2: SharedMap;

        beforeEach(async () => {
            // Connect the first map
            containerRuntimeFactory = new MockContainerRuntimeFactory();
            const containerRuntime = containerRuntimeFactory.createContainerRuntime(componentRuntime);
            const services = {
                deltaConnection: containerRuntime.createDeltaConnection(),
                objectStorage: new MockStorage(undefined),
            };
            map.connect(services);

            // Create and connect a second map
            const componentRuntime2 = new MockFluidDataStoreRuntime();
            map2 = new SharedMap("testMap2", componentRuntime2, MapFactory.Attributes);
            const containerRuntime2 = containerRuntimeFactory.createContainerRuntime(componentRuntime2);
            const services2 = {
                deltaConnection: containerRuntime2.createDeltaConnection(),
                objectStorage: new MockStorage(undefined),
            };
            map2.connect(services2);
        });

        describe(".get()", () => {
            it("Should be able to retrieve a key", () => {
                const value = "value";
                map.set("test", value);

                containerRuntimeFactory.processAllMessages();

                // Verify the local SharedMap
                assert.equal(map.get("test"), value, "could not retrieve key");

                // Verify the remote SharedMap
                assert.equal(map2.get("test"), value, "could not retrieve key from the remote map");
            });
        });

        describe(".has()", () => {
            it("Should return false when a key is not in the map", () => {
                assert.equal(map.has("notInSet"), false, "has() did not return false for missing key");
            });

            it("Should return true when a key is in the map", () => {
                map.set("inSet", "value");

                containerRuntimeFactory.processAllMessages();

                // Verify the local SharedMap
                assert.equal(map.has("inSet"), true, "could not find the key");

                // Verify the remote SharedMap
                assert.equal(map2.has("inSet"), true, "could not find the key in the remote map");
            });
        });

        describe(".set()", () => {
            it("Should set a key to a value", () => {
                const value = "value";
                map.set("test", value);

                containerRuntimeFactory.processAllMessages();

                // Verify the local SharedMap
                assert.equal(map.has("test"), true, "could not find the set key");
                assert.equal(map.get("test"), value, "could not get the set key");

                // Verify the remote SharedMap
                assert.equal(map2.has("test"), true, "could not find the set key in remote map");
                assert.equal(map2.get("test"), value, "could note get the set key from remote map");
            });

            it("Should be able to set a shared object handle as a key", () => {
                const subMap = factory.create(componentRuntime, "subMap");
                map.set("test", subMap.handle);

                containerRuntimeFactory.processAllMessages();

                // Verify the local SharedMap
                const localSubMap = map.get<IFluidHandle>("test");
                assert.equal(localSubMap.absolutePath, subMap.handle.absolutePath, "could not get the handle's path");

                // Verify the remote SharedMap
                const remoteSubMap = map2.get<IFluidHandle>("test");
                assert.equal(
                    remoteSubMap.absolutePath,
                    subMap.handle.absolutePath,
                    "could not get the handle's path in remote map");
            });

            it("Should be able to set and retrieve a plain object with nested handles", async () => {
                const subMap = factory.create(componentRuntime, "subMap");
                const subMap2 = factory.create(componentRuntime, "subMap2");
                const containingObject = {
                    subMapHandle: subMap.handle,
                    nestedObj: {
                        subMap2Handle: subMap2.handle,
                    },
                };
                map.set("object", containingObject);

                containerRuntimeFactory.processAllMessages();

                const retrieved = map.get("object");
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
                    map.set(value, value);
                }

                containerRuntimeFactory.processAllMessages();

                // Verify the local SharedMap
                map.forEach((value, key) => {
                    assert.ok(set.has(key), "the key should be present in the set");
                    assert.equal(key, value, "the value should match the set value");
                    assert.equal(map.get(key), value, "could not get key");
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
                map.set("test", "resolved");
                assert.ok(map.has("test"));

                containerRuntimeFactory.processAllMessages();

                // Verify the local SharedMap
                assert.equal(await map.wait("test"), "resolved", "promise not resolved for existing key");

                // Verify the remote SharedMap
                assert.equal(
                    await map2.wait("test"), "resolved", "promise not resolved for existing key in remote map");
            });

            it("Should resolve returned promise once unavailable key is available", async () => {
                assert.ok(!map.has("test"));

                const waitP = map.wait("test");
                const waitP2 = map2.wait("test");

                map.set("test", "resolved");

                containerRuntimeFactory.processAllMessages();

                // Verify the local SharedMap
                assert.equal(await waitP, "resolved", "promise not resolved after key is available");

                // Verify the remote SharedMap
                assert.equal(await waitP2, "resolved", "promise not resolved after key is available in remote map");
            });
        });
    });
});
