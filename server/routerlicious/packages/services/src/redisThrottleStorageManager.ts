/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IThrottleStorageManager,
    IThrottlingMetrics,
} from "@fluidframework/server-services-core";
import { executeRedisMultiWithHmsetExpire, IRedisParameters } from "@fluidframework/server-services-utils";
import { Redis } from "ioredis";
import * as winston from "winston";
import { CommonProperties, Lumberjack } from "@fluidframework/server-services-telemetry";

/**
 * Manages storage of throttling metrics in redis hashes with an expiry of 'expireAfterSeconds'.
 */
export class RedisThrottleStorageManager implements IThrottleStorageManager {
    private readonly expireAfterSeconds: number = 60 * 60 * 24;
    private readonly prefix: string = "throttle";

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
            winston.error("Throttle Manager Redis Error:", error);
            Lumberjack.error(
                "Throttle Manager Redis Error",
                { [CommonProperties.telemetryGroupName]: "throttling" },
                error);
        });
    }

    public async setThrottlingMetric(
        id: string,
        throttlingMetric: IThrottlingMetrics,
    ): Promise<void> {
        const key = this.getKey(id);

        return executeRedisMultiWithHmsetExpire(
            this.client,
            key,
            throttlingMetric as { [key: string]: any },
            this.expireAfterSeconds);
    }

    public async getThrottlingMetric(id: string): Promise<IThrottlingMetrics | undefined> {
        const throttlingMetricRedis = await this.client.hgetall(this.getKey(id));
        if (Object.keys(throttlingMetricRedis).length === 0) {
            return undefined;
        }

        // All values retrieved from Redis are strings, so they must be parsed
        let throttlingMetric = {
            count: Number.parseInt(throttlingMetricRedis.count, 10),
            lastCoolDownAt: Number.parseInt(throttlingMetricRedis.lastCoolDownAt, 10),
            throttleStatus: throttlingMetricRedis.throttleStatus === "true",
            throttleReason: throttlingMetricRedis.throttleReason,
            retryAfterInMs: Number.parseInt(throttlingMetricRedis.retryAfterInMs, 10),
        };

        for (const [key, value] of Object.entries(throttlingMetricRedis)) {
            if (key.startsWith("usage_count_")) {
                throttlingMetric[key] = Number.parseInt(value, 10)
            }
        }
        
        return throttlingMetric;
    }

    private getKey(id: string): string {
        return `${this.prefix}:${id}`;
    }
}
