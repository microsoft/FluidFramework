/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Interface for a page object cache
 */
export interface ICache {
	/**
	 * Retrieves the cached entry for the given key. Or null if it doesn't exist.
	 *
	 * @param key - Key to get value of.
	 * @param prefixOverride - Prefix to append to the key, handled by the implementation if left undefined. Empty string will not add any prefix to the key.
	 */
	get<T>(key: string, prefixOverride?: string): Promise<T>;

	/**
	 * Sets a cache value
	 *
	 * @param key - Key to set value of.
	 * @param value - Value to set key to.
	 * @param expireAfterSeconds - Amount of seconds that the key/value pair should exist for.
	 * @param prefixOverride - Prefix to append to the key, handled by the implementation if left undefined. Empty string will not add any prefix to the key.
	 */
	set<T>(key: string, value: T, expireAfterSeconds?: number, prefixOverride?: string): Promise<void>;

	/**
	 * Deletes a cache value
	 *
	 * @param key - Key to delete value for.
	 * @param prefixOverride - Prefix to append to the key, handled by the implementation if left undefined. Empty string will not add any prefix to the key.
	 */
	delete?(key: string, prefixOverride?: string): Promise<boolean>;

	/**
	 * Increments key value by 1. If the key does not exist, its value will be first set to 0 and then incremented.
	 *
	 * @param key - Key to increment value for.
	 */
	incr?(key: string): Promise<number>;

	/**
	 * Decrements key value by 1. If the key does not exist, its value will be first set to 0 and then decremented.
	 *
	 * @param key - Key to decrement value for.
	 */
	decr?(key: string): Promise<number>;
}
