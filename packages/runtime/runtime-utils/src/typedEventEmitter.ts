/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import {
    EventArgs,
    EventHandler,
    EventName,
    IErrorEvents,
    IEventProvider,
} from "@fluidframework/runtime-definitions";

export type OmittedEventEmitterMembers =
    | keyof IEventProvider<unknown>
    | "emit"
    | "removeAllListeners"
    | "listeners"
    | "listenerCount";

export interface IEventEmitterEvents<TEvents> extends IErrorEvents {
    // NOTE: listener is type CallableFunction instead of EventHandler<TEvents>
    // because that breaks listening to the newListener and removeListener with generics.
    newListener: [event: EventName<TEvents>, listener: CallableFunction];
    removeListener: [event: EventName<TEvents>, listener: CallableFunction];
}

export interface IEventEmitter<
    TEvents,
    AllEvents extends TEvents & IEventEmitterEvents<TEvents> = TEvents & IEventEmitterEvents<TEvents>
> extends Omit<EventEmitter, OmittedEventEmitterMembers>, IEventProvider<AllEvents> {
    new (): this;
    emit<
        TKey extends keyof TEvents,
        TArgs extends TEvents[TKey] = TEvents[TKey]
    >(
        event: EventName<TEvents, TKey>,
        ...args: EventArgs<TArgs, this>
    ): boolean;
    removeAllListeners<TKey extends keyof AllEvents>(event?: EventName<AllEvents, TKey>): this;
    listeners<
        TKey extends keyof AllEvents,
        TArgs extends AllEvents[TKey] = AllEvents[TKey]
    >(
        event: EventName<AllEvents, TKey>
    ): EventHandler<AllEvents, this, TKey, TArgs>[];
    listenerCount<TKey extends keyof AllEvents>(event: EventName<AllEvents, TKey>): number;
}

export const TypedEventEmitter = EventEmitter as unknown as new <TEvents>() => IEventEmitter<TEvents>;
