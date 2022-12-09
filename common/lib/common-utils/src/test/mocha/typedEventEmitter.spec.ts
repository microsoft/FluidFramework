/* eslint-disable @typescript-eslint/explicit-function-return-type */
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { IErrorEvent, IEvent, IEventProvider, IEventThisPlaceHolder } from "@fluidframework/common-definitions";
import { TypedEventEmitter } from "../..";
import { IBaseEventSpec, IEventProvider2, TypedEventEmitter2 } from "../../typedEventEmitter";

export interface ISampleEvents extends IEvent {
    (event: "something", listener: (x: number) => void);
    (event: "useThis", listener: (y: IEventThisPlaceHolder) => void)
}

export interface ISampleEventSpec extends IBaseEventSpec {
    something: (x: number) => void;
    useThis: (y: IEventThisPlaceHolder) => void;
}

export interface ISample extends IEventProvider<ISampleEvents> {
    dummy: number;
}

export class Sample extends TypedEventEmitter<ISampleEvents> implements ISample {
    dummy = 4;

    someCode(): void {
        this.emit("something", this.dummy);
    }
}

export interface ISample2 extends IEventProvider2<ISampleEventSpec> {
    dummy: number;
}

export class Sample2 extends TypedEventEmitter2<ISampleEventSpec> implements ISample2 {
    dummy = 4;

    someCode(): void {
        this.emit("something", this.dummy);
        this.emit("useThis", this);
    }
}

function takeOld(oldIep: ISample) {
}

function takeNew(newIep: ISample2) {
}

takeOld(new Sample2());
takeNew(new Sample()); // This one still works even if event specs don't match. I think that's ok though


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

// ////
// This section was where I learned that IEventProvider<IEvents<Spec>> doesn't work
// It matches with multiple event signatures (e.g. E0, E1, E2) and results in a case
// with unknown that breaks type compatibility

// export type IdmEvents = IEvents<ISampleEventSpec>;
// export type IdmEventProvider = IEventProvider<IdmEvents>;

// declare const e1: IdmEvents;
// declare const e2: ISampleEvents;
// declare const p1: IdmEventProvider;
// declare const p2: IEventProvider<ISampleEvents>;

// declare const newThing: IEventProvider2<ISampleEventSpec>;
// takeOld(newThing);

// e1()
// e2()

// p1.on();
// p2.on();

// type Testing<TThis, T> = T extends
// {
//     (event: infer E0, listener: (...args: infer A0) => void),
//     (event: infer E1, listener: (...args: infer A1) => void),
//     (event: infer E2, listener: (...args: infer A2) => void),
//     (event: string, listener: (...args: any[]) => void),
// }
// ? true
// : false

// type Testing1 = IEventTransformer<ISample, IdmEvents>
// type Testing2 = Testing<ISample, IdmEvents>
// type Testing3 = Testing<ISample, ISampleEvents>
