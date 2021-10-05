/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICache } from "../../services";

export class TestCache implements ICache {
    private readonly dictionary = new Map<string, any>();

    async get<T>(key: string): Promise<T> {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return Promise.resolve(this.dictionary.get(key));
    }
    async set<T>(key: string, value: T): Promise<void> {
        this.dictionary.set(key, value);
        return Promise.resolve();
    }
    async deleteIfExists<T>(key: string): Promise<void> {
        if (this.dictionary.has(key)) {
            this.dictionary.delete(key);
        }

        return Promise.resolve();
    }
}
