/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { PromiseCache } from "@microsoft/fluid-common-utils";
import { ISocketStorageDiscovery, IOdspResolvedUrl } from "./contracts";

export interface ICacheLock {
    key: string;
    lockId: number;
    release: () => Promise<void>;
}

/**
 * A cache for data persisted between sessions.  Only serializable content should be put here!
 * This interface may be implemented and provided by the Host, and in order to allow a host
 * to include asynchronous operations in its implementation, each function returns Promise.
 */
export interface IPersistedCache {
    /**
     * lock the key for writing
     */
    lock(key: string): Promise<ICacheLock>;

    /**
     * Get the cache value of the key
     */
    get(key: string): Promise<any>;

    /**
     * Delete value in the cache
     */
    remove(key: string, lock: ICacheLock): Promise<void>;

    /**
     * Put the value into cache
     * Important - only serializable content is allowed since this cache may be persisted between sessions
     */
    put(key: string, value: any, lock: ICacheLock, expiryTime?: number): Promise<void>;
}

export class LocalCache extends EventEmitter implements IPersistedCache {
    private readonly cache: PromiseCache<string, any> = new PromiseCache<string, any>({
        expiry: { policy: "absolute", durationMs: 10 * 1000 },
    });
    private readonly heldLockIds: Map<string, number> = new Map();
    private nextLockId: number = 0;

    private lockNow(key: string): ICacheLock {
        const lock: ICacheLock = {
            key,
            lockId: ++this.nextLockId,
            release: async () => {
                this.heldLockIds.delete(key);
                this.emit("lockRelease", key);
            },
        };
        this.heldLockIds.set(key, lock.lockId);
        return lock;
    }

    private isLockCurrent(lock: ICacheLock, key: string) {
        return lock.lockId === this.heldLockIds.get(key);
    }

    async lock(key: string): Promise<ICacheLock> {
        if (!this.heldLockIds.has(key)) {
            return this.lockNow(key);
        }

        //* todo: add expiration on the lock (where is expiration specificed?)
        return new Promise((resolve) => {
            this.on("lockRelease", (releasedKey) => {
                if (releasedKey === key) {
                    resolve(this.lockNow(key));
                }
            });
        });
    }

    async get(key: string): Promise<any> {
        return this.cache.get(key);
    }

    async remove(key: string, lock: ICacheLock) {
        if (this.isLockCurrent(lock, key)) {
            this.cache.remove(key);
        }
    }

    //* todo: reimplement expiration
    async put(key: string, value: any, lock: ICacheLock, expiryTime?: number | undefined) {
        if (this.isLockCurrent(lock, key)) {
            this.cache.addValue(key, value);
        }
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
     * Cache of joined/joining sessions
     */
    readonly sessionCache: PromiseCache<string, ISocketStorageDiscovery>;

    /**
     * Cache of resolved/resolving file URLs
     */
    readonly fileUrlCache: PromiseCache<string, IOdspResolvedUrl>;
}

//* todo: Write good comments
//* todo: double-check expirations
export class OdspCache implements IOdspCache {
    /**
     * Permanent cache of
     * We are storing the getLatest response in cache for 10s so that other
     * containers initializing in the same timeframe can use this
     * result. We are choosing a small time period as the summarizes
     * are generated frequently and if that is the case then we don't
     * want to use the same getLatest result.
     */

    /**
     * Cache of join session call results.
     * If the result is valid and used within an hour we put the same result again with updated time
     * to keep using it for consecutive join session calls.
     */
    public readonly sessionCache = new PromiseCache<string, ISocketStorageDiscovery>({
        expiry: { policy: "sliding", durationMs: 60 * 60 * 1000 },
    });

    /**
     *
     */
    public readonly fileUrlCache = new PromiseCache<string, IOdspResolvedUrl>();

    //* todo: comment
    constructor(
        public readonly persistedCache: IPersistedCache = new LocalCache(),
    ) {}
}
