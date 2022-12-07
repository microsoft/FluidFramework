/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UnionToIntersection } from "../util";

/**
 * `true` if the given type is an acceptable shape for an event, otherwwise `false`;
 */
export type IsEvent<Event> = Event extends (...args: any[]) => void ? true : false;

/**
 * Returns a type which contains only the event-like properties of `Events` (i.e. they satisfy {@link IsEvent}).
 */
export type EventFilter<Events> = {
    [P in (string | symbol) & keyof Events as IsEvent<Events[P]> extends true
        ? P
        : never]: Events[P];
};

/**
 * Converts an `Events` object (i.e. the event registry for an {@link IEventEmitter}) into a type consumable
 * by an IEventProvider (from `@fluidframework/common-definitions`).
 * @example
 * ```typescript
 * interface MyEvents {
 *   load: (user: string, data: IUserData) => void;
 *   error: (errorCode: number) => void;
 * }
 *
 * class MySharedObject extends SharedObject<TransformEvents<MyEvents>> {
 *    // ...
 * }
 * ```
 */
export type TransformEvents<Events extends EventFilter<Events>> = {
    [P in keyof Events]: (event: P, listener: Events[P]) => void;
} extends Record<any, infer Z>
    ? UnionToIntersection<Z>
    : never;

/**
 * An object which allows the registration of listeners so that subscribers can be notified when an event happens
 * @param Events - All the events that this emitter supports
 * @example
 * ```typescript
 * type MyEventEmitter = IEventEmitter<{
 *   load: (user: string, data: IUserData) => void;
 *   error: (errorCode: number) => void;
 * }>
 * ```
 */
export interface IEventEmitter<Events extends EventFilter<Events>> {
    /**
     * Register an event listener
     * @param eventName - the name of the event
     * @param listener - the handler to run when the event is fired by the emitter
     * @returns a function which will deregister the listener when run
     */
    on<K extends (string | symbol) & keyof EventFilter<Events>>(
        eventName: K,
        listener: Events[K],
    ): () => void;
}

/**
 * A class specifying the minimal operations required to implement an {@link IEventEmitter}
 */
export abstract class EventEmitter<Events extends EventFilter<Events>>
    implements IEventEmitter<Events>
{
    /**
     * Fire the given event, notifying all suscribers by calling their registered listener functions
     * @param eventName - the name of the event to fire
     * @param args - the arguments passed to the event listener functions
     */
    protected abstract emit<K extends (string | symbol) & keyof EventFilter<Events>>(
        eventName: K,
        ...args: Parameters<Events[K]>
    ): void;

    /**
     * Register an event listener
     * @param eventName - the name of the event
     * @param listener - the handler to run when the event is fired by the emitter
     * @param persistance - whether or not the listener should be removed after it is fired the first time
     * @param position - whether the listener should be appended to the beginning or the end of the list of existing listeners. Listeners are fired in the order of the list.
     * @returns a function which will deregister the listener when run
     */
    public abstract on<K extends (string | symbol) & keyof EventFilter<Events>>(
        eventName: K,
        listener: Events[K],
    ): () => void;
}

/**
 * Advantages over TypedEventEmitter:
 * - Syntactically simpler to make events (object notation vs function interface)
 * - emit is strongly typed
 * - Allows easy deregistration
 * - Less code
 * - Interface only demands a single method, which handles both registration and deregistration. This encourages composition over inheritance since composition is easy.
 */
