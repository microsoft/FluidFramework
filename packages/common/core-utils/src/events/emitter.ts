/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// import { UsageError } from "@fluidframework/telemetry-utils/internal";
import type {
	Listenable,
	Listeners,
	Off,
	NoListenersCallback,
	HasListeners,
	IEmitter,
} from "@fluidframework/core-interfaces/internal";

import { getOrCreate } from "./util.js";

/**
 * Provides an API for subscribing to and listening to events.
 *
 * @remarks Classes wishing to emit events may either extend this class, compose over it, or expose it as a property of type {@link @fluidframework/core-interfaces#Listenable}.
 *
 * @example Extending this class
 *
 * ```typescript
 * interface MyEvents {
 * 	loaded: () => void;
 * 	computed: () => number;
 * }
 *
 * class MyInheritanceClass extends EventEmitter<MyEvents> {
 * 	private load() {
 * 		this.emit("loaded");
 * 		const results: number[] = this.emitAndCollect("computed");
 * 	}
 * }
 * ```
 *
 * @example Composing over this class
 *
 * ```typescript
 * class MyCompositionClass implements Listenable<MyEvents> {
 * 	private readonly events = createEmitter<MyEvents>();
 *
 * 	private load() {
 * 		this.events.emit("loaded");
 * 		const results: number[] = this.events.emitAndCollect("computed");
 * 	}
 *
 * 	public on<K extends keyof MyEvents>(eventName: K, listener: MyEvents[K]): () => void {
 * 		return this.events.on(eventName, listener);
 * 	}
 * }
 * ```
 *
 * @example Exposing this class as a property
 *
 * ```typescript
 * class MyExposingClass {
 * 	private readonly _events = createEmitter<MyEvents>();
 * 	public readonly events: Listenable<MyEvents> = this._events;
 *
 * 	private load() {
 * 		this._events.emit("loaded");
 * 		const results: number[] = this._events.emitAndCollect("computed");
 * 	}
 * }
 * ```
 * @internal
 */
export class EventEmitter<TListeners extends Listeners<TListeners>>
	implements Listenable<TListeners>, HasListeners<TListeners>
{
	protected readonly listeners = new Map<
		keyof TListeners,
		Set<(...args: any[]) => TListeners[keyof TListeners]>
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
			// Current tsc (5.4.5) cannot spread `args` into `listener()`.
			const argArray: unknown[] = args;
			// This explicitly copies listeners so that new listeners added during this call to emit will not receive this event.
			for (const listener of [...listeners]) {
				// If listener has been unsubscribed while invoking other listeners, skip it.
				if (listeners.has(listener)) {
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

	public on<K extends keyof Listeners<TListeners>>(
		eventName: K,
		listener: TListeners[K],
	): Off {
		const listeners = getOrCreate(this.listeners, eventName, () => new Set());
		if (listeners.has(listener)) {
			const eventDescription =
				typeof eventName === "symbol" ? eventName.description : String(eventName.toString());

			throw new Error(
				`Attempted to register the same listener object twice for event ${eventDescription}`,
			);
		}
		listeners.add(listener);
		return () => this.off(eventName, listener);
	}

	public off<K extends keyof Listeners<TListeners>>(
		eventName: K,
		listener: TListeners[K],
	): void {
		const listeners = this.listeners.get(eventName);
		if (listeners?.delete(listener) === true && listeners.size === 0) {
			this.listeners.delete(eventName);
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call
			this.noListeners?.(eventName);
		}
	}

	public hasListeners(eventName?: keyof TListeners): boolean {
		if (eventName === undefined) {
			return this.listeners.size > 0;
		}
		return this.listeners.has(eventName);
	}
}

/**
 * This class exposes the constructor and the `emit` method of `EventEmitter`, elevating them from protected to public
 * @internal
 */
class ComposableEventEmitter<TListeners extends Listeners<TListeners>>
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

/**
 * Create a {@link @fluidframework/core-interfaces#Listenable} that can be instructed to emit events via the {@link @fluidframework/core-interfaces#IEmitter} interface.
 *
 * A class can delegate handling {@link @fluidframework/core-interfaces#Listenable} to the returned value while using it to emit the events.
 * See also {@link EventEmitter} which be used as a base class to implement {@link @fluidframework/core-interfaces#Listenable} via extension.
 * @example Forwarding events to the emitter
 * ```typescript
 * interface MyEvents {
 * 	loaded(): void;
 * }
 *
 * class MyClass implements Listenable<MyEvents> {
 * 	private readonly events = createEmitterMinimal<MyEvents>();
 *
 * 	private load(): void {
 * 		this.events.emit("loaded");
 * 	}
 *
 * 	public on<K extends keyof MyEvents>(eventName: K, listener: MyEvents[K]): Off {
 * 		return this.events.on(eventName, listener);
 * 	}
 *
 * 	public off<K extends keyof MyEvents>(eventName: K, listener: MyEvents[K]): void {
 * 		return this.events.off(eventName, listener);
 * 	}
 * }
 * ```
 * @internal
 */
export function createEmitter<TListeners extends object>(
	noListeners?: NoListenersCallback<TListeners>,
	// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
): Listenable<TListeners> & IEmitter<TListeners> & HasListeners<TListeners> {
	return new ComposableEventEmitter<TListeners>(noListeners);
}
