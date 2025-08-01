/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IThrottleAndUsageStorageManager,
	IThrottlingMetrics,
	IUsageData,
} from "@fluidframework/server-services-core";

import type { ITokenBucketState } from "./baseTokenBucket";
import type { ITokenBucketStorage, IRedisStorageConfig } from "./tokenBucketStorage";

/**
 * Redis-based storage implementation for token bucket states.
 * Converts between ITokenBucketState and IThrottlingMetrics for compatibility
 * with existing Redis storage infrastructure.
 * @internal
 */
export class RedisTokenBucketStorage implements ITokenBucketStorage {
	private readonly keyPrefix: string;

	constructor(
		private readonly storageManager: IThrottleAndUsageStorageManager,
		config: IRedisStorageConfig = {},
	) {
		this.keyPrefix = config.keyPrefix ?? "tokenbucket:";
	}

	public async get(id: string): Promise<ITokenBucketState | undefined> {
		const key = this.getKey(id);
		const throttlingMetric = await this.storageManager.getThrottlingMetric(key);

		if (!throttlingMetric) {
			return undefined;
		}

		return this.convertFromThrottlingMetrics(throttlingMetric);
	}

	public async set(id: string, state: ITokenBucketState): Promise<void> {
		const key = this.getKey(id);
		const throttlingMetric = this.convertToThrottlingMetrics(state);

		await this.storageManager.setThrottlingMetric(key, throttlingMetric);
	}

	public async clear(): Promise<void> {
		// Note: IThrottleAndUsageStorageManager doesn't provide a clear method
		// This is a limitation of the current interface
		// In practice, Redis keys will expire based on TTL
		console.warn("RedisTokenBucketStorage.clear() not implemented - relying on TTL expiration");
	}

	/**
	 * Set token bucket state along with usage data
	 * @param id - Unique identifier for the bucket
	 * @param state - Bucket state to store
	 * @param usageStorageId - Usage storage identifier
	 * @param usageData - Usage data to store alongside
	 */
	public async setWithUsageData(
		id: string,
		state: ITokenBucketState,
		usageStorageId: string,
		usageData: IUsageData,
	): Promise<void> {
		const key = this.getKey(id);
		const throttlingMetric = this.convertToThrottlingMetrics(state);

		await this.storageManager.setThrottlingMetricAndUsageData(
			key,
			throttlingMetric,
			usageStorageId,
			usageData,
		);
	}

	private getKey(id: string): string {
		return `${this.keyPrefix}${id}`;
	}

	private convertFromThrottlingMetrics(metric: IThrottlingMetrics): ITokenBucketState {
		return {
			tokens: metric.count,
			lastReplenishAt: metric.lastCoolDownAt,
			isThrottled: metric.throttleStatus,
			throttleReason: metric.throttleReason,
			retryAfterInMs: metric.retryAfterInMs,
		};
	}

	private convertToThrottlingMetrics(state: ITokenBucketState): IThrottlingMetrics {
		return {
			count: state.tokens,
			lastCoolDownAt: state.lastReplenishAt,
			throttleStatus: state.isThrottled,
			throttleReason: state.throttleReason,
			retryAfterInMs: state.retryAfterInMs,
		};
	}
}
