/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * A mutable map interface controlled by Fluid Framework, mirroring the built-in `Map`
 * but using `IterableIterator` for its iterator methods.
 *
 * @remarks
 * Fluid Framework uses this type instead of the built-in `Map` to insulate against
 * breaking changes introduced by the TypeScript standard library across versions.
 * The `set` method returns `this` for compatibility with existing Fluid interfaces
 * such as `IDirectory` and `ISharedMap`.
 *
 * @sealed @public
 */
export interface FluidMapLegacy<K, V> {
	/**
	 * Returns an iterable of entries in the map.
	 */
	[Symbol.iterator](): IterableIterator<[K, V]>;

	/**
	 * The number of entries in the map.
	 */
	readonly size: number;

	/**
	 * Returns an iterable of key, value pairs for every entry in the map.
	 */
	entries(): IterableIterator<[K, V]>;

	/**
	 * Executes the provided function once per each key/value pair in the map.
	 */
	forEach(
		callbackfn: (value: V, key: K, map: FluidMapLegacy<K, V>) => void,
		// Typing inherited from Map.
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
	keys(): IterableIterator<K>;

	/**
	 * Returns an iterable of values in the map.
	 */
	values(): IterableIterator<V>;

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
	 * Adds a new element with a specified key and value to the map.
	 * If an element with the same key already exists, the element will be updated.
	 */
	set(key: K, value: V): this;

	readonly [Symbol.toStringTag]: string;
}

/**
 * A readonly map interface controlled by Fluid Framework, derived from {@link FluidMapLegacy}
 * with write operations removed.
 *
 * @remarks
 * Fluid Framework uses this type instead of the built-in `ReadonlyMap` to insulate
 * against breaking changes introduced by the TypeScript standard library across versions.
 * Interfaces that need map-like read behavior should extend this type.
 *
 * @sealed @alpha
 */
export interface FluidReadonlyMap<K, V>
	extends Omit<
		FluidMapLegacy<K, V>,
		"clear" | "delete" | "set" | "forEach" | typeof Symbol.toStringTag
	> {
	/**
	 * Executes the provided function once per each key/value pair in the map.
	 */
	forEach(
		callbackfn: (value: V, key: K, map: FluidReadonlyMap<K, V>) => void,
		// Typing inherited from ReadonlyMap.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		thisArg?: any,
	): void;
}

/**
 * A mutable map interface controlled by Fluid Framework, extending {@link FluidReadonlyMap}
 * with write operations.
 *
 * @remarks
 * Unlike {@link FluidMapLegacy}, the `set` method returns `void` instead of `this`,
 * which avoids covariant `this` return type issues in interface hierarchies.
 * New Fluid interfaces should prefer extending this type over {@link FluidMapLegacy}.
 *
 * @sealed @alpha
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
