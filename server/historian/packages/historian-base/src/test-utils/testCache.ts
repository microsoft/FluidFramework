/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICache } from "../services";

export class TestCache implements ICache {
    private readonly dictionary = new Map<string, any>();

    async get<T>(key: string): Promise<T> {
        return Promise.resolve(this.dictionary.get(key));
    }
    async set<T>(key: string, value: T): Promise<void> {
        this.dictionary.set(key, value);
        return Promise.resolve();
    }
}
