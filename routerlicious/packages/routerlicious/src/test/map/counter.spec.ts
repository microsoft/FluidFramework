import * as api from "@prague/client-api";
import * as map from "@prague/map";
import * as assert from "assert";
import { generateToken } from "../../utils";
import * as testUtils from "../testUtils";

describe("Routerlicious", () => {
    describe("Map", () => {
        describe("Counter", () => {
            let testDocument: api.Document;
            let testMap: map.IMap;
            let testCounter: map.Counter;

            beforeEach(async () => {
                const tenantId = "test";
                const documentId = "testDocument";
                const secret = "test";

                testUtils.registerAsTest("", "", "");
                const token = generateToken(tenantId, documentId, secret);
                testDocument = await api.load(documentId, { token });
                testMap = testDocument.createMap();
                testCounter = testMap.set("defaultCounter", undefined, map.CounterValueType.Name);
            });

            describe(".constructor", () => {
                it("Should be able to create a counter with default value", async () => {
                    assert.ok(testCounter);
                    assert.equal(testCounter.value, 0);
                });

                it("Should be able to create a counter with predefined value", async () => {
                    const counterWithValue = testMap.set("defaultCounter", 50, map.CounterValueType.Name);
                    assert.ok(counterWithValue);
                    assert.equal(counterWithValue.value, 50);
                });
            });

            describe(".increment", () => {
                it("Should be able to increment a counter with positive and negative values", async () => {
                    testCounter.increment(20);
                    assert.equal(testCounter.value, 20);
                    testCounter.increment(-40);
                    assert.equal(testCounter.value, -20);
                });
            });

            describe(".increment", () => {
                it("Should be able to register an onIncrement callback", () => {
                    const callback = (value: number) => {
                        return;
                    };

                    testCounter.onIncrement = callback;
                    assert.equal(testCounter.onIncrement, callback);
                });

                it("Should fire onIncrementAt callback after increment", () => {
                    let fired = false;

                    testCounter.onIncrement = (value: number) => {
                        fired = true;
                        assert.equal(value, 10);
                    };

                    testCounter.increment(10);
                    assert.ok(fired);
                });
            });
        });
    });
});
