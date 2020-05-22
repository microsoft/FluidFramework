/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
  * A configuration that defines caching behavior.
  */
export interface ICachePolicy {
    /**
     * Defines how long (in milliseconds) user content should be cached. Making this number larger increases the
     * probability of a cache hit and also increases the probability that the user will see noticeably stale content.
     */
    userContentCacheExpiry: number;
}

export const defaultCachePolicy: ICachePolicy = {
    // By default, we only cache user content for 10 seconds
    userContentCacheExpiry: 10 * 1000,
};

/**
  * A generic caching interface that can be used to save values, like network calls, that are expensive to obtain.
  */
export interface ICache {
    /**
     * Called when a value is being requested from the cache.
     * @param key - The key of the data that is being requested.
     * @returns A promise that resolves to cached data or undefined if the item is not in the cache or is expired.
     */
    get(key: string): Promise<any>;

    /**
     * Called when a value should be removed from the cache.
     * @param key - The key of the item to remove from the cache
     */
    remove(key: string);

    /**
     * Called when a value should be inserted in the cache.
     * @param key - A unique key that is associated with this data. Will be used later for fetching.
     * @param value - The value of the data that should be stored.
     * @param expiryTime - The number of milliseconds from the current time that this data should be safe to cache.
     */
    put(key: string, value: any, expiryTime?: number);
}

export interface ISessionCache {
    /**
     * Get the cache value of the key
     * This is syncronous API
     */
    get(key: string): any;

    /**
     * Deletes value in storage
     */
    remove(key: string);

    /**
     * puts value into cache
     */
    put(key: string, value: any, expiryTime?: number);
}

/**
 * Internal cache interface used within driver only
 */
export interface IOdspCache {
    /**
     * permanent cache - only serializable content is allowed
     */
    readonly localStorage: ICache;

    /**
     * session cache - non-serializable content is allowed
     */
    readonly sessionStorage: ISessionCache;
}

export class CacheBase {
    protected readonly cache = new Map<string, any>();

    public remove(key: string) {
        this.cache.delete(key);
    }

    public put(key: string, value: any, expiryTime?: number) {
        this.cache.set(key, value);
        if (value instanceof Promise) {
            value.catch(() => {
                this.remove(key);
            });
        }
        if (expiryTime) {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            this.gc(key, expiryTime);
        }
    }

    private async gc(key: string, expiryTime: number) {
        const delay = async (ms?: number) => new Promise((res) => setTimeout(res, ms));
        await delay(expiryTime);
        if (this.cache.has(key)) {
            this.cache.delete(key);
        }
    }
}

export class LocalCache extends CacheBase implements ICache {
    public async get(key: string) {
        return this.cache.get(key);
    }
}

export class SessionCache extends CacheBase implements ISessionCache {
    public get(key: string) {
        return this.cache.get(key);
    }
}

export class OdspCache implements IOdspCache {
    public readonly localStorage: ICache;
    public readonly sessionStorage: ICache = new SessionCache();

    constructor(permanentCache?: ICache) {
        this.localStorage = permanentCache !== undefined ? permanentCache : new LocalCache();
    }
}
