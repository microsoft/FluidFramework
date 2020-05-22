/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PromiseCache } from "@microsoft/fluid-common-utils";
import { ISocketStorageDiscovery, IOdspResolvedUrl } from "./contracts";

/**
 * A cache for data persisted between sessions.  Only serializable content should be put here!
 * This interface may be implemented and provided by the Host, and in order to allow a host
 * to include asynchronous operations in its implementation, each function returns Promise.
 */
export interface IPersistedCache {
    /**
     * Get the cache value of the key
     */
    get(key: string): Promise<any>;

    /**
     * Delete value in the cache
     */
    remove(key: string): Promise<void>;

    /**
     * Put the value into cache
     * Important - only serializable content is allowed since this cache may be persisted between sessions
     */
    put(key: string, value: any, expiryTime?: number): Promise<void>;
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
    private readonly cache = new Map<string, any>();
    private readonly gc: GarbageCollector<string> = new GarbageCollector<string>((key) => this.cache.delete(key));

    async get(key: string): Promise<any> {
        return this.cache.get(key);
    }

    async remove(key: string) {
        this.cache.delete(key);
        this.gc.cancel(key);
    }

    async put(key: string, value: any, expiryTime?: number) {
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
