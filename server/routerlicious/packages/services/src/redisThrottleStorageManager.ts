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
            throttlingMetric as { [key: string]: any; },
            this.expireAfterSeconds);
    }

    public async getThrottlingMetric(id: string): Promise<IThrottlingMetrics | undefined> {
        const throttlingMetric = await this.client.hgetall(this.getKey(id));
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
