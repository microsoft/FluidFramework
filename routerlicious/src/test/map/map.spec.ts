import * as assert from "assert";
import * as api from "../../api";
import * as apiCore from "../../api-core";
import { IMap, IMapView } from "../../data-types";
import { copyMap, MapExtension, MapView } from "../../map";
import * as testUtils from "../testUtils";

describe("Routerlicious", () => {
    describe("Map", () => {
        let registry: apiCore.Registry;
        let testDocument: api.Document;
        let rootMap: IMap;
        let testMap: IMap;

        beforeEach(async () => {
            testUtils.registerAsTest("", "", "");
            registry = new apiCore.Registry();
            testDocument = await api.load("testDocument");
            rootMap = testDocument.getRoot();
            testMap = testDocument.createMap();
        });

        describe("CollaborativeMap", () => {
            it("Can create a document", () => {
                assert.ok(testDocument);
            });

            it("Can get the root map", () => {
                assert.ok(rootMap);
            });

            it("Can create a map", () => {
                assert.ok(testMap);
            });

            it("Can set and get map data", async () => {
                await testMap.set("testKey", "testValue");
                await testMap.set("testKey2", "testValue2");
                assert.equal(await testMap.get("testKey"), "testValue");
                assert.equal(await testMap.get("testKey2"), "testValue2");
                assert.deepEqual(await testMap.keys(), ["testKey", "testKey2"]);
            });
        });

        describe("copyMap", () => {
            it("Should copy all values in the MapView into the map", async () => {
                const from = await testMap.getView();
                from.set("lebron", "james");
                from.set("dwayne", "wade");
                from.set("kevin", "love");

                const to = new Map();
                copyMap(from, to);

                for (const key of from.keys()) {
                    assert.ok(to.has(key));
                    assert.equal(from.get(key), to.get(key));
                }
            });
        });

        describe("MapView", () => {
            let view: IMapView;

            beforeEach(async () => {
                view = await testMap.getView();
            });

            describe(".get()", () => {
                it("Should be able to retrieve a key", () => {
                    const value = "value";
                    view.set("test", value);
                    assert.equal(value, view.get("test"));
                });

                it("Should return undefined when a key does not exist in the map", () => {
                    assert.equal(undefined, view.get("missing"));
                });
            });

            describe(".has()", () => {
                it("Should return false when a key is not in the map", () => {
                    assert.equal(false, view.has("notInSet"));
                });

                it("Should return true when a key is in the map", () => {
                    view.set("inSet", "value");
                    assert.equal(true, view.has("inSet"));
                });
            });

            describe(".set()", () => {
                it("Should set a key to a value", () => {
                    const value = "value";
                    view.set("test", value);
                    assert.equal(true, view.has("test"));
                    assert.equal(value, view.get("test"));
                });

                it("Should be able to set a collaborative object as a key", () => {
                    const subMap = testDocument.createMap();
                    view.set("test", subMap);
                    assert.equal(view.get("test"), subMap);
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
                        view.set(value, value);
                    }

                    view.forEach((value, key) => {
                        assert.ok(set.has(key));
                        assert.equal(key, value);
                        assert.equal(view.get(key), value);
                        set.delete(key);
                    });

                    assert.equal(set.size, 0);
                });
            });

            describe(".serialize", () => {
                it("Should serialize the map as a JSON object", () => {
                    view.set("first", "second");
                    view.set("third", "fourth");
                    view.set("fifth", "sixth");
                    const subMap = testDocument.createMap();
                    view.set("object", subMap);

                    const concrete = view as MapView;
                    const serialized = concrete.serialize();
                    const parsed = JSON.parse(serialized);

                    view.forEach((value, key) => {
                        const type = parsed[key].type;
                        if (type === "Plain") {
                            assert.equal(parsed[key].type, "Plain");
                            assert.equal(parsed[key].value, value);
                        } else {
                            assert.equal(parsed[key].type, "Collaborative");
                            assert.equal(parsed[key].value.id, subMap.id);
                            assert.equal(parsed[key].value.type, MapExtension.Type);
                        }
                    });
                });
            });

            describe(".wait()", () => {
                it("Should resolve returned promise for existing keys", async () => {
                    view.set("test", "resolved");
                    assert.ok(view.has("test"));
                    await view.wait("test");
                });

                it("Should resolve returned promise once unavailable key is available", async () => {
                    assert.ok(!view.has("test"));

                    const waitP = view.wait("test");
                    view.set("test", "resolved");

                    await waitP;
                });
            });
        });
    });
});
