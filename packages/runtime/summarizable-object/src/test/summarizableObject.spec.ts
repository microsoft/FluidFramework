/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { IBlob } from "@microsoft/fluid-protocol-definitions";
import { MockRuntime } from "@microsoft/fluid-test-runtime-utils";
import { ISummarizableObject } from "../interfaces";
import { SummarizableObjectFactory } from "../summarizableObjectFactory";

describe("SummarizableObject", () => {
    let runtime: MockRuntime;
    let factory: SummarizableObjectFactory;
    let summarizableObject: ISummarizableObject;

    beforeEach(async () => {
        runtime = new MockRuntime();
        factory = new SummarizableObjectFactory();
        summarizableObject = factory.create(runtime, "root") as ISummarizableObject;
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
            assert.equal(summarizableObject.get(key2), value2, "The retrieved value must match the set value");
        });
    });

    describe("Snapshot", () => {
        it("can generate snaphot of the summarizable object data", () => {
            summarizableObject.set("key1", "value1");
            summarizableObject.set("key2", "value2");
            summarizableObject.set("key3", { value: "value3" });

            const tree = summarizableObject.snapshot();
            const contents = JSON.stringify({
                key1: "value1",
                key2: "value2",
                key3: { value: "value3" },
            });

            assert(tree.entries.length === 1);
            assert(tree.entries[0].path === "header");
            assert((tree.entries[0].value as IBlob).contents === contents);
        });
    });
});
