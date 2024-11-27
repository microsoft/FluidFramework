/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * `true` iff the given type is an acceptable shape for a {@link Listeners | event} listener
 * @public
 */
export type IsListener<TListener> = TListener extends (...args: any[]) => void ? true : false;

/**
 * Used to specify the kinds of events emitted by a {@link Listenable}.
 *
 * @remarks
 * Any object type is a valid {@link Listeners}, but only the {@link IsListener | event-like} properties of that
 * type will be included.
 *
 * @example
 * ```typescript
 * interface MyEvents {
 *   load: (user: string, data: IUserData) => void;
 *   error: (errorCode: number) => void;
 * }
 * ```
 *
 * @public
 */
export type Listeners<T extends object> = {
	[P in (string | symbol) & keyof T as IsListener<T[P]> extends true ? P : never]: T[P];
};

/**
 * An object which allows the registration of listeners so that subscribers can be notified when an event happens.
 * @param TListeners - All the {@link Listeners | events} that this subscribable supports
 *
 * @privateRemarks
 * {@link @fluid-internal/client-utils#CustomEventEmitter} can be used as a base class to implement this via extension.
 * ```ts
 * type MyEventEmitter = IEmitter<{
 *   load: (user: string, data: IUserData) => void;
 *   error: (errorCode: number) => void;
 * }>
 * ```
 * {@link @fluid-internal/client-utils#createEmitter} can help implement this interface via delegation.
 *
 * @sealed @public
 */
export interface Listenable<TListeners extends object> {
	/**
	 * Register an event listener.
	 * @param eventName - The name of the event.
	 * @param listener - The listener function to run when the event is fired.
	 * @returns A {@link Off | function} which will deregister the listener when called.
	 * Calling the deregistration function more than once will have no effect.
	 *
	 * Listeners may also be deregistered by passing the listener to {@link Listenable.off | off()}.
	 * @remarks Registering the exact same `listener` object for the same event more than once will throw an error.
	 * If registering the same listener for the same event multiple times is desired, consider using a wrapper function for the second subscription.
	 */
	on<K extends keyof Listeners<TListeners>>(eventName: K, listener: TListeners[K]): Off;

	/**
	 * Deregister an event listener.
	 * @param eventName - The name of the event.
	 * @param listener - The listener function to remove from the current set of event listeners.
	 * @remarks If `listener` is not currently registered, this method will have no effect.
	 *
	 * Listeners may also be deregistered by calling the {@link Off | deregistration function} returned when they are {@link Listenable.on | registered}.
	 */
	off<K extends keyof Listeners<TListeners>>(eventName: K, listener: TListeners[K]): void;
}

/**
 * A function that, when called, will deregister an event listener subscription that was previously registered.
 * @remarks
 * It is returned by the {@link Listenable.on | event registration function} when event registration occurs.
 * @public
 */
export type Off = () => void;
