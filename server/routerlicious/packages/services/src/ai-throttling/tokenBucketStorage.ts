/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ITokenBucketState } from "./baseTokenBucket";

/**
 * Storage interface for token bucket state persistence.
 * Allows different storage backends (in-memory, Redis, etc.) to be used
 * with the same token bucket algorithm.
 * @internal
 */
export interface ITokenBucketStorage {
	/**
	 * Get token bucket state for the given ID
	 * @param id - Unique identifier for the bucket
	 * @returns Current bucket state, or undefined if not found
	 */
	get(id: string): Promise<ITokenBucketState | undefined>;

	/**
	 * Set token bucket state for the given ID
	 * @param id - Unique identifier for the bucket
	 * @param state - Bucket state to store
	 */
	set(id: string, state: ITokenBucketState): Promise<void>;

	/**
	 * Clear all stored bucket states (useful for testing)
	 */
	clear(): Promise<void>;
}

/**
 * Configuration for in-memory token bucket storage
 * @internal
 */
export interface IInMemoryStorageConfig {
	/** Maximum number of buckets to track in memory */
	maxBuckets?: number;
	/** How long to keep bucket state cached (in milliseconds) */
	maxAgeMs?: number;
}

/**
 * Configuration for Redis-based token bucket storage
 * @internal
 */
export interface IRedisStorageConfig {
	/** TTL for bucket states in Redis (in seconds) */
	ttlSeconds?: number;
	/** Key prefix for Redis keys */
	keyPrefix?: string;
}
