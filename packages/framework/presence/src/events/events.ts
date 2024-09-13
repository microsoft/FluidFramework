/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This file is a clone of the `events.ts` file from the `@fluidframework/tree` package.
 * `@public` APIs have been changed to `@alpha` and some lint defects from more strict rules
 * have been fixed or suppressed.
 */

import type { IEvent } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";

function fail(message: string): never {
	throw new Error(message);
}

/**
 * Retrieve a value from a map with the given key, or create a new entry if the key is not in the map.
 * @param map - The map to query/update
 * @param key - The key to lookup in the map
 * @param defaultValue - a function which returns a default value. This is called and used to set an initial value for the given key in the map if none exists
 * @returns either the existing value for the given key, or the newly-created value (the result of `defaultValue`)
 */
function getOrCreate<K, V>(map: Map<K, V>, key: K, defaultValue: (key: K) => V): V {
	let value = map.get(key);
	if (value === undefined) {
		value = defaultValue(key);
		map.set(key, value);
	}
	return value;
}

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

/**
 * Interface for an event emitter that can emit typed events to subscribed listeners.
 * @internal
 */
export interface IEmitter<E extends Events<E>> {
	/**
	 * Emits an event with the specified name and arguments, notifying all subscribers by calling their registered listener functions.
	 * @param eventName - the name of the event to fire
	 * @param args - the arguments passed to the event listener functions
	 */
	emit<K extends keyof Events<E>>(eventName: K, ...args: Parameters<E[K]>): void;

	/**
	 * Emits an event with the specified name and arguments, notifying all subscribers by calling their registered listener functions.
	 * It also collects the return values of all listeners into an array.
	 *
	 * Warning: This method should be used with caution. It deviates from the standard event-based integration pattern as creates substantial coupling between the emitter and its listeners.
	 * For the majority of use-cases it is recommended to use the standard {@link IEmitter.emit} functionality.
	 * @param eventName - the name of the event to fire
	 * @param args - the arguments passed to the event listener functions
	 * @returns An array of the return values of each listener, preserving the order listeners were called.
	 */
	emitAndCollect<K extends keyof Events<E>>(
		eventName: K,
		...args: Parameters<E[K]>
	): ReturnType<E[K]>[];
}

/**
 * Create an {@link ISubscribable} that can be instructed to emit events via the {@link IEmitter} interface.
 *
 * A class can delegate handling {@link ISubscribable} to the returned value while using it to emit the events.
 * See also `EventEmitter` which be used as a base class to implement {@link ISubscribable} via extension.
 * @internal
 */
export function createEmitter<E extends Events<E>>(
	noListeners?: NoListenersCallback<E>,
): ISubscribable<E> & IEmitter<E> & HasListeners<E> {
	return new ComposableEventEmitter<E>(noListeners);
}

/**
 * Called when the last listener for `eventName` is removed.
 * Useful for determining when to clean up resources related to detecting when the event might occurs.
 * @internal
 */
export type NoListenersCallback<E extends Events<E>> = (eventName: keyof Events<E>) => void;

/**
 * @internal
 */
export interface HasListeners<E extends Events<E>> {
	/**
	 * When no `eventName` is provided, returns true iff there are any listeners.
	 *
	 * When `eventName` is provided, returns true iff there are listeners for that event.
	 *
	 * @remarks
	 * This can be used to know when its safe to cleanup data-structures which only exist to fire events for their listeners.
	 */
	hasListeners(eventName?: keyof Events<E>): boolean;
}

/**
 * Provides an API for subscribing to and listening to events.
 *
 * @remarks Classes wishing to emit events may either extend this class or compose over it.
 *
 * @example Extending this class
 *
 * ```typescript
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
 *
 * @example Composing over this class
 *
 * ```typescript
 * class MyClass implements ISubscribable<MyEvents> {
 *   private readonly events = EventEmitter.create<MyEvents>();
 *
 *   private load() {
 *     this.events.emit("loaded");
 *   }
 *
 *   public on<K extends keyof MyEvents>(eventName: K, listener: MyEvents[K]): () => void {
 *     return this.events.on(eventName, listener);
 *   }
 * }
 * ```
 */
export class EventEmitter<E extends Events<E>> implements ISubscribable<E>, HasListeners<E> {
	// TODO: because the inner data-structure here is a set, adding the same callback twice does not error,
	// but only calls it once, and unsubscribing will stop calling it all together.
	// This is surprising since it makes subscribing and unsubscribing not inverses (but instead both idempotent).
	// This might be desired, but if so the documentation should indicate it.
	private readonly listeners = new Map<keyof E, Set<(...args: unknown[]) => any>>();

	// Because this is protected and not public, calling this externally (not from a subclass) makes sending events to the constructed instance impossible.
	// Instead, use the static `create` function to get an instance which allows emitting events.
	protected constructor(private readonly noListeners?: NoListenersCallback<E>) {}

	protected emit<K extends keyof Events<E>>(eventName: K, ...args: Parameters<E[K]>): void {
		const listeners = this.listeners.get(eventName);
		if (listeners !== undefined) {
			const argArray: unknown[] = args; // TODO: Current TS (4.5.5) cannot spread `args` into `listener()`, but future versions (e.g. 4.8.4) can.
			// This explicitly copies listeners so that new listeners added during this call to emit will not receive this event.
			for (const listener of listeners) {
				// If listener has been unsubscribed while invoking other listeners, skip it.
				if (listeners.has(listener)) {
					listener(...argArray);
				}
			}
		}
	}

	protected emitAndCollect<K extends keyof Events<E>>(
		eventName: K,
		...args: Parameters<E[K]>
	): ReturnType<E[K]>[] {
		const listeners = this.listeners.get(eventName);
		if (listeners !== undefined) {
			const argArray: unknown[] = args;
			const resultArray: ReturnType<E[K]>[] = [];
			for (const listener of listeners.values()) {
				// listner return type is any to enable this.listeners to be a Map
				// of Sets rather than a Record with tracked (known) return types.
				// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
				resultArray.push(listener(...argArray));
			}
			return resultArray;
		}
		return [];
	}

	/**
	 * Register an event listener.
	 * @param eventName - the name of the event
	 * @param listener - the handler to run when the event is fired by the emitter
	 * @returns a function which will deregister the listener when run.
	 * This function will error if called more than once.
	 * @privateRemarks
	 * TODO:
	 * invoking the returned callback can error even if its only called once if the same listener was provided to two calls to "on".
	 * This behavior is not documented and its unclear if its a bug or not: see note on listeners.
	 */
	public on<K extends keyof Events<E>>(eventName: K, listener: E[K]): () => void {
		getOrCreate(this.listeners, eventName, () => new Set()).add(listener);
		return () => this.off(eventName, listener);
	}

	private off<K extends keyof Events<E>>(eventName: K, listener: E[K]): void {
		const listeners =
			this.listeners.get(eventName) ??
			// TODO: consider making this (and assert below) a usage error since it can be triggered by users of the public API: maybe separate those use cases somehow?
			fail("Event has no listeners. Event deregistration functions may only be invoked once.");
		assert(
			listeners.delete(listener),
			0xa30 /* Listener does not exist. Event deregistration functions may only be invoked once. */,
		);
		if (listeners.size === 0) {
			this.listeners.delete(eventName);
			this.noListeners?.(eventName);
		}
	}

	public hasListeners(eventName?: keyof Events<E>): boolean {
		if (eventName === undefined) {
			return this.listeners.size > 0;
		}
		return this.listeners.has(eventName);
	}
}

// This class exposes the constructor and the `emit` method of `EventEmitter`, elevating them from protected to public
class ComposableEventEmitter<E extends Events<E>>
	extends EventEmitter<E>
	implements IEmitter<E>
{
	public constructor(noListeners?: NoListenersCallback<E>) {
		super(noListeners);
	}

	public override emit<K extends keyof Events<E>>(
		eventName: K,
		...args: Parameters<E[K]>
	): void {
		return super.emit(eventName, ...args);
	}

	public override emitAndCollect<K extends keyof Events<E>>(
		eventName: K,
		...args: Parameters<E[K]>
	): ReturnType<E[K]>[] {
		return super.emitAndCollect(eventName, ...args);
	}
}
