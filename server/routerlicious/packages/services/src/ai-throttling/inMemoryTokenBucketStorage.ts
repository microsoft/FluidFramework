/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import LRUCache from "lru-cache";

import type { ITokenBucketState } from "./baseTokenBucket";
import type { ITokenBucketStorage, IInMemoryStorageConfig } from "./tokenBucketStorage";

/**
 * In-memory storage implementation for token bucket states.
 * Uses LRU cache with configurable size and TTL.
 * @internal
 */
export class InMemoryTokenBucketStorage implements ITokenBucketStorage {
	private readonly bucketStates: LRUCache<string, ITokenBucketState>;

	constructor(config: IInMemoryStorageConfig = {}) {
		this.bucketStates = new LRUCache<string, ITokenBucketState>({
			max: config.maxBuckets ?? 1000,
			maxAge: config.maxAgeMs ?? 5 * 60 * 1000, // Default 5 minutes
		});
	}

	public async get(id: string): Promise<ITokenBucketState | undefined> {
		return this.bucketStates.get(id);
	}

	public async set(id: string, state: ITokenBucketState): Promise<void> {
		this.bucketStates.set(id, state);
	}

	public async clear(): Promise<void> {
		this.bucketStates.reset();
	}
}
