/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PromiseCache } from "@fluidframework/common-utils";
import { IFluidResolvedUrl } from "@fluidframework/driver-definitions";
import { ISocketStorageDiscovery, IOdspResolvedUrl } from "./contracts";

/**
 * Describes what kind of content is stored in cache entry.
 */
export type CacheKey = "Snapshot";

/*
 * There is overlapping information here - host can use all of it or parts
 * to implement storage / identify files.
 * Driver guarantees that docId is stable ID uniquely identifying document.
 */
export interface IFileEntry {
    /**
     * Unique and stable ID of the document. This is the key to the cache
     */
    docId: string;
    /**
     * Resolved URI is provided for additional versatility - host can use it to
     * identify file in storage, and (as example) delete all cached entries for
     * a file if user requests so.
     * This is IOdspResolvedUrl in case of ODSP driver.
     */
    resolvedUrl: IFluidResolvedUrl;
}

/**
 * Cache entry. Identifies file that this entry belongs to, and type of content stored in it.
 */
export interface ICacheEntry {
    /**
     * Identifies file in storage this cached entry is for
     */
    file: IFileEntry;
    /**
     * Identifies individual entry for a given file.
     */
    key: CacheKey;
}

/**
 * Versioned cache entry.
 */
export interface ICacheVersionedEntry extends ICacheEntry {
    /**
     * Version of cached entry.
     * When putting new entry, new entry always overwrites previous entry no matter what the version is.
     * When removing entry, entry is removed only if version of previously stored entry matches version
     * supplied.
     */
    version: string;
}

/**
 * Persistent cache. This interface can be implemented by the host to provide durable caching
 * across sessions. If not provided, driver will provide in-memory cache that does not survive
 * across session boundary.
 *
 * Note that entries stored in cache are versioned, but request for data are not (version-less).
 * Host is expected to store only latest version provided by driver.
 * Updates on usage contain version info. If newer version of entry is already stored in cache,
 * host should ignore such updates.
 */
export interface IPersistedCache {
    /**
     * Get the cache value of the key
     * @param entry - cache entry.
     * @returns Cached value. undefined if nothing is cached.
     */
    get(entry: ICacheEntry): Promise<any>;

    /**
     * Put the value into cache. Overwrites any prior version of same entry.
     * Important - only serializable content is allowed since this cache may be persisted between sessions
     * @param entry - cache entry.
     * @param value - jasonable content.
     */
    put(entry: ICacheVersionedEntry, value: any): void;

    /**
     * Supplies optional expiration for the cache entry.
     * Call should be ignored by implementer if version of entry does not match version stored in cache!
     * Driver may periodically call this API for an entry to update host on expiration time,
     * based on internal heuristics and new information (like how stale is snapshot based on how many ops are
     * on top of such snapshot). Please note that expiry time is just an educated guess.
     * The best strategy hosts can implement is not to delete entries right when they expire, but
     * rather do a combination of
     * 1) Delete entries on get() if it expired
     * 2) Implement MRU (most recent used) eviction policy to control cache size
     * This is more efficient then deleting entries based on timer as there may be no activity in a file,
     * or tab might be suspended for a long period of time, causing expiration timer to fire. However, the
     * next time some file activity happens (or tab gets more CPU), driver may come back and update expiry time
     * and it may happen that it's still not that stale and could be reused, despite earlier calculation suggesting
     * it expired.
     * @param entry - cache entry. Call should be ignored if version of entry does not match version stored in cache.
     * @param origExpiryTime - original expiry time, in milliseconds. This value does not change for an entry and
     * provides information on default policy driver uses if no other information is available.
     * @param expiryTime - suggested expiration time, in milliseconds, based on new information. Can be negative if
     * already well into expiration! This timer linearly scales down to zero and beyond zero based on new information
     * (like ops available on top of snapshot).
     * Implementer of cache is free to overwrite it / implement different policy, or scale expiryTime linearly.
     */
    updateExpiry(entry: ICacheVersionedEntry, origExpiryTime: number, expiryTime: number): void;
}

/**
 * Handles garbage collection of expiring cache entries.
 * Not exported.
 * (Based off of the same class in promiseCache.ts, could be consolidated)
 */
class GarbageCollector<TKey> {
    private readonly gcTimeouts = new Map<TKey, NodeJS.Timeout>();

    constructor(
        private readonly cleanup: (key: TKey) => void,
    ) {}

    /**
     * Schedule GC for the given key, as applicable
     */
    public schedule(key: TKey, durationMs: number) {
        this.gcTimeouts.set(
            key,
            setTimeout(
                () => { this.cleanup(key); this.cancel(key); },
                durationMs,
            ),
        );
    }

    /**
     * Cancel any pending GC for the given key
     */
    public cancel(key: TKey) {
        const timeout = this.gcTimeouts.get(key);
        if (timeout !== undefined) {
            clearTimeout(timeout);
            this.gcTimeouts.delete(key);
        }
    }
}

/**
 * Default local-only implementation of IPersistedCache,
 * used if no persisted cache is provided by the host
 */
export class LocalCache implements IPersistedCache {
    private readonly cache = new Map<ICacheEntry, any>();
    private readonly gc = new GarbageCollector<ICacheEntry>((key) => this.cache.delete(key));

    async get(entry: ICacheEntry): Promise<any> {
        return this.cache.get(entry);
    }

    put(entry: ICacheEntry, value: any) {
        this.gc.cancel(entry);
        this.cache.set(entry, value);
    }

    updateExpiry(entry: ICacheVersionedEntry, origExpiryTime: number, expiryTime: number): void {
        if (expiryTime <= 0) {
            this.cache.delete(entry);
            this.gc.cancel(entry);
        } else {
            this.gc.schedule(entry, expiryTime);
        }
    }
}

export class PromiseCacheWithOneHourSlidingExpiry<T> extends PromiseCache<string, T> {
    constructor(removeOnError?: (e: any) => boolean) {
        super({ expiry: { policy: "sliding", durationMs: 3600000 }, removeOnError });
    }
}

/**
 * Internal cache interface used within driver only
 */
export interface IOdspCache {
    /**
     * Persisted cache - only serializable content is allowed
     */
    readonly persistedCache: IPersistedCache;

    /**
     * Cache of joined/joining session info
     * This cache will use a one hour sliding expiration window.
     */
    readonly sessionJoinCache: PromiseCacheWithOneHourSlidingExpiry<ISocketStorageDiscovery>;

    /**
     * Cache of resolved/resolving file URLs
     */
    readonly fileUrlCache: PromiseCache<string, IOdspResolvedUrl>;
}

export class OdspCache implements IOdspCache {
    public readonly sessionJoinCache = new PromiseCacheWithOneHourSlidingExpiry<ISocketStorageDiscovery>();

    public readonly fileUrlCache = new PromiseCache<string, IOdspResolvedUrl>();

    /**
     * Initialize the OdspCach, with an optional cache to store persisted data in.
     * If an IPersistedCache is not provided, we'll use a local-only cache for this session.
     */
    constructor(
        public readonly persistedCache: IPersistedCache = new LocalCache(),
    ) {}
}
