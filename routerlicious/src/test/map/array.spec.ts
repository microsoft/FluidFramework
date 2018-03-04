import * as assert from "assert";
import * as api from "../../api";
import { DistributedArray, DistributedArrayValueType } from "../../map";
import * as testUtils from "../testUtils";

describe("Routerlicious", () => {
    describe("Map", () => {
        describe("Array", () => {
            let testDocument: api.Document;
            let testArray: DistributedArray<number>;

            beforeEach(async () => {
                testUtils.registerAsTest("", "", "");
                testDocument = await api.load("testDocument");
                const map = testDocument.createMap();
                testArray = map.set("array", undefined, DistributedArrayValueType.Name) as DistributedArray<number>;
            });

            describe(".insertAt()", () => {
                it("Should be able to insert an element into an empty array", () => {
                    testArray.insertAt(0, 0);
                    assert.equal(testArray.value[0], 0);
                });

                it("Should be able to insert multiple elements into an array", () => {
                    for (let i = 0; i < 10; i++) {
                        testArray.insertAt(i, i);
                    }

                    for (let i = 0; i < 10; i++) {
                        assert.equal(testArray.value[i], i);
                    }
                });

                it("Should be able to insert an element in a non-sequential index", () => {
                    testArray.insertAt(0, 0);
                    assert.equal(testArray.value[0], 0);
                    testArray.insertAt(10, 10);
                    assert.equal(testArray.value[10], 10);
                    assert.equal(testArray.value[5], undefined);
                });

                it("Should be able to overwrite an element", () => {
                    testArray.insertAt(0, 0);
                    assert.equal(testArray.value[0], 0);
                    testArray.insertAt(0, 5);
                    assert.equal(testArray.value[0], 5);
                });
            });

            describe(".onInsertAt", () => {
                it("Should be able to register an onInsertAt callback", () => {
                    const callback = (index: number, value: number) => {
                        return;
                    };

                    testArray.onInsertAt = callback;
                    assert.equal(testArray.onInsertAt, callback);
                });

                it("Should fire onInsertAt callback after insert", () => {
                    let fired = false;

                    testArray.onInsertAt = (index: number, value: number) => {
                        fired = true;
                        assert.equal(index, 0);
                        assert.equal(value, 0);
                    };
                    testArray.insertAt(0, 0);
                    assert.ok(fired);
                });
            });
        });
    });
});
