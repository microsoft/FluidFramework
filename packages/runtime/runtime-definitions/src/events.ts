/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export const eventThis = Symbol("EventThis");
export type EventThis = typeof eventThis;

/**
 * Supports an array type or function signature.
 * Array types will use the literal types as-is.
 * Function signatures will attempt to replace EventThis types with the
 * implementor of IEventProvider's this type to support polymorphism.
 */
export type EventArgs<T, TThis> =
    T extends any[]
    ? T
    : T extends (...args: infer A) => any
    ? { [K in keyof A]: A[K] extends EventThis ? TThis : A[K] }
    : T;

export type EventName<
    TEvents,
    TKey extends keyof TEvents = keyof TEvents
> = TKey extends string | number ? TKey : never;

export type EventHandler<
    TEvents,
    TThis,
    TKey extends keyof TEvents = keyof TEvents,
    TArgs extends TEvents[TKey] = TEvents[TKey]
> = (...args: EventArgs<TArgs, TThis>) => void;

export type EventSubscribe<TEvents, TThis> = <
    TKey extends keyof TEvents = keyof TEvents,
    TArgs extends TEvents[TKey] = TEvents[TKey]
>(
    event: EventName<TEvents, TKey>,
    listener: EventHandler<TEvents, TThis, TKey, TArgs>,
) => TThis;

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
