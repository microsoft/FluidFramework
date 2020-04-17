/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export interface ICache {
    /**
     * Get the cache value of the key
     */
    get(key: string): Promise<any>;

    /**
     * Deletes value in storage
     */
    remove(key: string);

    /**
     * puts value into cache
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
