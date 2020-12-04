/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
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

/**
 * A lenient implementation of IThrottlerHelper that prioritizes low latency over strict throttling.
 */
export class Throttler implements IThrottler {
    private readonly lastThrottleUpdateAtMap: LRUCache<string, number>;
    private readonly countDeltaMap: LRUCache<string, number>;
    private readonly throttlerResponseCache: LRUCache<string, IThrottlerResponse>;

    constructor(
        private readonly throttlerHelper: IThrottlerHelper,
        private readonly minThrottleIntervalInMs: number,
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
     * Uses caching to bring added latency down to constant time (from cache connection time)
     * @throws {ThrottlingError} if throttled
     */
    public incrementCount(id: string, weight: number = 1): void {
        this.updateCountDelta(id, weight);

        void this.updateAndCacheThrottleStatus(id);

        // check cached throttle status, but allow operation through if status is not yet cached
        const cachedThrottlerResponse = this.throttlerResponseCache.get(id);
        console.log({ cachedThrottlerResponse });
        if (cachedThrottlerResponse && cachedThrottlerResponse.throttleStatus) {
            throw new ThrottlingError(
                cachedThrottlerResponse.throttleReason,
                Math.ceil(cachedThrottlerResponse.retryAfterInMs / 1000),
            );
        }
    }

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
            await this.throttlerHelper.updateCount(id, countDelta)
                .then((throttlerResponse) => {
                    this.throttlerResponseCache.set(id, throttlerResponse);
                })
                .catch((err) => {
                    this.logger?.error(`Failed to update throttling count for ${id}: ${err}`);
                });
        }
    }
}
