/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * A symbol that, when attached to an object as a property and given a truthy value,
 * causes that object to be treated as an "eager" item in a `FlexList` even if it otherwise would have been considered to be "lazy".
 * @remarks
 * Used by `markEager`and `isMarkedEager`.
 */
const flexListEager = Symbol("FlexList Eager");

/** Mark the given object as an "eager" item in a `FlexList`, regardless of its type. */
export function markEager<T>(t: T): T {
	return isLazy(t)
		? Object.defineProperty(t, flexListEager, {
				value: true,
				configurable: true,
				enumerable: false,
				writable: false,
		  })
		: t;
}

/** Check if the given object has been marked "eager" via `markEager`. */
function isMarkedEager(x: unknown): x is { [flexListEager]: true } {
	return (x as { [flexListEager]?: boolean })[flexListEager] ?? false;
}

/**
 * A flexible way to list values.
 * Each item in the list can either be a **value** or a **function that returns a value** (the latter allows cyclic references to work).
 * @privateRemarks
 * By default, items that are of type `"function"` will be considered "lazy" and all other items will be considered eager.
 * To force a `"function"` item to be treated as an eager item, call `markEager` before putting it in the list.
 * This is necessary e.g. when the eager list items are function types and the lazy items are functions that _return_ function types.
 * `FlexList`s are processed by `normalizeFlexList` and `normalizeFlexListEager`.
 * @alpha
 */
export type FlexList<Item = unknown> = readonly LazyItem<Item>[];

/**
 * Given a `FlexList` of eager and lazy items, return an equivalent list where all items are lazy.
 */
export function normalizeFlexListLazy<List extends FlexList>(t: List): FlexListToLazyArray<List> {
	return t.map((value: LazyItem) => {
		if (isMarkedEager(value)) {
			return () => value;
		}
		if (isLazy(value)) {
			return value;
		}
		return () => value;
	}) as FlexListToLazyArray<List>;
}

/**
 * Given a `FlexList` of eager and lazy items, return an equivalent list where all items are eager.
 */
export function normalizeFlexListEager<List extends FlexList>(
	t: List,
): FlexListToNonLazyArray<List> {
	const data: readonly unknown[] = t.map((value: LazyItem) => {
		if (isMarkedEager(value)) {
			return value;
		}
		if (isLazy(value)) {
			return value();
		}
		return value;
	});
	return data as FlexListToNonLazyArray<List>;
}

function isLazy<Item>(x: LazyItem<Item>): x is () => Item {
	return typeof x === "function";
}

/**
 * An "eager" or "lazy" Item in a `FlexList`.
 * Lazy items are wrapped in a function to allow referring to themselves before they are declared.
 * This makes recursive and co-recursive items possible.
 * @alpha
 */
export type LazyItem<Item = unknown> = Item | (() => Item);

/**
 * @alpha
 */
export type NormalizedFlexList<Item> = readonly Item[];

export type NormalizedLazyFlexList<Item> = (() => Item)[];

/**
 * @alpha
 */
export type ExtractItemType<Item extends LazyItem> = Item extends () => infer Result
	? Result
	: Item;

/**
 * @alpha
 */
export type ExtractListItemType<List extends FlexList> = List extends FlexList<infer Item>
	? Item
	: unknown;

type NormalizeLazyItem<List extends LazyItem> = List extends () => unknown ? List : () => List;

/**
 * Normalize FlexList type to a non-lazy array.
 * @alpha
 */
export type FlexListToNonLazyArray<List extends FlexList> = ArrayHasFixedLength<List> extends true
	? ConstantFlexListToNonLazyArray<List>
	: NormalizedFlexList<ExtractListItemType<List>>;

/**
 * Normalize FlexList type to a non-lazy array.
 * @alpha
 */
export type ConstantFlexListToNonLazyArray<List extends FlexList> = List extends readonly [
	infer Head,
	...infer Tail,
]
	? [ExtractItemType<Head>, ...ConstantFlexListToNonLazyArray<Tail>]
	: [];

/**
 * Detect if an array is a Tuple (fixed length) or unknown length.
 *
 * Types which many have one of multiple fixed lengths (like `[] | [0]`) count as having a fixed length.
 *
 * @remarks
 * Type operations designed to work on tuples can often behave very badly on regular arrays.
 * For example recursive patterns for processing them often just return the base case,
 * losing all the type information.
 *
 * @alpha
 */
// This works by determining if the length is `number` (and not a specific number).
export type ArrayHasFixedLength<List extends readonly unknown[]> = number extends List["length"]
	? false
	: true;

/**
 * Normalize FlexList type to a lazy array.
 */
export type FlexListToLazyArray<List extends FlexList> = ArrayHasFixedLength<List> extends true
	? ConstantFlexListToLazyArray<List>
	: NormalizedLazyFlexList<ExtractListItemType<List>>;

/**
 * Normalize FlexList type to a lazy array.
 */
export type ConstantFlexListToLazyArray<List extends FlexList> = List extends readonly [
	infer Head,
	...infer Tail,
]
	? [NormalizeLazyItem<Head>, ...ConstantFlexListToLazyArray<Tail>]
	: [];
