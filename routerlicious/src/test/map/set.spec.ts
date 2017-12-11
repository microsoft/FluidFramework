import * as assert from "assert";
import * as api from "../../api";
import { IMap, ISet } from "../../data-types";
import * as testUtils from "../testUtils";

describe("Routerlicious", () => {
    describe("Map", () => {
        describe("set", () => {
            let testDocument: api.Document;
            let testMap: IMap;
            let emptySet: ISet<number>;
            let populatedSet: ISet<number>;

            beforeEach(async () => {
                testUtils.registerAsTest("", "", "");
                testDocument = await api.load("testDocument");
                testMap = testDocument.createMap();
                emptySet = testMap.createSet("emptySet") as ISet<number>;
                populatedSet = testMap.createSet("populatedSet", [1, 2, 4, 6]);
            });

            it("Can create an empty set and populate it", () => {
                assert.ok(emptySet);
                assert.deepEqual(emptySet.entries(), []);
                emptySet.add(10);
                emptySet.add(20);
                emptySet.add(30);
                emptySet.delete(20);
                assert.deepEqual(emptySet.entries(), [10, 30]);
                assert.deepEqual(Array.from(emptySet.getInternalSet().values()), [10, 30]);
            });

            it("Can create a set with values and populate it", () => {
                assert.ok(populatedSet);
                assert.deepEqual(populatedSet.entries(), [1, 2, 4, 6]);
                populatedSet.add(3);
                populatedSet.add(5);
                assert.deepEqual(populatedSet.entries(), [1, 2, 4, 6, 3, 5]);
                populatedSet.delete(2);
                populatedSet.delete(4);
                assert.deepEqual(populatedSet.entries(), [1, 6, 3, 5]);
                assert.deepEqual(Array.from(populatedSet.getInternalSet().values()), [1, 6, 3, 5]);
            });

        });
    });
});
