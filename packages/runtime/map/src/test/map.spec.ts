/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { IComponentHandle } from "@fluidframework/component-core-interfaces";
import { IBlob } from "@fluidframework/protocol-definitions";
import { MockRuntime, MockSharedObjectServices } from "@fluidframework/test-runtime-utils";

import * as map from "../";
import { SharedMap } from "../map";

describe("Routerlicious", () => {
    describe("Map", () => {
        let rootMap: map.ISharedMap;
        let testMap: map.ISharedMap;
        let factory: map.MapFactory;
        let runtime: MockRuntime;

        beforeEach(async () => {
            runtime = new MockRuntime();
            factory = new map.MapFactory();
            rootMap = factory.create(runtime, "root");
            testMap = factory.create(runtime, "test");
        });

        describe("SharedMap", () => {
            it("Can get the root map", () => {
                assert.ok(rootMap);
            });

            it("Can create a map", () => {
                assert.ok(testMap);
            });

            it("Can set and get map data", async () => {
                testMap.set("testKey", "testValue");
                testMap.set("testKey2", "testValue2");
                assert.equal(testMap.get("testKey"), "testValue");
                assert.equal(testMap.get("testKey2"), "testValue2");
            });
        });

        describe("eventsMap", () => {
            it("listeners should listen to fired map events", async () => {
                const dummyMap = testMap;
                let called1: boolean = false;
                let called2: boolean = false;
                dummyMap.on("op", (agr1, arg2, arg3) => called1 = true);
                dummyMap.on("valueChanged", (agr1, arg2, arg3, arg4) => called2 = true);
                dummyMap.set("marco", "polo");
                assert.equal(called1, false, "op");
                assert.equal(called2, true, "valueChanged");
            });
        });

        describe("MapView", () => {
            let sharedMap: map.ISharedMap;

            beforeEach(async () => {
                sharedMap = testMap;
            });

            describe(".get()", () => {
                it("Should be able to retrieve a key", () => {
                    const value = "value";
                    sharedMap.set("test", value);
                    assert.equal(value, sharedMap.get("test"));
                });

                it("Should return undefined when a key does not exist in the map", () => {
                    assert.equal(undefined, sharedMap.get("missing"));
                });
            });

            describe(".has()", () => {
                it("Should return false when a key is not in the map", () => {
                    assert.equal(false, sharedMap.has("notInSet"));
                });

                it("Should return true when a key is in the map", () => {
                    sharedMap.set("inSet", "value");
                    assert.equal(true, sharedMap.has("inSet"));
                });
            });

            describe(".set()", () => {
                it("Should set a key to a value", () => {
                    const value = "value";
                    sharedMap.set("test", value);
                    assert.equal(true, sharedMap.has("test"));
                    assert.equal(value, sharedMap.get("test"));
                });

                it("Should be able to set a shared object handle as a key", () => {
                    const subMap = factory.create(runtime, "subMap");
                    sharedMap.set("test", subMap.handle);
                    assert.equal(sharedMap.get<IComponentHandle>("test").path, subMap.id);
                });

                it("Should be able to set and retrieve a plain object with nested handles", async () => {
                    const subMap = factory.create(runtime, "subMap");
                    const subMap2 = factory.create(runtime, "subMap2");
                    const containingObject = {
                        subMapHandle: subMap.handle,
                        nestedObj: {
                            subMap2Handle: subMap2.handle,
                        },
                    };
                    sharedMap.set("object", containingObject);

                    const retrieved = sharedMap.get("object");
                    assert.equal(await retrieved.subMapHandle.get(), subMap);
                    assert.equal(await retrieved.nestedObj.subMap2Handle.get(), subMap2);
                });

                it("Should reject undefined and null key sets", () => {
                    assert.throws(() => {
                        sharedMap.set(undefined, "one");
                    }, "Should throw for key of undefined");
                    assert.throws(() => {
                        sharedMap.set(null, "two");
                    }, "Should throw for key of null");
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
                        sharedMap.set(value, value);
                    }

                    sharedMap.forEach((value, key) => {
                        assert.ok(set.has(key));
                        assert.equal(key, value);
                        assert.equal(sharedMap.get(key), value);
                        set.delete(key);
                    });

                    assert.equal(set.size, 0);
                });
            });

            describe(".serialize", () => {
                it("Should serialize the map as a JSON object", () => {
                    sharedMap.set("first", "second");
                    sharedMap.set("third", "fourth");
                    sharedMap.set("fifth", "sixth");
                    const subMap = factory.create(runtime, "subMap");
                    sharedMap.set("object", subMap.handle);

                    const parsed = (sharedMap as SharedMap).getSerializableStorage();

                    sharedMap.forEach((value, key) => {
                        if (!value.IComponentHandle) {
                            assert.equal(parsed[key].type, "Plain");
                            assert.equal(parsed[key].value, value);
                        } else {
                            assert.equal(parsed[key].type, "Plain");
                            assert.equal(parsed[key].value.url, subMap.id);
                        }
                    });
                });

                it("Should serialize an undefined value", () => {
                    sharedMap.set("first", "second");
                    sharedMap.set("third", "fourth");
                    sharedMap.set("fifth", undefined);
                    assert.ok(sharedMap.has("fifth"));
                    const subMap = factory.create(runtime, "subMap");
                    sharedMap.set("object", subMap.handle);

                    const parsed = (sharedMap as SharedMap).getSerializableStorage();

                    sharedMap.forEach((value, key) => {
                        if (!value || !value.IComponentHandle) {
                            assert.equal(parsed[key].type, "Plain");
                            assert.equal(parsed[key].value, value);
                        } else {
                            assert.equal(parsed[key].type, "Plain");
                            assert.equal(parsed[key].value.url, subMap.id);
                        }
                    });
                });

                it("Should serialize an object with nested handles", async () => {
                    const subMap = factory.create(runtime, "subMap");
                    const subMap2 = factory.create(runtime, "subMap2");
                    const containingObject = {
                        subMapHandle: subMap.handle,
                        nestedObj: {
                            subMap2Handle: subMap2.handle,
                        },
                    };
                    sharedMap.set("object", containingObject);

                    const serialized = JSON.stringify((sharedMap as any).getSerializableStorage());
                    // eslint-disable-next-line max-len
                    assert.equal(serialized, `{"object":{"type":"Plain","value":{"subMapHandle":{"type":"__fluid_handle__","url":"subMap"},"nestedObj":{"subMap2Handle":{"type":"__fluid_handle__","url":"subMap2"}}}}}`);
                });

                it("can load old serialization format", async () => {
                    sharedMap.set("key", "value");

                    const content = JSON.stringify({
                        key: {
                            type: "Plain",
                            value: "value",
                        },
                    });

                    const services = new MockSharedObjectServices({ header: content });
                    const map2 = await factory.load(runtime, "mapId", services, "branchId", factory.attributes);
                    assert(map2.get("key") === "value");
                });

                it("new serialization format for small maps", async () => {
                    sharedMap.set("key", "value");

                    const tree = sharedMap.snapshot();
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
                    const map2 = await factory.load(runtime, "mapId", services, "branchId", factory.attributes);
                    assert(map2.get("key") === "value");
                });

                it("new serialization format for big maps", async () => {
                    sharedMap.set("key", "value");

                    // 40K char string
                    let longString = "01234567890";
                    for (let i = 0; i < 12; i++) {
                        longString = longString + longString;
                    }
                    sharedMap.set("longValue", longString);
                    sharedMap.set("zzz", "the end");

                    const tree = sharedMap.snapshot();
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
                    const map2 = await factory.load(runtime, "mapId", services, "branchId", factory.attributes);
                    assert(map2.get("key") === "value");
                    assert(map2.get("longValue") === longString);
                    assert(map2.get("zzz") === "the end");
                });
            });

            describe(".wait()", () => {
                it("Should resolve returned promise for existing keys", async () => {
                    sharedMap.set("test", "resolved");
                    assert.ok(sharedMap.has("test"));
                    await sharedMap.wait("test");
                });

                it("Should resolve returned promise once unavailable key is available", async () => {
                    assert.ok(!sharedMap.has("test"));

                    const waitP = sharedMap.wait("test");
                    sharedMap.set("test", "resolved");

                    await waitP;
                });
            });
        });
    });
});
