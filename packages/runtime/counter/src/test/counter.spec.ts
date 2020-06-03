/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { MockRuntime } from "@fluidframework/test-runtime-utils";
import { CounterFactory } from "../counterFactory";
import { ISharedCounter } from "..";

describe("Routerlicious", () => {
    describe("Api", () => {
        describe("counter", () => {
            let testCounter: ISharedCounter;

            beforeEach(async () => {
                const factory = new CounterFactory();
                testCounter = factory.create(new MockRuntime(), "counter");
            });

            it("Can create a counter", () => {
                assert.ok(testCounter);
            });

            // it("Can set and get cell data", async () => {
            //     testCounter.set("testValue");
            //     assert.equal(testCounter.get(), "testValue");
            // });
        });
    });
});
