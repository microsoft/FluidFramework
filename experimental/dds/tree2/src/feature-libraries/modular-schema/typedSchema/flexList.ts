/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Flexible way to list values.
 * Can be values, functions that return the value (to allow cyclic references to work), or arrays.
 * @remarks
 * Does not work properly if T can be a function.
 * @alpha
 */
export type FlexList<Item = unknown> = readonly LazyItem<Item>[];

export function normalizeFlexList<List extends FlexList>(t: List): FlexListToLazyArray<List> {
	return t.map((value: LazyItem) => {
		if (typeof value === "function") {
			return value;
		}
		return () => value;
	}) as FlexListToLazyArray<List>;
}

export function normalizeFlexListEager<List extends FlexList>(
	t: List,
): FlexListToNonLazyArray<List> {
	const data: readonly unknown[] = t.map((value: LazyItem) => {
		if (typeof value === "function") {
			return value() as unknown;
		}
		return value;
	});
	return data as FlexListToNonLazyArray<List>;
}

/**
 * T, but can be wrapped in a function to allow referring to types before they are declared.
 * This makes recursive and co-recursive types possible.
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
