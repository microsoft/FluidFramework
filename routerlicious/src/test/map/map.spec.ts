import * as assert from "assert";
import * as api from "../../api";
import * as testUtils from "../testUtils";

describe("Routerlicious", () => {
    describe("Api", () => {
        describe("map", () => {
            let registry: api.Registry;
            let testDocument: api.Document;
            let rootMap: api.IMap;
            let testMap: api.IMap;

            beforeEach(async () => {
                testUtils.registerAsTest("", "", "");
                registry = new api.Registry();
                testDocument = await api.load("testDocument");
                rootMap = testDocument.getRoot();
                testMap = testDocument.createMap();
            });

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
    });
});
