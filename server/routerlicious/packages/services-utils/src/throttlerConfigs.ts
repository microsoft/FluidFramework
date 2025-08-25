/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import safeStringify from "json-stringify-safe";

/**
 * Standard throttler config that maps to the params for Throttler and ThrottlerHelper
 * from `@fluidframework/server-services` package.
 * @internal
 */
export interface ILegacyThrottleConfig {
	type?: "Throttler";
	maxPerMs: number;
	maxBurst: number;
	minCooldownIntervalInMs: number;
	minThrottleIntervalInMs: number;
	maxInMemoryCacheSize: number;
	maxInMemoryCacheAgeInMs: number;
	enableEnhancedTelemetry?: boolean;
}

/**
 * Simplified Throttler config that can be converted to an ILegacyThrottleConfig
 * based on the typical inputs used to determine an ILegacyThrottleConfig.
 * This still allows overrides for specific values, but can cut down on the
 * human math needed for each individual throttle config.
 *
 * Most often, we compute LegacyThrottleConfig based on how many events we can support in a given timeframe.
 * The resulting config is almost always the same maths, with some variation in maxInMemoryCacheSize
 * and maxInMemoryCacheAgeInMs depending on the need.
 * @internal
 */
export interface ISimpleLegacyThrottleConfig extends Partial<ILegacyThrottleConfig> {
	maxPerInterval: number;
	intervalInMs: number;
}

const isSimpleLegacyThrottleConfig = (obj: unknown): obj is ISimpleLegacyThrottleConfig => {
	return (
		typeof obj === "object" &&
		typeof (obj as ISimpleLegacyThrottleConfig).maxPerInterval === "number" &&
		typeof (obj as ISimpleLegacyThrottleConfig).intervalInMs === "number"
	);
};
const expandSimpleLegacyThrottleConfig = ({
	maxPerInterval,
	intervalInMs,
	...overrides
}: ISimpleLegacyThrottleConfig): Partial<ILegacyThrottleConfig> => {
	const throttleConfig: Partial<ILegacyThrottleConfig> = {
		type: "Throttler",
		maxPerMs: maxPerInterval / intervalInMs,
		maxBurst: maxPerInterval,
		minCooldownIntervalInMs: intervalInMs,
		minThrottleIntervalInMs: intervalInMs,
		maxInMemoryCacheSize: 1000, // A reasonable size for most uses
		maxInMemoryCacheAgeInMs: intervalInMs * 2,
		enableEnhancedTelemetry: false,
		...overrides,
	};
	return throttleConfig;
};
/**
 * Effectively disables throttling by allowing 1,000,000 events per ms and only checking throttle every 16 min.
 * Also, will only keep throttle value in cache at a given time to avoid unnecessary memory use.
 */
export const disabledLegacyThrottleConfig: ILegacyThrottleConfig = {
	type: "Throttler",
	maxPerMs: 1000000,
	maxBurst: 1000000,
	minCooldownIntervalInMs: 1000000,
	minThrottleIntervalInMs: 1000000,
	maxInMemoryCacheSize: 1,
	maxInMemoryCacheAgeInMs: 1,
	enableEnhancedTelemetry: false,
};
/**
 * Get a valid ILegacyThrottleConfig from a config file value.
 * @internal
 */
export const getLegacyThrottleConfig = (
	configValue:
		| ISimpleLegacyThrottleConfig
		| Partial<ILegacyThrottleConfig>
		| "disabled"
		| undefined,
): Partial<ILegacyThrottleConfig> => {
	const throttleConfigValue = configValue ?? "disabled";
	if (
		(typeof throttleConfigValue !== "object" || Array.isArray(throttleConfigValue)) &&
		throttleConfigValue !== "disabled"
	) {
		throw new Error(`Received invalid Throttle config: ${safeStringify(configValue)}`);
	}
	if (throttleConfigValue === "disabled") {
		return disabledLegacyThrottleConfig;
	}
	if (isSimpleLegacyThrottleConfig(throttleConfigValue)) {
		return expandSimpleLegacyThrottleConfig(throttleConfigValue);
	}
	return throttleConfigValue;
};

/**
 * Standard throttler config that maps to params for the DistributedTokenBucketThrottler
 * from `@fluidframework/server-services` package.
 * @internal
 */
export interface IHybridThrottleConfig {
	type: "DistributedTokenBucket";
	local: {
		maxPerMs: number;
		maxBurst: number;
		minCooldownIntervalInMs: number;
	};
	distributed: {
		maxPerMs: number;
		maxBurst: number;
		minCooldownIntervalInMs: number;
		minThrottleIntervalInMs: number;
	};
	maxInMemoryCacheSize: number;
	maxInMemoryCacheAgeInMs: number;
	enableEnhancedTelemetry?: boolean;
}

/**
 * Simplified Throttler config that can be converted to an IHybridThrottleConfig
 * based on the typical inputs used to determine an IHybridThrottleConfig.
 * This still allows overrides for specific values, but can cut down on the
 * human math needed for each individual throttle config.
 *
 * Most often, we compute HybridThrottleConfig based on how many events we can support in a given timeframe.
 * The resulting config is almost always the same maths, with some variation in maxInMemoryCacheSize
 * and maxInMemoryCacheAgeInMs depending on the need.
 * @internal
 */
export interface ISimpleHybridThrottleConfig extends Partial<IHybridThrottleConfig> {
	simpleLocal: {
		maxPerInterval: number;
		intervalInMs: number;
	};
	simpleDistributed: {
		maxPerInterval: number;
		intervalInMs: number;
	};
}

const isSimpleHybridThrottleConfig = (obj: unknown): obj is ISimpleHybridThrottleConfig => {
	return (
		typeof obj === "object" &&
		typeof (obj as ISimpleHybridThrottleConfig).simpleLocal === "object" &&
		typeof (obj as ISimpleHybridThrottleConfig).simpleDistributed === "object"
	);
};
const expandSimpleHybridThrottleConfig = ({
	simpleLocal,
	simpleDistributed,
	...overrides
}: ISimpleHybridThrottleConfig): Partial<IHybridThrottleConfig> &
	Required<Pick<IHybridThrottleConfig, "type">> => {
	const throttleConfig: Partial<IHybridThrottleConfig> &
		Required<Pick<IHybridThrottleConfig, "type">> = {
		type: "DistributedTokenBucket",
		local: {
			maxPerMs: simpleLocal.maxPerInterval / simpleLocal.intervalInMs,
			maxBurst: simpleLocal.maxPerInterval,
			minCooldownIntervalInMs: simpleLocal.intervalInMs,
		},
		distributed: {
			maxPerMs: simpleDistributed.maxPerInterval / simpleDistributed.intervalInMs,
			maxBurst: simpleDistributed.maxPerInterval,
			minCooldownIntervalInMs: simpleDistributed.intervalInMs,
			minThrottleIntervalInMs: simpleDistributed.intervalInMs,
		},
		maxInMemoryCacheSize: 1000, // A reasonable size for most uses
		maxInMemoryCacheAgeInMs: simpleLocal.intervalInMs * 2,
		enableEnhancedTelemetry: false,
		...overrides,
	};
	return throttleConfig;
};

/**
 * Effectively disables throttling by allowing 1,000,000 events per ms and only checking throttle every 16 min.
 * Also, will only keep throttle value in cache at a given time to avoid unnecessary memory use.
 */
export const disabledHybridThrottleConfig: IHybridThrottleConfig = {
	type: "DistributedTokenBucket",
	local: {
		maxPerMs: 1000000,
		maxBurst: 1000000,
		minCooldownIntervalInMs: 1000000,
	},
	distributed: {
		maxPerMs: 1000000,
		maxBurst: 1000000,
		minCooldownIntervalInMs: 1000000,
		minThrottleIntervalInMs: 1000000,
	},
	maxInMemoryCacheSize: 1,
	maxInMemoryCacheAgeInMs: 1,
	enableEnhancedTelemetry: false,
};

export const getHybridThrottleConfig = (
	configValue:
		| ISimpleHybridThrottleConfig
		| Partial<IHybridThrottleConfig>
		| "disabled"
		| undefined,
): Partial<IHybridThrottleConfig> & Required<Pick<IHybridThrottleConfig, "type">> => {
	const throttleConfigValue = configValue ?? "disabled";
	if (
		(typeof throttleConfigValue !== "object" || Array.isArray(throttleConfigValue)) &&
		throttleConfigValue !== "disabled"
	) {
		throw new Error(`Received invalid Throttle config: ${safeStringify(configValue)}`);
	}
	if (throttleConfigValue === "disabled") {
		return disabledHybridThrottleConfig;
	}
	if (isSimpleHybridThrottleConfig(throttleConfigValue)) {
		return expandSimpleHybridThrottleConfig(throttleConfigValue);
	}
	return { ...throttleConfigValue, type: "DistributedTokenBucket" };
};

/**
 * Type guard to determine the specific throttle config type
 * @internal
 */
export const getThrottleConfigType = (
	obj: unknown,
): "legacy" | "simpleLegacy" | "hybrid" | "simpleHybrid" | "unknown" => {
	if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
		return "unknown";
	}

	// Check for ISimpleHybridThrottleConfig first (most specific)
	if (isSimpleHybridThrottleConfig(obj)) {
		return "simpleHybrid";
	}

	// Check for ISimpleLegacyThrottleConfig
	if (isSimpleLegacyThrottleConfig(obj)) {
		return "simpleLegacy";
	}

	// Check for IHybridThrottleConfig structure
	const objTyped = obj as any;
	if (
		objTyped.local !== undefined &&
		objTyped.distributed !== undefined &&
		typeof objTyped.local === "object" &&
		typeof objTyped.distributed === "object" &&
		typeof objTyped.local.maxPerMs === "number" &&
		typeof objTyped.distributed.maxPerMs === "number"
	) {
		return "hybrid";
	}

	// Check for ILegacyThrottleConfig structure
	if (
		typeof objTyped.maxPerMs === "number" &&
		typeof objTyped.maxBurst === "number" &&
		typeof objTyped.minCooldownIntervalInMs === "number"
	) {
		return "legacy";
	}

	return "unknown";
};

export const getThrottleConfig = (configValue: unknown) => {
	const configType = getThrottleConfigType(configValue);
	switch (configType) {
		case "hybrid":
		case "simpleHybrid":
			// Handle new Hybrid config values explicitly
			return getHybridThrottleConfig(configValue as any);
		case "legacy":
		case "simpleLegacy":
		case "unknown":
		default:
			// Handle other config values as they were already handled.
			return getLegacyThrottleConfig(configValue as any);
	}
};
