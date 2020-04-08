
/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { EventEmitter } from "events";
import {
    IEventProvider,
    IEvent,
    IEventTransformer,
    TransformedEvent,
} from "@microsoft/fluid-common-definitions";


export type TypedEventTransform<TTHis, TEvent extends IEvent> =
    IEventTransformer<TTHis, TEvent> &
    // eslint-disable-next-line max-len
    TransformedEvent<TTHis,"newListener" | "removeListener", Parameters<(event: string, listener: (...args: any[]) => void) => void>>;


/**
 * Event Emitter helper class the supports emitting typed events
 */
export class TypedEventEmitter<TEvent extends IEvent> extends EventEmitter implements IEventProvider<TEvent> {

    constructor(){
        super();
        this.addListener = super.addListener.bind(this) as TypedEventTransform<this, TEvent>;
        this.on = super.on.bind(this) as  TypedEventTransform<this, TEvent>;
        this.once = super.once.bind(this) as  TypedEventTransform<this, TEvent>;
        this.prependListener = super.prependListener.bind(this) as  TypedEventTransform<this, TEvent>;
        this.prependOnceListener = super.prependOnceListener.bind(this) as  TypedEventTransform<this, TEvent>;
        this.removeListener = super.removeListener.bind(this) as  TypedEventTransform<this, TEvent>;
        this.off = super.off.bind(this) as  TypedEventTransform<this, TEvent>;
    }
    readonly addListener: TypedEventTransform<this, TEvent>;
    readonly on: TypedEventTransform<this, TEvent>;
    readonly once: TypedEventTransform<this, TEvent>;
    readonly prependListener: TypedEventTransform<this, TEvent>;
    readonly prependOnceListener: TypedEventTransform<this, TEvent>;
    readonly removeListener: TypedEventTransform<this, TEvent>;
    readonly off: TypedEventTransform<this, TEvent>;
}
