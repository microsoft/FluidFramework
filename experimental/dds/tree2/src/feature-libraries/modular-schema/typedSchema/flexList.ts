/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Assume } from "./typeUtils";

// TODO: tests

/**
 * Flexible way to list values.
 * Can be values, functions that return the value (to allow cyclic references to work), or arrays.
 * @remarks
 * Does not work properly if T can be a function or array.
 */
export type FlexList<Item> = LazyItem<Item> | readonly LazyItem<Item>[];

// TODO: make use FlexList and be more generic
export function normalizeFlexList<Item, List extends FlexList<Item>>(
	t: List,
): FlexListToLazyArray<Item, List> {
	if (typeof t === "function") {
		return [t] as FlexListToLazyArray<Item, List>;
	}
	if (Array.isArray(t)) {
		t.map((value: LazyItem<Item>) => {
			if (typeof value === "function") {
				return value;
			}
			return () => value;
		});
	}
	return [() => t] as FlexListToLazyArray<Item, List>;
}

/**
 * T, but can be wrapped in a function to allow referring to types before they are declared.
 * This makes recursive and co-recursive types possible.
 */
export type LazyItem<Item> = Item | (() => Item);

export type NormalizedFlexList<Item> = readonly Item[];
export type NormalizedLazyFlexList<Item> = (() => Item)[];

/**
 * Normalize FlexList type to a non-lazy array.
 */
export type FlexListToNonLazyArray<
	Item,
	List extends FlexList<Item>,
> = List extends readonly LazyItem<Item>[]
	? ArrayToNonLazyArray<Item, List>
	: [ExtractItemType<Item, Assume<List, LazyItem<Item>>>];

/**
 * Normalize FlexList type to a lazy array.
 */

export type FlexListToLazyArray<
	Item,
	List extends FlexList<Item>,
> = List extends readonly LazyItem<Item>[]
	? ArrayToLazyArray<Item, List>
	: [NormalizeLazyItem<Item, Assume<List, LazyItem<Item>>>];

type ExtractItemType<Item, List extends LazyItem<Item>> = List extends () => infer Result
	? Result
	: List;
type NormalizeLazyItem<Item, List extends LazyItem<Item>> = List extends () => unknown
	? List
	: () => List;

/**
 * Normalize FlexList type to a non-lazy array.
 */
type ArrayToNonLazyArray<Item, List extends readonly LazyItem<Item>[]> = List extends readonly [
	infer Head,
	...infer Tail,
]
	? [
			ExtractItemType<Item, Assume<Head, LazyItem<Item>>>,
			...ArrayToNonLazyArray<Item, Assume<Tail, readonly LazyItem<Item>[]>>,
	  ]
	: [];

/**
 * Normalize FlexList type to a lazy array.
 */
type ArrayToLazyArray<Item, List extends readonly LazyItem<Item>[]> = List extends readonly [
	infer Head,
	...infer Tail,
]
	? [
			NormalizeLazyItem<Item, Assume<Head, LazyItem<Item>>>,
			...ArrayToLazyArray<Item, Assume<Tail, readonly LazyItem<Item>[]>>,
	  ]
	: [];
