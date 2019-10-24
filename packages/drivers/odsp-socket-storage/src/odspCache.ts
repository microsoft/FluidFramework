/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export class OdspCache {
    private readonly odspCache: Map<string, any>;

    constructor() {
        this.odspCache = new Map<string, any>();
    }

    public get(key: string, removeKey: boolean = false) {
        const val = this.odspCache.get(key);
        if (removeKey && val) {
            this.odspCache.delete(key);
        }
        return val;
    }

    public put(key: string, value: any, expiryTime: number) {
        this.odspCache.set(key, value);
        // tslint:disable-next-line: no-floating-promises
        this.gc(key, expiryTime);
    }

    private async gc(key: string, expiryTime: number) {
        // tslint:disable-next-line: no-string-based-set-timeout
        const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));
        await delay(expiryTime);
        if (this.odspCache.has(key)) {
            this.odspCache.delete(key);
        }
    }
}
