/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import winston from "winston";
import { DistributedTokenBucketThrottler } from "../throttling";
import { Throttler, ThrottlerHelper } from "../legacy-throttling";
import type { IHybridThrottleConfig, IThrottleConfig } from "@fluidframework/server-services-utils";
import type {
	IThrottleAndUsageStorageManager,
	IThrottler,
} from "@fluidframework/server-services-core";

/**
 * Configures a throttler based on the provided throttle configuration.
 * @param throttleConfig - The throttle configuration to use.
 * @returns The configured throttler.
 */
export const configureThrottler = (
	throttleConfig: Partial<IThrottleConfig | IHybridThrottleConfig>,
	throttleAndUsageStorageManager: IThrottleAndUsageStorageManager,
): IThrottler => {
	if (throttleConfig.type === "DistributedTokenBucket") {
		const hybridThrottleConfig = throttleConfig as Partial<IHybridThrottleConfig>;
		return new DistributedTokenBucketThrottler(throttleAndUsageStorageManager, winston, {
			localTokenBucket: {
				capacity: hybridThrottleConfig.local?.maxBurst,
				refillRatePerMs: hybridThrottleConfig.local?.maxPerMs,
				minCooldownIntervalMs: hybridThrottleConfig.local?.minCooldownIntervalInMs,
			},
			distributedTokenBucket: {
				capacity: hybridThrottleConfig.distributed?.maxBurst,
				refillRatePerMs: hybridThrottleConfig.distributed?.maxPerMs,
				minCooldownIntervalMs: hybridThrottleConfig.distributed?.minCooldownIntervalInMs,
				distributedSyncIntervalInMs:
					hybridThrottleConfig.distributed?.minThrottleIntervalInMs,
			},
			maxLocalCacheSize: hybridThrottleConfig.maxInMemoryCacheSize,
			maxLocalCacheAgeInMs: hybridThrottleConfig.maxInMemoryCacheAgeInMs,
			enableEnhancedTelemetry: hybridThrottleConfig.enableEnhancedTelemetry,
		}) as IThrottler;
	}
	const legacyThrottleConfig = throttleConfig as Partial<IThrottleConfig>;
	const throttlerHelper = new ThrottlerHelper(
		throttleAndUsageStorageManager,
		legacyThrottleConfig.maxPerMs,
		legacyThrottleConfig.maxBurst,
		legacyThrottleConfig.minCooldownIntervalInMs,
	);
	return new Throttler(
		throttlerHelper,
		legacyThrottleConfig.minThrottleIntervalInMs,
		winston,
		legacyThrottleConfig.maxInMemoryCacheSize,
		legacyThrottleConfig.maxInMemoryCacheAgeInMs,
		legacyThrottleConfig.enableEnhancedTelemetry,
	);
};
