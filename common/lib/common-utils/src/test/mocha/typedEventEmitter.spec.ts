/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { IErrorEvent } from "@fluidframework/common-definitions";
import { TypedEventEmitter } from "../..";

export interface NewEventSpec {
    something: (x: number) => void;
    useThis1: (y: IEventThisPlaceHolder) => void;
}

interface IBaseEvents extends IEvent {
    (event: "removeListener", listener: (event: string) => void);
    // (event: "newListener", listener: (event: string, listener: (...args: any[]) => void) => void);
    // (event: "removeListener", listener: (event: string, listener: (...args: any[]) => void) => void);
}

export interface IOldEvents extends IEvent {
    (event: "asdf", listener: (y: boolean, z: string) => void);
    (event: "something", listener: (x: number) => void);
    (event: "useThis1", listener: (y: IEventThisPlaceHolder) => void)
}

const sampleOld = new TypedEventEmitter<IOldEvents>();

sampleOld.emit("something", 5);
sampleOld.emit("addListener", "asdf", () => {});

sampleOld.emit("something", 7);

sampleOld.on("something", (x) => {});

// Notice these are acceptable (EMITTING IS NOT ACTUALLY)
sampleOld.emit("unspecified", () => {});
sampleOld.on("unspecified", () => {});

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
});
