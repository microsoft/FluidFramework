/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IThrottleStorageManager,
    IThrottlingMetrics,
} from "@fluidframework/server-services-core";
import { Redis } from "ioredis";
import * as winston from "winston";

/**
 * Manages storage of throttling metrics in redis hashes with an expiry of 'expireAfterSeconds'.
 */
export class RedisThrottleStorageManager implements IThrottleStorageManager {
    private readonly setAsync: any;
    private readonly getAsync: any;
    private readonly expire: any;

    constructor(
        client: Redis,
        private readonly expireAfterSeconds = 60 * 60 * 24,
        private readonly prefix = "throttle",
    ) {
        this.setAsync = client.hmset.bind(client);
        this.getAsync = client.hgetall.bind(client);
        this.expire = client.expire.bind(client);

        client.on("error", (error) => {
            winston.error("Throttle Manager Redis Error:", error);
        });
    }

    public async setThrottlingMetric(
        id: string,
        throttlingMetric: IThrottlingMetrics,
    ): Promise<void> {
        const key = this.getKey(id);
        const result = await this.setAsync(key, throttlingMetric);

        if (result !== "OK") {
            return Promise.reject(result);
        }
        await this.expire(key, this.expireAfterSeconds);
    }

    public async getThrottlingMetric(id: string): Promise<IThrottlingMetrics | undefined> {
        const throttlingMetric = await this.getAsync(this.getKey(id));

        if (Object.keys(throttlingMetric).length === 0) {
            return undefined;
        }

        // All values retrieved from Redis are strings, so they must be parsed
        return {
            count: Number.parseInt(throttlingMetric.count, 10),
            lastCoolDownAt: Number.parseInt(throttlingMetric.lastCoolDownAt, 10),
            throttleStatus: throttlingMetric.throttleStatus === "true",
            throttleReason: throttlingMetric.throttleReason,
            retryAfterInMs: Number.parseInt(throttlingMetric.retryAfterInMs, 10),
        };
    }

    private getKey(id: string): string {
        return `${this.prefix}:${id}`;
    }
}
