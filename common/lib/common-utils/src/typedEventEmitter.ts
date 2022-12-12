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

/** Convert from IEvent shape to a type mapping event name to args list */
export type EventArgsMapping<TEvent> =
    //* TODO: ...Start with all 15 like IEventTransformer
    TEvent extends {
        (event: infer E0, listener: (...args: infer A0) => void);
        (event: infer E1, listener: (...args: infer A1) => void);
        (event: infer E2, listener: (...args: infer A2) => void);
        (event: infer E3, listener: (...args: infer A3) => void);
        (event: string, listener: (...args: any[]) => void);
    }
        ? SingleEventArgsMapping<E0, A0> &
              SingleEventArgsMapping<E1, A1> &
              SingleEventArgsMapping<E2, A2> &
              SingleEventArgsMapping<E3, A3>
        : TEvent extends {
              (event: infer E0, listener: (...args: infer A0) => void);
              (event: infer E1, listener: (...args: infer A1) => void);
              (event: infer E2, listener: (...args: infer A2) => void);
              (event: string, listener: (...args: any[]) => void);
          }
        ? SingleEventArgsMapping<E0, A0> &
              SingleEventArgsMapping<E1, A1> &
              SingleEventArgsMapping<E2, A2>
        : TEvent extends {
              (event: infer E0, listener: (...args: infer A0) => void);
              (event: infer E1, listener: (...args: infer A1) => void);
              (event: string, listener: (...args: any[]) => void);
          }
        ? SingleEventArgsMapping<E0, A0> & SingleEventArgsMapping<E1, A1>
        : TEvent extends {
              (event: infer E0, listener: (...args: infer A0) => void);
              (event: string, listener: (...args: any[]) => void);
          }
        ? SingleEventArgsMapping<E0, A0>
        : SingleEventArgsMapping<string, any[]>;

export type SingleEventArgsMapping<TEventKey, TListenerArgs extends any[]> = TEventKey extends string
    ? {
          [TK in TEventKey]: TListenerArgs;
      }
    : never;

export type TypedEmit<TThis, TEvent> = keyof EventArgsMapping<TEvent> extends string
? <
    TEventKey extends keyof EventArgsMapping<TEvent>,
>(
    event: TEventKey,
    ...args: ReplaceIEventThisPlaceHolder<EventArgsMapping<TEvent>[TEventKey], TThis>
) => boolean
: never;

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

        this.emit = super.emit.bind(this) as TypedEmit<this, TEvent & IEvent>;
    }
    readonly addListener: TypedEventTransform<this, TEvent>;
    readonly on: TypedEventTransform<this, TEvent>;
    readonly once: TypedEventTransform<this, TEvent>;
    readonly prependListener: TypedEventTransform<this, TEvent>;
    readonly prependOnceListener: TypedEventTransform<this, TEvent>;
    readonly removeListener: TypedEventTransform<this, TEvent>;
    readonly off: TypedEventTransform<this, TEvent>;

    readonly emit: TypedEmit<this, TEvent>;
}
