/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { EventEmitterWithErrorHandling } from "../eventEmitterWithErrorHandling";

function defaultErrorHandler(event, error) {
    throw error;
}

describe("EventEmitterWithErrorHandling", () => {
    it("forwards events", ()=> {
        const emitter = new EventEmitterWithErrorHandling(defaultErrorHandler);
        let passedArg: number | undefined;
        emitter.on("foo", (arg) => { passedArg = arg; });

        emitter.emit("foo", 3);
        assert.strictEqual(passedArg, 3);
    });
    it("forwards error event", ()=> {
        const emitter = new EventEmitterWithErrorHandling(defaultErrorHandler);
        let passedArg: number | undefined;
        emitter.on("error", (arg) => { passedArg = arg; });

        emitter.emit("error", 3);
        assert.strictEqual(passedArg, 3);
    });
    it("converts exception in listener to error event, some other listeners succeed", ()=> {
        const emitter = new EventEmitterWithErrorHandling(defaultErrorHandler);
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
        // error listener
        emitter.on("error", (error) => {
            passedErrorMsg = error.message;
            passedEventArg = error.eventArg;
        });

        emitter.emit("foo", 3);  // listener above will throw. Expect error listener to be invoked
        assert.strictEqual(passedErrorMsg, "foo listener throws");
        assert.strictEqual(passedEventArg, 3);
        assert.strictEqual(earlyListenerCallCount, 1);
        assert.strictEqual(lateListenerCallCount, 0);
    });
    it("emitting error event when unhandled will throw", ()=> {
        const emitter = new EventEmitterWithErrorHandling(defaultErrorHandler);
        try {
            const error = new Error("No one is listening");
            Object.assign(error, { prop: 4 });
            emitter.emit("error", error, 3);  // the extra args (e.g. 3 here) are dropped
            assert.fail("previous line should throw");
        } catch (error) {
            assert.strictEqual(error.message, "No one is listening");
            assert.strictEqual(error.prop, 4);
        }
    });
    it("if error listener throws, new exception is thrown, some other listeners succeed", ()=> {
        const emitter = new EventEmitterWithErrorHandling(defaultErrorHandler);
        let earlyListenerCallCount: number = 0;
        let earlyListenerErrorMsg: string = "";
        let delinquentListenerCallCount: number = 0;
        let lateListenerCallCount: number = 0;
        // Innocent bystander - early (registered before throwing one)
        emitter.on("error", (error) => {
            ++earlyListenerCallCount;
            earlyListenerErrorMsg = error.message;
        });
        // The delinquent
        emitter.on("error", (_error) => {
            ++delinquentListenerCallCount;
            const listenerError = new Error("error listener throws"); // Such a bummer!
            throw listenerError;
        });
        // Innocent bystander - late (registered after throwing one)
        emitter.on("error", (_error) => {
            ++lateListenerCallCount;
        });

        try {
            emitter.emit("error", new Error("original error"));
            assert.fail("previous line should throw");
        } catch (error) {
            assert.strictEqual(error.message, "error listener throws", "error thrown from listener expected");
        }
        assert.strictEqual(earlyListenerCallCount, 1, "early error listener should be called once");
        assert.strictEqual(earlyListenerErrorMsg, "original error", "early error listener should get original error");
        assert.strictEqual(delinquentListenerCallCount, 1, "delinquent error listener should be called once");
        assert.strictEqual(lateListenerCallCount, 0, "late error listener not expected to be called");
    });
    it("exception in listener will be thrown if no error listener", ()=> {
        const emitter = new EventEmitterWithErrorHandling(defaultErrorHandler);
        emitter.on("foo", (arg) => {
            const error = new Error("foo listener throws");
            Object.assign(error, { eventArg: arg });
            throw error;
        });

        try {
            emitter.emit("foo", 3);  // listener above will throw. Expect error listener to be invoked but then throw
            assert.fail("previous line should throw");
        } catch (error) {
            assert.strictEqual(error.message, "foo listener throws");
            assert.strictEqual(error.eventArg, 3);
        }
    });
});
