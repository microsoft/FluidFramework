/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { PromiseCache } from "@fluidframework/common-utils";
import {
    IOdspResolvedUrl,
    IFileEntry,
    IEntry,
    IPersistedCache,
    ICacheEntry,
} from "@fluidframework/odsp-driver-definitions";
import { ISocketStorageDiscovery } from "./contracts";
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
     */
    readonly sessionJoinCache: PromiseCache<string, {entryTime: number, joinSessionResponse: ISocketStorageDiscovery}>;

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
    public readonly sessionJoinCache =
        new PromiseCache<string, {entryTime: number, joinSessionResponse: ISocketStorageDiscovery}>();

    public readonly fileUrlCache = new PromiseCache<string, IOdspResolvedUrl>();
}
