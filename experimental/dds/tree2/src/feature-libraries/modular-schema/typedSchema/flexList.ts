/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// TODO: tests

/**
 * Flexible way to list values.
 * Can be values, functions that return the value (to allow cyclic references to work), or arrays.
 * @remarks
 * Does not work properly if T can be a function or array.
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

/**
 * T, but can be wrapped in a function to allow referring to types before they are declared.
 * This makes recursive and co-recursive types possible.
 */
export type LazyItem<Item = unknown> = Item | (() => Item);

export type NormalizedFlexList<Item> = readonly Item[];
export type NormalizedLazyFlexList<Item> = (() => Item)[];

type ExtractItemType<List extends LazyItem> = List extends () => infer Result ? Result : List;
type NormalizeLazyItem<List extends LazyItem> = List extends () => unknown ? List : () => List;

/**
 * Normalize FlexList type to a non-lazy array.
 */
export type FlexListToNonLazyArray<List extends FlexList> = List extends readonly [
	infer Head,
	...infer Tail,
]
	? [ExtractItemType<Head>, ...FlexListToNonLazyArray<Tail>]
	: [];

/**
 * Normalize FlexList type to a lazy array.
 */
export type FlexListToLazyArray<List extends FlexList> = List extends readonly [
	infer Head,
	...infer Tail,
]
	? [NormalizeLazyItem<Head>, ...FlexListToLazyArray<Tail>]
	: [];
