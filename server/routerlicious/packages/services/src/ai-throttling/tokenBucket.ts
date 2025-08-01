/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IThrottlerResponse, IUsageData } from "@fluidframework/server-services-core";

import {
	BaseTokenBucket,
	type ITokenBucketConfig,
	type ITokenBucketState,
	type ITokenBucketResult,
} from "./baseTokenBucket";
import type { RedisTokenBucketStorage } from "./redisTokenBucketStorage";
import type { ITokenBucketStorage } from "./tokenBucketStorage";

/**
 * Configuration for unified token bucket
 * @internal
 */
export interface ITokenBucketOptions {
	/** Maximum operations per second */
	opsPerSecond: number;
	/** Burst capacity (max tokens in bucket) */
	burstCapacity?: number;
	/** Token replenishment interval in milliseconds */
	replenishIntervalMs?: number;
}

/**
 * Unified token bucket implementation that works with different storage backends.
 * Uses the same core algorithm regardless of whether storage is in-memory or distributed.
 * @internal
 */
export class TokenBucket extends BaseTokenBucket {
	constructor(
		private readonly storage: ITokenBucketStorage,
		options: ITokenBucketOptions,
	) {
		const replenishIntervalMs = options.replenishIntervalMs ?? 100;
		const burstCapacity = options.burstCapacity ?? options.opsPerSecond;

		// Convert to base config format
		const baseConfig: ITokenBucketConfig = {
			maxTokens: burstCapacity,
			tokensPerMs: options.opsPerSecond / 1000, // Convert ops/sec to ops/ms
			minReplenishIntervalMs: replenishIntervalMs,
		};

		super(baseConfig);
	}

	/**
	 * Attempt to consume tokens for the given ID
	 * @param id - Unique identifier for the bucket
	 * @param tokensRequested - Number of tokens to consume
	 * @returns Result indicating success/failure
	 */
	public async tryConsumeTokens(
		id: string,
		tokensRequested: number,
	): Promise<ITokenBucketResult> {
		const now = Date.now();
		const currentState = await this.getBucketState(id, now);
		const result = this.consumeTokens(currentState, tokensRequested, now);

		// Update stored state
		await this.storage.set(id, result.newState);

		return result;
	}

	/**
	 * Add tokens back to the bucket (for completed/cancelled operations)
	 * @param id - Unique identifier for the bucket
	 * @param tokensToAdd - Number of tokens to add back
	 */
	public async returnTokens(id: string, tokensToAdd: number): Promise<void> {
		const now = Date.now();
		const currentState = await this.getBucketState(id, now);
		const newState = this.addTokens(currentState, tokensToAdd, now);

		await this.storage.set(id, newState);
	}

	/**
	 * Get current throttle status for an ID
	 * @param id - Unique identifier for the bucket
	 * @returns Current throttle response
	 */
	public async getThrottleStatus(id: string): Promise<IThrottlerResponse> {
		const state = await this.getBucketState(id, Date.now());
		return this.toThrottlerResponse(state);
	}

	/**
	 * Get current token count for an ID (useful for monitoring)
	 * @param id - Unique identifier for the bucket
	 * @returns Current number of available tokens
	 */
	public async getTokenCount(id: string): Promise<number> {
		const state = await this.getBucketState(id, Date.now());
		return state.tokens;
	}

	/**
	 * Clear all bucket states (useful for testing)
	 */
	public async clearAll(): Promise<void> {
		await this.storage.clear();
	}

	/**
	 * Update count with usage data (for distributed storage that supports it)
	 * @param id - Unique identifier for the bucket
	 * @param tokensRequested - Number of tokens to consume
	 * @param usageStorageId - Usage storage identifier
	 * @param usageData - Usage data to store alongside
	 * @returns Result indicating success/failure
	 */
	public async tryConsumeTokensWithUsage(
		id: string,
		tokensRequested: number,
		usageStorageId: string,
		usageData: IUsageData,
	): Promise<ITokenBucketResult> {
		const now = Date.now();
		const currentState = await this.getBucketState(id, now);
		const result = this.consumeTokens(currentState, tokensRequested, now);

		// Check if storage supports usage data
		await ("setWithUsageData" in this.storage
			? (this.storage as RedisTokenBucketStorage).setWithUsageData(
					id,
					result.newState,
					usageStorageId,
					usageData,
			  )
			: this.storage.set(id, result.newState));

		return result;
	}

	/**
	 * Get bucket state for an ID, creating it if it doesn't exist
	 * @param id - Unique identifier for the bucket
	 * @param now - Current timestamp
	 * @returns Current bucket state
	 */
	private async getBucketState(id: string, now: number): Promise<ITokenBucketState> {
		let state = await this.storage.get(id);
		if (!state) {
			state = this.createInitialState(now);
			await this.storage.set(id, state);
		}
		return state;
	}
}
