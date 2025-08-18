/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IThrottleAndUsageStorageManager,
	IThrottlingMetrics,
	IUsageData,
} from "@fluidframework/server-services-core";
import { Lumberjack } from "@fluidframework/server-services-telemetry";

/**
 * @internal
 */
export interface ITokenBucket {
	/**
	 * Tries to consume a certain number of tokens from the bucket.
	 * @param tokens - The number of tokens to consume.
	 * @returns Milliseconds until the tokens can be consumed. 0 if the tokens were successfully consumed.
	 */
	tryConsume(tokens: number): number;
}

export interface ITokenBucketConfig {
	/**
	 * The maximum number of tokens the bucket can hold.
	 */
	capacity: number;
	/**
	 * The rate at which tokens are added to the bucket (tokens per millisecond).
	 */
	refillRatePerMs: number;
	/**
	 * The minimum cooldown interval between bursts of token consumption.
	 */
	minCooldownIntervalMs: number;
}

/**
 * An effectively disabled token bucket.
 */
const defaultTokenBucketConfig: ITokenBucketConfig = {
	capacity: 1_000_000,
	refillRatePerMs: 1_000_000,
	minCooldownIntervalMs: 1_000_000,
};

/**
 * Implements the Token Bucket algorithm for rate limiting.
 * @internal
 */
export class TokenBucket implements ITokenBucket {
	private readonly config: ITokenBucketConfig;
	/**
	 * The current number of tokens in the bucket.
	 */
	protected tokens: number;
	/**
	 * The timestamp of the last time tokens were refilled.
	 */
	protected lastRefillTimestamp: number;

	constructor(
		/**
		 * The maximum number of tokens the bucket can hold.
		 */
		config: Partial<ITokenBucketConfig>,
	) {
		this.config = {
			...defaultTokenBucketConfig,
			...config,
		};
		this.tokens = this.config.capacity;
		this.lastRefillTimestamp = Date.now();
	}

	protected isCoolingDown(): boolean {
		const now = Date.now();
		const elapsed = now - this.lastRefillTimestamp;
		return elapsed < this.config.minCooldownIntervalMs;
	}

	/**
	 * Refills the token bucket with new tokens based on the elapsed time since last refill.
	 */
	protected refillTokens() {
		if (this.isCoolingDown()) {
			// If we're still in the cooldown period, do nothing.
			return;
		}
		const now = Date.now();
		const elapsed = now - this.lastRefillTimestamp;
		const tokensToAdd = Math.floor(elapsed * this.config.refillRatePerMs);
		this.tokens = Math.min(this.config.capacity, this.tokens + tokensToAdd);
		this.lastRefillTimestamp = now;
	}

	/**
	 * Tries to consume a certain number of tokens from the bucket.
	 * @param tokens - The number of tokens to consume.
	 * @returns 0 if the tokens were successfully consumed, or the duration until the tokens can be consumed in milliseconds.
	 */
	public tryConsume(tokens: number): number {
		this.refillTokens();
		if (tokens <= this.tokens) {
			// Consume the tokens.
			this.tokens -= tokens;
			return 0;
		}

		// Not enough tokens available, so communicate how long it will take for the necessary tokens to be refilled.
		const timeUntilRefill = Math.ceil((tokens - this.tokens) / this.config.refillRatePerMs);
		if (!this.isCoolingDown()) {
			// Calculate the duration until the tokens can be consumed from now.
			return timeUntilRefill;
		}
		// Otherwise, communicate the minimum time until the next cooldown interval is reached,
		// or the duration until the tokens can be consumed, whichever is higher.
		const timeUntilCooledDown =
			this.config.minCooldownIntervalMs - (Date.now() - this.lastRefillTimestamp);
		return Math.max(timeUntilRefill, timeUntilCooledDown);
	}
}

export interface IDistributedTokenBucketConfig extends ITokenBucketConfig {
	/**
	 * Minimum time in milliseconds between synchronization attempts.
	 */
	distributedSyncIntervalInMs: number;
}

/**
 * An effectively disabled distributed token bucket.
 */
const defaultDistributedTokenBucketConfig: IDistributedTokenBucketConfig = {
	...defaultTokenBucketConfig,
	distributedSyncIntervalInMs: 1_000_000,
};

export class DistributedTokenBucket implements ITokenBucket {
	private readonly config: IDistributedTokenBucketConfig;
	/**
	 * The number of tokens consumed since the last synchronization.
	 */
	private tokensConsumedSinceLastSync: number = 0;

	/**
	 * The timestamp of the last synchronization.
	 */
	private lastSyncTimestamp: number | undefined;

	/**
	 * The result of the last token consumption attempt as milliseconds until tokens will be
	 * available again.
	 * This is used until the next synchronization to determine the status of the token bucket.
	 */
	private lastConsumeTokensSyncResult: number | undefined;

	constructor(
		private readonly remoteId: string,
		/**
		 * Storage manager for distributed throttling and usage data.
		 *
		 * @remarks
		 * This manager uses the IThrottlingMetrics shape, which is a holdover from the legacy throttling
		 * implementation. For back compat purposes with existing data, it is still used.
		 */
		private readonly throttleAndUsageStorageManager: IThrottleAndUsageStorageManager,
		/**
		 * The maximum number of tokens the bucket can hold.
		 */
		config: Partial<IDistributedTokenBucketConfig>,
		private readonly usageStorageId?: string,
	) {
		this.config = {
			...defaultDistributedTokenBucketConfig,
			...config,
		};
	}

	private async tryConsumeCore(usageData?: IUsageData): Promise<void> {
		const now = Date.now();
		this.lastSyncTimestamp = now;
		const defaultThrottlingMetric: IThrottlingMetrics = {
			count: this.config.capacity,
			lastCoolDownAt: now,
			throttleStatus: false,
			throttleReason: "",
			retryAfterInMs: 0,
		};
		const throttlingMetric: IThrottlingMetrics =
			(await this.throttleAndUsageStorageManager.getThrottlingMetric(this.remoteId)) ??
			defaultThrottlingMetric;
		// adjust "tokens" by the amount consumed since last sync
		throttlingMetric.count -= this.tokensConsumedSinceLastSync;

		// Exit early if already throttled and no chance of being unthrottled
		const retryAfterInMs = this.getRetryAfterInMs(throttlingMetric, now);
		if (retryAfterInMs > 0) {
			throttlingMetric.retryAfterInMs = retryAfterInMs;
			await this.setThrottlingMetricAndUsageData(throttlingMetric, usageData);
			this.lastConsumeTokensSyncResult = throttlingMetric.retryAfterInMs;
			return;
		}

		// replenish "tokens" if possible
		const amountToReplenish = this.getTokenReplenishAmount(throttlingMetric, now);
		if (amountToReplenish > 0) {
			throttlingMetric.count += amountToReplenish;
			throttlingMetric.lastCoolDownAt = now;
		}

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

		await this.setThrottlingMetricAndUsageData(throttlingMetric, usageData);

		this.lastConsumeTokensSyncResult = 0;
	}

	private async setThrottlingMetricAndUsageData(
		throttlingMetric: IThrottlingMetrics,
		usageData?: IUsageData,
	) {
		await (this.usageStorageId && usageData
			? this.throttleAndUsageStorageManager.setThrottlingMetricAndUsageData(
					this.remoteId,
					throttlingMetric,
					this.usageStorageId,
					usageData,
			  )
			: this.throttleAndUsageStorageManager.setThrottlingMetric(
					this.remoteId,
					throttlingMetric,
			  ));
	}

	private getTokenReplenishAmount(throttlingMetric: IThrottlingMetrics, now: number): number {
		const timeSinceLastCooldownInMs = now - throttlingMetric.lastCoolDownAt;
		// replenish "tokens" at most once per minCooldownInterval
		if (timeSinceLastCooldownInMs > this.config.minCooldownIntervalMs) {
			const tokensToReplenish = Math.floor(
				timeSinceLastCooldownInMs * this.config.refillRatePerMs,
			);
			// don't let the bucket overflow
			if (tokensToReplenish + throttlingMetric.count > this.config.capacity) {
				return this.config.capacity - throttlingMetric.count;
			}
			return tokensToReplenish;
		}
		return 0;
	}

	private getRetryAfterInMs(throttlingMetric: IThrottlingMetrics, now: number): number {
		const tokenDebt = 0 - throttlingMetric.count;
		const amountPossibleToReplenishNow = this.getTokenReplenishAmount(throttlingMetric, now);
		const timeUntilNextCooldown =
			throttlingMetric.lastCoolDownAt + this.config.minCooldownIntervalMs - now;
		const remainingTokenDebt = tokenDebt - amountPossibleToReplenishNow;
		const timeUntilDebtReplenished = remainingTokenDebt / this.config.refillRatePerMs;
		if (timeUntilDebtReplenished <= 0) {
			// no need to wait because tokens can be replenished to satisfactory amount
			return timeUntilDebtReplenished;
		}
		// must at least wait until next cooldown
		return Math.max(timeUntilNextCooldown, timeUntilDebtReplenished);
	}

	public tryConsume(tokens: number, usageData?: IUsageData): number {
		this.tokensConsumedSinceLastSync += tokens;
		if (
			!this.lastSyncTimestamp ||
			Date.now() - this.lastSyncTimestamp >= this.config.distributedSyncIntervalInMs
		) {
			this.tryConsumeCore(usageData).catch((error) => {
				Lumberjack.error("Failed to consume tokens", { error });
			});
		}
		return this.lastConsumeTokensSyncResult ?? 0;
	}
}
