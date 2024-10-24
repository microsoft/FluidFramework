/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type FiveDaysMs, IResolvedUrl } from "@fluidframework/driver-definitions/internal";

/**
 * Must be less than IDocumentStorageServicePolicies.maximumCacheDurationMs policy of 5 days.
 * That policy is the outward expression and this value is the implementation - using a larger value
 * would violate that statement of the driver's behavior.
 * Other parts of the system (such as Garbage Collection) depend on that policy being properly implemented.
 *
 * @internal
 */
export const maximumCacheDurationMs: FiveDaysMs = 432_000_000; // 5 days in ms

/**
 * Describes what kind of content is stored in cache entry.
 * @internal
 */
export const snapshotKey = "snapshot";

/**
 * Describes key for partial snapshot with loading GroupId in cache entry.
 * @internal
 */
export const snapshotWithLoadingGroupIdKey = "snapshotWithLoadingGroupId";

/**
 * @legacy
 * @alpha
 */
export type CacheContentType = "snapshot" | "ops" | "snapshotWithLoadingGroupId";

/*
 * File / container identifier.
 * There is overlapping information here - host can use all of it or parts
 * to implement storage / identify files.
 */
/**
 * @legacy
 * @alpha
 */
export interface IFileEntry {
	/**
	 * Unique and stable ID of the document.
	 * Driver guarantees that docId is stable ID uniquely identifying document.
	 */
	docId: string;
	/**
	 * Resolved URI is provided for additional versatility - host can use it to
	 * identify file in storage, and (as example) delete all cached entries for
	 * a file if user requests so.
	 * This is IOdspResolvedUrl in case of ODSP driver.
	 */
	resolvedUrl: IResolvedUrl;
}

/**
 * Cache entry. Identifies file that this entry belongs to, and type of content stored in it.
 * @legacy
 * @alpha
 */
export interface IEntry {
	/**
	 * Identifies type of entry for a given file.
	 * Each file can have multiple types of entries associated with it.
	 * For example, it can be snapshot, blob, ops, etc.
	 */
	type: CacheContentType;

	/**
	 * Identifies individual entry for a given file and type.
	 * Each file can have multiple cache entries associated with it.
	 * This property identifies a particular instance of entry.
	 * For example, for blobs it will be unique ID of the blob in a file.
	 * For batch of ops, it can be starting op sequence number.
	 * For types that have only one entry (like snapshots), it will be empty string.
	 */
	key: string;
}

/**
 * Cache entry. Identifies file that this entry belongs to, and type of content stored in it.
 * @legacy
 * @alpha
 */
export interface ICacheEntry extends IEntry {
	/**
	 * Identifies file in storage this cached entry is for
	 */
	file: IFileEntry;
}

/**
 * Persistent cache. This interface can be implemented by the host to provide durable caching
 * across sessions. If not provided at driver factory construction, factory will use in-memory
 * cache implementation that does not survive across sessions. Snapshot entires stored in the
 * IPersistedCache will be considered stale and removed after 2 days. Read the README for more
 * information.
 * @legacy
 * @alpha
 */
export interface IPersistedCache {
	/**
	 * Get the cache value of the key
	 * @param entry - cache entry, identifies file and particular key for this file.
	 * @returns Cached value. undefined if nothing is cached.
	 */
	get(entry: ICacheEntry): Promise<any>;

	/**
	 * Put the value into cache.
	 * Important - only serializable content is allowed since this cache may be persisted between sessions
	 * @param entry - cache entry.
	 * @param value - JSON-serializable content.
	 */
	put(entry: ICacheEntry, value: any): Promise<void>;

	/**
	 * Removes the entries from the cache for given parametres.
	 * @param file - file entry to be deleted.
	 */
	removeEntries(file: IFileEntry): Promise<void>;
}

/**
 * Api to generate a cache key from cache entry.
 * @param entry - cache entry from which a cache key is generated
 * @returns The key for cache.
 * @internal
 */
export function getKeyForCacheEntry(entry: ICacheEntry): string {
	return `${entry.file.docId}_${entry.type}_${entry.key}`;
}
