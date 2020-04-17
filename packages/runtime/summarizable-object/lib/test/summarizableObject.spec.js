/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import * as assert from "assert";
import { MockRuntime, MockSharedObjectServices } from "@microsoft/fluid-test-runtime-utils";
import { SummarizableObjectFactory } from "../summarizableObjectFactory";
describe("SummarizableObject", () => {
    let runtime;
    let factory;
    let summarizableObject;
    beforeEach(async () => {
        runtime = new MockRuntime();
        factory = new SummarizableObjectFactory();
        summarizableObject = factory.create(runtime, "root");
    });
    describe("Api", () => {
        it("can create a summarizable object", () => {
            assert.ok(summarizableObject);
        });
        it("can set and get summarizable object data", async () => {
            const key1 = "testKey1";
            const value1 = "testValue1";
            summarizableObject.set(key1, value1);
            assert.equal(summarizableObject.get(key1), value1, "The retrieved value must match the set value");
            const key2 = "testKey2";
            const value2 = { value: "testValue2" };
            summarizableObject.set(key2, value2);
            assert.deepEqual(summarizableObject.get(key2), value2, "The retrieved value must match the set value");
        });
    });
    describe("Snapshot", () => {
        it("can generate snapshot and load from snapshot of the summarizable object data", async () => {
            const key1 = "testKey1";
            const value1 = "testValue1";
            summarizableObject.set(key1, value1);
            const key2 = "testKey2";
            const value2 = "testValue2";
            summarizableObject.set(key2, value2);
            const key3 = "testKey3";
            const value3 = { value: "testValue3" };
            summarizableObject.set(key3, value3);
            const tree = summarizableObject.snapshot();
            const contents = JSON.stringify({
                testKey1: value1,
                testKey2: value2,
                testKey3: value3,
            });
            // Verify that the generated snapshot is correct.
            assert(tree.entries.length === 1);
            assert(tree.entries[0].path === "header");
            assert(tree.entries[0].value.contents === contents);
            const services = new MockSharedObjectServices({
                header: contents,
            });
            // Load another object from the snapshot and ensure that it has loaded the data from the original object.
            const summarizableObject2 = await factory.load(runtime, "mapId", services, "branchId", factory.attributes);
            assert.equal(summarizableObject2.get(key1), value1);
            assert.equal(summarizableObject2.get(key2), value2);
            assert.deepEqual(summarizableObject2.get(key3), value3);
        });
    });
});
//# sourceMappingURL=summarizableObject.spec.js.map