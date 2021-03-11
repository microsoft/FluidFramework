/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { EventEmitterWithErrorHandling } from "../eventEmitterWithErrorHandling";

class MyEventEmitter extends EventEmitterWithErrorHandling {

}

describe.only("EventEmitterWithErrorHandling", () => {
    it("forwards events", ()=> {
        const emitter = new MyEventEmitter();
        let passedArg: number | undefined;
        emitter.on("foo", (arg) => { passedArg = arg; });

        emitter.emit("foo", 3);
        assert.strictEqual(passedArg, 3);
    });
    it("forwards error event", ()=> {
        const emitter = new MyEventEmitter();
        let passedArg: number | undefined;
        emitter.on("error", (arg) => { passedArg = arg; });

        emitter.emit("error", 3);
        assert.strictEqual(passedArg, 3);
    });
    it("converts exception in listener to error event", ()=> {
        const emitter = new MyEventEmitter();
        let passedErrorMsg: string | undefined;
        let passedEventArg: number | undefined;
        emitter.on("foo", (arg) => {
            const error = new Error("foo listener throws");
            Object.assign(error, { eventArg: arg });
            throw error;
        });
        emitter.on("error", (error) => {
            passedErrorMsg = error.message;
            passedEventArg = error.eventArg;
        });

        emitter.emit("foo", 3);  // listener above will throw. Expect error listener to be invoked
        assert.strictEqual(passedErrorMsg, "foo listener throws");
        assert.strictEqual(passedEventArg, 3);
    });
    it("emitting error event when unhandled will throw", ()=> {
        const emitter = new MyEventEmitter();
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
    it("if error listener throws, new exception is thrown", ()=> {
        const emitter = new MyEventEmitter();
        let errorListenerCallCount: number = 0;
        emitter.on("error", (_error) => {
            ++errorListenerCallCount;
            const listenerError = new Error("error listener throws"); // Such a bummer!
            throw listenerError;
        });

        try {
            const error = new Error("original error");
            emitter.emit("error", error);
            assert.fail("previous line should throw");
        } catch (error) {
            assert.strictEqual(error.message, "error listener throws", "error thrown from listener should win");
        }
        assert.strictEqual(errorListenerCallCount, 2, "error listener should be called twice");
    });
    it("exception in listener will be thrown if no error listener", ()=> {
        const emitter = new MyEventEmitter();
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
