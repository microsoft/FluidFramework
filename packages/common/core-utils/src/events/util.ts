/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	EventEmitter,
	type HasListeners,
	type IEmitter,
	type NoListenersCallback,
} from "./emitter.js";
import type { Listenable, Listeners } from "./listeners.js";

/**
 * Convert a union of types to an intersection of those types. Useful for `TransformEvents`.
 * @privateRemarks
 * First an always true extends clause is used (T extends T) to distribute T into to a union of types contravariant over each member of the T union.
 * Then the constraint on the type parameter in this new context is inferred, giving the intersection.
 * @system @public
 */
export type UnionToIntersection<T> = (T extends T ? (k: T) => unknown : never) extends (
	k: infer U,
) => unknown
	? U
	: never;

/**
 * Subset of Map interface.
 * @public
 */
export interface MapGetSet<K, V> {
	get(key: K): V | undefined;
	set(key: K, value: V): void;
}

/**
 * A dictionary whose values are keyed off of two objects (key1, key2).
 * As it is a nested map, size() will return the number of distinct key1s.
 * If you need constant-time access to the number of values, use SizedNestedMap instead.
 *
 * This code assumes values will not be undefined (keys can be undefined).
 * @public
 */
export type NestedMap<Key1, Key2, Value> = Map<Key1, Map<Key2, Value>>;

/**
 * Sets the value at `key` in map to value if not already present.
 * Returns the value at `key` after setting it.
 * This is equivalent to a get or default that adds the default to the map.
 * @public
 */
export function getOrAddInMap<Key, Value>(
	map: MapGetSet<Key, Value>,
	key: Key,
	value: Value,
): Value {
	const currentValue = map.get(key);
	if (currentValue !== undefined) {
		return currentValue;
	}
	map.set(key, value);
	return value;
}

/**
 * Sets the value at (key1, key2) in map to value.
 * If there already is a value for (key1, key2), it is replaced with the provided one.
 * @public
 */
export function setInNestedMap<Key1, Key2, Value>(
	map: NestedMap<Key1, Key2, Value>,
	key1: Key1,
	key2: Key2,
	value: Value,
): void {
	const innerMap = getOrAddInMap(map, key1, new Map<Key2, Value>());
	innerMap.set(key2, value);
}

/**
 * Create a {@link Listenable} that can be instructed to emit events via the {@link IEmitter} interface.
 *
 * A class can delegate handling {@link Listenable} to the returned value while using it to emit the events.
 * See also {@link EventEmitter} which be used as a base class to implement {@link Listenable} via extension.
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
 * }
 * ```
 * @public
 */
export function createEmitter<TListeners extends object>(
	noListeners?: NoListenersCallback<TListeners>,
): Listenable<TListeners> & IEmitter<TListeners> & HasListeners<TListeners> {
	return new ComposableEventEmitter<TListeners>(noListeners);
}

/**
 * This class exposes the constructor and the `emit` method of `EventEmitter`, elevating them from protected to public
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
 * Retrieve a value from a map with the given key, or create a new entry if the key is not in the map.
 * @param map - The map to query/update
 * @param key - The key to lookup in the map
 * @param defaultValue - a function which returns a default value. This is called and used to set an initial value for the given key in the map if none exists
 * @returns either the existing value for the given key, or the newly-created value (the result of `defaultValue`)
 * @public
 */
export function getOrCreate<K, V>(
	map: MapGetSet<K, V>,
	key: K,
	defaultValue: (key: K) => V,
): V {
	let value = map.get(key);
	if (value === undefined) {
		value = defaultValue(key);
		map.set(key, value);
	}
	return value;
}
