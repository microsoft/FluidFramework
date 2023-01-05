/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IEvent } from "@fluidframework/common-definitions";

/**
 * Convert a union of types to an intersection of those types. Useful for `TransformEvents`.
 */
export type UnionToIntersection<T> = (T extends any ? (k: T) => unknown : never) extends (
    k: infer U,
) => unknown
    ? U
    : never;

/**
 * `true` iff the given type is an acceptable shape for an event
 */
export type IsEvent<Event> = Event extends (...args: any[]) => any ? true : false;

/**
 * Used to specify the kinds of events emitted by an {@link IEventEmitter}.
 * @example
 * ```ts
 * interface MyEvents {
 *   load: (user: string, data: IUserData) => void;
 *   error: (errorCode: number) => void;
 * }
 * ```
 * Any object type is a valid {@link Events}, but only the event-like properties of that
 * type will be included.
 */
export type Events<E> = {
    [P in (string | symbol) & keyof E as IsEvent<E[P]> extends true ? P : never]: E[P];
};

/**
 * Converts an `Events` type (i.e. the event registry for an {@link IEventEmitter}) into a type consumable
 * by an IEventProvider from `@fluidframework/common-definitions`.
 * @param E - the `Events` type to transform
 * @param Target - an optional `IEvent` type that will be merged into the result along with the transformed `E`
 * @example
 * ```ts
 * interface MyEvents {
 *   load: (user: string, data: IUserData) => void;
 *   error: (errorCode: number) => void;
 * }
 *
 * class MySharedObject extends SharedObject<TransformEvents<MyEvents, ISharedObjectEvents>> {
 *    // ...
 * }
 * ```
 */
export type TransformEvents<E extends Events<E>, Target extends IEvent = IEvent> = {
    [P in keyof Events<E>]: (event: P, listener: E[P]) => void;
} extends Record<any, infer Z>
    ? UnionToIntersection<Z> & Target
    : never;

/**
 * An object which allows the registration of listeners so that subscribers can be notified when an event happens
 * @param E - All the events that this emitter supports
 * @example
 * ```ts
 * type MyEventEmitter = IEventEmitter<{
 *   load: (user: string, data: IUserData) => void;
 *   error: (errorCode: number) => void;
 * }>
 * ```
 */
export interface IEventEmitter<E extends Events<E>> {
    /**
     * Register an event listener
     * @param eventName - the name of the event
     * @param listener - the handler to run when the event is fired by the emitter
     * @returns a function which will deregister the listener when run
     */
    on<K extends keyof Events<E>>(eventName: K, listener: E[K]): () => void;
}

/**
 * Provides an API for subscribing to and listening to events.
 * Classes wishing to emit events may either extend this class:
 * @example
 * ```ts
 * interface MyEvents {
 *   "loaded": () => void;
 * }
 *
 * class MyClass extends EventEmitter<MyEvents> {
 *   private load() {
 *     this.emit("loaded");
 *   }
 * }
 * ```
 * Or, compose over it:
 * @example
 * ```ts
 * class MyClass extends IEventEmitter<MyEvents> {
 *   private readonly events = EventEmitter.create<MyEvents>();
 *
 *   private load() {
 *     this.events.emit("loaded");
 *   }
 *
 *   public on<K extends (string | symbol) & keyof MyEvents>(
 *     eventName: K,
 *     listener: MyEvents[K],
 *   ): () => void {
 *     return events.on(eventName, listener);
 *   }
 * }
 * ```
 */
export class EventEmitter<E extends Events<E>> implements IEventEmitter<E> {
    private readonly listeners: Partial<{
        [P in keyof E]: Set<E[P]>;
    }> = {};

    /**
     * Create an instance of an {@link EventEmitter}.
     */
    public static create<E extends Events<E>>() {
        return new EventEmitter() as EventEmitter<E> & {
            // Expose the `emit` method so that it may be called by the creator.
            emit: EventEmitter<E>["emit"];
        };
    }

    // The constructor is private to seal the class as well as to require use of the static `create` function
    private constructor() {}

    /**
     * Fire the given event, notifying all subscribers by calling their registered listener functions
     * @param eventName - the name of the event to fire
     * @param args - the arguments passed to the event listener functions
     */
    protected emit<K extends keyof Events<E>>(eventName: K, ...args: Parameters<E[K]>): void {
        const listeners = this.listeners[eventName];
        if (listeners !== undefined) {
            const argArray: unknown[] = args; // TODO: Current TS (4.5.5) cannot spread `args` into `listener()`, but future versions (e.g. 4.8.4) can.
            for (const listener of listeners.values()) {
                listener(...argArray);
            }
        }
    }

    /**
     * Register an event listener
     * @param eventName - the name of the event
     * @param listener - the handler to run when the event is fired by the emitter
     * @returns a function which will deregister the listener when run
     */
    public on<K extends keyof Events<E>>(eventName: K, listener: E[K]): () => void {
        const listeners = this.listeners[eventName];
        if (listeners !== undefined) {
            listeners.add(listener);
        } else {
            this.listeners[eventName] = new Set([listener]);
        }

        return this.off.bind(this, eventName, listener);
    }

    private off<K extends keyof Events<E>>(eventName: K, listener: E[K]): void {
        const listeners = this.listeners[eventName];
        if (listeners !== undefined) {
            listeners.delete(listener);
            if (listeners.size === 0) {
                this.listeners[eventName] = undefined;
            }
        }
    }
}
