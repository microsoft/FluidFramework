/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Example: How to Use the Hybrid Throttler to Handle Traffic Spikes
 *
 * The HybridThrottler solves the problem of traffic spikes getting through during the gaps
 * between distributed throttle checks. It combines:
 *
 * 1. Local instance-level throttling (immediate response to spikes)
 * 2. Distributed throttling via Redis (global coordination across instances)
 *
 * Benefits:
 * - Immediate protection against sharp traffic spikes
 * - Maintains global rate limits across all service instances
 * - Lower Redis load compared to checking every operation
 * - Configurable for different deployment scenarios
 */

import type { IRedisClientConnectionManager } from "@fluidframework/server-services-utils";

import {
	HybridThrottler,
	createFromGlobalLimits,
	createForLowLatency,
	CommonLocalThrottleConfigs,
	type ILocalThrottleConfig,
} from "..";
import { RedisThrottleAndUsageStorageManager } from "../../redisThrottleAndUsageStorageManager";

// Example 1: Basic Setup for a Medium-Scale Deployment
export function createBasicHybridThrottler(
	redisConnectionManager: IRedisClientConnectionManager,
): HybridThrottler {
	// Configure distributed throttling storage
	const storageManager = new RedisThrottleAndUsageStorageManager(redisConnectionManager);

	// Configure local throttling to catch spikes between distributed checks
	const localConfig = createFromGlobalLimits(
		100000, // Global limit: 100k ops/sec
		20, // Estimated 20 service instances
		0.8, // Safety factor: use 80% of calculated per-instance limit
		3, // Burst multiplier: allow 3 seconds worth of operations in burst
	);
	// This creates: ~4000 ops/sec per instance with 12000 burst capacity

	return new HybridThrottler(
		storageManager,
		localConfig,
		5000, // Sync with Redis every 5 seconds
	);
}

// Example 2: High-Traffic Setup with Aggressive Local Throttling
export function createHighTrafficHybridThrottler(
	redisConnectionManager: IRedisClientConnectionManager,
): HybridThrottler {
	const storageManager = new RedisThrottleAndUsageStorageManager(redisConnectionManager);

	// Use pre-configured high-traffic settings
	const localConfig = CommonLocalThrottleConfigs.largeCluster.veryHighTraffic;

	return new HybridThrottler(
		storageManager,
		localConfig,
		2000, // Fast sync interval
	);
}

// Example 3: Low-Latency Setup for Real-Time Applications
export function createLowLatencyHybridThrottler(
	redisConnectionManager: IRedisClientConnectionManager,
): HybridThrottler {
	const storageManager = new RedisThrottleAndUsageStorageManager(redisConnectionManager);

	// Optimized for low latency with frequent token replenishment
	const localConfig = createForLowLatency(
		2000, // 2000 ops/sec per instance
		1000, // Small burst capacity for quick response
	);

	return new HybridThrottler(storageManager, localConfig, 1000);
}

// Example 4: Custom Configuration with Fine-Tuned Parameters
export function createCustomHybridThrottler(
	redisConnectionManager: IRedisClientConnectionManager,
): HybridThrottler {
	const storageManager = new RedisThrottleAndUsageStorageManager(redisConnectionManager);

	// Custom local configuration
	const localConfig: ILocalThrottleConfig = {
		maxLocalOpsPerSecond: 5000, // 5000 ops/sec per instance
		localBurstCapacity: 15000, // 3 seconds worth of burst
		localReplenishIntervalMs: 100, // Replenish every 100ms
	};

	return new HybridThrottler(
		storageManager,
		localConfig,
		3000,
		undefined, // No logger
		2000, // Cache size
		300000, // 5-minute cache age
		true, // Enable enhanced telemetry
	);
}

// Example 5: Migration from Existing Throttler
export function migrateFromExistingThrottler(
	redisConnectionManager: IRedisClientConnectionManager,
	// Existing configuration parameters
	existingRatePerMs: number,
	existingBurstLimit: number,
	existingMinInterval: number,
): HybridThrottler {
	// Keep existing distributed configuration
	const storageManager = new RedisThrottleAndUsageStorageManager(redisConnectionManager);

	// Add local throttling based on existing global rate
	const globalRatePerSecond = existingRatePerMs * 1000;
	const localConfig = createFromGlobalLimits(
		globalRatePerSecond,
		10, // Assume 10 instances for migration
		0.7, // Conservative safety factor for migration
		2,
	);

	return new HybridThrottler(storageManager, localConfig, Math.min(existingMinInterval, 10000));
}

// Usage examples for different scenarios:

export interface IThrottlingScenarios {
	/**
	 * Use this for sudden traffic spikes (e.g., viral content, DDoS)
	 * Provides immediate protection while maintaining global limits
	 */
	handleTrafficSpike(
		throttler: HybridThrottler,
		tenantId: string,
		operationWeight?: number,
	): void;

	/**
	 * Use this for normal request processing with weighted operations
	 * (e.g., different operations have different costs)
	 */
	handleWeightedRequest(
		throttler: HybridThrottler,
		clientId: string,
		operationType: string,
	): void;

	/**
	 * Use this for long-running operations that should be tracked
	 * and decremented when completed
	 */
	handleLongRunningOperation(
		throttler: HybridThrottler,
		sessionId: string,
		operationWeight: number,
	): Promise<void>;
}

export const ThrottlingScenarios: IThrottlingScenarios = {
	handleTrafficSpike(
		throttler: HybridThrottler,
		tenantId: string,
		operationWeight: number = 1,
	): void {
		try {
			// This will check BOTH local and distributed limits
			throttler.incrementCount(`tenant:${tenantId}`, operationWeight);
			// Operation allowed - proceed with business logic
		} catch (error) {
			if (error instanceof Error && error.message.includes("throttled")) {
				// Handle throttling - return 429 or appropriate response
				// The error will contain retry-after information
				throw error;
			}
			// Handle other errors
			throw error;
		}
	},

	handleWeightedRequest(
		throttler: HybridThrottler,
		clientId: string,
		operationType: string,
	): void {
		// Different operations have different weights
		const operationWeights = {
			read: 1,
			write: 3,
			bulk_write: 10,
			admin: 20,
		};

		const weight = operationWeights[operationType as keyof typeof operationWeights] || 1;

		// This may throw ThrottlingError if limits are exceeded
		throttler.incrementCount(`client:${clientId}`, weight);
		// Process the operation if not throttled
	},

	async handleLongRunningOperation(
		throttler: HybridThrottler,
		sessionId: string,
		operationWeight: number,
	): Promise<void> {
		// Increment count at start
		throttler.incrementCount(`session:${sessionId}`, operationWeight);

		try {
			// Perform long-running operation
			await new Promise((resolve) => setTimeout(resolve, 5000));
		} finally {
			// Always decrement when operation completes (success or failure)
			throttler.decrementCount(`session:${sessionId}`, operationWeight);
		}
	},
};

/**
 * Configuration recommendations based on deployment characteristics
 */
export const ConfigurationRecommendations = {
	/**
	 * For development/testing environments
	 */
	development: {
		description: "Lenient limits for development",
		config: CommonLocalThrottleConfigs.smallCluster.lowTraffic,
		syncIntervalMs: 10000,
	},

	/**
	 * For production environments with predictable traffic
	 */
	productionStable: {
		description: "Balanced configuration for stable production traffic",
		config: CommonLocalThrottleConfigs.mediumCluster.mediumTraffic,
		syncIntervalMs: 5000,
	},

	/**
	 * For production environments with variable/spiky traffic
	 */
	productionVariable: {
		description: "Aggressive local throttling for variable production traffic",
		config: CommonLocalThrottleConfigs.largeCluster.highTraffic,
		syncIntervalMs: 2000,
	},

	/**
	 * For high-scale production environments
	 */
	productionHighScale: {
		description: "High-capacity configuration for large-scale deployments",
		config: CommonLocalThrottleConfigs.largeCluster.veryHighTraffic,
		syncIntervalMs: 1000,
	},
} as const;
