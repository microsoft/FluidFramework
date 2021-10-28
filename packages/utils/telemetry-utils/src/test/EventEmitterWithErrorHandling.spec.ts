/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { EventEmitterWithErrorHandling } from "../eventEmitterWithErrorHandling";
import { isFluidError } from "../fluidErrorBase";

describe("EventEmitterWithErrorHandling", () => {
    let errorHandlerCalled = false;
    function defaultErrorHandler(event, error) {
        errorHandlerCalled = true;
        throw error;
    }

    beforeEach(() => {
        errorHandlerCalled = false;
    });

    it("forwards events", ()=> {
        const emitter = new EventEmitterWithErrorHandling(defaultErrorHandler, "errorSource");
        let passedArg: number | undefined;
        emitter.on("foo", (arg) => { passedArg = arg; });

        emitter.emit("foo", 3);
        assert.strictEqual(passedArg, 3);
        assert.strictEqual(errorHandlerCalled, false);
    });
    it("forwards error event", ()=> {
        const emitter = new EventEmitterWithErrorHandling(defaultErrorHandler, "errorSource");
        let passedArg: number | undefined;
        emitter.on("error", (arg) => { passedArg = arg; });

        emitter.emit("error", 3);
        assert.strictEqual(passedArg, 3);
        assert.strictEqual(errorHandlerCalled, false);
    });
    it("error thrown from listener is handled, some other listeners succeed", ()=> {
        const emitter = new EventEmitterWithErrorHandling((event, error: any) => {
            passedErrorMsg = error.message;
            passedEventName = event;
            assert(isFluidError(error) && error.errorSource === "someErrorSource");
            assert(error.getTelemetryProperties().mishandledEvent === event);
        }, "someErrorSource");
        let passedErrorMsg: string | undefined;
        let passedEventName: string | symbol | undefined;
        let earlyListenerCallCount: number = 0;
        let lateListenerCallCount: number = 0;
        // Innocent bystander - early (registered before throwing one)
        emitter.on("foo", (_arg) => {
            ++earlyListenerCallCount;
        });
        // The delinquent
        emitter.on("foo", (_arg) => {
            throw new Error("foo listener throws");
        });
        // Innocent bystander - late (registered after throwing one)
        emitter.on("foo", (_arg) => {
            ++lateListenerCallCount;
        });

        emitter.emit("foo", 3);  // listener above will throw. Expect error listener to be invoked
        assert.strictEqual(passedErrorMsg, "foo listener throws");
        assert.strictEqual(passedEventName, "foo");
        assert.strictEqual(earlyListenerCallCount, 1);
        assert.strictEqual(lateListenerCallCount, 0);
    });
    it("emitting error event when unhandled will invoke handler", ()=> {
        const emitter = new EventEmitterWithErrorHandling(defaultErrorHandler, "errorSource");
        try {
            const error = new Error("No one is listening");
            Object.assign(error, { prop: 4 }); // This will be dropped by normalizeError
            emitter.emit("error", error, 3);  // the extra args (e.g. 3 here) are dropped
            assert.fail("previous line should throw");
        } catch (error) {
            assert(isFluidError(error));
            assert.strictEqual(error.message, "No one is listening");
            assert.strictEqual(error.errorSource, "errorSource");
            assert.strictEqual(error.getTelemetryProperties().mishandledEvent, "error");
            assert.strictEqual((error as any).prop, undefined,
                "Normalized error will not retain props besides message/stack");
            assert.strictEqual(errorHandlerCalled, true);
        }
    });
});
