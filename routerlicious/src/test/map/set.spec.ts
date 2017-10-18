import * as assert from "assert";
import * as api from "../../api";
import * as testUtils from "../testUtils";

describe("Routerlicious", () => {
    describe("Map", () => {
        describe("set", () => {
            let registry: api.Registry;
            let testDocument: api.Document;
            let testMap: api.IMap;
            let emptySet: api.ISet<number>;
            let populatedSet: api.ISet<number>;

            beforeEach(async () => {
                testUtils.registerAsTest("", "", "");
                registry = new api.Registry();
                testDocument = await api.load("testDocument");
                testMap = testDocument.createMap();
                emptySet = await testMap.createSet("emptySet") as api.ISet<number>;
                populatedSet = await testMap.createSet("populatedSet", [1, 2, 4, 6]);
            });

            it("Can create an empty set and populate it", async () => {
                assert.ok(emptySet);
                assert.deepEqual(await emptySet.entries(), []);
                await emptySet.add(10);
                await emptySet.add(20);
                await emptySet.add(30);
                await emptySet.delete(20);
                assert.deepEqual(await emptySet.entries(), [10, 30]);
            });

            it("Can create a set with values and populate it", async () => {
                assert.ok(populatedSet);
                assert.deepEqual(await populatedSet.entries(), [1, 2, 4, 6]);
                await populatedSet.add(3);
                await populatedSet.add(5);
                assert.deepEqual(await populatedSet.entries(), [1, 2, 4, 6, 3, 5]);
                await populatedSet.delete(2);
                await populatedSet.delete(4);
                assert.deepEqual(await populatedSet.entries(), [1, 6, 3, 5]);
            });

        });
    });
});
