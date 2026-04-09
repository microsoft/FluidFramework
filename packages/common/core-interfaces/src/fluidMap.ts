/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Like TypeScript's built-in `Iterable` type.
 *
 * @privateRemarks
 * This exists to be unaffected by TypeScript's version and configuration options.
 *
 * @sealed @alpha
 */
export interface FluidIterable<T> {
	/**
	 * Returns an iterator over the elements in this iterable.
	 *
	 * @remarks Works like the built-in {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Symbol/iterator | \[Symbol.iterator\]} protocol.
	 */
	[Symbol.iterator](): FluidIterableIterator<T>;
}

/**
 * Like TypeScript's built-in iterable iterator type.
 *
 * @privateRemarks
 * The done branch uses `any` rather than `undefined` to match TypeScript's built-in IteratorReturnResult, which defaults to any for the same reason.
 * Using `undefined` causes TypeScript to include it in type inference at call sites like `Array.from` which would infer `T | undefined` instead of `T`.
 * The done value is rarely meaningful to callers since values are mainly consumed when done is false.
 * Thus `any` is not particularly harmful here, and the unsafety is worth it as
 * it interacts better with the existing TypeScript `IteratorResult` interfaces where `TReturn` defaults to any.
 *
 * @sealed @alpha
 */
export interface FluidIterableIterator<T> extends FluidIterable<T> {
	/**
	 * Returns the next element in the iteration sequence.
	 *
	 * @remarks Works like the built-in {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Iteration_protocols#the_iterator_protocol | Iterator.next} method.
	 * When there are remaining elements, returns `\{ value: T; done?: false \}`.
	 * When the iteration is complete, returns `\{ value: any; done: true \}`.
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	next(): { value: T; done?: false } | { value: any; done: true };
}

/**
 * Like TypeScript's built in `ReadonlyMap` type.
 * Unlike the built in `ReadonlyMap`, this interface includes Symbol.toStringTag.
 *
 * @privateRemarks
 * This exists so that Fluid has a `ReadonlyMap` type which is unaffected by TypeScript's version and configuration options,
 * and safe to implement without being broken by changes to TypeScript's default ReadonlyMap type.
 * All behavior exposed through this interface should be compatible with the corresponding behavior of built in ReadonlyMaps,
 * but it may lack some of the newer APIs,
 * and might express the type slightly different from how TypeScript does in its `ReadonlyMap` type.
 *
 * @sealed @alpha
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
 * Like TypeScript's built in `Map` type.
 *
 * @privateRemarks
 * This exists so that Fluid has a `Map` type which is unaffected by TypeScript's version and configuration options,
 * and safe to implement without being broken by changes to TypeScript's default Map type.
 * All behavior exposed through this interface should be compatible with the corresponding behavior of JavaScript Maps,
 * but it may lack some of the newer APIs,
 * and might express the type slightly different from how TypeScript does in its `Map` type.
 *
 * @sealed @alpha
 */
export interface FluidMap<K, V> extends FluidReadonlyMap<K, V> {
	/**
	 * Removes the specified element from the map by its key.
	 *
	 * @remarks
	 * Unlike the built-in `Map.delete`, this returns `void` instead of a boolean.
	 * This is intentional: in a distributed system, the caller often cannot reliably know
	 * whether the element existed at the time of deletion.
	 * Subtypes may override this to return a boolean if appropriate.
	 */
	delete(key: K): void;

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
