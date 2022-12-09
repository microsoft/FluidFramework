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
    ReplaceIEventThisPlaceHolder,
    IEventThisPlaceHolder,
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

/** Converting from IEvent shape to EventSpec shape. Might allow for easier transition to EventSpec */
export type ToEventSpec<TEvent extends IEvent> =
    // ...Start with all 15 like IEventTransformer
    // I think we would drop all mention of the (event: string, ...) signature
    TEvent extends
    {
        (event: infer E0, listener: (...args: infer A0) => void),
        (event: infer E1, listener: (...args: infer A1) => void),
        (event: string, listener: (...args: any[]) => void),
    }
    ? EventSpecEntry<E0, A0> & EventSpecEntry<E1, A1>
    : TEvent extends
    {
        (event: infer E0, listener: (...args: infer A0) => void),
        (event: string, listener: (...args: any[]) => void),
    }
    ? EventSpecEntry<E0, A0>
    : EventSpecEntry<string, any[]>
    ;

export type EventSpecEntry<TEventKey, TListenerArgs extends any[]> =
    TEventKey extends string ?
    {
        [TK in TEventKey]: (...args: TListenerArgs) => void;
    }
    : never;


/** These events are always supported due to base EventEmitter implementation */
export interface BaseEventSpec {
    newListener: (event: string, listener: (...args: any[]) => void) => void;
    removeListener: (event: string, listener: (...args: any[]) => void) => void;
}

/** Extracts the supported event names from the spec */
type EventKeys<TEventSpec> =
    keyof TEventSpec extends string ?
        TEventSpec[keyof TEventSpec] extends (...args: any[]) => void ?
            keyof TEventSpec
: never : never;

/** Extracts the given event's listener signature (including replacing IEventThisPlaceHolder) */
type ListenerSignature<TThis, TEventSpec, TEventKey extends EventKeys<TEventSpec>> =
    keyof TEventSpec extends string ?
        TEventSpec[TEventKey] extends (...args: infer TArgs) => void ?
            (...args: ReplaceIEventThisPlaceHolder<TArgs, TThis>) => void
: never : never;

/** Signature for on/once/off functions */
type EventHandlerRegistrationSignatures<TThis, TEventSpec> =
    <TEventKey extends EventKeys<TEventSpec>>(
        event: TEventKey,
        listener: ListenerSignature<TThis, TEventSpec, TEventKey>,
    ) => TThis;

/** Signature for emit */
type EventEmitSignatures<TThis, TEventSpec> =
    <TEventKey extends EventKeys<TEventSpec>>(
        event: TEventKey,
        ...args: Parameters<ListenerSignature<TThis, TEventSpec, TEventKey>>
    ) => boolean;

/** Interface exposed to consumers who will listen to events */
export interface IEventProvider2<TEventSpec> {
    on: EventHandlerRegistrationSignatures<this, TEventSpec>;
    once: EventHandlerRegistrationSignatures<this, TEventSpec>;
    off: EventHandlerRegistrationSignatures<this, TEventSpec>;
}

export class TypedEventEmitter2<TEventSpec extends BaseEventSpec> extends EventEmitter implements IEventProvider2<TEventSpec> {
    constructor() {
        super();
        this.addListener = super.addListener.bind(this) as EventHandlerRegistrationSignatures<this, TEventSpec>;
        this.on = super.on.bind(this) as EventHandlerRegistrationSignatures<this, TEventSpec>;
        this.once = super.once.bind(this) as EventHandlerRegistrationSignatures<this, TEventSpec>;
        this.prependListener = super.prependListener.bind(this) as EventHandlerRegistrationSignatures<this, TEventSpec>;
        this.prependOnceListener = super.prependOnceListener.bind(this) as EventHandlerRegistrationSignatures<this, TEventSpec>;
        this.removeListener = super.removeListener.bind(this) as EventHandlerRegistrationSignatures<this, TEventSpec>;
        this.off = super.off.bind(this) as EventHandlerRegistrationSignatures<this, TEventSpec>;

        this.emit = super.emit.bind(this) as EventEmitSignatures<this, TEventSpec>;
    }
    readonly addListener: EventHandlerRegistrationSignatures<this, TEventSpec>;
    readonly on: EventHandlerRegistrationSignatures<this, TEventSpec>;
    readonly once: EventHandlerRegistrationSignatures<this, TEventSpec>;
    readonly prependListener: EventHandlerRegistrationSignatures<this, TEventSpec>;
    readonly prependOnceListener: EventHandlerRegistrationSignatures<this, TEventSpec>;
    readonly removeListener: EventHandlerRegistrationSignatures<this, TEventSpec>;
    readonly off: EventHandlerRegistrationSignatures<this, TEventSpec>;

    readonly emit: EventEmitSignatures<this, TEventSpec>;
}

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

export interface SampleEventSpec extends BaseEventSpec {
    foo: (x: number, y: string) => void;
    bar: () => void;
    baz: (options: { a: string; b: boolean; }) => void;
    useThis: (x: IEventThisPlaceHolder) => void;
    // BOOM: number;
}

class MyTee extends TypedEventEmitter2<SampleEventSpec> {}
const sample = new MyTee();

// These are strongly typed
sample.emit("foo", 3, "asdf");
sample.emit("bar");
sample.emit("baz", { a: "hello", b: true });
sample.emit("useThis", sample);

sample.on("newListener", (event: string, listener: Listener) => {});
sample.on("foo", (x: number, y: string) => {});
sample.on("bar", () => {});
sample.on("baz", ({ a, b }) => {});
sample.on("useThis", (x: MyTee) => {});


// Not supported
sample.emit("unspecified", 123);
sample.on("unspecified", () => {});

export interface NewEventSpec {
    something: (x: number) => void;
    useThis1: (y: IEventThisPlaceHolder) => void;
}

export interface IOldEvents extends IEvent {
    (event: "something", listener: (x: number) => void);
    (event: "useThis1", listener: (y: IEventThisPlaceHolder) => void)
}

const sampleOld = new TypedEventEmitter<IOldEvents>();

// Notice these are acceptable
sampleOld.emit("unspecified", () => {});
sampleOld.on("unspecified", () => {});
