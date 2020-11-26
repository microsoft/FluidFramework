/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IThrottleManager,
    IThrottler,
    IThrottlerResponse,
    ThrottlerRequestType,
} from "@fluidframework/server-services-core";

/**
 * Super simple Token Bucket Throttler implementation for use in tests.
 */
export class TestThrottler implements IThrottler {
    constructor(
        private readonly throttleManager: IThrottleManager,
        private readonly limit: number,
        private readonly rate: number,
    ) {
    }

    public async updateRequestCount(
        id: string,
        requestType: ThrottlerRequestType,
        count: number,
    ): Promise<IThrottlerResponse> {
        const now = Date.now();

        // get stored request metric
        let requestMetric = await this.throttleManager.getRequestMetric(id, requestType);
        if (!requestMetric) {
            // start a request metric 0 count
            requestMetric = {
                count: 0,
                lastCoolDownAt: now,
                throttleStatus: false,
                throttleReason: undefined,
                retryAfterInMs: 0,
            };
        }

        // cooldown count
        requestMetric.count -= Math.floor((now - requestMetric.lastCoolDownAt) / this.rate);
        requestMetric.lastCoolDownAt = now;

        // adjust count
        requestMetric.count += count;

        // check throttle
        if (requestMetric.count > this.limit) {
            requestMetric.throttleStatus = true;
            requestMetric.retryAfterInMs = (requestMetric.count - this.limit) * this.rate;
            requestMetric.throttleReason = `count exceeded by ${requestMetric.count - this.limit}`;
        } else {
            requestMetric.throttleStatus = false;
            requestMetric.retryAfterInMs = 0;
            requestMetric.throttleReason = undefined;
        }

        // update stored request metric
        await this.throttleManager.setRequestMetric(id, requestType, requestMetric);

        return {
            throttleStatus: requestMetric.throttleStatus,
            throttleReason: requestMetric.throttleReason,
            retryAfterInMs: requestMetric.retryAfterInMs,
        };
    }

    public async getThrottleStatus(id: string, requestType: ThrottlerRequestType): Promise<IThrottlerResponse> {
        const requestMetric = await this.throttleManager.getRequestMetric(id, requestType);

        return {
            throttleStatus: requestMetric.throttleStatus,
            throttleReason: requestMetric.throttleReason,
            retryAfterInMs: requestMetric.retryAfterInMs,
        };
    }
}
