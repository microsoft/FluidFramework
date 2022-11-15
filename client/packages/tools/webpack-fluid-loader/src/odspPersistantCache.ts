/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICacheEntry, IFileEntry, IPersistedCache } from "@fluidframework/odsp-driver-definitions";

export class OdspPersistentCache implements IPersistedCache {
    private readonly cache = new Map<string, any>();

    public constructor() {}

    async get(entry: ICacheEntry): Promise<any> {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return this.cache.get(this.keyFromEntry(entry));
    }

    async put(entry: ICacheEntry, value: any) {
        this.cache.set(this.keyFromEntry(entry), value);
    }

    async removeEntries(file: IFileEntry): Promise<void> {}

    private keyFromEntry(entry: ICacheEntry): string {
        return `${entry.file.docId}_${entry.type}_${entry.key}`;
    }
}
