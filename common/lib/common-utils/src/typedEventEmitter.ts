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

/** Converting from IEvent shape to EventSpec shape. Might allow for easier transition to EventSpec */
export type ToEventArgsMappingCore<TEvent extends IEvent> =
    // ...Start with all 15 like IEventTransformer
    TEvent extends
    {
        (event: infer E0, listener: (...args: infer A0) => void),
        (event: infer E1, listener: (...args: infer A1) => void),
        (event: infer E2, listener: (...args: infer A2) => void),
        (event: infer E3, listener: (...args: infer A3) => void),
        (event: string, listener: (...args: any[]) => void),
    }
    ? SingleEventArgsMapping<E0, A0> & SingleEventArgsMapping<E1, A1> & SingleEventArgsMapping<E2, A2> & SingleEventArgsMapping<E3, A3>
    : TEvent extends
    {
        (event: infer E0, listener: (...args: infer A0) => void),
        (event: infer E1, listener: (...args: infer A1) => void),
        (event: infer E2, listener: (...args: infer A2) => void),
        (event: string, listener: (...args: any[]) => void),
    }
    ? SingleEventArgsMapping<E0, A0> & SingleEventArgsMapping<E1, A1> & SingleEventArgsMapping<E2, A2>
    : TEvent extends
    {
        (event: infer E0, listener: (...args: infer A0) => void),
        (event: infer E1, listener: (...args: infer A1) => void),
        (event: string, listener: (...args: any[]) => void),
    }
    ? SingleEventArgsMapping<E0, A0> & SingleEventArgsMapping<E1, A1>
    : TEvent extends
    {
        (event: infer E0, listener: (...args: infer A0) => void),
        (event: string, listener: (...args: any[]) => void),
    }
    ? SingleEventArgsMapping<E0, A0>
    : SingleEventArgsMapping<string, any[]>
    ;

export type ToEventArgsMapping<TEvent> =
    ToEventArgsMappingCore<TEvent & IEvent> &
    SingleEventArgsMapping<"addListener", [event: string, listener: (...args: any[]) => void]> &
    SingleEventArgsMapping<"removeListener", [event: string, listener: (...args: any[]) => void]>;
    //* Uncomment this to allow emitting anything. But themn emit loses intellisense for event keys
    // & EventSpecEntry<string, any[]>;

export type SingleEventArgsMapping<TEventKey, TListenerArgs extends any[]> =
    TEventKey extends string ?
    {
        [TK in TEventKey]: TListenerArgs;
    }
    : never;

type StringKeys<TEventSpec> =
    keyof TEventSpec extends string ?
            keyof TEventSpec
 : never
;

/** Signature for emit */
export type EventEmitSignatures_Orig<TThis, TEvent> =
    <TEventKey extends StringKeys<ToEventArgsMapping<TEvent>>>(
        event: TEventKey,
        ...args: ReplaceIEventThisPlaceHolder<ToEventArgsMapping<TEvent>[TEventKey], TThis>
    ) => boolean;

    export type ToEventArgsArrayCore<TEvent extends IEvent> =
    // ...Start with all 15 like IEventTransformer
    TEvent extends
    {
        (event: infer E0, listener: (...args: infer A0) => void),
        (event: infer E1, listener: (...args: infer A1) => void),
        (event: infer E2, listener: (...args: infer A2) => void),
        (event: infer E3, listener: (...args: infer A3) => void),
        (event: string, listener: (...args: any[]) => void),
    }
    ? SingleEventArgsArray<E0, A0> | SingleEventArgsArray<E1, A1> | SingleEventArgsArray<E2, A2> | SingleEventArgsArray<E3, A3>
    : TEvent extends
    {
        (event: infer E0, listener: (...args: infer A0) => void),
        (event: infer E1, listener: (...args: infer A1) => void),
        (event: infer E2, listener: (...args: infer A2) => void),
        (event: string, listener: (...args: any[]) => void),
    }
    ? SingleEventArgsArray<E0, A0> | SingleEventArgsArray<E1, A1> | SingleEventArgsArray<E2, A2>
    : TEvent extends
    {
        (event: infer E0, listener: (...args: infer A0) => void),
        (event: infer E1, listener: (...args: infer A1) => void),
        (event: string, listener: (...args: any[]) => void),
    }
    ? SingleEventArgsArray<E0, A0> | SingleEventArgsArray<E1, A1>
    : TEvent extends
    {
        (event: infer E0, listener: (...args: infer A0) => void),
        (event: string, listener: (...args: any[]) => void),
    }
    ? SingleEventArgsArray<E0, A0>
    : SingleEventArgsArray<string, any[]>
    ;

export type ToEventArgsArray<TEvent> =
    ToEventArgsArrayCore<TEvent & IEvent> |
    SingleEventArgsArray<"addListener", [event: string, listener: (...args: any[]) => void]> |
    SingleEventArgsArray<"removeListener", [event: string, listener: (...args: any[]) => void]>;
    //* Uncomment this to allow emitting anything. But themn emit loses intellisense for event keys
    // & EventSpecEntry<string, any[]>;

type AM =
    SingleEventArgsMapping<"removeListener", [event: string, listener: (...args: any[]) => void]>;


type AA =
    SingleEventArgsArray<"removeListener", [event: string, listener: (...args: any[]) => void]>;

type B =
    ToEventArgsArray<IOldEvents>;

export type SingleEventArgsArray<TEventKey, TListenerArgs extends any[]> =
    TEventKey extends string ?
    [TEventKey, TListenerArgs] //* ORiginally tried spreading [TEventKey, ...TListenerArgs] but this loses the named tuple members
    : never;

type EventEmitSignatures<TThis, TEvent> =
    ToEventArgsArray<TEvent> extends [event: infer TKey, args: [...rest: infer TRest]]
    ?
    <TKey2 extends TKey>(
        event: TKey2,
        ...args: TRest
        // ...args: ReplaceIEventThisPlaceHolder<ToEventArgsArray<TEvent>, TThis>
    ) => boolean
    :
    never;

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

        this.emit = super.emit.bind(this) as EventEmitSignatures<this, TEvent & IEvent>;
    }
    readonly addListener: TypedEventTransform<this, TEvent>;
    readonly on: TypedEventTransform<this, TEvent>;
    readonly once: TypedEventTransform<this, TEvent>;
    readonly prependListener: TypedEventTransform<this, TEvent>;
    readonly prependOnceListener: TypedEventTransform<this, TEvent>;
    readonly removeListener: TypedEventTransform<this, TEvent>;
    readonly off: TypedEventTransform<this, TEvent>;

    readonly emit: EventEmitSignatures<this, TEvent>;
}

export interface IOldEvents extends IEvent {
    (event: "asdf", listener: (y: boolean, z: string) => void);
    (event: "qwer", listener: () => void);
}

const tee1: TypedEventEmitter<IOldEvents> = new TypedEventEmitter();

tee1.emit("asdf", )
