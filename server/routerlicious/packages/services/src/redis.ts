/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICache } from "@fluidframework/server-services-core";
import { Redis } from "ioredis";
import * as winston from "winston";
/**
 * Redis based cache client
 */
export class RedisCache implements ICache {
    constructor(
        private readonly client: Redis,
        private readonly expireAfterSeconds = 60 * 60 * 24,
        private readonly prefix = "page") {
        client.on("error", (err) => {
            winston.error("Error with Redis:", err);
        });
    }

    public async get(key: string): Promise<string> {
        return this.client.get(this.getKey(key));
    }

    public async set(key: string, value: string): Promise<void> {
        const result = await this.client.set(this.getKey(key), value, "EX", this.expireAfterSeconds);
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
