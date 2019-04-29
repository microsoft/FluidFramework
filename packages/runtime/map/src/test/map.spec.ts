import * as assert from "assert";
import * as map from "..";
import { SharedMap } from "../map";

describe("Routerlicious", () => {
    describe("Map", () => {
        let rootMap: map.ISharedMap;
        let testMap: map.ISharedMap;
        let extension: map.MapExtension;

        beforeEach(async () => {
            extension = new map.MapExtension();
            rootMap = extension.create(null, "root");
            testMap = extension.create(null, "test");
        });

        describe("SharedMap", () => {
            it("Can get the root map", () => {
                assert.ok(rootMap);
            });

            it("Can create a map", () => {
                assert.ok(testMap);
            });

            it("Can set and get map data", async () => {
                // tslint:disable:no-backbone-get-set-outside-model
                /* tslint:disable:no-unsafe-any */
                testMap.set("testKey", "testValue");
                testMap.set("testKey2", "testValue2");
                assert.equal(testMap.get("testKey"), "testValue");
                assert.equal(testMap.get("testKey2"), "testValue2");
            });
        });

        describe("copyMap", () => {
            it("Should copy all values in the MapView into the map", async () => {
                const from = testMap;
                from.set("lebron", "james");
                from.set("dwayne", "wade");
                from.set("kevin", "love");

                const to = new Map();
                map.copyMap(from, to);

                for (const key of from.keys()) {
                    assert.ok(to.has(key));
                    assert.equal(from.get(key), to.get(key));
                }
            });
        });

        describe("eventsMap", () => {
            it("listeners should listen to fired map events", async () => {
                const dummyMap = testMap;
                let called: boolean = false;
                dummyMap.on("op", (agr1, arg2, arg3) => called = true);
                dummyMap.on("valueChanged", (agr1, arg2, arg3, arg4) => called = true);
                dummyMap.set("dwyane", "johnson");
                assert.equal(called, true);
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

                it("Should be able to set a shared object as a key", () => {
                    const subMap = extension.create(null, "subMap");
                    sharedMap.set("test", subMap);
                    assert.equal(sharedMap.get("test"), subMap);
                });
            });

            describe(".forEach()", () => {
                it("Should iterate over all keys in the map", () => {
                    // We use a set to mark the values we want to insert. When we iterate we will remove from the set
                    // and then check it's empty at the end
                    const set = new Set();
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
                    const subMap = extension.create(null, "subMap");
                    sharedMap.set("object", subMap);

                    const concrete = (sharedMap as SharedMap).internalView();
                    const serialized = concrete.serialize((key, value, type) => value);
                    const parsed = JSON.parse(serialized);

                    sharedMap.forEach((value, key) => {
                        const type = parsed[key].type;
                        if (type === "Plain") {
                            assert.equal(parsed[key].type, "Plain");
                            assert.equal(parsed[key].value, value);
                        } else {
                            assert.equal(parsed[key].type, "Shared");
                            assert.equal(parsed[key].value, subMap.id);
                        }
                    });
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
