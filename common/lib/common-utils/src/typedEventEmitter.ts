/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable max-len */

import { EventEmitter, Listener } from "events";
import {
    IEvent,
    TransformedEvent,
    IEventTransformer,
    IEventProvider,
} from "@fluidframework/common-definitions";

/**
 * The event emitter polyfill and the node event emitter have different event types:
 * string | symbol vs. string | number
 *
 * This type allow us to correctly handle either type
 */
export type EventEmitterEventType = EventEmitter extends { on(event: infer E, listener: any) }
    ? E
    : never;

export type TypedEventTransform<TThis, TEvent> =
    // Event emitter supports some special events for the emitter itself to use
    // this exposes those events for the TypedEventEmitter.
    // Since we know what the shape of these events are, we can describe them directly via a TransformedEvent
    // which easier than trying to extend TEvent directly
    TransformedEvent<
        TThis,
        "newListener" | "removeListener",
        Parameters<(event: string, listener: (...args: any[]) => void) => void>
    > &
        // Expose all the events provides by TEvent
        IEventTransformer<TThis, TEvent & IEvent> &
        // Add the default overload so this is covertable to EventEmitter regardless of environment
        TransformedEvent<TThis, EventEmitterEventType, any[]>;

/**
 * Event Emitter helper class the supports emitting typed events
 */
export class TypedEventEmitter<TEvent>
    extends EventEmitter
    implements IEventProvider<TEvent & IEvent>
{
    constructor() {
        super();
        this.addListener = super.addListener.bind(this) as TypedEventTransform<this, TEvent>;
        this.on = super.on.bind(this) as TypedEventTransform<this, TEvent>;
        this.once = super.once.bind(this) as TypedEventTransform<this, TEvent>;
        this.prependListener = super.prependListener.bind(this) as TypedEventTransform<
            this,
            TEvent
        >;
        this.prependOnceListener = super.prependOnceListener.bind(this) as TypedEventTransform<
            this,
            TEvent
        >;
        this.removeListener = super.removeListener.bind(this) as TypedEventTransform<this, TEvent>;
        this.off = super.off.bind(this) as TypedEventTransform<this, TEvent>;
    }
    readonly addListener: TypedEventTransform<this, TEvent>;
    readonly on: TypedEventTransform<this, TEvent>;
    readonly once: TypedEventTransform<this, TEvent>;
    readonly prependListener: TypedEventTransform<this, TEvent>;
    readonly prependOnceListener: TypedEventTransform<this, TEvent>;
    readonly removeListener: TypedEventTransform<this, TEvent>;
    readonly off: TypedEventTransform<this, TEvent>;
}

(new TypedEventEmitter()).on("newListener", (event: string, listener: (...args: any[]) => void) => {});

interface IBaseEventSpec {
    newListener: (event: string, listener: (...args: any[]) => void) => void;
    removeListener: (event: string, listener: (...args: any[]) => void) => void;
}

type SampleKeys = EventKeys<ISampleEventSpec>;
type SampleListener = ListenerSignature<ISampleEventSpec, "foo">;
type SampleEventsType = IEvents<ISampleEventSpec>;

declare const e: SampleEventsType;
e("foo", (x, y) => { });

type EventKeys<TEventSpec> =
    keyof TEventSpec extends string ?
        TEventSpec[keyof TEventSpec] extends (...args: any[]) => void ?
            keyof TEventSpec
: never : never;

type ListenerSignature<TEventSpec, TEventKey extends EventKeys<TEventSpec>> =
    keyof TEventSpec extends string ?
        TEventSpec[TEventKey] extends (...args: any[]) => void ?
            TEventSpec[TEventKey]
: never : never;

// Compatibility with existing IEvent shape
export interface IEvents<TEventSpec> {
    <TEventKey extends EventKeys<TEventSpec>>(
        event: TEventKey,
        listener: ListenerSignature<TEventSpec, TEventKey>,
    );
}

// Dropped extending TypedEventEmitter because I don't know how to incorporate the TypedEventTransform stuff
class TypedEventEmitter2<TEventSpec extends IBaseEventSpec> extends EventEmitter {
    emit<TEventKey extends EventKeys<TEventSpec>>(
        event: TEventKey,
        ...args: Parameters<ListenerSignature<TEventSpec, TEventKey>>
    ): boolean {
        // Would want to incorporate this class directly in TypedEventEmitter rather than subclassing and calling super.emit
        return super.emit(event, ...args);
    }

    on<TEventKey extends EventKeys<TEventSpec>>(
        event: TEventKey,
        listener: ListenerSignature<TEventSpec, TEventKey>,
    ): this {
        // Would want to incorporate this class directly in TypedEventEmitter rather than subclassing and calling super.on
        // Have to cast to Listener because it's expecting something that can take ...args: any[].  Alternative is to constrain Signatures to extend Record<string, any[]> and support arbitrary events
        return super.on(event, listener as Listener);
    }
}

// extend Record<string, any[]> if you want to allow any undeclared event (why?) - also this will allow numerical keys
export interface ISampleEventSpec extends IBaseEventSpec {
    foo: (x: number, y: string) => void;
    bar: () => void;
    baz: (options: { a: string; b: boolean; }) => void;
    // BOOM: number;
}
const sample = new TypedEventEmitter2<ISampleEventSpec>();

// These are strongly typed
sample.emit("foo", 3, "asdf");
sample.emit("bar");
sample.emit("baz", { a: "hello", b: true });

sample.on("foo", (x: number, y: string) => {});
sample.on("bar", () => {});
sample.on("baz", ({ a, b }) => {});


// Not supported
sample.emit("unspecified", 123);
sample.on("unspecified", () => {});
