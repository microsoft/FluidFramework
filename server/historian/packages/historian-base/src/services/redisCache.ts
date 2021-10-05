/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Lumberjack } from "@fluidframework/server-services-telemetry";
import { Redis } from "ioredis";
import * as winston from "winston";
import { ICache, IRedisParameters } from "./definitions";

/**
 * Redis based cache client
 */
export class RedisCache implements ICache {
    private readonly expireAfterSeconds: number = 60 * 60 * 24;
    private readonly prefix: string = "git";

    constructor(
        private readonly client: Redis,
        parameters?: IRedisParameters) {
        if (parameters?.expireAfterSeconds) {
            this.expireAfterSeconds = parameters.expireAfterSeconds;
        }

        if (parameters?.prefix) {
            this.prefix = parameters.prefix;
        }

        client.on("error", (error) => {
            winston.error("Redis Cache Error:", error);
            Lumberjack.error("Redis Cache Error", undefined, error);
        });
    }

    public async get<T>(key: string): Promise<T> {
        const stringValue = await this.client.get(this.getKey(key));
        return JSON.parse(stringValue) as T;
    }

    public async set<T>(key: string, value: T, expireAfterSeconds: number = this.expireAfterSeconds): Promise<void> {
        const result = await this.client.set(this.getKey(key), JSON.stringify(value), "EX", expireAfterSeconds);
        if (result !== "OK") {
            return Promise.reject(result);
        }
    }

    public async deleteIfExists(key: string): Promise<void> {
        const exists = await this.client.exists(this.getKey(key));
        if (!exists) {
            return;
        }

        const result = await this.client.del(this.getKey(key));
        // The DEL API in Redis returns the number of keys that were removed.
        // If the key exists and we try to delete it, we expect a result equal to 1
        // to indicate success
        if (result !== 1) {
            return Promise.reject(new Error(`Unable to delete key ${this.getKey(key)} from Redis.`));
        }
    }

    /**
     * Translates the input key to the one we will actually store in redis
     */
    private getKey(key: string): string {
        return `${this.prefix}:${key}`;
    }
}
