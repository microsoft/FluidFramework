import * as assert from "assert";
import * as api from "../../api";
import { IMap } from "../../data-types";
import { Counter, CounterValueType } from "../../map";
import * as testUtils from "../testUtils";

describe("Routerlicious", () => {
    describe("Map", () => {
        describe("counter", () => {
            let testDocument: api.Document;
            let testMap: IMap;
            let counterWithDefault: Counter;
            let counterWithValue: Counter;
            let counterWithValueAndLimit: Counter;

            beforeEach(async () => {
                testUtils.registerAsTest("", "", "");
                testDocument = await api.load("testDocument");
                testMap = testDocument.createMap();
                counterWithDefault = testMap.set("defaultCounter", undefined, CounterValueType.Name);
                counterWithValue = testMap.set(
                    "valueCounter",
                    {
                        value: 50,
                    },
                    CounterValueType.Name);
                counterWithValueAndLimit = testMap.set(
                    "valueCounterWithLimit",
                    {
                        max: 100,
                        min: 10,
                        value: 50,
                    },
                    CounterValueType.Name);
            });

            it("Can create a counter with default value", async () => {
                assert.ok(counterWithDefault);
                assert.equal(counterWithDefault.value, 0);
            });

            it("Can create a counter with predefined value", async () => {
                assert.ok(counterWithValue);
                assert.equal(counterWithValue.value, 50);
            });

            it("Does not throw error on valid counter range", () => {
                assert.doesNotThrow(() => {
                    testMap.set(
                        "validCounter",
                        {
                            max: 110,
                            min: 10,
                            value: 100,
                        },
                        CounterValueType.Name);
                });
            });

            it("caps at max", () => {
                counterWithValueAndLimit.increment(60);
                assert.equal(counterWithValueAndLimit.value, counterWithValueAndLimit.max);
            });

            it("Can incrrement and decrement a counter", async () => {
                counterWithValue.increment(20);
                assert.equal(counterWithValue.value, 70);
                counterWithValue.increment(-40);
                assert.equal(counterWithValue.value, 30);
            });

        });
    });
});
