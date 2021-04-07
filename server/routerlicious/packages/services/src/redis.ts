/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICache } from "@fluidframework/server-services-core";
import { Redis } from "ioredis";
import * as winston from "winston";
/**
 * Redis based cache client
 */
export class RedisCache implements ICache {
    constructor(private readonly client: Redis, private readonly prefix = "page") {
        client.on("error", (err) => {
            winston.error("Error with Redis:", err);
        });
    }

    public async get(key: string): Promise<string> {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return this.client.get(this.getKey(key));
    }

    public async set(key: string, value: string): Promise<void> {
        const result = await this.client.set(this.getKey(key), value);
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
