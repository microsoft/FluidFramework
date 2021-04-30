/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICacheEntry, IFileEntry, IPersistedCache } from "@fluidframework/odsp-driver-definitions";

export class OdspPersistentCache implements IPersistedCache {
    private readonly cache = new Map<string, any>();

    public constructor() {}

    async get(entry: ICacheEntry): Promise<any> {
        const key = this.keyFromEntry(entry);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return this.cache.get(key);
    }

    async put(entry: ICacheEntry, value: any) {
        const key = this.keyFromEntry(entry);
        this.cache.set(key, value);
    }

    async removeEntries(file: IFileEntry): Promise<void> {
        Array.from(this.cache)
        .filter(([cachekey]) => {
            const docIdFromKey = cachekey.split("_");
            if (docIdFromKey[0] === file.docId) {
                return true;
            }
        })
        .map(([cachekey]) => {
            this.cache.delete(cachekey);
        });
    }

    private keyFromEntry(entry: ICacheEntry): string {
        return `${entry.file.docId}_${entry.type}_${entry.key}`;
    }
}
