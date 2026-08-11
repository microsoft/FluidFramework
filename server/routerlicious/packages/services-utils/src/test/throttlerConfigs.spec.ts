/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	ISimpleLegacyThrottleConfig,
	ILegacyThrottleConfig,
	disabledLegacyThrottleConfig,
	ISimpleHybridThrottleConfig,
	IHybridThrottleConfig,
	disabledHybridThrottleConfig,
	getThrottleConfig,
	getHybridThrottleConfig,
	getLegacyThrottleConfig,
	getThrottleConfigType,
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
		assert.deepStrictEqual(getThrottleConfig("disabled"), disabledLegacyThrottleConfig);
	});

	it("passes along partial configs", () => {
		const partialConfig1: Partial<ILegacyThrottleConfig> = {};
		assert.deepStrictEqual(getThrottleConfig(partialConfig1), partialConfig1);
		const partialConfig2: Partial<ILegacyThrottleConfig> = {
			maxPerMs: 100,
		};
		assert.deepStrictEqual(getThrottleConfig(partialConfig2), partialConfig2);
		const partialConfig3: Partial<ILegacyThrottleConfig> = {
			maxPerMs: 50,
			maxBurst: 2000,
			minCooldownIntervalInMs: 30000,
		};
		assert.deepStrictEqual(getThrottleConfig(partialConfig3), partialConfig3);
		const partialConfig4: Partial<ILegacyThrottleConfig> = {
			enableEnhancedTelemetry: true,
		};
		assert.deepStrictEqual(getThrottleConfig(partialConfig4), { ...partialConfig4 });
	});

	it("expands simplified configs", () => {
		const simpleConfig1: ISimpleLegacyThrottleConfig = {
			maxPerInterval: 3_000,
			intervalInMs: 30_000,
		};
		const expandedConfig1: ILegacyThrottleConfig = {
			type: "Throttler",
			maxPerMs: 0.1,
			maxBurst: 3_000,
			minCooldownIntervalInMs: 30_000,
			minThrottleIntervalInMs: 30_000,
			maxInMemoryCacheSize: 1_000,
			maxInMemoryCacheAgeInMs: 60_000,
			enableEnhancedTelemetry: false,
		};
		assert.deepStrictEqual(getThrottleConfig(simpleConfig1), expandedConfig1);
		const simpleConfig2: ISimpleLegacyThrottleConfig = {
			maxPerInterval: 9_000,
			intervalInMs: 30_000,
			maxInMemoryCacheSize: 30_000,
			maxInMemoryCacheAgeInMs: 180_000,
		};
		const expandedConfig2: ILegacyThrottleConfig = {
			type: "Throttler",
			maxPerMs: 0.3,
			maxBurst: 9_000,
			minCooldownIntervalInMs: 30_000,
			minThrottleIntervalInMs: 30_000,
			maxInMemoryCacheSize: 30_000,
			maxInMemoryCacheAgeInMs: 180_000,
			enableEnhancedTelemetry: false,
		};
		assert.deepStrictEqual(getThrottleConfig(simpleConfig2), expandedConfig2);
		const simpleConfig3: ISimpleLegacyThrottleConfig = {
			maxPerInterval: 1_500,
			intervalInMs: 30_000,
		};
		const expandedConfig3: ILegacyThrottleConfig = {
			type: "Throttler",
			maxPerMs: 0.05,
			maxBurst: 1_500,
			minCooldownIntervalInMs: 30_000,
			minThrottleIntervalInMs: 30_000,
			maxInMemoryCacheSize: 1_000,
			maxInMemoryCacheAgeInMs: 60_000,
			enableEnhancedTelemetry: false,
		};
		assert.deepStrictEqual(getThrottleConfig(simpleConfig3), expandedConfig3);
		const simpleConfig4: ISimpleLegacyThrottleConfig = {
			maxPerInterval: 10_000,
			intervalInMs: 5_000,
		};
		const expandedConfig4: ILegacyThrottleConfig = {
			type: "Throttler",
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
		const simpleConfig1: ISimpleLegacyThrottleConfig = {
			maxPerInterval: 3_000,
			intervalInMs: 30_000,
			maxPerMs: 5,
		};
		const expandedConfig1: ILegacyThrottleConfig = {
			type: "Throttler",
			maxPerMs: 5,
			maxBurst: 3_000,
			minCooldownIntervalInMs: 30_000,
			minThrottleIntervalInMs: 30_000,
			maxInMemoryCacheSize: 1_000,
			maxInMemoryCacheAgeInMs: 60_000,
			enableEnhancedTelemetry: false,
		};
		assert.deepStrictEqual(getThrottleConfig(simpleConfig1), expandedConfig1);
		const simpleConfig2: ISimpleLegacyThrottleConfig = {
			maxPerInterval: 9_000,
			intervalInMs: 30_000,
			maxInMemoryCacheSize: 30_000,
			maxInMemoryCacheAgeInMs: 180_000,
			minThrottleIntervalInMs: 140_000,
		};
		const expandedConfig2: ILegacyThrottleConfig = {
			type: "Throttler",
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

describe("Hybrid Throttler Configs", () => {
	it("validates safe hybrid config types", () => {
		// invalid
		assert.throws(() => getHybridThrottleConfig("disable" as any));
		assert.throws(() => getHybridThrottleConfig(5 as any));
		assert.throws(() => getHybridThrottleConfig(true as any));
		assert.throws(() => getHybridThrottleConfig(false as any));
		assert.throws(() => getHybridThrottleConfig([{}] as any));
		// valid
		assert.doesNotThrow(() =>
			getHybridThrottleConfig({
				local: { maxPerMs: 0.1, maxBurst: 100, minCooldownIntervalInMs: 1000 },
				distributed: {
					maxPerMs: 0.05,
					maxBurst: 50,
					minCooldownIntervalInMs: 2000,
					minThrottleIntervalInMs: 2000,
				},
				maxInMemoryCacheSize: 1000,
				maxInMemoryCacheAgeInMs: 60000,
			}),
		);
		assert.doesNotThrow(() =>
			getHybridThrottleConfig({
				simpleLocal: { maxPerInterval: 100, intervalInMs: 1000 },
				simpleDistributed: { maxPerInterval: 50, intervalInMs: 2000 },
			}),
		);
		assert.doesNotThrow(() => getHybridThrottleConfig({}));
		assert.doesNotThrow(() => getHybridThrottleConfig("disabled"));
	});

	it("handles disabled hybrid configs", () => {
		assert.deepStrictEqual(getHybridThrottleConfig("disabled"), disabledHybridThrottleConfig);
	});

	it("passes along partial hybrid configs", () => {
		const partialConfig1: Partial<IHybridThrottleConfig> = {};
		assert.deepStrictEqual(getHybridThrottleConfig(partialConfig1), {
			...partialConfig1,
			type: "DistributedTokenBucket",
		});

		const partialConfig2: Partial<IHybridThrottleConfig> = {
			local: { maxPerMs: 0.1, maxBurst: 100, minCooldownIntervalInMs: 1000 },
		};
		assert.deepStrictEqual(getHybridThrottleConfig(partialConfig2), {
			type: "DistributedTokenBucket",
			...partialConfig2,
		});

		const partialConfig3: Partial<IHybridThrottleConfig> = {
			local: { maxPerMs: 0.05, maxBurst: 50, minCooldownIntervalInMs: 2000 },
			distributed: {
				maxPerMs: 0.025,
				maxBurst: 25,
				minCooldownIntervalInMs: 4000,
				minThrottleIntervalInMs: 4000,
			},
			maxInMemoryCacheSize: 2000,
			maxInMemoryCacheAgeInMs: 30000,
		};
		assert.deepStrictEqual(getHybridThrottleConfig(partialConfig3), {
			type: "DistributedTokenBucket",
			...partialConfig3,
		});

		const partialConfig4: Partial<IHybridThrottleConfig> = {
			enableEnhancedTelemetry: true,
		};
		assert.deepStrictEqual(getHybridThrottleConfig(partialConfig4), {
			type: "DistributedTokenBucket",
			...partialConfig4,
		});
	});

	it("expands simplified hybrid configs", () => {
		const simpleConfig1: ISimpleHybridThrottleConfig = {
			simpleLocal: { maxPerInterval: 3_000, intervalInMs: 30_000 },
			simpleDistributed: { maxPerInterval: 1_500, intervalInMs: 30_000 },
		};
		const expandedConfig1: IHybridThrottleConfig = {
			type: "DistributedTokenBucket",
			local: {
				maxPerMs: 0.1,
				maxBurst: 3_000,
				minCooldownIntervalInMs: 30_000,
			},
			distributed: {
				maxPerMs: 0.05,
				maxBurst: 1_500,
				minCooldownIntervalInMs: 30_000,
				minThrottleIntervalInMs: 30_000,
			},
			maxInMemoryCacheSize: 1_000,
			maxInMemoryCacheAgeInMs: 60_000,
			enableEnhancedTelemetry: false,
		};
		assert.deepStrictEqual(getHybridThrottleConfig(simpleConfig1), expandedConfig1);

		const simpleConfig2: ISimpleHybridThrottleConfig = {
			simpleLocal: { maxPerInterval: 9_000, intervalInMs: 30_000 },
			simpleDistributed: { maxPerInterval: 4_500, intervalInMs: 30_000 },
			maxInMemoryCacheSize: 30_000,
			maxInMemoryCacheAgeInMs: 180_000,
		};
		const expandedConfig2: IHybridThrottleConfig = {
			type: "DistributedTokenBucket",
			local: {
				maxPerMs: 0.3,
				maxBurst: 9_000,
				minCooldownIntervalInMs: 30_000,
			},
			distributed: {
				maxPerMs: 0.15,
				maxBurst: 4_500,
				minCooldownIntervalInMs: 30_000,
				minThrottleIntervalInMs: 30_000,
			},
			maxInMemoryCacheSize: 30_000,
			maxInMemoryCacheAgeInMs: 180_000,
			enableEnhancedTelemetry: false,
		};
		assert.deepStrictEqual(getHybridThrottleConfig(simpleConfig2), expandedConfig2);

		const simpleConfig3: ISimpleHybridThrottleConfig = {
			simpleLocal: { maxPerInterval: 10_000, intervalInMs: 5_000 },
			simpleDistributed: { maxPerInterval: 5_000, intervalInMs: 5_000 },
		};
		const expandedConfig3: IHybridThrottleConfig = {
			type: "DistributedTokenBucket",
			local: {
				maxPerMs: 2,
				maxBurst: 10_000,
				minCooldownIntervalInMs: 5_000,
			},
			distributed: {
				maxPerMs: 1,
				maxBurst: 5_000,
				minCooldownIntervalInMs: 5_000,
				minThrottleIntervalInMs: 5_000,
			},
			maxInMemoryCacheSize: 1_000,
			maxInMemoryCacheAgeInMs: 10_000,
			enableEnhancedTelemetry: false,
		};
		assert.deepStrictEqual(getHybridThrottleConfig(simpleConfig3), expandedConfig3);
	});

	it("expands and overrides simplified hybrid configs", () => {
		const simpleConfig1: ISimpleHybridThrottleConfig = {
			simpleLocal: { maxPerInterval: 3_000, intervalInMs: 30_000 },
			simpleDistributed: { maxPerInterval: 1_500, intervalInMs: 30_000 },
			local: { maxPerMs: 5, maxBurst: 3_000, minCooldownIntervalInMs: 30_000 },
		};
		const expandedConfig1: IHybridThrottleConfig = {
			type: "DistributedTokenBucket",
			local: {
				maxPerMs: 5,
				maxBurst: 3_000,
				minCooldownIntervalInMs: 30_000,
			},
			distributed: {
				maxPerMs: 0.05,
				maxBurst: 1_500,
				minCooldownIntervalInMs: 30_000,
				minThrottleIntervalInMs: 30_000,
			},
			maxInMemoryCacheSize: 1_000,
			maxInMemoryCacheAgeInMs: 60_000,
			enableEnhancedTelemetry: false,
		};
		assert.deepStrictEqual(getHybridThrottleConfig(simpleConfig1), expandedConfig1);

		const simpleConfig2: ISimpleHybridThrottleConfig = {
			simpleLocal: { maxPerInterval: 9_000, intervalInMs: 30_000 },
			simpleDistributed: { maxPerInterval: 4_500, intervalInMs: 30_000 },
			maxInMemoryCacheSize: 30_000,
			maxInMemoryCacheAgeInMs: 180_000,
			distributed: {
				maxPerMs: 0.25,
				maxBurst: 4_500,
				minCooldownIntervalInMs: 30_000,
				minThrottleIntervalInMs: 140_000,
			},
		};
		const expandedConfig2: IHybridThrottleConfig = {
			type: "DistributedTokenBucket",
			local: {
				maxPerMs: 0.3,
				maxBurst: 9_000,
				minCooldownIntervalInMs: 30_000,
			},
			distributed: {
				maxPerMs: 0.25,
				maxBurst: 4_500,
				minCooldownIntervalInMs: 30_000,
				minThrottleIntervalInMs: 140_000,
			},
			maxInMemoryCacheSize: 30_000,
			maxInMemoryCacheAgeInMs: 180_000,
			enableEnhancedTelemetry: false,
		};
		assert.deepStrictEqual(getHybridThrottleConfig(simpleConfig2), expandedConfig2);
	});
});

describe("getThrottleConfig (unified)", () => {
	it("correctly identifies and processes legacy configs", () => {
		const legacyConfig: ILegacyThrottleConfig = {
			type: "Throttler",
			maxPerMs: 0.1,
			maxBurst: 3000,
			minCooldownIntervalInMs: 30000,
			minThrottleIntervalInMs: 30000,
			maxInMemoryCacheSize: 1000,
			maxInMemoryCacheAgeInMs: 60000,
			enableEnhancedTelemetry: false,
		};
		assert.deepStrictEqual(getThrottleConfig(legacyConfig), legacyConfig);

		const simpleLegacyConfig: ISimpleLegacyThrottleConfig = {
			maxPerInterval: 3000,
			intervalInMs: 30000,
		};
		const expectedExpanded = getLegacyThrottleConfig(simpleLegacyConfig);
		assert.deepStrictEqual(getThrottleConfig(simpleLegacyConfig), expectedExpanded);
	});

	it("correctly identifies and processes hybrid configs", () => {
		const hybridConfig: IHybridThrottleConfig = {
			type: "DistributedTokenBucket",
			local: {
				maxPerMs: 0.1,
				maxBurst: 3000,
				minCooldownIntervalInMs: 30000,
			},
			distributed: {
				maxPerMs: 0.05,
				maxBurst: 1500,
				minCooldownIntervalInMs: 30000,
				minThrottleIntervalInMs: 30000,
			},
			maxInMemoryCacheSize: 1000,
			maxInMemoryCacheAgeInMs: 60000,
			enableEnhancedTelemetry: false,
		};
		assert.deepStrictEqual(getThrottleConfig(hybridConfig), hybridConfig);

		const simpleHybridConfig: ISimpleHybridThrottleConfig = {
			simpleLocal: { maxPerInterval: 3000, intervalInMs: 30000 },
			simpleDistributed: { maxPerInterval: 1500, intervalInMs: 30000 },
		};
		const expectedExpanded = getHybridThrottleConfig(simpleHybridConfig);
		assert.deepStrictEqual(getThrottleConfig(simpleHybridConfig), expectedExpanded);
	});

	it("handles disabled configs for both legacy and hybrid", () => {
		assert.deepStrictEqual(getThrottleConfig("disabled"), disabledLegacyThrottleConfig);
	});

	it("defaults unknown configs to legacy processing", () => {
		assert.throws(() => getThrottleConfig("invalid" as any));
		assert.throws(() => getThrottleConfig(123 as any));
		assert.throws(() => getThrottleConfig(true as any));
	});
});

describe("getThrottleConfigType", () => {
	it("correctly identifies legacy config types", () => {
		const legacyConfig: ILegacyThrottleConfig = {
			type: "Throttler",
			maxPerMs: 0.1,
			maxBurst: 3000,
			minCooldownIntervalInMs: 30000,
			minThrottleIntervalInMs: 30000,
			maxInMemoryCacheSize: 1000,
			maxInMemoryCacheAgeInMs: 60000,
		};
		assert.strictEqual(getThrottleConfigType(legacyConfig), "legacy");

		const simpleLegacyConfig: ISimpleLegacyThrottleConfig = {
			maxPerInterval: 3000,
			intervalInMs: 30000,
		};
		assert.strictEqual(getThrottleConfigType(simpleLegacyConfig), "simpleLegacy");
	});

	it("correctly identifies hybrid config types", () => {
		const hybridConfig: IHybridThrottleConfig = {
			type: "DistributedTokenBucket",
			local: {
				maxPerMs: 0.1,
				maxBurst: 3000,
				minCooldownIntervalInMs: 30000,
			},
			distributed: {
				maxPerMs: 0.05,
				maxBurst: 1500,
				minCooldownIntervalInMs: 30000,
				minThrottleIntervalInMs: 30000,
			},
			maxInMemoryCacheSize: 1000,
			maxInMemoryCacheAgeInMs: 60000,
		};
		assert.strictEqual(getThrottleConfigType(hybridConfig), "hybrid");

		const simpleHybridConfig: ISimpleHybridThrottleConfig = {
			simpleLocal: { maxPerInterval: 3000, intervalInMs: 30000 },
			simpleDistributed: { maxPerInterval: 1500, intervalInMs: 30000 },
		};
		assert.strictEqual(getThrottleConfigType(simpleHybridConfig), "simpleHybrid");
	});

	it("identifies unknown config types", () => {
		assert.strictEqual(getThrottleConfigType("invalid"), "unknown");
		assert.strictEqual(getThrottleConfigType(123), "unknown");
		assert.strictEqual(getThrottleConfigType(true), "unknown");
		assert.strictEqual(getThrottleConfigType(null), "unknown");
		assert.strictEqual(getThrottleConfigType([]), "unknown");
		assert.strictEqual(getThrottleConfigType({}), "unknown");
	});
});
