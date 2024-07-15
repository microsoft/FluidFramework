/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IEvent } from "@fluidframework/core-interfaces";
import { getOrCreate } from "../util/index.js";

/**
 * Convert a union of types to an intersection of those types. Useful for `TransformEvents`.
 * @privateRemarks
 * First an always true extends clause is used (T extends T) to distribute T into to a union of types contravariant over each member of the T union.
 * Then the constraint on the type parameter in this new context is inferred, giving the intersection.
 */
export type UnionToIntersection<T> = (T extends T ? (k: T) => unknown : never) extends (
	k: infer U,
) => unknown
	? U
	: never;

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
 * Converts a {@link Listeners} type (i.e. the event registry for a {@link Listenable}) into a type consumable
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
export type TransformListeners<
	TListeners extends Listeners<TListeners>,
	TTarget extends IEvent = IEvent,
> = {
	[P in keyof Listeners<TListeners>]: (event: P, listener: TListeners[P]) => void;
} extends Record<string | number | symbol, infer Z>
	? UnionToIntersection<Z> & TTarget
	: never;

/**
 * An object which allows the registration of listeners so that subscribers can be notified when an event happens.
 * @param TListeners - All the {@link Listeners | events} that this subscribable supports
 *
 * @privateRemarks
 * `EventEmitter` can be used as a base class to implement this via extension.
 * ```ts
 * type MyEventEmitter = IEventEmitter<{
 *   load: (user: string, data: IUserData) => void;
 *   error: (errorCode: number) => void;
 * }>
 * ```
 * {@link createEmitter} can help implement this interface via delegation.
 *
 * @sealed @public
 */
export interface Listenable<TListeners extends object> {
	/**
	 * Register an event listener.
	 * @param eventName - the name of the event
	 * @param listener - the handler to run when the event is fired by the emitter
	 * @returns a {@link Off | function} which will deregister the listener when called.
	 * This deregistration function is idempotent and therefore may be safely called more than once with no effect.
	 * @remarks Do not register the exact same `listener` object for the same event more than once.
	 * Doing so will result in undefined behavior, and is not guaranteed to behave the same in future versions of this library.
	 */
	on<K extends keyof Listeners<TListeners>>(eventName: K, listener: TListeners[K]): Off;
}

/**
 * A function that, when called, will deregister an event listener subscription that was previously registered.
 * @remarks
 * It is returned by the {@link Listenable.on | event registration function} when event registration occurs.
 * @public
 */
export type Off = () => void;

/**
 * Interface for an event emitter that can emit typed events to subscribed listeners.
 * @internal
 */
export interface IEmitter<TListeners extends Listeners<TListeners>> {
	/**
	 * Emits an event with the specified name and arguments, notifying all subscribers by calling their registered listener functions.
	 * @param eventName - the name of the event to fire
	 * @param args - the arguments passed to the event listener functions
	 */
	emit<K extends keyof Listeners<TListeners>>(
		eventName: K,
		...args: Parameters<TListeners[K]>
	): void;

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
	emitAndCollect<K extends keyof Listeners<TListeners>>(
		eventName: K,
		...args: Parameters<TListeners[K]>
	): ReturnType<TListeners[K]>[];
}

/**
 * Create a {@link Listenable} that can be instructed to emit events via the {@link IEmitter} interface.
 *
 * A class can delegate handling {@link Listenable} to the returned value while using it to emit the events.
 * See also `EventEmitter` which be used as a base class to implement {@link Listenable} via extension.
 * @internal
 */
export function createEmitter<TListeners extends object>(
	noListeners?: NoListenersCallback<TListeners>,
): Listenable<TListeners> & IEmitter<TListeners> & HasListeners<TListeners> {
	return new ComposableEventEmitter<TListeners>(noListeners);
}

/**
 * Called when the last listener for `eventName` is removed.
 * Useful for determining when to clean up resources related to detecting when the event might occurs.
 * @internal
 */
export type NoListenersCallback<TListeners extends object> = (
	eventName: keyof Listeners<TListeners>,
) => void;

/**
 * @internal
 */
export interface HasListeners<TListeners extends Listeners<TListeners>> {
	/**
	 * When no `eventName` is provided, returns true iff there are any listeners.
	 *
	 * When `eventName` is provided, returns true iff there are listeners for that event.
	 *
	 * @remarks
	 * This can be used to know when its safe to cleanup data-structures which only exist to fire events for their listeners.
	 */
	hasListeners(eventName?: keyof Listeners<TListeners>): boolean;
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
 *   public on<K extends keyof MyEvents>(eventName: K, listener: MyEvents[K]): Off {
 *     return this.events.on(eventName, listener);
 *   }
 * }
 * ```
 */
export class EventEmitter<TListeners extends Listeners<TListeners>>
	implements Listenable<TListeners>, HasListeners<TListeners>
{
	protected readonly listeners = new Map<
		keyof TListeners,
		Map<Off, (...args: any[]) => TListeners[keyof TListeners]>
	>();

	// Because this is protected and not public, calling this externally (not from a subclass) makes sending events to the constructed instance impossible.
	// Instead, use the static `create` function to get an instance which allows emitting events.
	protected constructor(private readonly noListeners?: NoListenersCallback<TListeners>) {}

	protected emit<K extends keyof TListeners>(
		eventName: K,
		...args: Parameters<TListeners[K]>
	): void {
		const listeners = this.listeners.get(eventName);
		if (listeners !== undefined) {
			const argArray: unknown[] = args; // TODO: Current TS (4.5.5) cannot spread `args` into `listener()`, but future versions (e.g. 4.8.4) can.
			// This explicitly copies listeners so that new listeners added during this call to emit will not receive this event.
			for (const [off, listener] of [...listeners]) {
				// If listener has been unsubscribed while invoking other listeners, skip it.
				if (listeners.has(off)) {
					listener(...argArray);
				}
			}
		}
	}

	protected emitAndCollect<K extends keyof TListeners>(
		eventName: K,
		...args: Parameters<TListeners[K]>
	): ReturnType<TListeners[K]>[] {
		const listeners = this.listeners.get(eventName);
		if (listeners !== undefined) {
			const argArray: unknown[] = args;
			const resultArray: ReturnType<TListeners[K]>[] = [];
			for (const listener of [...listeners.values()]) {
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
	 */
	public on<K extends keyof Listeners<TListeners>>(
		eventName: K,
		listener: TListeners[K],
	): Off {
		const off: Off = () => {
			const currentListeners = this.listeners.get(eventName);
			if (currentListeners?.delete(off) === true) {
				if (currentListeners.size === 0) {
					this.listeners.delete(eventName);
					this.noListeners?.(eventName);
				}
			}
		};

		getOrCreate(this.listeners, eventName, () => new Map()).set(off, listener);
		return off;
	}

	public hasListeners(eventName?: keyof TListeners): boolean {
		if (eventName === undefined) {
			return this.listeners.size !== 0;
		}
		return this.listeners.has(eventName);
	}
}

/**
 * This class exposes the constructor and the `emit` method of `EventEmitter`, elevating them from protected to public
 */
export class ComposableEventEmitter<TListeners extends Listeners<TListeners>>
	extends EventEmitter<TListeners>
	implements IEmitter<TListeners>
{
	public constructor(noListeners?: NoListenersCallback<TListeners>) {
		super(noListeners);
	}

	public override emit<K extends keyof TListeners>(
		eventName: K,
		...args: Parameters<TListeners[K]>
	): void {
		return super.emit(eventName, ...args);
	}

	public override emitAndCollect<K extends keyof TListeners>(
		eventName: K,
		...args: Parameters<TListeners[K]>
	): ReturnType<TListeners[K]>[] {
		return super.emitAndCollect(eventName, ...args);
	}
}
