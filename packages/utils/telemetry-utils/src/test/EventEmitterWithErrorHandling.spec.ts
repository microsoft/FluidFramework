/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { EventEmitterWithErrorHandling } from "../eventEmitterWithErrorHandling";

describe("EventEmitterWithErrorHandling", () => {
    let errorHandlerCalled = false;
    function defaultErrorHandler(event, error) {
        errorHandlerCalled = true;
        throw error;
    }

    beforeEach(() => {
        errorHandlerCalled = false;
    });

    it("forwards events", () => {
        const emitter = new EventEmitterWithErrorHandling(defaultErrorHandler);
        let passedArg: number | undefined;
        emitter.on("foo", (arg) => { passedArg = arg; });

        emitter.emit("foo", 3);
        assert.strictEqual(passedArg, 3);
        assert.strictEqual(errorHandlerCalled, false);
    });
    it("forwards error event", () => {
        const emitter = new EventEmitterWithErrorHandling(defaultErrorHandler);
        let passedArg: number | undefined;
        emitter.on("error", (arg) => { passedArg = arg; });

        emitter.emit("error", 3);
        assert.strictEqual(passedArg, 3);
        assert.strictEqual(errorHandlerCalled, false);
    });
    it("error thrown from listener is handled, some other listeners succeed", () => {
        const emitter = new EventEmitterWithErrorHandling((event, error: any) => {
            passedErrorMsg = error.message;
            passedEventArg = error.eventArg;
        });
        let passedErrorMsg: string | undefined;
        let passedEventArg: number | undefined;
        let earlyListenerCallCount: number = 0;
        let lateListenerCallCount: number = 0;
        // Innocent bystander - early (registered before throwing one)
        emitter.on("foo", (_arg) => {
            ++earlyListenerCallCount;
        });
        // The delinquent
        emitter.on("foo", (arg) => {
            const error = new Error("foo listener throws");
            Object.assign(error, { eventArg: arg });
            throw error;
        });
        // Innocent bystander - late (registered after throwing one)
        emitter.on("foo", (_arg) => {
            ++lateListenerCallCount;
        });

        emitter.emit("foo", 3);  // listener above will throw. Expect error listener to be invoked
        assert.strictEqual(passedErrorMsg, "foo listener throws");
        assert.strictEqual(passedEventArg, 3);
        assert.strictEqual(earlyListenerCallCount, 1);
        assert.strictEqual(lateListenerCallCount, 0);
    });
    it("emitting error event when unhandled will invoke handler", () => {
        const emitter = new EventEmitterWithErrorHandling(defaultErrorHandler);
        try {
            const error = new Error("No one is listening");
            Object.assign(error, { prop: 4 });
            emitter.emit("error", error, 3);  // the extra args (e.g. 3 here) are dropped
            assert.fail("previous line should throw");
        } catch (error: any) {
            assert.strictEqual(error.message, "No one is listening");
            assert.strictEqual(error.prop, 4);
            assert.strictEqual(errorHandlerCalled, true);
        }
    });
});
