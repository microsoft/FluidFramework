/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PromiseCache } from "@fluidframework/common-utils";
import { IFluidResolvedUrl } from "@fluidframework/driver-definitions";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { ISocketStorageDiscovery, IOdspResolvedUrl } from "./contracts";

/**
 * Describes what kind of content is stored in cache entry.
 */
export type CacheKey = "snapshot";

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

/*
 * Driver will implement exponential back-off policy when it comes to updating usage of snapshots
 * It will use these settings to start reporting every 'startingUpdateUsageOpFrequency' ops and scale
 * that distance with 'updateUsageOpMultiplier' multiplier.
 * As result, we will
 *   - reach 5K ops with 19 calls, with 500 ops between the calls at that mark
 *   - reach 1M ops with 73 calls, with 95K ops between the calls at that mark
 */
export const updateUsageOpMultiplier = 1.2;
export const startingUpdateUsageOpFrequency = 100;

/**
 * Versioned cache entry.
 */
export interface ICacheVersionedEntry extends ICacheEntry {
    /**
     * Version of cached entry.
     * When new entry is put to cache, old entries (all other versions) should be trimmed from the cache.
     * Requests for data are version-less, and should return last version put into the cache.
     * As such, version information is useful for updateUsage() calls, as individual clients do not
     * know if they are operating on latest version, Requests to update usage from such clients should
     * be ignored.
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
 * Latest is defined by the time of put() call, there is no way to compare versions other than for equality.
 * Updates on usage contain version info. If newer version of entry is already stored in cache,
 * host should ignore such updates.
 */
export interface IPersistedCache {
    /**
     * Get the cache value of the key
     * @param entry - cache entry.
     * @param maxOpCount - If provided, indicates driver-specific policy on expiry
     * If snapshot has more than that amount of ops (based on earlier updateUsage() calls), host should not
     * return such entry (and return undefined).
     * This does not mean entry should be deleted, just particular usage pattern in runtime / driver can't use
     * such an old entry
     * An example of such usage would be booting summarizer client. Latency is less important in such scenario,
     * but fetching more recent snapshot is advantageous in reducing bandwidth requirements (less ops to download).
     * Logic around when to expire / evict entries should not account for calls where cache entry is not returned.
     * @returns Cached value. undefined if nothing is cached.
    */
    get(entry: ICacheEntry, maxOpCount?: number): Promise<any>;

    /**
     * Put the value into cache. Overwrites any prior version of same entry.
     * Important - only serializable content is allowed since this cache may be persisted between sessions
     * @param entry - cache entry.
     * @param value - JSON-serializable content.
     */
    put(entry: ICacheVersionedEntry, value: any, seqNumber?: number): void;

    // Tells how far given entry is behind, in number of ops.
    // The bigger the number, the more stale entry (like snapshot)
    // Eventually entry should not be used and deleted by host from cache,
    // but exactly policy is host defined.
    // NOte: Driver will implement exponential back off stretegy here, calling this API
    // less and less often as data comes in. Please see startingUpdateUsageOpFrequency and
    // updateUsageOpMultiplier for reference implementation
    updateUsage(entry: ICacheVersionedEntry, opCount: number): void;
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

export class PersistedCacheWithErrorHandling implements IPersistedCache {
    public constructor(
        protected readonly cache: IPersistedCache,
        protected readonly logger: ITelemetryLogger) {
    }

    async get(entry: ICacheEntry, expiry?: number): Promise<any> {
        try {
            return this.cache.get(entry);
        } catch (error) {
            this.logger.sendErrorEvent({ eventName: "cacheFetchError", key: entry.key }, error);
            return undefined;
        }
    }

    put(entry: ICacheVersionedEntry, value: any, seqNumber?: number) {
        try {
            this.cache.put(entry, value, seqNumber);
        } catch (error) {
            this.logger.sendErrorEvent({ eventName: "cachePutError", key: entry.key }, error);
            return undefined;
        }
    }

    updateUsage(entry: ICacheVersionedEntry, opCount: number): void {
        try {
            this.cache.updateUsage(entry, opCount);
        } catch (error) {
            this.logger.sendErrorEvent({ eventName: "cacheUpdateUsageError", key: entry.key }, error);
            return undefined;
        }
    }
}

export const snapshotExpiryDefaultPolicy = 10000;

/** Describes how many ops behind snapshot can be for summarizer client to still use it */
export const snapshotExpirySummarizerOps = 1000;

/**
 * Default local-only implementation of IPersistedCache,
 * used if no persisted cache is provided by the host
 */
export class LocalPersistentCache implements IPersistedCache {
    private readonly cache = new Map<ICacheEntry, any>();
    private readonly gc = new GarbageCollector<ICacheEntry>((key) => this.cache.delete(key));

    async get(entry: ICacheEntry, expiry?: number): Promise<any> {
        return this.cache.get(entry);
    }

    put(entry: ICacheVersionedEntry, value: any, seqNumber?: number) {
        this.cache.set(entry, value);

        // Do not keep items too long in memory
        this.gc.cancel(entry);
        this.gc.schedule(entry, snapshotExpiryDefaultPolicy);
    }

    updateUsage(entry: ICacheVersionedEntry, opCount: number): void {
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
export interface INonPersistentCache {
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

/**
 * Internal cache interface used within driver only
 */
export interface IOdspCache extends INonPersistentCache {
    /**
     * Persisted cache - only serializable content is allowed
     */
    readonly persistedCache: IPersistedCache;
}

export class NonPersistentCache implements INonPersistentCache {
    public readonly sessionJoinCache = new PromiseCacheWithOneHourSlidingExpiry<ISocketStorageDiscovery>();

    public readonly fileUrlCache = new PromiseCache<string, IOdspResolvedUrl>();
}

export class OdspCache extends NonPersistentCache implements IOdspCache {
    readonly persistedCache: IPersistedCache;

    /**
     * Initialize the OdspCach, with an optional cache to store persisted data in.
     * If an IPersistedCache is not provided, we'll use a local-only cache for this session.
     */
    constructor(
        persistedCache: IPersistedCache,
        nonpersistentCache: NonPersistentCache,
        logger: ITelemetryLogger)
    {
        super();
        this.persistedCache = new PersistedCacheWithErrorHandling(
            persistedCache,
            logger);

        Object.assign(this, nonpersistentCache);
    }
}
