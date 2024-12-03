/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Interface for a page object cache
 * @internal
 */
export interface ICache {
	/**
	 * Retrieves the cached entry for the given key. Or null if it doesn't exist.
	 */
	// eslint-disable-next-line @rushstack/no-new-null
	get(key: string): Promise<string | null>;

	/**
	 * Sets a cache value
	 */
	set(key: string, value: string, expireAfterSeconds?: number): Promise<void>;

	/**
	 * Deletes a cache value
	 */
	delete?(key: string): Promise<boolean>;

	/**
	 * Increments key value by 1. If the key does not exist, its value will be first set to 0 and then incremented.
	 */
	incr?(key: string): Promise<number>;

	/**
	 * Decrements key value by 1. If the key does not exist, its value will be first set to 0 and then decremented.
	 */
	decr?(key: string): Promise<number>;
}
