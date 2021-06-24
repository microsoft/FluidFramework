/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export declare const eventKey: unique symbol;

/** Transforms by substituting the polymorphic "this" type */
export interface EventThis { [eventKey]: "this" }
/**
 * Transforms by substituting the exact literal type.
 * This should be used for complex/generic types that
 * aren't sure if they should be transformed or not.
 */
export interface EventLiteral<L> { [eventKey]: "literal", type: L }

/** Type that transforms an individual event argument. */
export type EventTransform<T, TThis> = T extends EventThis ? TThis : T extends EventLiteral<infer L> ? L : T;

/**
 * Transforms the event contract for IEventEmitter.
 * Supports an array type or function signature.
 */
export type EventArgs<T, TThis> =
    T extends any[]
    ? { [K in keyof T]: EventTransform<T[K], TThis> }
    : T extends (...args: infer A) => any
    ? { [K in keyof A]: EventTransform<A[K], TThis> }
    : T;

/** Gets the valid event names from an event contract. */
export type EventName<
    TEvents,
    TKey extends keyof TEvents = keyof TEvents
> = TKey extends string | number ? TKey : never;

/** Gets the event handler types from an event contract. */
export type EventHandler<
    TEvents,
    TThis,
    TKey extends keyof TEvents = keyof TEvents,
    TArgs extends TEvents[TKey] = TEvents[TKey]
> = (...args: EventArgs<TArgs, TThis>) => void;

/** Gets the listener function signatures from an event contract. */
export type EventSubscribe<TEvents, TThis> = <
    TKey extends keyof TEvents = keyof TEvents,
    TArgs extends TEvents[TKey] = TEvents[TKey]
>(
    event: EventName<TEvents, TKey>,
    listener: EventHandler<TEvents, TThis, TKey, TArgs>,
) => TThis;

/** Object which emits strongly typed listenable events. */
export interface IEventProvider<TEvents> {
    readonly on: EventSubscribe<TEvents, this>;
    readonly off: EventSubscribe<TEvents, this>;
    readonly once: EventSubscribe<TEvents, this>;
    readonly addListener: EventSubscribe<TEvents, this>;
    readonly removeListener: EventSubscribe<TEvents, this>;
    readonly prependListener: EventSubscribe<TEvents, this>;
    readonly prependOnceListener: EventSubscribe<TEvents, this>;
}

/** Common error event contract for general errors. */
export interface IErrorEvents {
    error: [error: any];
}
