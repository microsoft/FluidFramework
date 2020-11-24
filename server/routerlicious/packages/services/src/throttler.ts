/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IThrottler,
    IThrottlerResponse,
    IThrottleManager,
    ThrottlerRequestType,
    IRequestMetrics,
} from "@fluidframework/server-services-core";

/**
 * Implements the Token Bucket algorithm for throttling requests.
 */
export class Throttler implements IThrottler {
    constructor(
        private readonly throttleManager: IThrottleManager,
        private readonly requestRate: number,
        private readonly minCooldownIntervalInMs: number,
    ) {
    }

    public async updateRequestCount(
        id: string,
        requestType: ThrottlerRequestType,
        count: number,
    ): Promise<IThrottlerResponse> {
        const now = Date.now();
        let requestMetric = await this.throttleManager.getRequestMetric(id, requestType);
        if (!requestMetric) {
            // start a request metric with 1 cooldown interval's worth of tokens
            requestMetric = {
                count: this.minCooldownIntervalInMs / this.requestRate,
                lastCoolDownAt: now,
                throttleStatus: false,
                throttleReason: undefined,
                retryAfterInMs: 0,
            };
        }

        // Exit early if already throttled and no chance of being unthrottled
        const timeUntilNotThrottled = this.getTimeUntilNotThrottledInMs(requestMetric, now);
        if (timeUntilNotThrottled > 0) {
            requestMetric.retryAfterInMs = timeUntilNotThrottled;
            // update stored request metric with new retry duration
            await this.throttleManager.setRequestMetric(id, requestType, requestMetric);
            return this.convertRequestMetricsToThrottlerResponse(requestMetric);
        }

        // replenish "tokens" if possible
        const amountToReplenish = this.getAmountToReplenishOnCooldown(requestMetric, now);
        if (amountToReplenish > 0) {
            requestMetric.count += amountToReplenish;
            requestMetric.lastCoolDownAt = now;
        }

        // adjust "tokens" based on given count
        requestMetric.count -= count;

        // throttle if "token bucket" is empty
        const newTimeUntilNotThrottled = this.getTimeUntilNotThrottledInMs(requestMetric, now);
        if (newTimeUntilNotThrottled > 0) {
            requestMetric.throttleStatus = true;
            requestMetric.throttleReason = `count exceeded by ${Math.abs(requestMetric.count)}`;
            requestMetric.retryAfterInMs = newTimeUntilNotThrottled;
        } else {
            requestMetric.throttleStatus = false;
            requestMetric.throttleReason = "";
            requestMetric.retryAfterInMs = 0;
        }

        // update stored request metric
        await this.throttleManager.setRequestMetric(id, requestType, requestMetric);

        return this.convertRequestMetricsToThrottlerResponse(requestMetric);
    }

    public async getThrottleStatus(id: string, requestType: ThrottlerRequestType): Promise<IThrottlerResponse> {
        const requestMetric = await this.throttleManager.getRequestMetric(id, requestType);
        return this.convertRequestMetricsToThrottlerResponse(requestMetric);
    }

    private convertRequestMetricsToThrottlerResponse(requestMetric: IRequestMetrics): IThrottlerResponse {
        return {
            throttleStatus: requestMetric.throttleStatus,
            throttleReason: requestMetric.throttleReason,
            retryAfterInMs: requestMetric.retryAfterInMs,
        };
    }

    private getAmountToReplenishOnCooldown(requestMetric: IRequestMetrics, now: number): number {
        const timeSinceLastCooldownInMs = now - requestMetric.lastCoolDownAt;
        // replenish "tokens" at most once per minCooldownInterval
        if (timeSinceLastCooldownInMs > this.minCooldownIntervalInMs) {
            return Math.floor(timeSinceLastCooldownInMs / this.requestRate);
        }
        return 0;
    }

    private getTimeUntilNotThrottledInMs(requestMetric: IRequestMetrics, now: number): number {
        const debt = 0 - requestMetric.count;
        if (debt <= 0) {
            return 0;
        }
        const amountPossibleToReplenishNow = this.getAmountToReplenishOnCooldown(requestMetric, now);
        const timeUntilNextCooldown = requestMetric.lastCoolDownAt + this.minCooldownIntervalInMs - now;
        const timeUntilDebtReplenished = (debt - amountPossibleToReplenishNow) * this.requestRate;
        // must at least wait until next cooldown
        return Math.max(timeUntilNextCooldown, timeUntilDebtReplenished);
    }
}
