import * as assert from "assert";
import * as api from "../../api";
import { ICounter, IMap } from "../../data-types";
import * as testUtils from "../testUtils";

describe("Routerlicious", () => {
    describe("Map", () => {
        describe("counter", () => {
            let testDocument: api.Document;
            let testMap: IMap;
            let counterWithDefault: ICounter;
            let counterWithValue: ICounter;
            let counterWithValueAndLimit: ICounter;

            beforeEach(async () => {
                testUtils.registerAsTest("", "", "");
                testDocument = await api.load("testDocument");
                testMap = testDocument.createMap();
                counterWithDefault = testMap.createCounter("defaultCounter");
                counterWithValue = testMap.createCounter("valueCounter", 50);
                counterWithValueAndLimit = testMap.createCounter("valueCounterWithLimit", 50, 10, 100);
            });

            it("Can create a counter with default value", async () => {
                assert.ok(counterWithDefault);
                assert.equal(counterWithDefault.get(), 0);
            });

            it("Can create a counter with predefined value", async () => {
                assert.ok(counterWithValue);
                assert.equal(counterWithValue.get(), 50);
            });

            it("Does not throw error on valid counter range", () => {
                assert.doesNotThrow(() => {
                    testMap.createCounter("validCounter", 100, 10, 110);
                });
            });

            it("Can throw error on invalid counter range", () => {
                assert.throws(() => {
                    throw testMap.createCounter("invalidCounter", 100, 10, 90);
                }, Error);
            });

            it("Throws an error on out of range increment/decrement", () => {
                assert.throws(() => {
                    throw counterWithValueAndLimit.increment(60);
                }, Error, "Error: Counter range exceeded!");
            });

            it("Can incrrement and decrement a counter", async () => {
                counterWithValue.increment(20);
                assert.equal(counterWithValue.get(), 70);
                counterWithValue.increment(-40);
                assert.equal(counterWithValue.get(), 30);
            });

        });
    });
});
