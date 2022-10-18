/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDisposable } from "@fluidframework/common-definitions";
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
// class GarbageCollector<TKey> {
//     private readonly gcTimeouts = new Map<TKey, ReturnType<typeof setTimeout>>();

//     constructor(
//         private readonly cleanup: (key: TKey) => void,
//     ) { }

//     /**
//      * Schedule GC for the given key, as applicable
//      */
//     public schedule(key: TKey, durationMs: number) {
//         this.gcTimeouts.set(
//             key,
//             setTimeout(
//                 () => { this.cleanup(key); this.cancel(key); },
//                 durationMs,
//             ),
//         );
//     }

//     /**
//      * Cancel any pending GC for the given key
//      */
//     public cancel(key: TKey) {
//         const timeout = this.gcTimeouts.get(key);
//         if (timeout !== undefined) {
//             clearTimeout(timeout);
//             this.gcTimeouts.delete(key);
//         }
//     }
// }

class MapWithExpiration<TKey, TValue> extends Map<TKey, TValue> implements IDisposable {
    public disposed: boolean = false;
    private readonly expirationTimeouts = new Map<TKey, ReturnType<typeof setTimeout>>();

    constructor(
        private readonly expiryMs: number,
    ) {
        super();
    }
    private scheduleExpiration(key: TKey) {
        this.expirationTimeouts.set(
            key,
            setTimeout(
                () => { this.delete(key); },
                this.expiryMs,
            ),
        );
    }

    private cancelExpiration(key: TKey) {
        const timeout = this.expirationTimeouts.get(key);
        if (timeout !== undefined) {
            clearTimeout(timeout);
            this.expirationTimeouts.delete(key);
        }
    }

    get(key: TKey): TValue | undefined {
        return super.get(key);
    }

    set(key: TKey, value: TValue): this {
        // Sliding window expiration policy (on write)
        this.cancelExpiration(key);
        this.scheduleExpiration(key);

        return super.set(key, value);
    }

    delete(key: TKey): boolean {
        this.cancelExpiration(key);
        return super.delete(key);
    }

    dispose(_error?: Error): void {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        Array.from(this).forEach(([key]) => this.cancelExpiration(key));
    }
}

/**
 * Default local-only implementation of IPersistedCache,
 * used if no persisted cache is provided by the host
 */
export class LocalPersistentCache implements IPersistedCache, IDisposable {
    public get disposed(): boolean { return this.cache.disposed; }
    private readonly cache: MapWithExpiration<string, any>;

    // For every document id there will be a single expiration entry inspite of the number of cache entries.
    private readonly docIdExpirationMap = new Map<string, ReturnType<typeof setTimeout>>();

    public constructor(snapshotExpiryPolicy = 30 * 1000) {
        this.cache = new MapWithExpiration<string, any>(snapshotExpiryPolicy);
    }

    public dispose(error?: Error): void {
        this.cache.dispose(error);
    }

    async get(entry: ICacheEntry): Promise<any> {
        const key = this.keyFromEntry(entry);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return this.cache.get(key);
    }

    async put(entry: ICacheEntry, value: any) {
        const key = this.keyFromEntry(entry);
        this.cache.set(key, value);
        //*
        this.updateExpirationEntry(entry.file.docId);
    }

    async removeEntries(file: IFileEntry): Promise<void> {
        this.removeDocIdEntriesFromCache(file.docId);
    }

    private removeDocIdEntriesFromCache(docId: string) {
        this.removeExpirationEntry(docId);
        return Array.from(this.cache)
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

    private removeExpirationEntry(docId: string) {
        const timeout = this.docIdExpirationMap.get(docId);
        if (timeout !== undefined) {
            clearTimeout(timeout);
            this.docIdExpirationMap.delete(docId);
        }
    }

    private updateExpirationEntry(docId: string) {
        this.removeExpirationEntry(docId);
        this.docIdExpirationMap.set(
            docId,
            setTimeout(
                () => {
                    this.removeDocIdEntriesFromCache(docId);
                },
                this.snapshotExpiryPolicy,
            ),
        );
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
    readonly sessionJoinCache: PromiseCache<string,
        { entryTime: number; joinSessionResponse: ISocketStorageDiscovery; }>;

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
        new PromiseCache<string, { entryTime: number; joinSessionResponse: ISocketStorageDiscovery; }>();

    public readonly fileUrlCache = new PromiseCache<string, IOdspResolvedUrl>();
}
