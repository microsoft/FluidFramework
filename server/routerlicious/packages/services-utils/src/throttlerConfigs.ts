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
export interface IThrottleConfig {
	maxPerMs: number;
	maxBurst: number;
	minCooldownIntervalInMs: number;
	minThrottleIntervalInMs: number;
	maxInMemoryCacheSize: number;
	maxInMemoryCacheAgeInMs: number;
	enableEnhancedTelemetry?: boolean;
}
/**
 * Simplified Throttler config that can be converted to an IThrottleConfig
 * based on the typical inputs used to determine an IThrottleConfig.
 * This still allows overrides for specific values, but can cut down on the
 * human math needed for each individual throttle config.
 *
 * Most often, we compute ThrottleConfig based on how many events we can support in a given timeframe.
 * The resulting config is almost always the same maths, with some variation in maxInMemoryCacheSize
 * and maxInMemoryCacheAgeInMs depending on the need.
 * @internal
 */
export interface ISimpleThrottleConfig extends Partial<IThrottleConfig> {
	maxPerInterval: number;
	intervalInMs: number;
}
const isSimpleThrottleConfig = (obj: unknown): obj is ISimpleThrottleConfig => {
	return (
		typeof obj === "object" &&
		typeof (obj as ISimpleThrottleConfig).maxPerInterval === "number" &&
		typeof (obj as ISimpleThrottleConfig).intervalInMs === "number"
	);
};
const expandSimpleThrottleConfig = ({
	maxPerInterval,
	intervalInMs,
	...overrides
}: ISimpleThrottleConfig): Partial<IThrottleConfig> => {
	const throttleConfig: Partial<IThrottleConfig> = {
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
export const disabledThrottleConfig: IThrottleConfig = {
	maxPerMs: 1000000,
	maxBurst: 1000000,
	minCooldownIntervalInMs: 1000000,
	minThrottleIntervalInMs: 1000000,
	maxInMemoryCacheSize: 1,
	maxInMemoryCacheAgeInMs: 1,
	enableEnhancedTelemetry: false,
};
/**
 * Get a valid IThrottleConfig from a config file value.
 * @internal
 */
export const getThrottleConfig = (
	configValue: ISimpleThrottleConfig | Partial<IThrottleConfig> | "disabled" | undefined,
): Partial<IThrottleConfig> => {
	const throttleConfigValue = configValue ?? "disabled";
	if (
		(typeof throttleConfigValue !== "object" || Array.isArray(throttleConfigValue)) &&
		throttleConfigValue !== "disabled"
	) {
		throw new Error(`Received invalid Throttle config: ${safeStringify(configValue)}`);
	}
	if (throttleConfigValue === "disabled") {
		return disabledThrottleConfig;
	}
	if (isSimpleThrottleConfig(throttleConfigValue)) {
		return expandSimpleThrottleConfig(throttleConfigValue);
	}
	return throttleConfigValue;
};
