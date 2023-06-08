/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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
	return result;
}
