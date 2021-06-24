/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import {
    EventHandler,
    EventName,
    EventSubscribe,
    IEventEmittable,
    IEventProvider,
} from "@fluidframework/runtime-definitions";

export type OmittedEventEmitterMembers =
    | keyof IEventProvider<any>
    | keyof IEventEmittable<any>
    | "removeAllListeners"
    | "listeners"
    | "listenerCount";

// Note: Need to intersect TEvents instead of Omit<TEvents, "error">,
// because otherwise base class event contracts cannot be emitted.
// Consequence is that custom error contracts override the generic error
// that can be emitted by EventEmitter by unhandled errors, which would
// be nice to include in the listener typings.
/** Helper type to include common error events. */
export type IncludeErrorEvents<TEvents> = TEvents & {
    error: TEvents extends { error: infer A }
        ? [error: any] | A
        : [error: any];
};

/** Helper type to include all EventEmitter events. */
export type EventEmitterEvents<TEvents, TThis> = IncludeErrorEvents<TEvents> & {
    newListener: [
        event: EventName<IncludeErrorEvents<TEvents>>,
        listener: EventHandler<IncludeErrorEvents<TEvents>, TThis>,
    ];
    // Attempting to correlate the event type with the listener type doesn't work.
    removeListener<K extends keyof IncludeErrorEvents<TEvents>>(
        event: EventName<IncludeErrorEvents<TEvents>, K>,
        listener: EventHandler<IncludeErrorEvents<TEvents>, TThis, K>,
    ): void;
};

/** Helper type to get the listener function signature including all EventEmitter events. */
export type EventEmitterSubscribe<TEvents, TThis> = EventSubscribe<EventEmitterEvents<TEvents, TThis>, TThis>;

export interface IEventEmitter<TEvents>
    extends Omit<EventEmitter, OmittedEventEmitterMembers>,
        IEventProvider<TEvents>,
        IEventEmittable<TEvents> {
    new (): this;
    readonly on: EventEmitterSubscribe<TEvents, this>;
    readonly off: EventEmitterSubscribe<TEvents, this>;
    readonly once: EventEmitterSubscribe<TEvents, this>;
    readonly addListener: EventEmitterSubscribe<TEvents, this>;
    readonly removeListener: EventEmitterSubscribe<TEvents, this>;
    readonly prependListener: EventEmitterSubscribe<TEvents, this>;
    readonly prependOnceListener: EventEmitterSubscribe<TEvents, this>;
    removeAllListeners<TKey extends keyof EventEmitterEvents<TEvents, this>>(
        event?: EventName<EventEmitterEvents<TEvents, this>, TKey>,
    ): this;
    listeners<
        TKey extends keyof EventEmitterEvents<TEvents, this>,
        TArgs extends EventEmitterEvents<TEvents, this>[TKey] = EventEmitterEvents<TEvents, this>[TKey]
    >(
        event: EventName<EventEmitterEvents<TEvents, this>, TKey>
    ): EventHandler<EventEmitterEvents<TEvents, this>, this, TKey, TArgs>[];
    listenerCount<TKey extends keyof EventEmitterEvents<TEvents, this>>(
        event: EventName<EventEmitterEvents<TEvents, this>, TKey>,
    ): number;
}

export const TypedEventEmitter = EventEmitter as unknown as new <TEvents>() => IEventEmitter<TEvents>;
