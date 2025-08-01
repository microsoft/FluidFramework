/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IThrottlerResponse } from "@fluidframework/server-services-core";

/**
 * Represents the state of a token bucket for rate limiting
 * @internal
 */
export interface ITokenBucketState {
	/** Current number of available tokens */
	tokens: number;
	/** Timestamp of last token replenishment */
	lastReplenishAt: number;
	/** Whether this bucket is currently throttled */
	isThrottled: boolean;
	/** Human-readable reason for throttling */
	throttleReason: string;
	/** Milliseconds to wait before retrying */
	retryAfterInMs: number;
}

/**
 * Configuration for token bucket behavior
 * @internal
 */
export interface ITokenBucketConfig {
	/** Maximum tokens the bucket can hold (burst capacity) */
	maxTokens: number;
	/** Rate of token replenishment (tokens per millisecond) */
	tokensPerMs: number;
	/** Minimum interval between replenishments (milliseconds) */
	minReplenishIntervalMs: number;
}

/**
 * Result of a token bucket operation
 * @internal
 */
export interface ITokenBucketResult {
	/** Whether the operation should be throttled */
	isThrottled: boolean;
	/** Reason for throttling (if applicable) */
	reason: string;
	/** Milliseconds to wait before retrying */
	retryAfterInMs: number;
	/** Updated bucket state */
	newState: ITokenBucketState;
}

/**
 * Abstract base class implementing the core token bucket algorithm.
 * Provides shared logic for rate limiting while allowing different storage and timing strategies.
 * @internal
 */
export abstract class BaseTokenBucket {
	constructor(protected readonly config: ITokenBucketConfig) {
		if (config.maxTokens <= 0) {
			throw new Error("maxTokens must be greater than 0");
		}
		if (config.tokensPerMs <= 0) {
			throw new Error("tokensPerMs must be greater than 0");
		}
		if (config.minReplenishIntervalMs <= 0) {
			throw new Error("minReplenishIntervalMs must be greater than 0");
		}
	}

	/**
	 * Create initial token bucket state
	 */
	protected createInitialState(now: number = Date.now()): ITokenBucketState {
		return {
			tokens: this.config.maxTokens,
			lastReplenishAt: now,
			isThrottled: false,
			throttleReason: "",
			retryAfterInMs: 0,
		};
	}

	/**
	 * Attempt to consume tokens from the bucket
	 * @param state - Current bucket state
	 * @param tokensRequested - Number of tokens to consume
	 * @param now - Current timestamp
	 * @returns Result indicating success/failure and updated state
	 */
	protected consumeTokens(
		state: ITokenBucketState,
		tokensRequested: number,
		now: number = Date.now(),
	): ITokenBucketResult {
		// Create a copy of state to avoid mutations
		const newState: ITokenBucketState = { ...state };

		// Replenish tokens if enough time has passed
		this.replenishTokens(newState, now);

		// Check if we have enough tokens
		if (newState.tokens >= tokensRequested) {
			// Successful consumption
			newState.tokens -= tokensRequested;
			newState.isThrottled = false;
			newState.throttleReason = "";
			newState.retryAfterInMs = 0;

			return {
				isThrottled: false,
				reason: "",
				retryAfterInMs: 0,
				newState,
			};
		}

		// Not enough tokens - calculate throttling response
		const tokenDeficit = tokensRequested - newState.tokens;
		const retryAfterInMs = this.calculateRetryAfter(newState, tokenDeficit, now);

		newState.isThrottled = true;
		newState.throttleReason = `Rate limit exceeded. Need ${tokenDeficit} more tokens.`;
		newState.retryAfterInMs = retryAfterInMs;

		return {
			isThrottled: true,
			reason: newState.throttleReason,
			retryAfterInMs,
			newState,
		};
	}

	/**
	 * Add tokens back to the bucket (for operation completion/cancellation)
	 * @param state - Current bucket state
	 * @param tokensToAdd - Number of tokens to add back
	 * @param now - Current timestamp
	 * @returns Updated state
	 */
	protected addTokens(
		state: ITokenBucketState,
		tokensToAdd: number,
		now: number = Date.now(),
	): ITokenBucketState {
		const newState: ITokenBucketState = { ...state };

		// Replenish first, then add the specific tokens
		this.replenishTokens(newState, now);
		newState.tokens = Math.min(this.config.maxTokens, newState.tokens + tokensToAdd);

		// Reset throttle state if we now have tokens available
		if (newState.tokens > 0) {
			newState.isThrottled = false;
			newState.throttleReason = "";
			newState.retryAfterInMs = 0;
		}

		return newState;
	}

	/**
	 * Convert token bucket state to standard throttler response format
	 */
	protected toThrottlerResponse(state: ITokenBucketState): IThrottlerResponse {
		return {
			throttleStatus: state.isThrottled,
			throttleReason: state.throttleReason,
			retryAfterInMs: state.retryAfterInMs,
		};
	}

	/**
	 * Replenish tokens based on elapsed time
	 * @param state - State to update (mutated in place)
	 * @param now - Current timestamp
	 */
	private replenishTokens(state: ITokenBucketState, now: number): void {
		const timeSinceLastReplenish = now - state.lastReplenishAt;

		// Only replenish if minimum interval has passed
		if (timeSinceLastReplenish > this.config.minReplenishIntervalMs) {
			const tokensToAdd = Math.floor(timeSinceLastReplenish * this.config.tokensPerMs);

			// Don't let bucket overflow
			if (tokensToAdd + state.tokens > this.config.maxTokens) {
				state.tokens = this.config.maxTokens;
			} else {
				state.tokens += tokensToAdd;
			}

			// Always update the timestamp when we check for replenishment
			state.lastReplenishAt = now;
		}
	}

	/**
	 * Calculate how long to wait before retrying
	 * @param state - Current bucket state
	 * @param tokenDeficit - How many more tokens are needed
	 * @param now - Current timestamp
	 * @returns Milliseconds to wait
	 */
	private calculateRetryAfter(
		state: ITokenBucketState,
		tokenDeficit: number,
		now: number,
	): number {
		// Time needed to generate the deficit tokens
		const timeToGenerateDeficit = tokenDeficit / this.config.tokensPerMs;

		// Time until next replenishment cycle
		const nextReplenishTime = state.lastReplenishAt + this.config.minReplenishIntervalMs;
		const timeUntilNextReplenish = Math.max(0, nextReplenishTime - now);

		// Must wait at least until next replenishment, and at least long enough to generate needed tokens
		return Math.max(timeUntilNextReplenish, timeToGenerateDeficit);
	}
}
