/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { EventEmitter } from "events";
import { IEvent, TransformedEvent, IEventTransformer, IEventProvider } from "@fluidframework/common-definitions";

// the event emitter polyfill and the node event emitter have different event types:
// string | symbol vs. string | number
// this allow us to correctly handle either type
export type EventEmitterEventType = EventEmitter extends { on(event: infer E, listener: any); } ? E : never;

export type TypedEventTransform<TThis, TEvent> =
    // Event emitter supports some special events for the emitter itself to use
    // this exposes those events for the TypedEventEmitter.
    // Since we know what the shape of these events are, we can describe them directly via a TransformedEvent
    // which easier than trying to extend TEvent directly
    // eslint-disable-next-line max-len
    TransformedEvent<TThis, "newListener" | "removeListener", Parameters<(event: string, listener: (...args: any[]) => void) => void>> &
    // Expose all the events provides by TEvent
    IEventTransformer<TThis, TEvent & IEvent> &
    // Add the default overload so this is covertable to EventEmitter regardless of environment
    TransformedEvent<TThis, EventEmitterEventType, any[]>;

/**
 * Event Emitter helper class the supports emitting typed events
 */
export class TypedEventEmitter<TEvent> extends EventEmitter implements IEventProvider<TEvent & IEvent> {
    constructor() {
        super();
        this.addListener = super.addListener.bind(this) as TypedEventTransform<this, TEvent>;
        this.on = super.on.bind(this) as TypedEventTransform<this, TEvent>;
        this.once = super.once.bind(this) as TypedEventTransform<this, TEvent>;
        this.prependListener = super.prependListener.bind(this) as TypedEventTransform<this, TEvent>;
        this.prependOnceListener = super.prependOnceListener.bind(this) as TypedEventTransform<this, TEvent>;
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
