/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { RedisClient } from "redis";
import * as util from "util";

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
    set(key: string, value: string): Promise<void>;
}
/**
 * Redis based cache client
 */
export class RedisCache implements ICache {
    private getAsync: any;
    private setAsync: any;

    constructor(client: RedisClient, private prefix = "page") {
        this.getAsync = util.promisify(client.get.bind(client));
        this.setAsync = util.promisify(client.set.bind(client));
    }

    public async get(key: string): Promise<string> {
        return this.getAsync(this.getKey(key));
    }

    public async set(key: string, value: string): Promise<void> {
        const result = await this.setAsync(this.getKey(key), value);
        if (result !== "OK") {
            return Promise.reject(result);
        }
    }

    /**
     * Translates the input key to the one we will actually store in redis
     */
    private getKey(key: string): string {
        return `${this.prefix}:${key}`;
    }
}
