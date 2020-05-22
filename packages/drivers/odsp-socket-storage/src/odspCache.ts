/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PromiseCache } from "@fluidframework/common-utils";
import { ISocketStorageDiscovery, IOdspResolvedUrl } from "./contracts";

/**
 * Describes what kind of content is stored in cache entry.
 */
export enum CacheKey {
    Snapshot,
}

/*
 * Driver uses this interface to identify file when talking to IPersistedCache
 * There is overlapping information here - host can use all of it or parts
 * to implement storage / identify files.
 * Driver guarantees that docId is stable ID uniquely identifying document.
 */
export interface IFileEntry {
    driveId: string;
    itemId: string;
    docId: string;
}

/**
 * Cache entry. Identifies file that this entry belongs to, and type of content stored in it.
 */
export interface ICacheEntry {
    file: IFileEntry;
    key: CacheKey;
}

/**
 * Persistent cache. This interface can be implemented by the host to provide durable caching
 * across sessions. If not provided, driver will provide in-memory cache that does not survive
 * across session boundary.
 */
export interface IPersistedCache {
    /**
     * Get the cache value of the key
     */
    get(entry: ICacheEntry): Promise<any>;

    /**
     * Delete value in the cache
     */
    remove(entry: ICacheEntry): Promise<void>;

    /**
     * Put the value into cache
     * Important - only serializable content is allowed since this cache may be persisted between sessions
     * @param expiryTime - suggested expiration time, in milliseconds.
     * Implementer of cache is free to overwrite it / implement different policy.
     */
    put(entry: ICacheEntry, value: any, expiryTime?: number): Promise<void>;
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

    async get(key: ICacheEntry): Promise<any> {
        return this.cache.get(key);
    }

    async remove(key: ICacheEntry) {
        this.cache.delete(key);
        this.gc.cancel(key);
    }

    async put(key: ICacheEntry, value: any, expiryTime?: number) {
        this.cache.set(key, value);
        if (expiryTime) {
            this.gc.schedule(key, expiryTime);
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
