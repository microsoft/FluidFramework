/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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
 * {@link @fluidframework/core-utils#createEmitter} can help implement this interface via delegation.
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
