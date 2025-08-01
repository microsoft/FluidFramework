/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IThrottlerResponse } from "@fluidframework/server-services-core";
import LRUCache from "lru-cache";

import {
	BaseTokenBucket,
	type ITokenBucketConfig,
	type ITokenBucketState,
	type ITokenBucketResult,
} from "./baseTokenBucket";

/**
 * Configuration for local (in-memory) token bucket throttling
 * @internal
 */
export interface ILocalTokenBucketConfig {
	/** Maximum operations per second */
	opsPerSecond: number;
	/** Burst capacity (max tokens in bucket) */
	burstCapacity?: number;
	/** Token replenishment interval in milliseconds */
	replenishIntervalMs?: number;
	/** Maximum number of buckets to track in memory */
	maxBuckets?: number;
	/** How long to keep bucket state cached */
	maxAgeMs?: number;
}

/**
 * In-memory token bucket implementation for local rate limiting.
 * Extends BaseTokenBucket to provide local storage and management.
 * @internal
 */
export class LocalTokenBucketHelper extends BaseTokenBucket {
	private readonly bucketStates: LRUCache<string, ITokenBucketState>;

	constructor(config: ILocalTokenBucketConfig) {
		const replenishIntervalMs = config.replenishIntervalMs ?? 100;
		const burstCapacity = config.burstCapacity ?? config.opsPerSecond;

		// Convert to base config format
		const baseConfig: ITokenBucketConfig = {
			maxTokens: burstCapacity,
			tokensPerMs: config.opsPerSecond / 1000, // Convert ops/sec to ops/ms
			minReplenishIntervalMs: replenishIntervalMs,
		};

		super(baseConfig);

		// Initialize LRU cache for bucket states
		this.bucketStates = new LRUCache<string, ITokenBucketState>({
			max: config.maxBuckets ?? 1000,
			maxAge: config.maxAgeMs ?? 5 * 60 * 1000, // Default 5 minutes
		});
	}

	/**
	 * Attempt to consume tokens for the given ID
	 * @param id - Unique identifier for the bucket
	 * @param tokensRequested - Number of tokens to consume
	 * @returns Result indicating success/failure
	 */
	public tryConsumeTokens(id: string, tokensRequested: number): ITokenBucketResult {
		const now = Date.now();
		const currentState = this.getBucketState(id, now);
		const result = this.consumeTokens(currentState, tokensRequested, now);

		// Update stored state
		this.bucketStates.set(id, result.newState);

		return result;
	}

	/**
	 * Add tokens back to the bucket (for completed/cancelled operations)
	 * @param id - Unique identifier for the bucket
	 * @param tokensToAdd - Number of tokens to add back
	 */
	public returnTokens(id: string, tokensToAdd: number): void {
		const now = Date.now();
		const currentState = this.getBucketState(id, now);
		const newState = this.addTokens(currentState, tokensToAdd, now);

		this.bucketStates.set(id, newState);
	}

	/**
	 * Get current throttle status for an ID
	 * @param id - Unique identifier for the bucket
	 * @returns Current throttle response
	 */
	public getThrottleStatus(id: string): IThrottlerResponse {
		const state = this.getBucketState(id, Date.now());
		return this.toThrottlerResponse(state);
	}

	/**
	 * Get current token count for an ID (useful for monitoring)
	 * @param id - Unique identifier for the bucket
	 * @returns Current number of available tokens
	 */
	public getTokenCount(id: string): number {
		const state = this.getBucketState(id, Date.now());
		return state.tokens;
	}

	/**
	 * Clear all bucket states (useful for testing)
	 */
	public clearAll(): void {
		this.bucketStates.reset();
	}

	/**
	 * Get bucket state for an ID, creating it if it doesn't exist
	 * @param id - Unique identifier for the bucket
	 * @param now - Current timestamp
	 * @returns Current bucket state
	 */
	private getBucketState(id: string, now: number): ITokenBucketState {
		let state = this.bucketStates.get(id);
		if (!state) {
			state = this.createInitialState(now);
			this.bucketStates.set(id, state);
		}
		return state;
	}
}
