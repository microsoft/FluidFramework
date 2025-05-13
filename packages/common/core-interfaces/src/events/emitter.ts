/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Listeners } from "./listeners.js";

/**
 * Interface for an event emitter that can emit typed events to subscribed listeners.
 * @internal
 */
export interface IEmitter<TListeners extends Listeners<TListeners>> {
	/**
	 * Emits an event with the specified name and arguments, notifying all subscribers by calling their registered listener functions.
	 * @param eventName - The name of the event to fire
	 * @param args - The arguments passed to the event listener functions
	 */
	emit<K extends keyof Listeners<TListeners>>(
		eventName: K,
		...args: Parameters<TListeners[K]>
	): void;

	/**
	 * Emits an event with the specified name and arguments, notifying all subscribers by calling their registered listener functions.
	 * It also collects the return values of all listeners into an array.
	 *
	 * @remarks
	 * Warning: This method should be used with caution. It deviates from the standard event-based integration pattern as creates substantial coupling between the emitter and its listeners.
	 * For the majority of use-cases it is recommended to use the standard {@link IEmitter.emit} functionality.
	 * @param eventName - The name of the event to fire
	 * @param args - The arguments passed to the event listener functions
	 * @returns An array of the return values of each listener, preserving the order listeners were called.
	 */
	emitAndCollect<K extends keyof Listeners<TListeners>>(
		eventName: K,
		...args: Parameters<TListeners[K]>
	): ReturnType<TListeners[K]>[];
}

/**
 * Called when the last listener for a given `eventName` is removed.
 * @remarks
 * Useful for determining when to clean up resources related to detecting when the event might occurs.
 * @internal
 */
export type NoListenersCallback<TListeners extends object> = (
	eventName: keyof Listeners<TListeners>,
) => void;

/**
 * Allows querying if an object has listeners.
 * @sealed
 * @internal
 */
export interface HasListeners<TListeners extends Listeners<TListeners>> {
	/**
	 * Determines whether or not any listeners are registered for the specified event name.
	 *
	 * @remarks
	 * If no event name is given, checks if *any* listeners are registered.
	 * This can be used to know when its safe to cleanup data-structures which only exist to fire events for their listeners.
	 */
	hasListeners(eventName?: keyof Listeners<TListeners>): boolean;
}

/**
 * Subset of Map interface including only the `get` and `set` methods.
 * @internal
 */
export interface MapGetSet<K, V> {
	get(key: K): V | undefined;
	set(key: K, value: V): void;
}
