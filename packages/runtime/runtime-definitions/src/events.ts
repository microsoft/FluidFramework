/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export type ArrayOrNever<T> = T extends any[] ? T : never;

export type EventName<
    TEvents,
    TKey extends keyof TEvents = keyof TEvents
> = TKey extends string | number ? TKey : never;

export type EventHandler<
    TEvents,
    TKey extends keyof TEvents = keyof TEvents,
    TArgs extends TEvents[TKey] = TEvents[TKey]
> = (...args: ArrayOrNever<TArgs>) => void;

export type EventSubscribe<TEvents, TResult> = <
    TKey extends keyof TEvents = keyof TEvents,
    TArgs extends TEvents[TKey] = TEvents[TKey]
>(
    event: EventName<TEvents, TKey>,
    listener: EventHandler<TEvents, TKey, TArgs>,
) => TResult;

export interface IErrorEvents {
    error: [error: any];
}

export interface IEventProvider<TEvents> {
    readonly on: EventSubscribe<TEvents, this>;
    readonly off: EventSubscribe<TEvents, this>;
    readonly once: EventSubscribe<TEvents, this>;
    readonly addListener: EventSubscribe<TEvents, this>;
    readonly removeListener: EventSubscribe<TEvents, this>;
    readonly prependListener: EventSubscribe<TEvents, this>;
    readonly prependOnceListener: EventSubscribe<TEvents, this>;
}
