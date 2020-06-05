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
export type CacheContentType = "snapshot";

/*
 * File / container identifier.
 * There is overlapping information here - host can use all of it or parts
 * to implement storage / identify files.
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

/*
 * Driver will implement exponential back-off policy when calling IPersistedCache.updateUsage()
 * to update host about file changes.
 * It will use these settings to start calling IPersistedCache.updateUsage()  every
 * 'startingUpdateUsageOpFrequency' ops initially and scale it with 'updateUsageOpMultiplier' multiplier.
 * As result, we will
 *   - reach 5K ops after 19 calls, with 500 ops between the calls at that mark
 *   - reach 1M ops after 73 calls, with 95K ops between the calls at that mark
 */
export const updateUsageOpMultiplier = 1.2;
export const startingUpdateUsageOpFrequency = 100;

/**
 * Persistent cache. This interface can be implemented by the host to provide durable caching
 * across sessions. If not provided at driver factory construction, factory will use in-memory
 * cache implementation that does not survive across sessions.
 */
export interface IPersistedCache {
    /**
     * Get the cache value of the key
     * @param entry - cache entry, identifies file and particular key for this file.
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
     * Put the value into cache.
     * Important - only serializable content is allowed since this cache may be persisted between sessions
     * @param entry - cache entry.
     * @param value - JSON-serializable content.
     * @param seqNumber - (reference) sequence number of snapshot. Incomming Ops will start with this number
     * (see updateUsage API).
     */
    put(entry: ICacheEntry, value: any, seqNumber: number): void;

    /*
     * Driver will call this API periodically to tell hosts about changes in document.
     * It tells latest sequence number observed for this document.
     * The bigger the number, the more stale entry (like snapshot)
     * Eventually entry should not be used and deleted by host from cache,
     * but exactly policy is host defined.
     * Notes:
     * Driver will implement exponential back off strategy here, calling this API
     * less and less often as data comes in. Please see startingUpdateUsageOpFrequency and
     * updateUsageOpMultiplier for reference implementation.
     * Multiple instances of same document can be opened by same page, host should expect some
     * that multiple entities can update data for same file.
     * Host should ignore sequence numbers that are lower than earlier reported for same file.
     */
    updateUsage(entry: ICacheEntry, seqNumber: number): void;
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
        return this.cache.get(entry).catch((error) => {
            this.logger.sendErrorEvent({ eventName: "cacheFetchError", type: entry.type }, error);
            return undefined;
        });
    }

    put(entry: ICacheEntry, value: any, seqNumber: number) {
        try {
            this.cache.put(entry, value, seqNumber);
        } catch (error) {
            this.logger.sendErrorEvent({ eventName: "cachePutError", type: entry.type }, error);
            return undefined;
        }
    }

    updateUsage(entry: ICacheEntry, seqNumber: number): void {
        try {
            this.cache.updateUsage(entry, seqNumber);
        } catch (error) {
            this.logger.sendErrorEvent({ eventName: "cacheUpdateUsageError", type: entry.type }, error);
            return undefined;
        }
    }
}

/** Describes how many ops behind snapshot can be for summarizer client to still use it */
export const snapshotExpirySummarizerOps = 1000;

/**
 * Default local-only implementation of IPersistedCache,
 * used if no persisted cache is provided by the host
 */
export class LocalPersistentCache implements IPersistedCache {
    private readonly snapshotExpiryPolicy = 30 * 1000;
    private readonly cache = new Map<string, any>();
    private readonly gc = new GarbageCollector<string>((key) => this.cache.delete(key));

    async get(entry: ICacheEntry, expiry?: number): Promise<any> {
        const key = this.keyFromEntry(entry);
        return this.cache.get(key);
    }

    put(entry: ICacheEntry, value: any, seqNumber: number) {
        const key = this.keyFromEntry(entry);
        this.cache.set(key, value);

        // Do not keep items too long in memory
        this.gc.cancel(key);
        this.gc.schedule(key, this.snapshotExpiryPolicy);
    }

    updateUsage(entry: ICacheEntry, seqNumber: number): void {
    }

    private keyFromEntry(entry: ICacheEntry): string {
        return `${entry.file.docId}_${entry.type}_${entry.key}`;
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

export function createOdspCache(
    persistedCache: IPersistedCache,
    nonpersistentCache: INonPersistentCache,
    logger: ITelemetryLogger): IOdspCache
{
    return {
        ...nonpersistentCache,
        persistedCache: new PersistedCacheWithErrorHandling(persistedCache, logger),
    };
}
