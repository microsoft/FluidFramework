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
export const snapshotKey = "snapshot";
export type CacheContentType = "snapshot" | "ops";

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
 * cache implementation that does not survive across sessions.
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
 * Similar to IPersistedCache, but exposes cache interface for single file
 */
export interface IPersistedFileCache {
    get(entry: IEntry): Promise<any>;
    put(entry: IEntry, value: any): Promise<void>;
    removeEntries(): Promise<void>;
}

/**
 * Handles garbage collection of expiring cache entries.
 * Not exported.
 * (Based off of the same class in promiseCache.ts, could be consolidated)
 */
class GarbageCollector<TKey> {
    private readonly gcTimeouts = new Map<TKey, ReturnType<typeof setTimeout>>();

    constructor(
        private readonly cleanup: (key: TKey) => void,
    ) { }

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
export class LocalPersistentCache implements IPersistedCache {
    private readonly cache = new Map<string, any>();
    private readonly gc = new GarbageCollector<string>((key) => this.cache.delete(key));

    public constructor(private readonly snapshotExpiryPolicy = 30 * 1000) {}

    async get(entry: ICacheEntry): Promise<any> {
        const key = this.keyFromEntry(entry);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return this.cache.get(key);
    }

    async put(entry: ICacheEntry, value: any) {
        const key = this.keyFromEntry(entry);
        this.cache.set(key, value);

        // Do not keep items too long in memory
        this.gc.cancel(key);
        this.gc.schedule(key, this.snapshotExpiryPolicy);
    }

    async removeEntries(file: IFileEntry): Promise<void> {
        Array.from(this.cache)
        .filter(([cachekey]) => {
            const docIdFromKey = cachekey.split("_");
            if (docIdFromKey[0] === file.docId) {
                return true;
            }
        })
        .map(([cachekey]) => {
            this.cache.delete(cachekey);
        });
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
    readonly persistedCache: IPersistedFileCache;
}

export class NonPersistentCache implements INonPersistentCache {
    public readonly sessionJoinCache = new PromiseCacheWithOneHourSlidingExpiry<ISocketStorageDiscovery>();

    public readonly fileUrlCache = new PromiseCache<string, IOdspResolvedUrl>();
}
