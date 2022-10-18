/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDisposable } from "@fluidframework/common-definitions";
import { MapWithExpiration } from "@fluidframework/driver-utils";
import { FiveDaysMs } from "@fluidframework/driver-definitions";

export interface ICache<T> extends IDisposable {
    get(key: string): Promise<T | undefined>;
    put(key: string, value: T): Promise<void>;
}

/** This is the max allowed value per the IDocumentStorageServicePolicies.maximumCacheDurationMs policy */
const fiveDaysMs: FiveDaysMs = 432000000;

/** A basic in-memory cache that expires entries after 5 days */
export class InMemoryCache<T> implements ICache<T> {
    public get disposed(): boolean { return this.cache.disposed; }
    public dispose() { this.cache.dispose(); }

    private readonly cache: MapWithExpiration<string, T> = new MapWithExpiration(fiveDaysMs);

    public async get(key: string): Promise<T | undefined> {
        return this.cache.get(key);
    }

    public async put(key: string, value: T): Promise<void> {
        this.cache.set(key, value);
    }
}

/** This "cache" does nothing on get/put */
export class NullCache<T> implements ICache<T> {
    public disposed: boolean = false;
    public dispose() { this.disposed = true; }

    public async get(key: string): Promise<T | undefined> {
        return undefined;
    }

    public async put(key: string, value: T): Promise<void> {
    }
}
