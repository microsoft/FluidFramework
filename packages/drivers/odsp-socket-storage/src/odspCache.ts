/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";

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

    public remove(key: string) {
        return this.odspCache.delete(key);
    }

    public put(key: string, value: any, expiryTime?: number) {
        assert(!this.odspCache.has(key), "Insertion rejected because cache already has that key!!");
        this.odspCache.set(key, value);
        if (expiryTime) {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            this.gc(key, expiryTime);
        }
    }

    private async gc(key: string, expiryTime: number) {
        const delay = async (ms: number) => new Promise((res) => setTimeout(res, ms));
        await delay(expiryTime);
        if (this.odspCache.has(key)) {
            this.odspCache.delete(key);
        }
    }
}
