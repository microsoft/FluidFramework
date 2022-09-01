/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export interface ICache<T> {
    get(key: string): Promise<T | undefined>;
    put(key: string, value: T): Promise<void>;
}

export class InMemoryCache<T> implements ICache<T> {
    private readonly cache: Map<string, T> = new Map();

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
