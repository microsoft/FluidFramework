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
    readonly sessionStorage: ICache;
}

export class LocalCache implements ICache {
    private readonly cache = new Map<string, any>();

    public async get(key: string) {
        return this.cache.get(key);
    }

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
        // eslint-disable-next-line @typescript-eslint/promise-function-async
        const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));
        await delay(expiryTime);
        if (this.cache.has(key)) {
            this.cache.delete(key);
        }
    }

}

export class OdspCache implements IOdspCache {
    public readonly localStorage: ICache;
    public readonly sessionStorage: ICache = new LocalCache();

    constructor(permanentCache?: ICache) {
        this.localStorage = permanentCache !== undefined ? permanentCache : new LocalCache();
    }
}
