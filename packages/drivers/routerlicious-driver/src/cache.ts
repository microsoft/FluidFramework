/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { get, set, del } from "idb-keyval";

export const isNode = () => typeof window === "undefined";

export interface ICacheEntry<T> {
    value: T;
    expiration?: Date;
}
export interface ICache {
    get<T>(key: string): Promise<T | undefined>;
    put<T>(key: string, value: ICacheEntry<T>): Promise<void>;
}

function isCacheEntryExpired(entry: ICacheEntry<any>): boolean {
    return entry.expiration !== undefined && Date.now() > entry.expiration.getTime()
}

export class InMemoryCache implements ICache {
    private readonly cache: Map<string, ICacheEntry<any>> = new Map();

    public async get<T>(key: string): Promise<T | undefined> {
        const entry: ICacheEntry<T> | undefined = await this.cache.get(key);
        if (entry === undefined) {
            return undefined;
        }
        if (isCacheEntryExpired(entry)) {
            this.cache.delete(key);
            return undefined;
        }
        return entry.value;
    }

    public async put<T>(key: string, entry: ICacheEntry<T>): Promise<void> {
        this.cache.set(key, entry);
    }
}

export class IndexedDBCache implements ICache {
    public async get<T>(key: string): Promise<T | undefined> {
        const entry: ICacheEntry<T> | undefined = await get(key);
        if (entry === undefined) {
            return undefined;
        }
        if (isCacheEntryExpired(entry)) {
            // Ignore deletion errors; they are not critical.
            del(key).catch(() => {});
            return undefined;
        }
        return entry.value;
    }

    public async put<T>(key: string, value: ICacheEntry<T>): Promise<void> {
        await set(key, value);
    }
}
