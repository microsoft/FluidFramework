/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Invariant } from "./typeCheck.js";
import { getOrCreate } from "./utils.js";

/**
 * Key in a {@link BrandedMapSubset}.
 * @internal
 */
export type BrandedKey<TKey, TContent> = TKey & Invariant<TContent>;

/**
 * @internal
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
 *
 * @internal
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
 */
export function getOrCreateSlotContent<
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	M extends BrandedMapSubset<BrandedKey<unknown, any>>,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	K extends BrandedKey<unknown, any>,
>(map: M, key: K, defaultValue: (key: K) => BrandedKeyContent<K>): BrandedKeyContent<K> {
	const result: BrandedKeyContent<K> = getOrCreate(map, key, defaultValue);
	// eslint-disable-next-line @typescript-eslint/no-unsafe-return
	return result;
}

/**
 * A counter used to allocate unique numbers (See {@link brandedSlot}) to use as {@link BrandedKey}s.
 * This allows the keys to be small integers, which are efficient to use as keys in maps.
 * See {@link BrandedMapSubset}.
 */
let slotCounter = 0;

/**
 * Define a strongly typed slot in which data can be stored in a {@link BrandedMapSubset}.
 * @internal
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function brandedSlot<TSlot extends BrandedKey<any, any>>(): TSlot {
	return slotCounter++ as TSlot;
}
