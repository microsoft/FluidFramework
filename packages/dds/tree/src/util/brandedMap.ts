/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Brand } from "./brand.js";
import type { Opaque } from "./opaque.js";
import type { Invariant } from "./typeCheck.js";
import { getOrCreate } from "./utils.js";

/**
 * Key in a {@link BrandedMapSubset}.
 * @remarks
 * Due to the `TContent` type parameter being invariant (which it has to be since keys are used to both read and write data),
 * generic collections end up needing to constrain their key's `TContent` to `any`.
 */
export type BrandedKey<TKey, TContent> = TKey & Invariant<TContent>;

/**
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BrandedKeyContent<TKey extends BrandedKey<unknown, any>> = TKey extends BrandedKey<
	unknown,
	infer TContent
>
	? TContent
	: never;

/**
 * A Map where the keys carry the types of values which they correspond to.
 *
 * Example usage:
 * ```typescript
 * type FooSlot<TContent> = BrandedKey<Opaque<Brand<number, "FooSlot">>, TContent>;
 * const counterSlot = brandedSlot<FooSlot<number>>();
 * const slots: BrandedMapSubset<FooSlot<any>> = new Map();
 * slots.set(counterSlot, slots.get(counterSlot) ?? 0 + 1);
 * ```
 *
 * @remarks
 * These APIs are designed so that a Map can be used to implement this type.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface BrandedMapSubset<K extends BrandedKey<unknown, any>> {
	get<K2 extends K>(key: K2): BrandedKeyContent<K2> | undefined;
	has(key: K): boolean;
	set<K2 extends K>(key: K2, value: BrandedKeyContent<K2>): this;
	delete(key: K): boolean;
}

/**
 * Version of {@link getOrCreate} with better typing for {@link BrandedMapSubset}.
 * @privateRemarks
 * Only infers type from key to avoid inferring `any` from map's key.
 */
export function getOrCreateSlotContent<K, V>(
	map: NoInfer<BrandedMapSubset<BrandedKey<K, V>>>,
	key: BrandedKey<K, V>,
	defaultValue: NoInfer<(key: BrandedKey<K, V>) => V>,
): V {
	return getOrCreate<BrandedKey<K, V>, V>(map, key, defaultValue);
}

/**
 * A counter used to allocate unique numbers (See {@link brandedSlot}) to use as {@link BrandedKey}s.
 * This allows the keys to be small integers, which are efficient to use as keys in maps.
 * See {@link BrandedMapSubset}.
 */
let slotCounter = 0;

/**
 * Define a strongly typed slot in which data can be stored in a {@link BrandedMapSubset}.
 */
export function brandedSlot<
	// See note on BrandedKey.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	TSlot extends BrandedKey<number | Opaque<Brand<number, string>>, any>,
>(): TSlot {
	return slotCounter++ as TSlot;
}
