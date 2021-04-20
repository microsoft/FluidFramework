/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Redis } from "ioredis";
import * as winston from "winston";

/**
 * Redis based cache client for caching and expiring tenants and tokens.
 */
export class RedisTenantCache {
    constructor(
        private readonly client: Redis,
        private readonly expireInSeconds = 60 * 60 * 24,
        private readonly prefix = "tenant") {
        client.on("error", (error) => {
            winston.error("Redis Tenant Cache Error:", error);
        });
    }

    public async exists(item: string): Promise<boolean> {
        const result = await this.client.exists(this.getKey(item));
        return result >= 1;
    }

    public async set(
        key: string,
        value: string = "",
        expiresInSeconds: number = this.expireInSeconds): Promise<void> {
        const result = await this.client.set(this.getKey(key), value);
        if (result !== "OK")
        {
            return Promise.reject(result);
        }

        await this.client.expire(this.getKey(key), expiresInSeconds);
    }

    public async get(key: string): Promise<string> {
        return this.client.get(this.getKey(key));
    }

    /**
     * Translates the input item to the one we will actually store in redis
     */
    private getKey(item: string): string {
        return `${this.prefix}:${item}`;
    }
}
