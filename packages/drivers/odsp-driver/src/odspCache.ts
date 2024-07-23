/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { PromiseCache } from "@fluidframework/core-utils/internal";
import { ISnapshot } from "@fluidframework/driver-definitions/internal";
import {
	ICacheEntry,
	IEntry,
	IFileEntry,
	IOdspResolvedUrl,
	IPersistedCache,
	ISocketStorageDiscovery,
	getKeyForCacheEntry,
} from "@fluidframework/odsp-driver-definitions/internal";

/**
 * Similar to IPersistedCache, but exposes cache interface for single file
 * @legacy
 * @alpha
 */
export interface IPersistedFileCache {
	// TODO: use a stronger type
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	get(entry: IEntry): Promise<any>;
	// TODO: use a stronger type
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	put(entry: IEntry, value: any): Promise<void>;
	removeEntries(): Promise<void>;
}

/**
 * Default local-only implementation of IPersistedCache,
 * used if no persisted cache is provided by the host
 */
export class LocalPersistentCache implements IPersistedCache {
	private readonly cache = new Map<string, unknown>();
	// For every document id there will be a single expiration entry inspite of the number of cache entries.
	private readonly docIdExpirationMap = new Map<string, ReturnType<typeof setTimeout>>();

	public constructor(private readonly snapshotExpiryPolicy = 3600 * 1000) {}

	async get(entry: ICacheEntry): Promise<unknown> {
		const key = getKeyForCacheEntry(entry);
		return this.cache.get(key);
	}

	async put(entry: ICacheEntry, value: unknown): Promise<void> {
		const key = getKeyForCacheEntry(entry);
		this.cache.set(key, value);
		this.updateExpirationEntry(entry.file.docId);
	}

	async removeEntries(file: IFileEntry): Promise<void> {
		this.removeDocIdEntriesFromCache(file.docId);
	}

	private removeDocIdEntriesFromCache(docId: string): void[] {
		this.removeExpirationEntry(docId);
		return [...this.cache]
			.filter(([cachekey]) => {
				const docIdFromKey = cachekey.split("_");
				if (docIdFromKey[0] === docId) {
					return true;
				}
			})
			.map(([cachekey]) => {
				this.cache.delete(cachekey);
			});
	}

	private removeExpirationEntry(docId: string): void {
		const timeout = this.docIdExpirationMap.get(docId);
		if (timeout !== undefined) {
			clearTimeout(timeout);
			this.docIdExpirationMap.delete(docId);
		}
	}

	private updateExpirationEntry(docId: string): void {
		this.removeExpirationEntry(docId);
		this.docIdExpirationMap.set(
			docId,
			setTimeout(() => {
				this.removeDocIdEntriesFromCache(docId);
			}, this.snapshotExpiryPolicy),
		);
	}
}
export class PromiseCacheWithOneHourSlidingExpiry<T> extends PromiseCache<string, T> {
	constructor(removeOnError?: (error: unknown) => boolean) {
		super({ expiry: { policy: "sliding", durationMs: 3600000 }, removeOnError });
	}
}

/**
 * Internal cache interface used within driver only
 * @legacy
 * @alpha
 */
export interface INonPersistentCache {
	/**
	 * Cache of joined/joining session info
	 */
	readonly sessionJoinCache: PromiseCache<
		string,
		{ entryTime: number; joinSessionResponse: ISocketStorageDiscovery }
	>;

	/**
	 * Cache of resolved/resolving file URLs
	 */
	readonly fileUrlCache: PromiseCache<string, IOdspResolvedUrl>;

	/**
	 * Used to store the snapshot fetch promise if the prefetch has been made using the prefetchLatestSnapshot api.
	 * This is then used later to look for the promise during the container load.
	 */
	readonly snapshotPrefetchResultCache: PromiseCache<string, IPrefetchSnapshotContents>;
}

/**
 * Internal cache interface used within driver only
 * @legacy
 * @alpha
 */
export interface IOdspCache extends INonPersistentCache {
	/**
	 * Persisted cache - only serializable content is allowed
	 */
	readonly persistedCache: IPersistedFileCache;
}

export class NonPersistentCache implements INonPersistentCache {
	public readonly sessionJoinCache = new PromiseCache<
		string,
		{ entryTime: number; joinSessionResponse: ISocketStorageDiscovery }
	>();

	public readonly fileUrlCache = new PromiseCache<string, IOdspResolvedUrl>();

	public readonly snapshotPrefetchResultCache = new PromiseCache<
		string,
		IPrefetchSnapshotContents
	>();
}

/**
 * @legacy
 * @alpha
 */
export interface IPrefetchSnapshotContents extends ISnapshot {
	fluidEpoch: string;
	prefetchStartTime: number;
}
