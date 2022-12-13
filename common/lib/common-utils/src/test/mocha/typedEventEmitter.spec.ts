/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { IErrorEvent, IEvent, IEventThisPlaceHolder } from "@fluidframework/common-definitions";
import { TypedEventEmitter } from "../..";

describe("TypedEventEmitter", () => {
    it("Validate Function proxies", () => {
        const tee = new TypedEventEmitter<IErrorEvent>();
        let once = 0;

        tee.once("error", () => once++);
        assert.equal(tee.listenerCount("error"), 1);

        let on = 0;
        tee.on("error", () => on++);
        assert.equal(tee.listenerCount("error"), 2);

        for (let i = 0; i < 5; i++) {
            tee.emit("error", "message");
        }

        assert.equal(once, 1);
        assert.equal(on, 5);
    });

    it("Validate new and remove Listener", () => {
        const tee = new TypedEventEmitter<IErrorEvent>();
        let newListenerCalls = 0;
        let removeListenerCalls = 0;
        const errListener = (): void => {};
        tee.on("removeListener", (event, listener) => {
            assert.equal(event, "error");
            assert.equal(listener, errListener);
            removeListenerCalls++;
        });
        tee.on("newListener", (event, listener) => {
            assert.equal(event, "error");
            assert.equal(listener, errListener);
            newListenerCalls++;
        });

        tee.on("error", errListener);
        tee.removeListener("error", errListener);

        assert.equal(newListenerCalls, 1);
        assert.equal(removeListenerCalls, 1);
    });

    it("Validate emit typing for valid event type", () => {
        const eventArgsEmitted: any[] = [];
        const handler = (...args): void => {
            eventArgsEmitted.push(args);
        };
        const tee = new (class SomeClass extends TypedEventEmitter<ISampleEvents> {
            someMember: 0 = 0;
        })();
        const plainTee = new TypedEventEmitter();

        tee.on("noArgs", handler);
        tee.on("twoArgs", handler);
        tee.on("useThis", handler);
        tee.on("somethingElse", handler);

        tee.emit("noArgs");
        tee.emit("twoArgs", true, "hello");
        tee.emit("useThis", tee);

        // @ts-expect-error Unknown event
        tee.emit("somethingElse");
        // @ts-expect-error Unknown event
        tee.emit("noArgs", "bogus");
        // @ts-expect-error Missing arg
        tee.emit("twoArgs", true);
        // @ts-expect-error Wrong arg types
        tee.emit("twoArgs", "wrongType", 123);
        // @ts-expect-error Wrong arg type for "this"-typed arg
        tee.emit("useThis", plainTee);

        // @ts-expect-error This shouldn't be emitted manually
        tee.emit("addListener", "asdf", () => {});
        // @ts-expect-error This shouldn't be emitted manually
        tee.emit("removeListener", "asdf", () => {});

        assert.deepStrictEqual(eventArgsEmitted, [
            [],
            [true, "hello"],
            [tee],
            // Below: Even if typing is violated, events are still emitted as written
            [],
            ["bogus"],
            [true],
            ["wrongType", 123],
            [plainTee],
        ]);
    });

    it("emit not supported for invalid event type", () => {
        const tee = new TypedEventEmitter<IInvalidEvents>();

        // @ts-expect-error any invalid signatures invalidate the type altogether (even though noArgs is on there)
        tee.emit("noArgs");
        // @ts-expect-error only strings are supported for event keys
        tee.emit(123);
        // @ts-expect-error only strings are supported for event keys
        tee.emit(456);
    });
});

interface ISampleEvents extends IEvent {
    (event: "noArgs", listener: () => void);
    (event: "twoArgs", listener: (y: boolean, z: string) => void);
    (event: "useThis", listener: (y: IEventThisPlaceHolder) => void);
}

interface IInvalidEvents extends IEvent {
    (event: "noArgs", listener: () => void); // Note: even this won't work
    (event: 123, listener: () => void);
    (event: number, listener: () => void);
}
