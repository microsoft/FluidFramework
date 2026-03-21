/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Like TypeScript's built-in `Iterable` type, except unaffected by TypeScript's version and configuration options.
 * @remarks
 * Native iterables (e.g., `Map`, `Set`, `Array`) are assignable to this type.
 * @sealed @public
 */
export interface FluidIterable<T> {
	[Symbol.iterator](): FluidIterableIterator<T>;
}

/**
 * Like TypeScript's built-in iterable iterator type, except unaffected by TypeScript's version and configuration options.
 * @remarks
 * Native iterable iterators (e.g., those returned by `Map.keys()`, `Set.values()`, etc.) are assignable to this type.
 * @sealed @public
 */
export interface FluidIterableIterator<T> extends FluidIterable<T> {
	next(): { value: T; done?: boolean };
}

/**
 * A readonly map interface controlled by Fluid Framework.
 *
 * @remarks
 * Fluid Framework uses this type instead of the built-in `ReadonlyMap` to insulate
 * against breaking changes introduced by the TypeScript standard library across versions.
 * Interfaces that need map-like read behavior should extend this type.
 *
 * A native `ReadonlyMap\<K, V\>` is NOT assignable to `FluidReadonlyMap\<K, V\>` because
 * `FluidReadonlyMap` has `[Symbol.toStringTag]`, which `ReadonlyMap` lacks.
 * In the other direction, `FluidReadonlyMap` is assignable to
 * `Omit\<ReadonlyMap, "forEach"\>`.
 *
 * A native `Map\<K, V\>` IS assignable to `FluidReadonlyMap\<K, V\>` since `Map` has
 * `[Symbol.toStringTag]` and all required readonly members.
 *
 * @sealed @public
 */
export interface FluidReadonlyMap<K, V> {
	/**
	 * Returns an iterable of entries in the map.
	 */
	[Symbol.iterator](): FluidIterableIterator<[K, V]>;

	/**
	 * The number of entries in the map.
	 */
	readonly size: number;

	/**
	 * Returns an iterable of key, value pairs for every entry in the map.
	 */
	entries(): FluidIterableIterator<[K, V]>;

	/**
	 * Executes the provided function once per each key/value pair in the map.
	 */
	forEach(
		callbackfn: (value: V, key: K, map: FluidReadonlyMap<K, V>) => void,
		// Typing inherited from ReadonlyMap.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		thisArg?: any,
	): void;

	/**
	 * Returns the value associated to the specified key, or undefined if there is none.
	 */
	get(key: K): V | undefined;

	/**
	 * Returns a boolean indicating whether an element with the specified key exists or not.
	 */
	has(key: K): boolean;

	/**
	 * Returns an iterable of keys in the map.
	 */
	keys(): FluidIterableIterator<K>;

	/**
	 * Returns an iterable of values in the map.
	 */
	values(): FluidIterableIterator<V>;

	/**
	 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Symbol/toStringTag | Symbol.toStringTag}
	 */
	readonly [Symbol.toStringTag]: string;
}

/**
 * A mutable map interface controlled by Fluid Framework, extending {@link FluidReadonlyMap}
 * with write operations.
 *
 * @remarks
 * The `set` method returns `void` instead of `this`,
 * which avoids covariant `this` return type issues in interface hierarchies.
 *
 * `FluidMap` is NOT assignable to the built-in `Map` because `set` returns `void`
 * instead of `this`. It is assignable to `Omit\<Map, "forEach" | "set"\>`.
 * A native `Map\<K, V\>` is NOT assignable to `FluidMap\<K, V\>` because `Map.set`
 * returns `this`, which is not assignable to `void` in a contravariant callback position.
 *
 * @sealed @public
 */
export interface FluidMap<K, V> extends FluidReadonlyMap<K, V> {
	/**
	 * Removes all entries from the map.
	 */
	clear(): void;

	/**
	 * Removes the specified element from the map by its key.
	 * @returns `true` if the element existed and has been removed, or `false` if the element does not exist.
	 */
	delete(key: K): boolean;

	/**
	 * Executes the provided function once per each key/value pair in the map.
	 */
	forEach(
		callbackfn: (value: V, key: K, map: FluidMap<K, V>) => void,
		// Typing inherited from Map.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		thisArg?: any,
	): void;

	/**
	 * Adds a new element with a specified key and value to the map.
	 * If an element with the same key already exists, the element will be updated.
	 */
	set(key: K, value: V): void;
}
