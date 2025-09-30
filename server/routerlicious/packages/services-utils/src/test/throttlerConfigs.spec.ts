/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	ISimpleThrottleConfig,
	IThrottleConfig,
	disabledThrottleConfig,
	getThrottleConfig,
} from "../throttlerConfigs";

describe("Throttler Configs", () => {
	it("validates safe config types", () => {
		// invalid
		assert.throws(() => getThrottleConfig("disable" as any));
		assert.throws(() => getThrottleConfig(5 as any));
		assert.throws(() => getThrottleConfig(true as any));
		assert.throws(() => getThrottleConfig(false as any));
		assert.throws(() => getThrottleConfig([{}] as any));
		// valid
		assert.doesNotThrow(() => getThrottleConfig({ maxPerInterval: 0, intervalInMs: 0 }));
		assert.doesNotThrow(() => getThrottleConfig({ maxPerMs: 100 }));
		assert.doesNotThrow(() => getThrottleConfig({}));
		assert.doesNotThrow(() => getThrottleConfig("disabled"));
	});

	it("handles disabled", () => {
		assert.deepStrictEqual(getThrottleConfig("disabled"), disabledThrottleConfig);
	});

	it("passes along partial configs", () => {
		const partialConfig1: Partial<IThrottleConfig> = {};
		assert.deepStrictEqual(getThrottleConfig(partialConfig1), partialConfig1);
		const partialConfig2: Partial<IThrottleConfig> = {
			maxPerMs: 100,
		};
		assert.deepStrictEqual(getThrottleConfig(partialConfig2), partialConfig2);
		const partialConfig3: Partial<IThrottleConfig> = {
			maxPerMs: 50,
			maxBurst: 2000,
			minCooldownIntervalInMs: 30000,
		};
		assert.deepStrictEqual(getThrottleConfig(partialConfig3), partialConfig3);
		const partialConfig4: Partial<IThrottleConfig> = {
			enableEnhancedTelemetry: true,
		};
		assert.deepStrictEqual(getThrottleConfig(partialConfig4), partialConfig4);
	});

	it("expands simplified configs", () => {
		const simpleConfig1: ISimpleThrottleConfig = {
			maxPerInterval: 3_000,
			intervalInMs: 30_000,
		};
		const expandedConfig1: IThrottleConfig = {
			maxPerMs: 0.1,
			maxBurst: 3_000,
			minCooldownIntervalInMs: 30_000,
			minThrottleIntervalInMs: 30_000,
			maxInMemoryCacheSize: 1_000,
			maxInMemoryCacheAgeInMs: 60_000,
			enableEnhancedTelemetry: false,
		};
		assert.deepStrictEqual(getThrottleConfig(simpleConfig1), expandedConfig1);
		const simpleConfig2: ISimpleThrottleConfig = {
			maxPerInterval: 9_000,
			intervalInMs: 30_000,
			maxInMemoryCacheSize: 30_000,
			maxInMemoryCacheAgeInMs: 180_000,
		};
		const expandedConfig2: IThrottleConfig = {
			maxPerMs: 0.3,
			maxBurst: 9_000,
			minCooldownIntervalInMs: 30_000,
			minThrottleIntervalInMs: 30_000,
			maxInMemoryCacheSize: 30_000,
			maxInMemoryCacheAgeInMs: 180_000,
			enableEnhancedTelemetry: false,
		};
		assert.deepStrictEqual(getThrottleConfig(simpleConfig2), expandedConfig2);
		const simpleConfig3: ISimpleThrottleConfig = {
			maxPerInterval: 1_500,
			intervalInMs: 30_000,
		};
		const expandedConfig3: IThrottleConfig = {
			maxPerMs: 0.05,
			maxBurst: 1_500,
			minCooldownIntervalInMs: 30_000,
			minThrottleIntervalInMs: 30_000,
			maxInMemoryCacheSize: 1_000,
			maxInMemoryCacheAgeInMs: 60_000,
			enableEnhancedTelemetry: false,
		};
		assert.deepStrictEqual(getThrottleConfig(simpleConfig3), expandedConfig3);
		const simpleConfig4: ISimpleThrottleConfig = {
			maxPerInterval: 10_000,
			intervalInMs: 5_000,
		};
		const expandedConfig4: IThrottleConfig = {
			maxPerMs: 2,
			maxBurst: 10_000,
			minCooldownIntervalInMs: 5_000,
			minThrottleIntervalInMs: 5_000,
			maxInMemoryCacheSize: 1_000,
			maxInMemoryCacheAgeInMs: 10_000,
			enableEnhancedTelemetry: false,
		};
		assert.deepStrictEqual(getThrottleConfig(simpleConfig4), expandedConfig4);
	});

	it("expands and overrides simplified configs", () => {
		const simpleConfig1: ISimpleThrottleConfig = {
			maxPerInterval: 3_000,
			intervalInMs: 30_000,
			maxPerMs: 5,
		};
		const expandedConfig1: IThrottleConfig = {
			maxPerMs: 5,
			maxBurst: 3_000,
			minCooldownIntervalInMs: 30_000,
			minThrottleIntervalInMs: 30_000,
			maxInMemoryCacheSize: 1_000,
			maxInMemoryCacheAgeInMs: 60_000,
			enableEnhancedTelemetry: false,
		};
		assert.deepStrictEqual(getThrottleConfig(simpleConfig1), expandedConfig1);
		const simpleConfig2: ISimpleThrottleConfig = {
			maxPerInterval: 9_000,
			intervalInMs: 30_000,
			maxInMemoryCacheSize: 30_000,
			maxInMemoryCacheAgeInMs: 180_000,
			minThrottleIntervalInMs: 140_000,
		};
		const expandedConfig2: IThrottleConfig = {
			maxPerMs: 0.3,
			maxBurst: 9_000,
			minCooldownIntervalInMs: 30_000,
			minThrottleIntervalInMs: 140_000,
			maxInMemoryCacheSize: 30_000,
			maxInMemoryCacheAgeInMs: 180_000,
			enableEnhancedTelemetry: false,
		};
		assert.deepStrictEqual(getThrottleConfig(simpleConfig2), expandedConfig2);
	});
});
