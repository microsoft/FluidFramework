/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export interface IOdspCache {
    get(key: string): any;
    remove(key: string);
    put(key: string, value: any, expiryTime?: number);
}

export class OdspCache implements IOdspCache {
    private readonly odspCache: Map<string, any>;

    constructor() {
        this.odspCache = new Map<string, any>();
    }

    public get(key: string) {
        const val = this.odspCache.get(key);
        return val;
    }

    public remove(key: string) {
        return this.odspCache.delete(key);
    }

    public put(key: string, value: any, expiryTime?: number) {
        this.odspCache.set(key, value);
        if (expiryTime) {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            this.gc(key, expiryTime);
        }
    }

    private async gc(key: string, expiryTime: number) {
        // eslint-disable-next-line @typescript-eslint/promise-function-async
        const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));
        await delay(expiryTime);
        if (this.odspCache.has(key)) {
            this.odspCache.delete(key);
        }
    }
}
