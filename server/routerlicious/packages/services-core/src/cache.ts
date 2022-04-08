/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Interface for a page object cache
 */
export interface ICache {
    /**
     * Retrieves the cached entry for the given key. Or null if it doesn't exist.
     */
    get(key: string): Promise<string>;

    /**
     * Sets a cache value
     */
    set(key: string, value: string, expireAfterSeconds?: number): Promise<void>;
}
