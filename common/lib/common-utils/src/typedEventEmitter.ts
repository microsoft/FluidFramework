/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable max-len */

import { EventEmitter } from "events";
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
        (event: infer E2, listener: (...args: infer A2) => void),
        (event: infer E3, listener: (...args: infer A3) => void),
        (event: string, listener: (...args: any[]) => void),
    }
    ? EventSpecEntry<E0, A0> & EventSpecEntry<E1, A1> & EventSpecEntry<E2, A2> & EventSpecEntry<E3, A3>
    : TEvent extends
    {
        (event: infer E0, listener: (...args: infer A0) => void),
        (event: infer E1, listener: (...args: infer A1) => void),
        (event: infer E2, listener: (...args: infer A2) => void),
        (event: string, listener: (...args: any[]) => void),
    }
    ? EventSpecEntry<E0, A0> & EventSpecEntry<E1, A1> & EventSpecEntry<E2, A2>
    : TEvent extends
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
        [TK in TEventKey]: TListenerArgs;
    }
    : never;

type B = IBaseEvents & IOldEvents;

declare const b: B;

type A = ToEventSpec<IOldEvents & IEvent>;

type D = keyof A;
type F = A["asdf"];

/** Extracts the supported event names from the spec */
type EventKeys2<TEventSpec> =
    keyof TEventSpec extends string ?
        TEventSpec[keyof TEventSpec] extends any[] ?
            keyof TEventSpec
: never : never;

type EventEmitSignatures2<TThis, TEvent extends IEvent> =
    <TEventKey extends EventKeys2<ToEventSpec<TEvent>>>(
        event: TEventKey,
        // ...args: ToEventSpec<TEvent>[TEventKey]
        ...args: ReplaceIEventThisPlaceHolder<ToEventSpec<TEvent>[TEventKey], TThis>
    ) => boolean;

type EventEmitSignaturesLoose2<TThis, TEvent extends IEvent> =
    EventEmitSignatures2<TThis, TEvent> &
    {(event: string, ...args: any[])};

type C = EventEmitSignaturesLoose2<{ somethis: string }, IOldEvents & IEvent>;
type E = EventEmitSignatures2<{ somethis: string }, IOldEvents & IEvent>;

declare const e: E;
e("useThis1", { somethis: "ok" });

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

/** Signature for emit */
type EventEmitSignatures<TThis, TEventSpec> =
    <TEventKey extends EventKeys<TEventSpec>>(
        event: TEventKey,
        ...args: Parameters<ListenerSignature<TThis, TEventSpec, TEventKey>>
    ) => boolean;

/** Also includes (event: string, ...) signature */
type EventEmitSignaturesLoose<TThis, TEventSpec> =
    EventEmitSignatures<TThis, TEventSpec> &
    {(event: string, ...args: any[])};

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

        this.emit = super.emit.bind(this) as EventEmitSignatures2<this, TEvent & IEvent>;
    }
    readonly addListener: TypedEventTransform<this, TEvent>;
    readonly on: TypedEventTransform<this, TEvent>;
    readonly once: TypedEventTransform<this, TEvent>;
    readonly prependListener: TypedEventTransform<this, TEvent>;
    readonly prependOnceListener: TypedEventTransform<this, TEvent>;
    readonly removeListener: TypedEventTransform<this, TEvent>;
    readonly off: TypedEventTransform<this, TEvent>;

    readonly emit: EventEmitSignatures2<this, TEvent & IEvent>;
}

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

// Notice these are acceptable (ACTUALLY NOT)
sampleOld.emit("unspecified", () => {});
sampleOld.on("unspecified", () => {});
