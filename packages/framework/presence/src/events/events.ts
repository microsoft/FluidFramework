/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IEvent } from "@fluidframework/core-interfaces";
import type { UnionToIntersection } from "@fluidframework/core-utils";

/**
 * `true` iff the given type is an acceptable shape for an event
 * @alpha
 */
export type IsEvent<Event> = Event extends (...args: any[]) => any ? true : false;

/**
 * Used to specify the kinds of events emitted by an {@link ISubscribable}.
 *
 * @remarks
 *
 * Any object type is a valid {@link Events}, but only the event-like properties of that
 * type will be included.
 *
 * @example
 *
 * ```typescript
 * interface MyEvents {
 *   load: (user: string, data: IUserData) => void;
 *   error: (errorCode: number) => void;
 * }
 * ```
 *
 * @alpha
 */
export type Events<E> = {
	[P in (string | symbol) & keyof E as IsEvent<E[P]> extends true ? P : never]: E[P];
};

/**
 * Converts an `Events` type (i.e. the event registry for an {@link ISubscribable}) into a type consumable
 * by an IEventProvider from `@fluidframework/core-interfaces`.
 * @param E - the `Events` type to transform
 * @param Target - an optional `IEvent` type that will be merged into the result along with the transformed `E`
 *
 * @example
 *
 * ```typescript
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
 * An object which allows the registration of listeners so that subscribers can be notified when an event happens.
 *
 * `EventEmitter` can be used as a base class to implement this via extension.
 * @param E - All the events that this emitter supports
 * @example
 * ```ts
 * type MyEventEmitter = IEventEmitter<{
 *   load: (user: string, data: IUserData) => void;
 *   error: (errorCode: number) => void;
 * }>
 * ```
 * @privateRemarks
 * {@link createEmitter} can help implement this interface via delegation.
 *
 * @alpha
 */
export interface ISubscribable<E extends Events<E>> {
	/**
	 * Register an event listener.
	 * @param eventName - the name of the event
	 * @param listener - the handler to run when the event is fired by the emitter
	 * @returns a function which will deregister the listener when run. This function has undefined behavior
	 * if called more than once.
	 */
	on<K extends keyof Events<E>>(eventName: K, listener: E[K]): () => void;
}
