/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { MapWithExpiration } from "@fluidframework/driver-base";
import { FiveDaysMs } from "@fluidframework/driver-definitions";

export interface ICache<T> {
    get(key: string): Promise<T | undefined>;
    put(key: string, value: T): Promise<void>;
}

const fiveDaysMs: FiveDaysMs = 432000000;

export class InMemoryCache<T> implements ICache<T> {
    private readonly cache: MapWithExpiration<string, T> = new MapWithExpiration(fiveDaysMs);

    public async get(key: string): Promise<T | undefined> {
        return this.cache.get(key);
    }

    public async put(key: string, value: T): Promise<void> {
        this.cache.set(key, value);
    }
}

export class NullCache<T> implements ICache<T> {
    public async get(key: string): Promise<T | undefined> {
        return undefined;
    }

    public async put(key: string, value: T): Promise<void> {
    }
}
