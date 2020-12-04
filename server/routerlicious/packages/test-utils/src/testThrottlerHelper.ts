/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IThrottleStorageManager,
    IThrottlerResponse,
    IThrottlerHelper,
} from "@fluidframework/server-services-core";

/**
 * Super simple Token Bucket Throttler implementation for use in tests.
 */
export class TestThrottlerHelper implements IThrottlerHelper {
    constructor(
        private readonly throttleStorageManager: IThrottleStorageManager,
        private readonly limit: number,
        private readonly rate: number,
    ) {
    }

    public async updateCount(
        id: string,
        count: number,
    ): Promise<IThrottlerResponse> {
        const now = Date.now();

        // get stored throttling metric
        let throttlingMetric = await this.throttleStorageManager.getThrottlingMetric(id);
        if (!throttlingMetric) {
            // start a throttling metric 0 count
            throttlingMetric = {
                count: 0,
                lastCoolDownAt: now,
                throttleStatus: false,
                throttleReason: undefined,
                retryAfterInMs: 0,
            };
        }

        // cooldown count
        throttlingMetric.count -= Math.floor((now - throttlingMetric.lastCoolDownAt) / this.rate);
        throttlingMetric.lastCoolDownAt = now;

        // adjust count
        throttlingMetric.count += count;

        // check throttle
        if (throttlingMetric.count > this.limit) {
            throttlingMetric.throttleStatus = true;
            throttlingMetric.retryAfterInMs = (throttlingMetric.count - this.limit) * this.rate;
            throttlingMetric.throttleReason = `Count exceeded by ${throttlingMetric.count - this.limit} at ${now}`;
        } else {
            throttlingMetric.throttleStatus = false;
            throttlingMetric.retryAfterInMs = 0;
            throttlingMetric.throttleReason = undefined;
        }

        // update stored throttling metric
        await this.throttleStorageManager.setThrottlingMetric(id, throttlingMetric);

        return {
            throttleStatus: throttlingMetric.throttleStatus,
            throttleReason: throttlingMetric.throttleReason,
            retryAfterInMs: throttlingMetric.retryAfterInMs,
        };
    }

    public async getThrottleStatus(id: string): Promise<IThrottlerResponse> {
        const throttlingMetric = await this.throttleStorageManager.getThrottlingMetric(id);

        return {
            throttleStatus: throttlingMetric.throttleStatus,
            throttleReason: throttlingMetric.throttleReason,
            retryAfterInMs: throttlingMetric.retryAfterInMs,
        };
    }
}
