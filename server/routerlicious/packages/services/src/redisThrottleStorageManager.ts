/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as util from "util";
import {
    IThrottleStorageManager,
    IThrottlingMetrics,
} from "@fluidframework/server-services-core";
import { RedisClient } from "redis";

/**
 * Manages storage of throttling metrics in redis hashes with an expiry of 'expireAfterSeconds'.
 */
export class RedisThrottleStorageManager implements IThrottleStorageManager {
    private readonly setAsync: any;
    private readonly getAsync: any;
    private readonly expire: any;

    constructor(
        client: RedisClient,
        private readonly expireAfterSeconds = 60 * 60 * 24,
        private readonly prefix = "throttle",
    ) {
        this.setAsync = util.promisify(client.hmset.bind(client));
        this.getAsync = util.promisify(client.hgetall.bind(client));
        this.expire = util.promisify(client.expire.bind(client));
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

        if (!throttlingMetric) {
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
