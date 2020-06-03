/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { ISharedObjectFactory } from "@fluidframework/shared-object-base";
import { MockRuntime } from "@fluidframework/test-runtime-utils";
import { ISharedCounter, SharedCounter } from "..";

describe("Counter", () => {
    let factory: ISharedObjectFactory;

    describe("constructor", () => {
        beforeEach(async () => {
            factory = SharedCounter.getFactory();
        });

        it("Can create a counter with default value", () => {
            const testCounter = factory.create(new MockRuntime(), "counter") as SharedCounter;
            assert.ok(testCounter);
            assert.equal(testCounter.value, 0);
        });
    });

    describe("increment", () => {
        let testCounter: ISharedCounter;

        beforeEach(async () => {
            factory = SharedCounter.getFactory();
            testCounter = factory.create(new MockRuntime(), "counter") as SharedCounter;
            assert.ok(testCounter);
        });

        it("Can increment a counter with positive and negative values", () => {
            testCounter.increment(20);
            assert.equal(testCounter.value, 20);
            testCounter.increment(-30);
            assert.equal(testCounter.value, -10);
        });

        it("Fires a listener callback after increment", () => {
            let fired1 = false;
            let fired2 = false;

            testCounter.on("incremented", (incrementAmount: number, newValue: number) => {
                if (!fired1) {
                    fired1 = true;
                    assert.equal(incrementAmount, 10);
                    assert.equal(newValue, 10);
                } else if (!fired2) {
                    fired2 = true;
                    assert.equal(incrementAmount, -3);
                    assert.equal(newValue, 7);
                } else {
                    assert.fail("incremented event fired too many times");
                }
            });

            testCounter.increment(10);
            testCounter.increment(-3);
            assert.ok(fired1);
            assert.ok(fired2);
        });
    });
});
