/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/** A symbol used to identify a `MarkedEager`. */
const flexListEager = Symbol("FlexList Eager");

/**
 * An object that has been marked as eager (as opposed to lazy) when used as an item in a `FlexList`.
 * It will be considered to be an eager item in a `FlexList` even if it is a function.
 */
interface MarkedEager {
	[flexListEager]: true;
}

/** Returns true iff the given item is a function and is not a `MarkedEager`. */
export function isLazy<Item>(item: LazyItem<Item>): item is () => Item {
	return typeof item === "function" && (item as Partial<MarkedEager>)[flexListEager] !== true;
}

/**
 * Mark the given object as an eager item in a `FlexList`.
 * @remarks
 * This only has an effect on function objects that would otherwise be considered to be lazy items in a `FlexList`.
 * @param t - The object to mark as eager.
 * @returns `t`, marked as eager if applicable.
 */
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

/**
 * A flexible way to list values.
 * Each item in the list can either be an "eager" **value** or a "lazy" **function that returns a value** (the latter allows cyclic references to work).
 * @privateRemarks
 * By default, items that are of type `"function"` will be considered lazy and all other items will be considered eager.
 * To force a `"function"` item to be treated as an eager item, call `markEager` before putting it in the list.
 * This is necessary e.g. when the eager list items are function types and the lazy items are functions that _return_ function types.
 * `FlexList`s are processed by `normalizeFlexList` and `normalizeFlexListEager`.
 * @system @public
 */
export type FlexList<Item = unknown> = readonly LazyItem<Item>[];

/**
 * Given a `FlexList` of eager and lazy items, return an equivalent list where all items are eager.
 */
export function normalizeFlexListEager<T>(t: FlexList<T>): T[] {
	const data: T[] = t.map((value: LazyItem<T>) => {
		if (isLazy(value)) {
			return value();
		}
		return value;
	});
	return data;
}

/**
 * An "eager" or "lazy" Item in a `FlexList`.
 * Lazy items are wrapped in a function to allow referring to themselves before they are declared.
 * This makes recursive and co-recursive items possible.
 * @public
 */
export type LazyItem<Item = unknown> = Item | (() => Item);

/**
 * Get the `Item` type from a `LazyItem<Item>`.
 * @system @public
 */
export type ExtractItemType<Item extends LazyItem> = Item extends () => infer Result
	? Result
	: Item;

/**
 * Normalize FlexList type to a union.
 * @system @public
 */
export type FlexListToUnion<TList extends FlexList> = ExtractItemType<TList[number]>;
