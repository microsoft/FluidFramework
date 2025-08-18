/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ILogger,
	IThrottleAndUsageStorageManager,
	IThrottler,
	IUsageData,
	ThrottlingError,
} from "@fluidframework/server-services-core";
import {
	CommonProperties,
	Lumberjack,
	ThrottlingTelemetryProperties,
} from "@fluidframework/server-services-telemetry";
import LRUCache, { Options as LRUCacheOptions } from "lru-cache";

import {
	DistributedTokenBucket,
	IDistributedTokenBucketConfig,
	ITokenBucketConfig,
	TokenBucket,
} from "./tokenBucket";

export interface IDistributedTokenBucketThrottlerConfig {
	/**
	 * Configuration for the local token bucket.
	 * This bucket is used for rate limiting operations within a single instance, and will typically
	 * have lower capacity than the distributed bucket.
	 * By default, the local token bucket is effectively disabled with massive limits.
	 * Default: \{ capacity: 1_000_000, refillRatePerMs: 1_000_000, minCooldownIntervalMs: 1_000_000 \}
	 */
	localTokenBucket?: Partial<ITokenBucketConfig>;
	/**
	 * Configuration for the distributed token bucket.
	 * This bucket is used for rate limiting operations across multiple instances, and will typically
	 * have higher capacity than the local bucket.
	 * By default, the distributed token bucket is effectively disabled with massive limits.
	 * Default: \{ capacity: 1_000_000, refillRatePerMs: 1_000_000, minCooldownIntervalMs: 1_000_000, distributedSyncIntervalInMs: 1_000_000 \}
	 */
	distributedTokenBucket?: Partial<IDistributedTokenBucketConfig>;

	/**
	 * Maximum number of keys that should be internally tracked at a given time.
	 * Fine tune this and cache age to balance accuracy and memory consumption.
	 * If this value is less than number of keys (traffic) per cache age time, the in-memry cache can overflow.
	 * Default: 1,000
	 */
	maxLocalCacheSize?: number;
	/**
	 * When to mark internal cache values as stale, in milliseconds. In production, this value should not be
	 * lower than distributedSyncIntervalInMs, otherwise throttle counts will be lost between sync intervals.
	 * Default: 60,000 (1min)
	 */
	maxLocalCacheAgeInMs?: number;

	/**
	 * Throttling can generate a lot of telemetry, which can be expensive and/or taxing on resources.
	 * Use this flag to enable/disable extra telemetry that is useful for validating throttling config correctness.
	 * Default: false
	 */
	enableEnhancedTelemetry?: boolean;
}

const defaultDistributedTokenBucketThrottlerConfig: Required<IDistributedTokenBucketThrottlerConfig> =
	{
		localTokenBucket: {
			capacity: 1_000_000,
			refillRatePerMs: 1_000_000,
			minCooldownIntervalMs: 1_000_000,
		},
		distributedTokenBucket: {
			capacity: 1_000_000,
			refillRatePerMs: 1_000_000,
			minCooldownIntervalMs: 1_000_000,
			distributedSyncIntervalInMs: 1_000_000,
		},
		maxLocalCacheSize: 1_000_000,
		maxLocalCacheAgeInMs: 60_000,
		enableEnhancedTelemetry: false,
	};

interface ITokenBucketCacheEntry {
	/**
	 * The token bucket used locally for rate limiting.
	 */
	localBucket: TokenBucket;

	/**
	 * The token bucket used for distributed rate limiting.
	 */
	distributedBucket: DistributedTokenBucket;
	/**
	 * The last time the token bucket was updated.
	 * In milliseconds since the epoch.
	 */
	lastUpdate: number;
}

/**
 * Uses the Token Bucket algorithm to calculate rate-limiting for throttling operations
 * for separately tracked identifiers (e.g API, user, etc.).
 * Depending on the provided storage manager, the token buckets may be persisted across instances.
 * @internal
 *
 * @remarks
 * The DistributedTokenBucketThrottler contains 2 separate TokenBuckets for each tracked identifier: 1 local, 1 distributed.
 * The local token bucket is used for rate limiting operations within a single instance, while the distributed token bucket is used for rate limiting operations across multiple instances.
 * Importantly, the distributed token bucket is only updated once every distributedSyncIntervalInMs, which alleviates pressure on the distributed storage,
 * but may introduce some latency in reflecting usage patterns across instances. The local token bucket exists to reduce the likelihood of missing large usage spikes in a single instance.
 */
export class DistributedTokenBucketThrottler implements IThrottler {
	/**
	 * Map of ids to token buckets.
	 * This is an LRU cache to avoid storing too many token buckets in memory.
	 */
	private readonly tokenBuckets: LRUCache<string, ITokenBucketCacheEntry>;
	private readonly config: Required<IDistributedTokenBucketThrottlerConfig>;

	constructor(
		private readonly throttleAndUsageStorageManager: IThrottleAndUsageStorageManager,
		private readonly logger?: ILogger,
		config?: Partial<IDistributedTokenBucketThrottlerConfig>,
	) {
		this.config = { ...defaultDistributedTokenBucketThrottlerConfig, ...config };
		const cacheOptions: LRUCacheOptions<string, ITokenBucketCacheEntry> = {
			max: this.config.maxLocalCacheSize,
			maxAge: this.config.maxLocalCacheAgeInMs,
			dispose: this.config.enableEnhancedTelemetry
				? (key, value: ITokenBucketCacheEntry) => {
						// Utilize the opportunity to log information before an item is removed from the cache.
						// If a cache entry is removed too soon, it can negatively impact the correctness of throttling.
						const now = Date.now();
						if (now - value.lastUpdate < this.config.maxLocalCacheAgeInMs) {
							// lastUpdate value should be equal to the time that the cached value was last updated.
							// If it is being disposed before the maxCacheAge is reached, it indicates that the cache is full.
							const telemetryProperties = this.getBaseTelemetryProperties(key);
							const lumberjackProperties = {
								...telemetryProperties.baseLumberjackProperties,
								ageInMs: now - value.lastUpdate,
							};
							this.logger?.warn(
								`Purged tokenBucket for ${key} before maxAge reached`,
								{ messageMetaData: telemetryProperties.baseMessageMetaData },
							);
							Lumberjack.warning(
								`Purged tokenBucket for ${key} before maxAge reached`,
								lumberjackProperties,
							);
						}
				  }
				: undefined,
		};
		this.tokenBuckets = new LRUCache(cacheOptions);
	}

	public incrementCount(
		id: string,
		weight: number = 1,
		usageStorageId?: string,
		usageData?: IUsageData,
	): void {
		const telemetryProperties = this.getBaseTelemetryProperties(id);
		// Step 1: Get or create the token bucket
		const existingTokenBucket = this.tokenBuckets.get(id);
		const tokenBucket: ITokenBucketCacheEntry = existingTokenBucket ?? {
			localBucket: new TokenBucket(this.config.localTokenBucket),
			distributedBucket: new DistributedTokenBucket(
				id,
				this.throttleAndUsageStorageManager,
				this.config.distributedTokenBucket,
				usageStorageId,
			),
			lastUpdate: Date.now(),
		};
		if (!existingTokenBucket) {
			// If the existing token bucket didn't exist, store the new one.
			this.tokenBuckets.set(id, tokenBucket);
		}

		// Step 2: Consume tokens from the local bucket
		const timeUntilLocalTokensCanBeConsumedMs = tokenBucket.localBucket.tryConsume(weight);
		const timeUntilDistributedTokensCanBeConsumedMs = tokenBucket.distributedBucket.tryConsume(
			weight,
			usageData,
		);
		tokenBucket.lastUpdate = Date.now();
		const timeUntilTokensCanBeConsumedMs = Math.max(
			timeUntilLocalTokensCanBeConsumedMs,
			timeUntilDistributedTokensCanBeConsumedMs,
		);
		if (timeUntilTokensCanBeConsumedMs !== 0) {
			// Tokens could not be consumed, indicating that a bucket is exhausted.
			// Throw a throttling error, and don't bother syncing with the distributed storage.
			const retryAfterInSeconds = timeUntilTokensCanBeConsumedMs / 1000;
			const throttlingError = new ThrottlingError(
				`Token bucket for ${id} is exhausted`,
				retryAfterInSeconds,
			);
			Lumberjack.warning(
				`Token bucket for ${id} is exhausted`,
				{
					...telemetryProperties,
					retryAfterInSeconds,
				},
				throttlingError,
			);
			throw throttlingError;
		}
	}

	public decrementCount(id: string, weight: number = 1): void {
		const telemetryProperties = this.getBaseTelemetryProperties(id);
		const tokenBucket = this.tokenBuckets.get(id);
		if (!tokenBucket) {
			return;
		}
		try {
			tokenBucket.localBucket.tryConsume(-weight);
			tokenBucket.distributedBucket.tryConsume(-weight);
		} catch (error) {
			// If the token buckets are still exhausted, we shouldn't throw when attempting to replenish tokens.
			this.logger?.warn(`Failed to decrement token bucket for ${id}`, {
				...telemetryProperties,
				error,
			});
			Lumberjack.warning(
				`Failed to decrement token bucket for ${id}`,
				telemetryProperties,
				error,
			);
		}
		tokenBucket.lastUpdate = Date.now();
	}

	private getBaseTelemetryProperties(key: string) {
		return {
			baseMessageMetaData: {
				key,
				eventName: "throttling",
			},
			baseLumberjackProperties: {
				[CommonProperties.telemetryGroupName]: "throttling",
				[ThrottlingTelemetryProperties.key]: key,
			},
		};
	}
}
