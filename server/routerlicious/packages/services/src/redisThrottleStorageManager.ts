/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as util from "util";
import {
    IThrottleStorageManager,
    IRequestMetrics,
} from "@fluidframework/server-services-core";
import { RedisClient } from "redis";

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

    public async setRequestMetric(
        id: string,
        requestMetric: IRequestMetrics,
    ): Promise<void> {
        const key = this.getKey(id);
        const result = await this.setAsync(key, requestMetric);

        if (result !== "OK") {
            return Promise.reject(result);
        }
        await this.expire(key, this.expireAfterSeconds);
    }

    public async getRequestMetric(id: string): Promise<IRequestMetrics> {
        const requestMetric = await this.getAsync(this.getKey(id));

        if (!requestMetric) {
            return undefined;
        }

        // All values retrieved from Redis are strings, so they must be parsed
        return {
            count: Number.parseInt(requestMetric.count, 10),
            lastCoolDownAt: Number.parseInt(requestMetric.lastCoolDownAt, 10),
            throttleStatus: requestMetric.throttleStatus === "true",
            throttleReason: requestMetric.throttleReason,
            retryAfterInMs: Number.parseInt(requestMetric.retryAfterInMs, 10),
        };
    }

    private getKey(id: string): string {
        return `${this.prefix}:${id}`;
    }
}
