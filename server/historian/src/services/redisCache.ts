/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { RedisClient } from "redis";
import * as util from "util";
import { ICache } from "./definitions";

/**
 * Redis based cache client
 */
export class RedisCache implements ICache {
    private getAsync;
    private setAsync;

    constructor(client: RedisClient, private prefix = "git") {
        this.getAsync = util.promisify(client.get.bind(client));
        this.setAsync = util.promisify(client.set.bind(client));
    }

    public async get<T>(key: string): Promise<T> {
        const stringValue = await this.getAsync(this.getKey(key));
        return JSON.parse(stringValue) as T;
    }

    public async set<T>(key: string, value: T): Promise<void> {
        const result = await this.setAsync(this.getKey(key), JSON.stringify(value));
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
