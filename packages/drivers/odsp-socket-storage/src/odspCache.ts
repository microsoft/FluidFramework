/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export class OdspCache {
    private readonly odspCache: Map<string, any>;

    constructor() {
        this.odspCache = new Map<string, any>();
    }

    public get(key: string) {
        return this.odspCache.get(key);
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
        this.odspCache.delete(key);
    }
}
