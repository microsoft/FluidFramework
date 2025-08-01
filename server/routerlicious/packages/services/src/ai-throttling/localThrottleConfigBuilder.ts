/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ILocalThrottleConfig } from "./hybridThrottler";

/**
 * Create a local throttle configuration based on global rate limits and cluster size
 *
 * @param globalRateLimit - The total operations per second allowed globally across all instances
 * @param estimatedInstanceCount - Estimated number of service instances in the cluster
 * @param safetyFactor - Safety multiplier to prevent over-allocation (default: 0.8).
 * Lower values = more conservative, higher values = more aggressive
 * @param burstMultiplier - How many seconds worth of operations to allow in burst (default: 2)
 * @returns Local throttle configuration
 * @internal
 */
export function createFromGlobalLimits(
	globalRateLimit: number,
	estimatedInstanceCount: number,
	safetyFactor: number = 0.8,
	burstMultiplier: number = 2,
): ILocalThrottleConfig {
	if (globalRateLimit <= 0) {
		throw new Error("globalRateLimit must be greater than 0");
	}
	if (estimatedInstanceCount <= 0) {
		throw new Error("estimatedInstanceCount must be greater than 0");
	}
	if (safetyFactor <= 0 || safetyFactor > 1) {
		throw new Error("safetyFactor must be between 0 and 1");
	}
	if (burstMultiplier <= 0) {
		throw new Error("burstMultiplier must be greater than 0");
	}

	// Calculate per-instance rate with safety factor
	const maxLocalOpsPerSecond = Math.floor(
		(globalRateLimit / estimatedInstanceCount) * safetyFactor,
	);

	// Ensure at least 1 operation per second per instance
	const adjustedMaxLocalOpsPerSecond = Math.max(1, maxLocalOpsPerSecond);

	// Calculate burst capacity
	const localBurstCapacity = Math.max(
		1,
		Math.floor(adjustedMaxLocalOpsPerSecond * burstMultiplier),
	);

	return {
		maxLocalOpsPerSecond: adjustedMaxLocalOpsPerSecond,
		localBurstCapacity,
		localReplenishIntervalMs: 100, // 100ms for responsive throttling
	};
}

/**
 * Create a local throttle configuration for low-latency scenarios
 *
 * @param maxLocalOpsPerSecond - Maximum operations per second for this instance
 * @param burstCapacity - Optional burst capacity (defaults to 1 second worth)
 * @returns Local throttle configuration optimized for low latency
 * @internal
 */
export function createForLowLatency(
	maxLocalOpsPerSecond: number,
	burstCapacity?: number,
): ILocalThrottleConfig {
	if (maxLocalOpsPerSecond <= 0) {
		throw new Error("maxLocalOpsPerSecond must be greater than 0");
	}

	return {
		maxLocalOpsPerSecond,
		localBurstCapacity: burstCapacity ?? maxLocalOpsPerSecond,
		localReplenishIntervalMs: 50, // 50ms for very responsive throttling
	};
}

/**
 * Create a local throttle configuration for high-throughput scenarios
 *
 * @param maxLocalOpsPerSecond - Maximum operations per second for this instance
 * @param burstCapacity - Optional burst capacity (defaults to 5 seconds worth)
 * @returns Local throttle configuration optimized for high throughput
 * @internal
 */
export function createForHighThroughput(
	maxLocalOpsPerSecond: number,
	burstCapacity?: number,
): ILocalThrottleConfig {
	if (maxLocalOpsPerSecond <= 0) {
		throw new Error("maxLocalOpsPerSecond must be greater than 0");
	}

	return {
		maxLocalOpsPerSecond,
		localBurstCapacity: burstCapacity ?? maxLocalOpsPerSecond * 5,
		localReplenishIntervalMs: 200, // 200ms for less frequent but more efficient replenishment
	};
}

/**
 * Validate a local throttle configuration
 *
 * @param config - Configuration to validate
 * @throws Error if configuration is invalid
 * @internal
 */
export function validateLocalThrottleConfig(config: ILocalThrottleConfig): void {
	if (config.maxLocalOpsPerSecond <= 0) {
		throw new Error("maxLocalOpsPerSecond must be greater than 0");
	}

	if (config.localBurstCapacity !== undefined && config.localBurstCapacity <= 0) {
		throw new Error("localBurstCapacity must be greater than 0 if specified");
	}

	if (config.localReplenishIntervalMs !== undefined && config.localReplenishIntervalMs <= 0) {
		throw new Error("localReplenishIntervalMs must be greater than 0 if specified");
	}

	// Warn about potential issues
	const replenishInterval = config.localReplenishIntervalMs ?? 100;
	if (replenishInterval > 1000) {
		console.warn("localReplenishIntervalMs > 1000ms may result in less responsive throttling");
	}

	const burstCapacity = config.localBurstCapacity ?? config.maxLocalOpsPerSecond;
	if (burstCapacity < config.maxLocalOpsPerSecond) {
		console.warn(
			"localBurstCapacity is less than maxLocalOpsPerSecond, which may cause aggressive throttling",
		);
	}
}

/**
 * Common local throttle configurations for typical deployment scenarios
 * @internal
 */
export const CommonLocalThrottleConfigs = {
	/**
	 * Configuration for small clusters with low-medium traffic
	 * Suitable for: Development, testing, small production deployments
	 */
	smallCluster: {
		lowTraffic: createFromGlobalLimits(100, 3, 0.8, 2),
		mediumTraffic: createFromGlobalLimits(500, 3, 0.8, 2),
	},

	/**
	 * Configuration for medium clusters with medium-high traffic
	 * Suitable for: Production deployments with moderate scale
	 */
	mediumCluster: {
		mediumTraffic: createFromGlobalLimits(1000, 10, 0.8, 2),
		highTraffic: createFromGlobalLimits(5000, 10, 0.8, 3),
	},

	/**
	 * Configuration for large clusters with high traffic
	 * Suitable for: Large-scale production deployments
	 */
	largeCluster: {
		highTraffic: createFromGlobalLimits(10000, 50, 0.8, 3),
		veryHighTraffic: createFromGlobalLimits(50000, 50, 0.8, 5),
	},
} as const;
