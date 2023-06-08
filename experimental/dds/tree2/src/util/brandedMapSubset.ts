/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Brand } from "./brand";
import { Invariant } from "./typeCheck";
import { getOrCreate } from "./utils";

/**
 * @alpha
 */
export type BrandedKey<TKey, TContent> = TKey & Invariant<TContent>;

/**
 * @alpha
 */
export type BrandedKeyContent<TKey extends BrandedKey<unknown, any>> = TKey extends BrandedKey<
	unknown,
	infer TContent
>
	? TContent
	: never;

/**
 * A Map where the keys carry the types of values which they correspond to.
 *
 * @remarks
 * These APIs are designed so that a Map can be used to implement this type.
 *
 * @alpha
 */
export interface BrandedMapSubset<K extends BrandedKey<unknown, any>> {
	get<K2 extends K>(key: K2): BrandedKeyContent<K2> | undefined;
	has(key: K): boolean;
	set<K2 extends K>(key: K2, value: BrandedKeyContent<K2>): this;
	delete(key: K): boolean;
}

export function getOrCreateSlot<
	M extends BrandedMapSubset<BrandedKey<unknown, any>>,
	K extends BrandedKey<unknown, any>,
>(map: M, key: K, defaultValue: (key: K) => BrandedKeyContent<K>): BrandedKeyContent<K> {
	const result: BrandedKeyContent<K> = getOrCreate(map, key, defaultValue);
	// eslint-disable-next-line @typescript-eslint/no-unsafe-return
	return result;
}

// TODO: remove references to anchor from these and dedup with anchorSet

/**
 * A counter used to allocate unique numbers (See {@link anchorSlot}) to each {@link AnchorSlot}.
 * This allows the keys to be small integers, which are efficient to use as keys in maps.
 */
let slotCounter = 0;

/**
 * Define a strongly typed slot on anchors in which data can be stored.
 *
 * @remarks
 * This is mainly useful for caching data associated with a location in the tree.
 *
 * Example usage:
 * ```typescript
 * const counterSlot = anchorSlot<number>();
 *
 * function useSlot(anchor: AnchorNode): void {
 * 	anchor.slots.set(counterSlot, 1 + anchor.slots.get(counterSlot) ?? 0);
 * }
 * ```
 * @alpha
 */
export function brandedSlot<TKey extends Brand<number, string>, TContent>(): BrandedKey<
	TKey,
	TContent
> {
	return slotCounter++ as BrandedKey<TKey, TContent>;
}
