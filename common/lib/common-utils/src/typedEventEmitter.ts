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

// Allow keyof TSig extends string | number since keyof any extending Record<string, any> is string | number (surprise!)

type SignatureKeys<TSig> =
    keyof TSig extends string | number ?
        TSig[keyof TSig] extends any[] ?
            keyof TSig
: never : never;

type SignatureArgs<TSig, TEvent extends SignatureKeys<TSig> = SignatureKeys<TSig>> =
    keyof TSig extends string | number ?
        TSig[TEvent] extends any[] ?
            TSig[TEvent]
: never : never;

export interface IEvents<TSig> {
    <TEvent extends SignatureKeys<TSig>>(event: TEvent, listener: (...args: SignatureArgs<TSig, TEvent>) => void);
}

// Dropped extending TypedEventEmitter because I don't know how to incorporate the TypedEventTransform stuff
class TypedEventEmitter2<TSignatures> extends EventEmitter {
    emit<TEvent extends SignatureKeys<TSignatures>>(
        event: TEvent,
        ...args: SignatureArgs<TSignatures, TEvent>
    ) {
        // Would want to incorporate this class directly in TypedEventEmitter rather than subclassing and calling super.emit
        return super.emit(event, ...args);
    }

    on<TEvent extends SignatureKeys<TSignatures>>(
        event: TEvent,
        listener: (...args: SignatureArgs<TSignatures, TEvent>) => void,
    ) {
        // Would want to incorporate this class directly in TypedEventEmitter rather than subclassing and calling super.on
        // Have to cast to Listener because it's expecting something that can take ...args: any[].  Alternative is to constrain Signatures to extend Record<string, any[]> and support arbitrary events
        return super.on(event, listener as Listener);
    }
}

export interface ISampleEventSignatures extends Record<string, any[]> {
    foo: [x: number, y: string];
    bar: [];
    baz: [options: { a: string; b: boolean; }];
//    [key: string]: any[];
//    45: number;
}
const sample = new TypedEventEmitter2<ISampleEventSignatures>();

type SignatureKeys2<TSig> =
    keyof TSig extends string | number ?
        TSig[keyof TSig] extends any[] ?
            keyof TSig
: never : never;

type SignatureArgs2<TSig, TEvent extends SignatureKeys2<TSig> = SignatureKeys2<TSig>> =
    keyof TSig extends string | number ?
        TSig[TEvent] extends any[] ?
            TSig[TEvent]
: never : never;


type SK = SignatureKeys2<ISampleEventSignatures>;
type SA = SignatureArgs2<ISampleEventSignatures>;

type StringKey<T> = keyof T extends string ? keyof T : never;
type IK = StringKey<{ [key: string]: any; }>;
type RK = StringKey<Record<string, any>>;

type IKey = keyof { [key: string]: any; };
type RKey = keyof ERecord;

interface ERecord extends Record<string, any> {}

// These are strongly typed (assuming you spell the type parameter correctly)
sample.emit("foo", 3, "asdf");
sample.emit("bar");
sample.emit("baz", { a: "hello", b: true });

// Now this is supported. But we lose suggestions on event names (but if you get the name right you still get the specific signature in intellisense)
sample.emit("unspecified", 123);

sample.on("foo", (x: number, y: string) => {});
