/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { MapWithExpiration } from "./mapWithExpiration.js";

export interface ICache<T> {
	get(key: string): Promise<T | undefined>;
	put(key: string, value: T): Promise<void>;
	/**
	 * Clears all entries from the cache.
	 */
	clear(): void;
	/**
	 * Removes all entries whose keys start with the given prefix.
	 * This allows document-specific cleanup of shared caches without
	 * affecting entries belonging to other documents.
	 */
	removeByPrefix(prefix: string): void;
}

/** A basic in-memory cache that optionally supports expiring entries after a period of inactivity */
export class InMemoryCache<T> implements ICache<T> {
	private readonly cache: Map<string, T>;

	constructor(expirationMs?: number) {
		this.cache = expirationMs !== undefined ? new MapWithExpiration(expirationMs) : new Map();
	}

	public async get(key: string): Promise<T | undefined> {
		return this.cache.get(key);
	}

	public async put(key: string, value: T): Promise<void> {
		this.cache.set(key, value);
	}

	public clear(): void {
		this.cache.clear();
	}

	public removeByPrefix(prefix: string): void {
		for (const key of this.cache.keys()) {
			if (key.startsWith(prefix)) {
				this.cache.delete(key);
			}
		}
	}
}

/** This "cache" does nothing on put, and get always returns undefined */
export class NullCache<T> implements ICache<T> {
	public async get(key: string): Promise<T | undefined> {
		return undefined;
	}

	public async put(key: string, value: T): Promise<void> {}

	public clear(): void {}

	public removeByPrefix(_prefix: string): void {}
}
