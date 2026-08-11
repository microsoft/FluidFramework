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

import { getThrottlingBaseTelemetryProperties } from "./utils";

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
	/**
	 * Enables enhanced logging for debugging purposes.
	 * @remarks
	 * This should only be enabled selectively for debugging, as it will generate a large quantity of telemetry.
	 */
	enableEnhancedTelemetry: boolean;
}

/**
 * An effectively disabled token bucket.
 */
const defaultTokenBucketConfig: ITokenBucketConfig = {
	capacity: 1_000_000,
	refillRatePerMs: 1_000_000,
	minCooldownIntervalMs: 1_000_000,
	enableEnhancedTelemetry: false,
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
	protected availableTokens: number;
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
		this.availableTokens = this.config.capacity;
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
	protected tryRefillTokens(): void {
		if (this.isCoolingDown()) {
			// If we're still in the cooldown period, do nothing.
			if (this.config.enableEnhancedTelemetry) {
				Lumberjack.verbose("TokenBucket: Still in cooldown period, skipping refill", {
					...getThrottlingBaseTelemetryProperties().baseLumberjackProperties,
				});
			}
			return;
		}
		const now = Date.now();
		const elapsed = now - this.lastRefillTimestamp;
		const tokensToAdd = Math.floor(elapsed * this.config.refillRatePerMs);
		this.availableTokens = Math.min(this.config.capacity, this.availableTokens + tokensToAdd);
		this.lastRefillTimestamp = now;
	}

	/**
	 * Tries to consume a certain number of tokens from the bucket.
	 * @param tokensToConsume - The number of tokens to consume.
	 * @returns 0 if the tokens were successfully consumed, or the duration until the tokens can be consumed in milliseconds.
	 */
	public tryConsume(tokensToConsume: number): number {
		if (tokensToConsume <= this.availableTokens) {
			// Consume the tokens without bothering to refill.
			// This is an optimization for the common case where there are enough tokens.
			this.availableTokens -= tokensToConsume;
			return 0;
		}

		// Refill the tokens based on elapsed time since last refill.
		this.tryRefillTokens();
		if (tokensToConsume <= this.availableTokens) {
			// Now there are enough tokens available.
			this.availableTokens -= tokensToConsume;
			return 0;
		}

		// Not enough tokens available, so communicate how long it will take for the necessary tokens to be refilled.
		const timeUntilRefillToAvailable = Math.ceil(
			(tokensToConsume - this.availableTokens) / this.config.refillRatePerMs,
		);
		if (!this.isCoolingDown()) {
			// Calculate the duration until the tokens can be consumed from now.
			if (this.config.enableEnhancedTelemetry) {
				Lumberjack.verbose("TokenBucket: Not enough tokens", {
					...getThrottlingBaseTelemetryProperties().baseLumberjackProperties,
					tokensRequested: tokensToConsume,
					tokensAvailable: this.availableTokens,
					timeUntilAvailable: timeUntilRefillToAvailable,
				});
			}
			return timeUntilRefillToAvailable;
		}
		// Otherwise, communicate the minimum time until the next cooldown interval is reached,
		// or the duration until the tokens can be consumed, whichever is higher.
		const timeUntilCooledDown =
			this.config.minCooldownIntervalMs - (Date.now() - this.lastRefillTimestamp);
		const timeUntilAvailable = Math.max(timeUntilRefillToAvailable, timeUntilCooledDown);
		if (this.config.enableEnhancedTelemetry) {
			Lumberjack.verbose("TokenBucket: Not enough tokens and still cooling down", {
				...getThrottlingBaseTelemetryProperties().baseLumberjackProperties,
				tokensRequested: tokensToConsume,
				tokensAvailable: this.availableTokens,
				timeUntilAvailable,
				timeUntilCooledDown,
				timeUntilRefillToAvailable,
			});
		}
		return timeUntilAvailable;
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
			if (this.config.enableEnhancedTelemetry) {
				Lumberjack.verbose("DistributedTokenBucket: Already throttled, exiting early", {
					...getThrottlingBaseTelemetryProperties().baseLumberjackProperties,
					remoteId: this.remoteId,
					tokensConsumedSinceLastSync: this.tokensConsumedSinceLastSync,
					currentCount: throttlingMetric.count,
					retryAfterInMs,
				});
			}
			throttlingMetric.retryAfterInMs = retryAfterInMs;
			await this.setThrottlingMetricAndUsageData(throttlingMetric, usageData);
			this.lastConsumeTokensSyncResult = throttlingMetric.retryAfterInMs;
			// Always reset tokensConsumedSinceLastSync after sync, regardless of throttling status
			this.tokensConsumedSinceLastSync = 0;
			return;
		}

		// replenish "tokens" if possible
		const amountToReplenish = this.getTokenReplenishAmount(throttlingMetric, now);
		if (amountToReplenish > 0) {
			throttlingMetric.count += amountToReplenish;
			throttlingMetric.lastCoolDownAt = now;
			if (this.config.enableEnhancedTelemetry) {
				Lumberjack.verbose("DistributedTokenBucket: Replenishing tokens", {
					...getThrottlingBaseTelemetryProperties().baseLumberjackProperties,
					remoteId: this.remoteId,
					amountToReplenish,
					newCount: throttlingMetric.count,
				});
			}
		}

		// throttle if "token bucket" is empty
		const newRetryAfterInMs = this.getRetryAfterInMs(throttlingMetric, now);
		if (newRetryAfterInMs > 0) {
			throttlingMetric.throttleStatus = true;
			throttlingMetric.throttleReason = `Throttling count exceeded by ${Math.abs(
				throttlingMetric.count,
			)} at ${new Date(now).toISOString()}`;
			throttlingMetric.retryAfterInMs = newRetryAfterInMs;
			if (this.config.enableEnhancedTelemetry) {
				Lumberjack.verbose("DistributedTokenBucket: Setting throttle status", {
					...getThrottlingBaseTelemetryProperties().baseLumberjackProperties,
					remoteId: this.remoteId,
					currentCount: throttlingMetric.count,
					retryAfterInMs: newRetryAfterInMs,
					throttleReason: throttlingMetric.throttleReason,
				});
			}
		} else {
			throttlingMetric.throttleStatus = false;
			throttlingMetric.throttleReason = "";
			throttlingMetric.retryAfterInMs = 0;
			if (this.config.enableEnhancedTelemetry) {
				Lumberjack.verbose("DistributedTokenBucket: Clearing throttle status", {
					...getThrottlingBaseTelemetryProperties().baseLumberjackProperties,
					remoteId: this.remoteId,
					currentCount: throttlingMetric.count,
				});
			}
		}

		await this.setThrottlingMetricAndUsageData(throttlingMetric, usageData);

		this.lastConsumeTokensSyncResult = throttlingMetric.retryAfterInMs;
		// Always reset tokensConsumedSinceLastSync after sync, regardless of throttling status
		this.tokensConsumedSinceLastSync = 0;
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
			if (this.config.enableEnhancedTelemetry) {
				Lumberjack.verbose("DistributedTokenBucket: Triggering sync", {
					...getThrottlingBaseTelemetryProperties().baseLumberjackProperties,
					remoteId: this.remoteId,
					tokensRequested: tokens,
					tokensConsumedSinceLastSync: this.tokensConsumedSinceLastSync,
					lastSyncTimestamp: this.lastSyncTimestamp,
					timeSinceLastSync: this.lastSyncTimestamp
						? Date.now() - this.lastSyncTimestamp
						: undefined,
				});
			}
			this.tryConsumeCore(usageData).catch((error) => {
				Lumberjack.error("Failed to consume tokens", { error });
			});
		} else if (this.config.enableEnhancedTelemetry) {
			Lumberjack.verbose("DistributedTokenBucket: Using cached result", {
				...getThrottlingBaseTelemetryProperties().baseLumberjackProperties,
				remoteId: this.remoteId,
				tokensRequested: tokens,
				tokensConsumedSinceLastSync: this.tokensConsumedSinceLastSync,
				cachedResult: this.lastConsumeTokensSyncResult,
				timeSinceLastSync: this.lastSyncTimestamp
					? Date.now() - this.lastSyncTimestamp
					: undefined,
			});
		}
		return this.lastConsumeTokensSyncResult ?? 0;
	}
}
