/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { extractLogSafeErrorProperties } from "../../logger";

describe("extractLogSafeErrorProperties", () => {
    describe("prepareErrorObject", () => {
        function createSampleError(): Error {
            try {
                const error = new Error("asdf");
                error.name = "FooError";
                throw error;
            } catch (e) {
                return e as Error;
            }
        }

        it("non-object error yields correct message", () => {
            assert.strictEqual(extractLogSafeErrorProperties("hello").message, "hello");
            assert.strictEqual(extractLogSafeErrorProperties(42).message, "42");
            assert.strictEqual(extractLogSafeErrorProperties(true).message, "true");
            assert.strictEqual(extractLogSafeErrorProperties(undefined).message, "undefined");
        });
        it("object error yields correct message", () => {
            assert.strictEqual(extractLogSafeErrorProperties({ message: "hello"}).message, "hello");
            assert.strictEqual(extractLogSafeErrorProperties({ message: 42}).message, "[object Object]");
            assert.strictEqual(extractLogSafeErrorProperties({ foo: 42}).message, "[object Object]");
            assert.strictEqual(extractLogSafeErrorProperties([1,2,3]).message, "1,2,3");
            assert.strictEqual(extractLogSafeErrorProperties(null).message, "null");
        });
        it("extract errorType", () => {
            assert.strictEqual(extractLogSafeErrorProperties({ errorType: "hello"}).errorType, "hello");
            assert.strictEqual(extractLogSafeErrorProperties({ foo: "hello"}).errorType, undefined);
            assert.strictEqual(extractLogSafeErrorProperties({ errorType: 42}).errorType, undefined);
            assert.strictEqual(extractLogSafeErrorProperties(42).errorType, undefined);
        });
        it("extract stack", () => {
            const e1 = createSampleError();
            const stack1 = extractLogSafeErrorProperties(e1).stack;
            assert(typeof(stack1) === "string");
            assert(!stack1?.includes("asdf"), "message should have been removed from stack");
            assert(stack1?.includes("FooError"), "name should still be in the stack");
        });
        it("extract stack non-standard values", () => {
            assert.strictEqual(extractLogSafeErrorProperties({ stack: "hello"}).stack, "");
            assert.strictEqual(extractLogSafeErrorProperties({ stack: "hello", name: "name" }).stack, "name");
            assert.strictEqual(extractLogSafeErrorProperties({ foo: "hello"}).stack, undefined);
            assert.strictEqual(extractLogSafeErrorProperties({ stack: 42}).stack, undefined);
            assert.strictEqual(extractLogSafeErrorProperties(42).stack, undefined);
        });
    });
});
