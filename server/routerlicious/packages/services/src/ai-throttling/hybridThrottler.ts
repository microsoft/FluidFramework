/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type IThrottler,
	type IThrottleAndUsageStorageManager,
	type IThrottlerResponse,
	ThrottlingError,
	type ILogger,
	type IUsageData,
} from "@fluidframework/server-services-core";
import {
	CommonProperties,
	Lumberjack,
	ThrottlingTelemetryProperties,
} from "@fluidframework/server-services-telemetry";
import LRUCache from "lru-cache";

import { InMemoryTokenBucketStorage } from "./inMemoryTokenBucketStorage";
import { RedisTokenBucketStorage } from "./redisTokenBucketStorage";
import { TokenBucket, type ITokenBucketOptions } from "./tokenBucket";

/**
 * Configuration for local instance throttling between distributed sync-ups
 * @internal
 */
export interface ILocalThrottleConfig {
	/**
	 * Maximum operations per second for local instance throttling.
	 * This should be set conservatively as a fraction of the global limit.
	 * For example, if global limit is 1000 ops/sec and you have 10 instances,
	 * set this to ~80-100 ops/sec per instance to allow some headroom.
	 */
	maxLocalOpsPerSecond: number;

	/**
	 * Local burst capacity - how many operations can be processed in a burst
	 * before local throttling kicks in. Should be aligned with expected traffic patterns.
	 * Default: maxLocalOpsPerSecond (1 second worth of operations)
	 */
	localBurstCapacity?: number;

	/**
	 * How often to replenish local tokens, in milliseconds.
	 * Smaller values = more responsive to traffic spikes but more CPU overhead.
	 * Default: 100ms
	 */
	localReplenishIntervalMs?: number;
}

/**
 * A hybrid throttler that combines distributed throttling (via Redis)
 * with local instance-level throttling to handle sharp traffic spikes between sync intervals.
 *
 * Architecture:
 * - Maintains local token buckets per instance to catch sharp spikes immediately
 * - Periodically syncs with distributed storage (Redis) for global coordination
 * - Uses the most restrictive result (local OR distributed throttling)
 * - Provides immediate feedback for traffic spikes while maintaining global limits
 *
 * @internal
 */
export class HybridThrottler implements IThrottler {
	private readonly lastThrottleUpdateAtMap: LRUCache<string, number>;
	private readonly countDeltaMap: LRUCache<string, number>;
	private readonly throttlerResponseCache: LRUCache<string, IThrottlerResponse>;
	private readonly localThrottlerResponseCache: LRUCache<string, IThrottlerResponse>;
	private readonly localTokenBucket: TokenBucket;
	private readonly distributedTokenBucket: TokenBucket;

	constructor(
		storageManager: IThrottleAndUsageStorageManager,
		localThrottleConfig: ILocalThrottleConfig,
		private readonly minThrottleIntervalInMs: number = 60000, // Default 1 minute
		private readonly logger?: ILogger,
		/**
		 * Maximum number of keys that should be internally tracked at a given time.
		 * Fine tune this and cache age to balance accuracy and memory consumption.
		 * If this value is less than number of keys (traffic) per cache age time, the in-memory cache can overflow.
		 * Default: 1,000
		 */
		maxCacheSize: number = 1000,
		/**
		 * When to mark internal cache values as stale, in milliseconds. In production, this value should not be
		 * lower than minThrottleIntervalInMs, otherwise throttle counts will be lost between calculation intervals.
		 * Default: 5min
		 */
		maxCacheAge: number = 1000 * 60 * 5,
		/**
		 * Throttling can generate a lot of telemetry, which can be expensive and/or taxing on resources.
		 * Use this flag to enable/disable extra telemetry that is useful for validating throttling config correctness.
		 * Default: false
		 */
		private readonly enableEnhancedTelemetry: boolean = false,
	) {
		// Validate local throttle config
		if (localThrottleConfig.maxLocalOpsPerSecond <= 0) {
			throw new Error("maxLocalOpsPerSecond must be greater than 0");
		}

		// Create unified token bucket configuration
		const tokenBucketOptions: ITokenBucketOptions = {
			opsPerSecond: localThrottleConfig.maxLocalOpsPerSecond,
			burstCapacity: localThrottleConfig.localBurstCapacity,
			replenishIntervalMs: localThrottleConfig.localReplenishIntervalMs,
		};

		// Initialize local token bucket (in-memory)
		this.localTokenBucket = new TokenBucket(
			new InMemoryTokenBucketStorage({
				maxBuckets: maxCacheSize,
				maxAgeMs: maxCacheAge,
			}),
			tokenBucketOptions,
		);

		// Initialize distributed token bucket (Redis)
		this.distributedTokenBucket = new TokenBucket(
			new RedisTokenBucketStorage(storageManager),
			tokenBucketOptions,
		);

		const cacheOptions: LRUCache.Options<string, any> = {
			max: maxCacheSize,
			maxAge: maxCacheAge,
		};

		this.lastThrottleUpdateAtMap = new LRUCache({
			...cacheOptions,
			dispose: this.enableEnhancedTelemetry
				? (key, value: number) => {
						const now = Date.now();
						if (now - value < maxCacheAge) {
							const telemetryProperties = this.getBaseTelemetryProperties(key);
							const lumberjackProperties = {
								...telemetryProperties.baseLumberjackProperties,
								ageInMs: now - value,
							};
							this.logger?.warn(
								`Purged lastThrottleUpdateAt for ${key} before maxAge reached`,
								{ messageMetaData: telemetryProperties.baseMessageMetaData },
							);
							Lumberjack.warning(
								`Purged lastThrottleUpdateAt for ${key} before maxAge reached`,
								lumberjackProperties,
							);
						}
				  }
				: undefined,
		});

		this.countDeltaMap = new LRUCache(cacheOptions);
		this.throttlerResponseCache = new LRUCache(cacheOptions);
		this.localThrottlerResponseCache = new LRUCache(cacheOptions);
	}

	/**
	 * Increments operation count and calculates throttle status.
	 * Performs BOTH local and distributed throttling checks.
	 * @throws {@link ThrottlingError} if throttled by either local or distributed limits
	 */
	public incrementCount(
		id: string,
		weight: number = 1,
		usageStorageId?: string,
		usageData?: IUsageData,
	): void {
		const telemetryProperties = this.getBaseTelemetryProperties(id);

		// STEP 1: Check cached local throttling status first
		const cachedLocalResponse = this.localThrottlerResponseCache.get(id);
		if (cachedLocalResponse && cachedLocalResponse.throttleStatus) {
			const retryAfterInSeconds = Math.ceil(cachedLocalResponse.retryAfterInMs / 1000);
			this.logger?.info(`Locally throttled (cached): ${id}`, {
				messageMetaData: {
					...telemetryProperties.baseMessageMetaData,
					reason: cachedLocalResponse.throttleReason,
					retryAfterInSeconds,
					throttleType: "local",
				},
			});
			Lumberjack.info(`Locally throttled (cached): ${id}`, {
				...telemetryProperties.baseLumberjackProperties,
				[ThrottlingTelemetryProperties.reason]: cachedLocalResponse.throttleReason,
				[ThrottlingTelemetryProperties.retryAfterInSeconds]: retryAfterInSeconds,
				throttleType: "local",
			});
			// eslint-disable-next-line @typescript-eslint/no-throw-literal
			throw new ThrottlingError(cachedLocalResponse.throttleReason, retryAfterInSeconds);
		}

		// STEP 2: Check local throttling and update cache (fire-and-forget)
		try {
			this.checkLocalThrottling(id, weight)
				.then((result) => {
					const localResponse: IThrottlerResponse = {
						throttleStatus: result.isThrottled,
						throttleReason: result.reason,
						retryAfterInMs: result.retryAfterInMs,
					};

					// Always cache the result for future requests
					this.localThrottlerResponseCache.set(id, localResponse);

					if (result.isThrottled) {
						const retryAfterInSeconds = Math.ceil(result.retryAfterInMs / 1000);
						this.logger?.info(`Locally throttled: ${id}`, {
							messageMetaData: {
								...telemetryProperties.baseMessageMetaData,
								reason: result.reason,
								retryAfterInSeconds,
								throttleType: "local",
							},
						});
						Lumberjack.info(`Locally throttled: ${id}`, {
							...telemetryProperties.baseLumberjackProperties,
							[ThrottlingTelemetryProperties.reason]: result.reason,
							[ThrottlingTelemetryProperties.retryAfterInSeconds]:
								retryAfterInSeconds,
							throttleType: "local",
						});
						// Note: We can't throw here due to async nature, but it's cached for next call
					}
				})
				.catch((error) => {
					this.logger?.error(`Error in local throttling check for ${id}: ${error}`, {
						messageMetaData: telemetryProperties.baseMessageMetaData,
					});
				});
		} catch (error) {
			// Log but don't block on local throttling errors
			this.logger?.error(`Sync error in local throttling for ${id}: ${error}`, {
				messageMetaData: telemetryProperties.baseMessageMetaData,
			});
		}

		// STEP 3: Update distributed count delta (for eventual consistency)
		this.updateCountDelta(id, weight);

		// STEP 4: Trigger distributed throttle check in background (non-blocking)
		this.updateAndCacheThrottleStatus(id, usageStorageId, usageData).catch((error) => {
			this.logger?.error(
				`Error encountered updating and/or caching throttle status for ${id}: ${error}`,
				{ messageMetaData: telemetryProperties.baseMessageMetaData },
			);
			Lumberjack.error(
				`Error encountered updating and/or caching throttle status for ${id}`,
				telemetryProperties.baseLumberjackProperties,
				error,
			);
		});

		// STEP 5: Check cached distributed throttle status
		const cachedThrottlerResponse = this.throttlerResponseCache.get(id);
		if (cachedThrottlerResponse && cachedThrottlerResponse.throttleStatus) {
			const retryAfterInSeconds = Math.ceil(cachedThrottlerResponse.retryAfterInMs / 1000);
			this.logger?.info(`Distributed throttled: ${id}`, {
				messageMetaData: {
					...telemetryProperties.baseMessageMetaData,
					reason: cachedThrottlerResponse.throttleReason,
					retryAfterInSeconds,
					throttleType: "distributed",
				},
			});
			Lumberjack.info(`Distributed throttled: ${id}`, {
				...telemetryProperties.baseLumberjackProperties,
				[ThrottlingTelemetryProperties.reason]: cachedThrottlerResponse.throttleReason,
				[ThrottlingTelemetryProperties.retryAfterInSeconds]: retryAfterInSeconds,
				throttleType: "distributed",
			});
			// eslint-disable-next-line @typescript-eslint/no-throw-literal
			throw new ThrottlingError(cachedThrottlerResponse.throttleReason, retryAfterInSeconds);
		}
	}

	/**
	 * Decrements operation count for both local and distributed tracking.
	 */
	public decrementCount(id: string, weight: number = 1): void {
		// Update distributed count
		this.updateCountDelta(id, -weight);

		// Return tokens to local bucket (allows for immediate retry)
		void this.localTokenBucket.returnTokens(id, weight);

		// Clear local throttling cache to allow immediate retry
		// This ensures that if we were locally throttled, returning tokens allows immediate retry
		this.localThrottlerResponseCache.del(id);
	}

	/**
	 * Check local throttling using token bucket algorithm
	 * @param id - The throttle ID
	 * @param weight - Operation weight
	 * @returns Local throttle result
	 */
	private async checkLocalThrottling(
		id: string,
		weight: number,
	): Promise<{
		isThrottled: boolean;
		reason: string;
		retryAfterInMs: number;
	}> {
		const result = await this.localTokenBucket.tryConsumeTokens(id, weight);

		return {
			isThrottled: result.isThrottled,
			reason: result.reason,
			retryAfterInMs: result.retryAfterInMs,
		};
	}

	private updateCountDelta(id: string, value: number): void {
		const currentValue = this.countDeltaMap.get(id) || 0;
		this.countDeltaMap.set(id, currentValue + value);
	}

	private async updateAndCacheThrottleStatus(
		id: string,
		usageStorageId?: string,
		usageData?: IUsageData,
	): Promise<void> {
		const telemetryProperties = this.getBaseTelemetryProperties(id);

		const now = Date.now();
		if (this.lastThrottleUpdateAtMap.get(id) === undefined) {
			if (this.enableEnhancedTelemetry) {
				this.logger?.info(`Starting to track throttling status for ${id}`, {
					messageMetaData: telemetryProperties.baseMessageMetaData,
				});
				Lumberjack.info(
					`Starting to track throttling status for ${id}`,
					telemetryProperties.baseLumberjackProperties,
				);
			}
			this.lastThrottleUpdateAtMap.set(id, now);
		}

		const lastThrottleUpdateTime = this.lastThrottleUpdateAtMap.get(id);
		if (
			lastThrottleUpdateTime !== undefined &&
			now - lastThrottleUpdateTime > this.minThrottleIntervalInMs
		) {
			const countDelta = this.countDeltaMap.get(id) ?? 0;
			this.lastThrottleUpdateAtMap.set(id, now);
			this.countDeltaMap.set(id, 0);
			const messageMetaData = {
				...telemetryProperties.baseMessageMetaData,
				weight: countDelta,
			};
			const lumberjackProperties = {
				...telemetryProperties.baseLumberjackProperties,
				[ThrottlingTelemetryProperties.weight]: countDelta,
			};
			// populate usageData with relevant data.
			if (usageData) {
				usageData.value = countDelta;
				usageData.startTime = lastThrottleUpdateTime;
				usageData.endTime = now;
			}

			// Use distributed token bucket instead of throttlerHelper
			try {
				const result =
					usageStorageId && usageData
						? await this.distributedTokenBucket.tryConsumeTokensWithUsage(
								id,
								countDelta,
								usageStorageId,
								usageData,
						  )
						: await this.distributedTokenBucket.tryConsumeTokens(id, countDelta);

				const throttlerResponse: IThrottlerResponse = {
					throttleStatus: result.isThrottled,
					throttleReason: result.reason,
					retryAfterInMs: result.retryAfterInMs,
				};

				if (this.enableEnhancedTelemetry) {
					this.logger?.info(
						`Updated distributed throttle count for ${id} by ${countDelta}`,
						{
							messageMetaData,
						},
					);
					Lumberjack.info(
						`Updated distributed throttle count for ${id} by ${countDelta}`,
						lumberjackProperties,
					);
				}
				this.throttlerResponseCache.set(id, throttlerResponse);
			} catch (err) {
				this.logger?.error(
					`Failed to update distributed throttling count for ${id}: ${err}`,
					{
						messageMetaData,
					},
				);
				Lumberjack.error(
					`Failed to update distributed throttling count for ${id}`,
					lumberjackProperties,
					err,
				);
			}
		}
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
