/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as util from "util";
import { RedisClient } from "redis";

/**
 * Redis based cache client for caching and expiring tenants and tokens.
 */
export class RedisTenantCache {
    private readonly setAsync;
    private readonly getAsync;
    private readonly existsAsync;
    private readonly expire: any;

    constructor(
        client: RedisClient,
        private readonly expireAfterSeconds = 60 * 60 * 24,
        private readonly prefix = "tenant") {
        this.setAsync = util.promisify(client.set.bind(client));
        this.getAsync = util.promisify(client.get.bind(client));
        this.existsAsync = util.promisify(client.exists.bind(client));
        this.expire = util.promisify(client.expire.bind(client));
    }

    public async exists(item: string): Promise<boolean> {
        const result = await this.existsAsync(this.getKey(item));
        return result >= 1;
    }

    public async set(
        key: string,
        value: string = "",
        expiresInSeconds: number = this.expireAfterSeconds): Promise<void> {
        const result = await this.setAsync(this.getKey(key), value);
        return result !== "OK" ?
            Promise.reject(result) :
            this.expire(this.getKey(key), expiresInSeconds);
    }

    public async get(key: string): Promise<string> {
        return this.getAsync(this.getKey(key));
    }

    /**
     * Translates the input item to the one we will actually store in redis
     */
    private getKey(item: string): string {
        return `${this.prefix}:${item}`;
    }
}
