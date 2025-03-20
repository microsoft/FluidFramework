/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IUsageData,
	IThrottlerHelper,
	IThrottlerResponse,
	IThrottleAndUsageStorageManager,
	IThrottlingMetrics,
} from "@fluidframework/server-services-core";

/**
 * Implements the Token Bucket algorithm to calculate rate-limiting for throttling operations.
 * @internal
 */
export class ThrottlerHelper implements IThrottlerHelper {
	constructor(
		private readonly throttleAndUsageStorageManager: IThrottleAndUsageStorageManager,
		private readonly rateInOperationsPerMs: number = 1000000,
		private readonly operationBurstLimit: number = 1000000,
		private readonly minCooldownIntervalInMs: number = 1000000,
	) {}

	public async updateCount(
		id: string,
		count: number,
		usageStorageId?: string,
		usageData?: IUsageData,
	): Promise<IThrottlerResponse> {
		const now = Date.now();
		const defaultThrottlingMetric: IThrottlingMetrics = {
			count: this.operationBurstLimit,
			lastCoolDownAt: now,
			throttleStatus: false,
			throttleReason: "",
			retryAfterInMs: 0,
		};

		const throttlingMetric: IThrottlingMetrics =
			(await this.throttleAndUsageStorageManager.getThrottlingMetric(id)) ??
			defaultThrottlingMetric;

		// Exit early if already throttled and no chance of being unthrottled
		const retryAfterInMs = this.getRetryAfterInMs(throttlingMetric, now);
		if (retryAfterInMs > 0) {
			throttlingMetric.retryAfterInMs = retryAfterInMs;
			await this.setThrottlingMetricAndUsageData(
				id,
				throttlingMetric,
				usageStorageId,
				usageData,
			);
			return this.getThrottlerResponseFromThrottlingMetrics(throttlingMetric);
		}

		// replenish "tokens" if possible
		const amountToReplenish = this.getTokenReplenishAmount(throttlingMetric, now);
		if (amountToReplenish > 0) {
			throttlingMetric.count += amountToReplenish;
			throttlingMetric.lastCoolDownAt = now;
		}

		// adjust "tokens" based on given count
		throttlingMetric.count -= count;

		// throttle if "token bucket" is empty
		const newRetryAfterInMs = this.getRetryAfterInMs(throttlingMetric, now);
		if (newRetryAfterInMs > 0) {
			throttlingMetric.throttleStatus = true;
			throttlingMetric.throttleReason = `Throttling count exceeded by ${Math.abs(
				throttlingMetric.count,
			)} at ${new Date(now).toISOString()}`;
			throttlingMetric.retryAfterInMs = newRetryAfterInMs;
		} else {
			throttlingMetric.throttleStatus = false;
			throttlingMetric.throttleReason = "";
			throttlingMetric.retryAfterInMs = 0;
		}

		await this.setThrottlingMetricAndUsageData(id, throttlingMetric, usageStorageId, usageData);

		return this.getThrottlerResponseFromThrottlingMetrics(throttlingMetric);
	}

	public async getThrottleStatus(id: string): Promise<IThrottlerResponse | undefined> {
		const throttlingMetric = await this.throttleAndUsageStorageManager.getThrottlingMetric(id);
		if (!throttlingMetric) {
			return undefined;
		}
		return this.getThrottlerResponseFromThrottlingMetrics(throttlingMetric);
	}

	private async setThrottlingMetricAndUsageData(
		id: string,
		throttlingMetric: IThrottlingMetrics,
		usageStorageId?: string,
		usageData?: IUsageData,
	) {
		await (usageStorageId && usageData
			? this.throttleAndUsageStorageManager.setThrottlingMetricAndUsageData(
					id,
					throttlingMetric,
					usageStorageId,
					usageData,
			  )
			: this.throttleAndUsageStorageManager.setThrottlingMetric(id, throttlingMetric));
	}

	private getThrottlerResponseFromThrottlingMetrics(
		throttlingMetric: IThrottlingMetrics,
	): IThrottlerResponse {
		return {
			throttleStatus: throttlingMetric.throttleStatus,
			throttleReason: throttlingMetric.throttleReason,
			retryAfterInMs: throttlingMetric.retryAfterInMs,
		};
	}

	private getTokenReplenishAmount(throttlingMetric: IThrottlingMetrics, now: number): number {
		const timeSinceLastCooldownInMs = now - throttlingMetric.lastCoolDownAt;
		// replenish "tokens" at most once per minCooldownInterval
		if (timeSinceLastCooldownInMs > this.minCooldownIntervalInMs) {
			const tokensToReplenish = Math.floor(
				timeSinceLastCooldownInMs * this.rateInOperationsPerMs,
			);
			// don't let the bucket overflow
			if (tokensToReplenish + throttlingMetric.count > this.operationBurstLimit) {
				return this.operationBurstLimit - throttlingMetric.count;
			}
			return tokensToReplenish;
		}
		return 0;
	}

	private getRetryAfterInMs(throttlingMetric: IThrottlingMetrics, now: number): number {
		const tokenDebt = 0 - throttlingMetric.count;
		const amountPossibleToReplenishNow = this.getTokenReplenishAmount(throttlingMetric, now);
		const timeUntilNextCooldown =
			throttlingMetric.lastCoolDownAt + this.minCooldownIntervalInMs - now;
		const remainingTokenDebt = tokenDebt - amountPossibleToReplenishNow;
		const timeUntilDebtReplenished = remainingTokenDebt / this.rateInOperationsPerMs;
		if (timeUntilDebtReplenished <= 0) {
			// no need to wait because tokens can be replenished to satisfactory amount
			return timeUntilDebtReplenished;
		}
		// must at least wait until next cooldown
		return Math.max(timeUntilNextCooldown, timeUntilDebtReplenished);
	}
}
