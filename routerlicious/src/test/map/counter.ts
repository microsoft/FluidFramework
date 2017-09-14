import * as assert from "assert";
import * as api from "../../api";
import * as testUtils from "../utils";

describe("Routerlicious", () => {
    describe("Api", () => {
        describe("counter", () => {
            let registry: api.Registry;
            let testDocument: api.Document;
            let testMap: api.IMap;
            let counterWithDefault: api.ICounter;
            let counterWithValue: api.ICounter;
            let counterWithValueAndLimit: api.ICounter;

            beforeEach(async () => {
                testUtils.registerAsTest("", "", "");
                registry = new api.Registry();
                testDocument = await api.load("testDocument");
                testMap = testDocument.createMap();
                counterWithDefault = await testMap.createCounter("defaultCounter");
                counterWithValue = await testMap.createCounter("valueCounter", 50);
                counterWithValueAndLimit = await testMap.createCounter("valueCounterWithLimit", 50, 10, 100);
            });

            it("Can create a counter with default value", async () => {
                assert.ok(counterWithDefault);
                assert.equal(await counterWithDefault.get(), 0);
            });

            it("Can create a counter with predefined value", async () => {
                assert.ok(counterWithValue);
                assert.equal(await counterWithValue.get(), 50);
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

            it("Returns rejected promise on out of range increment/decrement", async () => {
                return counterWithValueAndLimit.increment(60).then(() => {
                    throw new Error(`Out of range increment should have thrown an error`);
                }, (error: string) => {
                    assert.equal(error, "Error: Counter range exceeded!");
                });
            });

            it("Can incrrement and decrement a counter", async () => {
                await counterWithValue.increment(20);
                assert.equal(await counterWithValue.get(), 70);
                await counterWithValue.increment(-40);
                assert.equal(await counterWithValue.get(), 30);
            });

        });
    });
});
