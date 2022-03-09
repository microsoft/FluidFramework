/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
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
 * Default local-only implementation of IPersistedCache,
 * used if no persisted cache is provided by the host
 */
export class LocalPersistentCache implements IPersistedCache {
    private readonly pc: PromiseCache<string, any>;

    public constructor(private readonly snapshotExpiryPolicy = 30 * 1000) {
        this.pc = new PromiseCache<string, any>({ expiry: {policy:"sliding", durationMs: this.snapshotExpiryPolicy} });
    }

    async get(entry: ICacheEntry): Promise<any> {
        const key = this.keyFromEntry(entry);
        return this.pc.get(key);
    }

    async put(entry: ICacheEntry, value: any) {
        const key = this.keyFromEntry(entry);
        this.pc.addValue(key,value);
    }

    async removeEntries(file: IFileEntry): Promise<void> {
        if (typeof this.pc.getEntries === "function" &&
            this.pc.getEntries !== null)
        {
            this.pc.getEntries()
            .filter(([cachekey]) => {
                const docIdFromKey = cachekey.split("_");
                if (docIdFromKey[0] === file.docId) {
                    return true;
                }
            })
            .map(([cachekey]) => {
                this.pc.remove(cachekey);
            });
        }
        else
        {
            assert("getEntries implementation not found");
        }
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
