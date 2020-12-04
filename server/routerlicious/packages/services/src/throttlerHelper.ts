/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IThrottlerHelper,
    IThrottlerResponse,
    IThrottleStorageManager,
    IThrottlingMetrics,
} from "@fluidframework/server-services-core";

/**
 * Implements the Token Bucket algorithm to calculate rate-limiting for throttling operations.
 */
export class ThrottlerHelper implements IThrottlerHelper {
    constructor(
        private readonly throttleStorageManager: IThrottleStorageManager,
        private readonly rate: number,
        private readonly minCooldownIntervalInMs: number,
    ) {
    }

    public async updateCount(
        id: string,
        count: number,
    ): Promise<IThrottlerResponse> {
        const now = Date.now();
        let throttlingMetric = await this.throttleStorageManager.getThrottlingMetric(id);
        if (!throttlingMetric) {
            // start a throttling metric with 1 cooldown interval's worth of tokens
            throttlingMetric = {
                count: this.minCooldownIntervalInMs / this.rate,
                lastCoolDownAt: now,
                throttleStatus: false,
                throttleReason: undefined,
                retryAfterInMs: 0,
            };
        }

        // Exit early if already throttled and no chance of being unthrottled
        const timeUntilNotThrottled = this.getTimeUntilNotThrottledInMs(throttlingMetric, now);
        if (timeUntilNotThrottled > 0) {
            throttlingMetric.retryAfterInMs = timeUntilNotThrottled;
            // update stored throttling metric with new retry duration
            await this.throttleStorageManager.setThrottlingMetric(id, throttlingMetric);
            return this.getThrottlerResponseFromThrottlingMetrics(throttlingMetric);
        }

        // replenish "tokens" if possible
        const amountToReplenish = this.getAmountToReplenishOnCooldown(throttlingMetric, now);
        if (amountToReplenish > 0) {
            throttlingMetric.count += amountToReplenish;
            throttlingMetric.lastCoolDownAt = now;
        }

        // adjust "tokens" based on given count
        throttlingMetric.count -= count;

        // throttle if "token bucket" is empty
        const newTimeUntilNotThrottled = this.getTimeUntilNotThrottledInMs(throttlingMetric, now);
        if (newTimeUntilNotThrottled > 0) {
            throttlingMetric.throttleStatus = true;
            throttlingMetric.throttleReason =
                `Throttling count exceeded by ${Math.abs(throttlingMetric.count)} at ${new Date(now).toISOString()}`;
            throttlingMetric.retryAfterInMs = newTimeUntilNotThrottled;
        } else {
            throttlingMetric.throttleStatus = false;
            throttlingMetric.throttleReason = "";
            throttlingMetric.retryAfterInMs = 0;
        }

        // update stored throttling metric
        await this.throttleStorageManager.setThrottlingMetric(id, throttlingMetric);

        return this.getThrottlerResponseFromThrottlingMetrics(throttlingMetric);
    }

    public async getThrottleStatus(id: string): Promise<IThrottlerResponse | undefined> {
        const throttlingMetric = await this.throttleStorageManager.getThrottlingMetric(id);
        if (!throttlingMetric) {
            return undefined;
        }
        return this.getThrottlerResponseFromThrottlingMetrics(throttlingMetric);
    }

    private getThrottlerResponseFromThrottlingMetrics(throttlingMetric: IThrottlingMetrics): IThrottlerResponse {
        return {
            throttleStatus: throttlingMetric.throttleStatus,
            throttleReason: throttlingMetric.throttleReason,
            retryAfterInMs: throttlingMetric.retryAfterInMs,
        };
    }

    private getAmountToReplenishOnCooldown(throttlingMetric: IThrottlingMetrics, now: number): number {
        const timeSinceLastCooldownInMs = now - throttlingMetric.lastCoolDownAt;
        // replenish "tokens" at most once per minCooldownInterval
        if (timeSinceLastCooldownInMs > this.minCooldownIntervalInMs) {
            return Math.floor(timeSinceLastCooldownInMs / this.rate);
        }
        return 0;
    }

    private getTimeUntilNotThrottledInMs(throttlingMetric: IThrottlingMetrics, now: number): number {
        const debt = 0 - throttlingMetric.count;
        if (debt <= 0) {
            return 0;
        }
        const amountPossibleToReplenishNow = this.getAmountToReplenishOnCooldown(throttlingMetric, now);
        const timeUntilNextCooldown = throttlingMetric.lastCoolDownAt + this.minCooldownIntervalInMs - now;
        const timeUntilDebtReplenished = (debt - amountPossibleToReplenishNow) * this.rate;
        // must at least wait until next cooldown
        return Math.max(timeUntilNextCooldown, timeUntilDebtReplenished);
    }
}
