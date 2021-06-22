/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ICacheEntry, IFileEntry, IPersistedCache } from "@fluidframework/odsp-driver-definitions";
export declare class OdspPersistentCache implements IPersistedCache {
    private readonly cache;
    constructor();
    get(entry: ICacheEntry): Promise<any>;
    put(entry: ICacheEntry, value: any): Promise<void>;
    removeEntries(file: IFileEntry): Promise<void>;
    private keyFromEntry;
}
//# sourceMappingURL=odspPersistantCache.d.ts.map