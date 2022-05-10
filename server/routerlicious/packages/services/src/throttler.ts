/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IThrottler,
    IThrottlerHelper,
    IThrottlerResponse,
    ThrottlingError,
    ILogger,
} from "@fluidframework/server-services-core";
import LRUCache from "lru-cache";
import { CommonProperties, Lumberjack, ThrottlingTelemetryProperties } from "@fluidframework/server-services-telemetry";

/**
 * A lenient implementation of IThrottlerHelper that prioritizes low latency over strict throttling.
 * This should be used for implementing throttling in places where latency matters more than accuracy,
 * such as service endpoints or socket connections.
 */
export class Throttler implements IThrottler {
    private readonly lastThrottleUpdateAtMap: LRUCache<string, number>;
    private readonly countDeltaMap: LRUCache<string, number>;
    private readonly throttlerResponseCache: LRUCache<string, IThrottlerResponse>;

    constructor(
        private readonly throttlerHelper: IThrottlerHelper,
        private readonly minThrottleIntervalInMs: number = 1000000,
        private readonly logger?: ILogger,
        maxCacheSize: number = 1000,
        maxCacheAge: number = 1000 * 60,
    ) {
        const cacheOptions: LRUCache.Options<string, any> = {
            max: maxCacheSize,
            maxAge: maxCacheAge,
        };
        this.lastThrottleUpdateAtMap = new LRUCache(cacheOptions);
        this.countDeltaMap = new LRUCache(cacheOptions);
        this.throttlerResponseCache = new LRUCache(cacheOptions);
    }

    /**
     * Increments operation count and calculates throttle status of given operation id.
     * Uses most recently calculated throttle status to determine current throttling, while updating in the background.
     * @throws {@link ThrottlingError} if throttled
     */
    public incrementCount(id: string, weight: number = 1): void {
        this.updateCountDelta(id, weight);

        void this.updateAndCacheThrottleStatus(id);

        // check cached throttle status, but allow operation through if status is not yet cached
        const cachedThrottlerResponse = this.throttlerResponseCache.get(id);
        if (cachedThrottlerResponse && cachedThrottlerResponse.throttleStatus) {
            const retryAfterInSeconds = Math.ceil(cachedThrottlerResponse.retryAfterInMs / 1000);
            this.logger?.info(`Throttled: ${id}`, {
                messageMetaData: {
                    key: id,
                    reason: cachedThrottlerResponse.throttleReason,
                    retryAfterInSeconds,
                    eventName: "throttling",
                },
            });
            Lumberjack.info(
                `Throttled: ${id}`,
                {
                    [CommonProperties.telemetryGroupName]: "throttling",
                    [ThrottlingTelemetryProperties.key]: id,
                    [ThrottlingTelemetryProperties.reason]: cachedThrottlerResponse.throttleReason,
                    [ThrottlingTelemetryProperties.retryAfterInSeconds]: retryAfterInSeconds,
                },
            );
            // eslint-disable-next-line @typescript-eslint/no-throw-literal
            throw new ThrottlingError(
                cachedThrottlerResponse.throttleReason,
                retryAfterInSeconds,
            );
        }
    }

    /**
     * Decrements operation count of given operation id.
     */
    public decrementCount(id: string, weight: number = 1): void {
        this.updateCountDelta(id, -weight);
    }

    private updateCountDelta(id: string, value: number): void {
        const currentValue = this.countDeltaMap.get(id) || 0;

        this.countDeltaMap.set(id, currentValue + value);
    }

    private async updateAndCacheThrottleStatus(id: string): Promise<void> {
        const now = Date.now();
        if (this.lastThrottleUpdateAtMap.get(id) === undefined) {
            this.lastThrottleUpdateAtMap.set(id, now);
        }
        if (now - this.lastThrottleUpdateAtMap.get(id) > this.minThrottleIntervalInMs) {
            const countDelta = this.countDeltaMap.get(id);
            this.lastThrottleUpdateAtMap.set(id, now);
            this.countDeltaMap.set(id, 0);
            const messageMetaData = {
                key: id,
                weight: countDelta,
                eventName: "throttling",
            };
            const lumberjackProperties = {
                [CommonProperties.telemetryGroupName]: "throttling",
                [ThrottlingTelemetryProperties.key]: id,
                [ThrottlingTelemetryProperties.weight]: countDelta,
            };
            await this.throttlerHelper.updateCount(id, countDelta)
                .then((throttlerResponse) => {
                    this.logger?.info(`Incremented throttle count for ${id} by ${countDelta}`, { messageMetaData });
                    Lumberjack.info(`Incremented throttle count for ${id} by ${countDelta}`, lumberjackProperties);
                    this.throttlerResponseCache.set(id, throttlerResponse);
                })
                .catch((err) => {
                    this.logger?.error(`Failed to update throttling count for ${id}: ${err}`, { messageMetaData });
                    Lumberjack.error(`Failed to update throttling count for ${id}`, lumberjackProperties, err);
                });
        }
    }
}
