/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { ConfigTypes, IConfigProviderBase } from "@fluidframework/core-interfaces";
import { compareArrays } from "@fluidframework/core-utils/internal";

import {
	CachedConfigProvider,
	createConfigBasedOptionsProxy,
	inMemoryConfigProvider,
	wrapConfigProviderWithDefaults,
} from "../config.js";
import { TelemetryDataTag } from "../logger.js";
import { MockLogger } from "../mockLogger.js";

const getMockStore = (settings: Record<string, string>): Storage => {
	const ops: string[] = [];
	return {
		getItem: (key: string): string | null => {
			ops.push(key);
			// eslint-disable-next-line unicorn/no-null
			return settings[key] ?? null;
		},
		getOps: (): Readonly<string[]> => ops,
		length: Object.keys(settings).length,
		clear: (): void => {},
		// eslint-disable-next-line unicorn/no-null
		key: (_index: number): string | null => null,
		removeItem: (_key: string): void => {},
		setItem: (_key: string, _value: string): void => {},
	};
};

const untypedProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => {
	return {
		getRawConfig: (name: string): ConfigTypes => settings[name],
	};
};

describe("Config", () => {
	it("Typing - storage provider", () => {
		const settings = {
			number: "1",
			badNumber: "{1}",
			stringAndNumber: "1",
			stringAndBoolean: "true",
			string: "string",
			boolean: "true",
			badBoolean: "truthy",
			numberArray: `[1, 2, 3]`,
			badNumberArray: `["one", "two", "three"]`,
			stringArray: `["1", "2", "3"]`,
			badStringArray: "1",
			booleanArray: "[true, false, true]",
			BadBooleanArray: "[true, 1, true]",
		};

		const mockStore = getMockStore(settings);
		const logger = new MockLogger();
		const config = new CachedConfigProvider(logger, inMemoryConfigProvider(mockStore));

		assert.equal(config.getNumber("number"), 1);
		logger.assertMatch([
			{
				category: "generic",
				eventName: "ConfigRead",
				configName: { tag: TelemetryDataTag.CodeArtifact, value: "number" },
				configValue: {
					tag: TelemetryDataTag.CodeArtifact,
					value: `{"raw":"1","string":"1","number":1}`,
				},
			},
		]);
		assert.equal(config.getNumber("badNumber"), undefined);
		assert.equal(config.getNumber("stringAndNumber"), 1);

		assert.equal(config.getString("stringAndNumber"), "1");
		assert.equal(config.getString("stringAndBoolean"), "true");
		assert.equal(config.getString("string"), "string");

		assert.equal(config.getBoolean("boolean"), true);
		assert.equal(config.getBoolean("badBoolean"), undefined);
		assert.equal(config.getBoolean("stringAndBoolean"), true);

		assert.deepEqual(config.getNumberArray("numberArray"), [1, 2, 3]);
		assert.equal(config.getNumberArray("badNumberArray"), undefined);

		assert.deepEqual(config.getStringArray("stringArray"), ["1", "2", "3"]);
		assert.equal(config.getStringArray("badStringArray"), undefined);

		assert.deepEqual(config.getBooleanArray("booleanArray"), [true, false, true]);
		assert.equal(config.getBooleanArray("BadBooleanArray"), undefined);
	});

	it("Typing - custom provider", () => {
		const settings = {
			number: 1,
			badNumber: "{1}",
			stringAndNumber: "1",
			stringAndBoolean: "true",
			string: "string",
			badString: [],
			boolean: "true",
			badBoolean: "truthy",
			numberArray: `[1, 2, 3]`,
			badNumberArray: ["one", "two", "three"],
			stringArray: `["1", "2", "3"]`,
			badStringArray: "1",
			booleanArray: [true, false, true],
			badBooleanArray: [1, 2, 3],
			badBooleanArray2: ["true", "false", "true"],
		};

		const mockStore = untypedProvider(settings);
		const config = new CachedConfigProvider(undefined, mockStore);

		assert.equal(config.getNumber("number"), 1);
		assert.equal(config.getNumber("stringAndNumber"), 1);
		assert.equal(config.getNumber("badNumber"), undefined);

		assert.equal(config.getString("stringAndNumber"), "1");
		assert.equal(config.getString("stringAndBoolean"), "true");
		assert.equal(config.getString("string"), "string");
		assert.equal(config.getString("badString"), undefined);

		assert.equal(config.getBoolean("boolean"), true);
		assert.equal(config.getBoolean("badBoolean"), undefined);
		assert.equal(config.getBoolean("stringAndBoolean"), true);

		assert.deepEqual(config.getNumberArray("numberArray"), [1, 2, 3]);
		assert.equal(config.getNumberArray("badNumberArray"), undefined);

		assert.deepEqual(config.getStringArray("stringArray"), ["1", "2", "3"]);
		assert.equal(config.getStringArray("badStringArray"), undefined);

		assert.deepEqual(config.getBooleanArray("booleanArray"), [true, false, true]);
		assert.equal(config.getBooleanArray("badBooleanArray"), undefined);
		assert.equal(config.getBooleanArray("badBooleanArray2"), undefined);
	});

	it("Void provider", () => {
		const config = new CachedConfigProvider(undefined, inMemoryConfigProvider(undefined));
		assert.equal(config.getNumber("number"), undefined);
		assert.equal(config.getString("does not exist"), undefined);
		assert.equal(config.getBoolean("boolean"), undefined);
	});

	it("Config priority", () => {
		const settings1 = {
			number: "1",
			string: "string1",
			boolean: "true",
			featureEnabled: "false",
		};
		const settings2 = {
			number: "2",
			string: "string2",
			boolean: "false",
			number2: "3",
			featureEnabled: "true",
		};
		const settings3 = {
			number2: "4",
			number3: "4",
			featureEnabled: "true",
		};

		const config1 = new CachedConfigProvider(
			undefined,
			inMemoryConfigProvider(getMockStore(settings1)),
			inMemoryConfigProvider(getMockStore(settings1)),
			inMemoryConfigProvider(getMockStore(settings2)),
			inMemoryConfigProvider(getMockStore(settings3)),
		);

		assert.equal(config1.getNumber("number"), 1); // from settings1
		assert.equal(config1.getString("string"), "string1"); // from settings1
		assert.equal(config1.getBoolean("boolean"), true); // from settings1
		assert.equal(config1.getNumber("number2"), 3); // from settings2
		assert.equal(config1.getNumber("number3"), 4); // from settings3
		assert.equal(config1.getBoolean("featureEnabled"), false); // from settings1.BreakGlass

		const config2 = new CachedConfigProvider(
			undefined,
			inMemoryConfigProvider(getMockStore(settings3)),
			inMemoryConfigProvider(getMockStore(settings2)),
			inMemoryConfigProvider(getMockStore(settings1)),
			inMemoryConfigProvider(getMockStore(settings1)),
		);

		assert.equal(config2.getNumber("number"), 2); // from settings2
		assert.equal(config2.getString("string"), "string2"); // from settings2
		assert.equal(config2.getBoolean("boolean"), false); // from settings2
		assert.equal(config2.getNumber("number2"), 4); // from settings3
		assert.equal(config2.getNumber("number3"), 4); // from settings3
		assert.equal(config1.getBoolean("featureEnabled"), false); // from settings1.BreakGlass
	});

	// #region SettingsProvider

	type SettingType = string | boolean | number | (string | boolean | number)[] | null;

	interface ProvideSettingsProvider {
		readonly SettingsProvider: SettingsProvider;
	}

	interface SettingsProvider extends ProvideSettingsProvider {
		/**
		 * Used to get the setting value for the specified setting.
		 * Providing a default in case setting is not available or not defined.
		 */
		getSetting<T extends SettingType>(
			settingName: string,
			defaultValue: T,
			namespace?: string,
		): T;
	}

	class HybridSettingsProvider implements SettingsProvider, IConfigProviderBase {
		public constructor(private readonly store: Record<string, SettingType | ConfigTypes>) {}

		public getRawConfig(name: string): ConfigTypes {
			// The point here is to use `getSetting`
			// eslint-disable-next-line unicorn/no-null
			const val = this.getSetting(name, null);
			return val ?? undefined;
		}

		public getSetting<T extends SettingType>(
			settingName: string,
			defaultValue: T,
			namespace?: string,
		): T {
			const key = namespace === undefined ? settingName : `${namespace}.${settingName}`;
			return (this.store[key] as T) ?? defaultValue;
		}

		public readonly SettingsProvider: SettingsProvider = this;
	}

	it("Typing - SettingsProvider", () => {
		const settings = {
			number: 1,
			sortOfNumber: "1",
			badNumber: "{1}",
			stringAndNumber: "1",
			stringAndBoolean: "true",
			string: "string",
			badString: [],
			boolean: "true",
			badBoolean: "truthy",
			numberArray: `[1, 2, 3]`,
			badNumberArray: ["one", "two", "three"],
			stringArray: `["1", "2", "3"]`,
			badStringArray: "1",
			booleanArray: [true, false, true],
			badBooleanArray: [1, 2, 3],
			badBooleanArray2: ["true", "false", "true"],
		};

		const config = new CachedConfigProvider(undefined, new HybridSettingsProvider(settings));

		assert.equal(config.getNumber("number"), 1);
		assert.equal(config.getNumber("sortOfNumber"), 1);
		assert.equal(config.getNumber("badNumber"), undefined);

		assert.equal(config.getString("stringAndNumber"), "1");
		assert.equal(config.getString("stringAndBoolean"), "true");
		assert.equal(config.getString("string"), "string");
		assert.equal(config.getString("badString"), undefined);

		assert.equal(config.getBoolean("boolean"), true);
		assert.equal(config.getBoolean("badBoolean"), undefined);

		assert.deepEqual(config.getNumberArray("numberArray"), [1, 2, 3]);
		assert.equal(config.getNumberArray("badNumberArray"), undefined);

		assert.deepEqual(config.getStringArray("stringArray"), ["1", "2", "3"]);
		assert.equal(config.getStringArray("badStringArray"), undefined);

		assert.deepEqual(config.getBooleanArray("booleanArray"), [true, false, true]);
		assert.equal(config.getBooleanArray("badBooleanArray"), undefined);
		assert.equal(config.getBooleanArray("badBooleanArray2"), undefined);
	});

	// #endregion SettingsProvider
});

describe("wrappedConfigProvider", () => {
	const configProvider = (featureGates: Record<string, ConfigTypes>): IConfigProviderBase => ({
		getRawConfig: (name: string): ConfigTypes => featureGates[name],
	});

	it("When there is no original config provider", () => {
		const config = wrapConfigProviderWithDefaults(undefined, { "Fluid.Feature.Gate": true });
		assert.strictEqual(config.getRawConfig("Fluid.Feature.Gate"), true);
	});

	it("When the original config provider does not specify the required key", () => {
		const config = wrapConfigProviderWithDefaults(configProvider({}), {
			"Fluid.Feature.Gate": true,
		});
		assert.strictEqual(config.getRawConfig("Fluid.Feature.Gate"), true);
	});

	it("When the original config provider specifies the required key", () => {
		const config = wrapConfigProviderWithDefaults(
			configProvider({ "Fluid.Feature.Gate": false }),
			{ "Fluid.Feature.Gate": true },
		);
		assert.strictEqual(config.getRawConfig("Fluid.Feature.Gate"), false);
	});
});

describe("createConfigBasedOptionsProxy", () => {
	interface IFeatureOptions {
		readonly booleanFeature: boolean;
		readonly stringFeature: string;
		readonly numberFeature: number;
		readonly arrayFeature: number[];
		readonly objectFeature: {
			readonly nestedBoolean: boolean;
		};
	}

	const featureOptionsKeys = [
		"booleanFeature",
		"stringFeature",
		"numberFeature",
		"arrayFeature",
		"objectFeature",
	];

	const featureOptionsNamespace = "Fluid.Feature";

	it("config overrides default option", () => {
		const options = createConfigBasedOptionsProxy<IFeatureOptions>(
			untypedProvider({ [`${featureOptionsNamespace}.stringFeature`]: "fromConfig" }),
			featureOptionsNamespace,
			{
				stringFeature: (c, n) => c.getString(n),
			},
			{
				stringFeature: "fromDefaultOptions",
			},
		);
		for (const key of featureOptionsKeys) {
			if (key === "stringFeature") {
				assert.strictEqual(options[key], "fromConfig");
			} else {
				assert.strictEqual(options[key], undefined);
			}
		}
	});

	it("config not in typeMap is ignored", () => {
		const options = createConfigBasedOptionsProxy<IFeatureOptions>(
			untypedProvider({ [`${featureOptionsNamespace}.stringFeature`]: "fromConfig" }),
			featureOptionsNamespace,
			{},
			{
				stringFeature: "fromDefaultOptions",
			},
		);
		for (const key of featureOptionsKeys) {
			if (key === "stringFeature") {
				assert.strictEqual(options[key], "fromDefaultOptions");
			} else {
				assert.strictEqual(options[key], undefined);
			}
		}
	});

	it("default options provide value when config is undefined", () => {
		const options = createConfigBasedOptionsProxy<IFeatureOptions>(
			untypedProvider({}),
			featureOptionsNamespace,
			{
				stringFeature: (c, n) => c.getString(n),
			},
			{
				stringFeature: "fromDefaultOptions",
			},
		);
		for (const key of featureOptionsKeys) {
			if (key === "stringFeature") {
				assert.strictEqual(options[key], "fromDefaultOptions");
			} else {
				assert.strictEqual(options[key], undefined);
			}
		}
	});

	it("string configs are coerced into strongly type options", () => {
		const options = createConfigBasedOptionsProxy<IFeatureOptions>(
			untypedProvider({
				[`${featureOptionsNamespace}.stringFeature`]: "fromConfig",
				[`${featureOptionsNamespace}.arrayFeature`]: "[1,2,3]",
				[`${featureOptionsNamespace}.booleanFeature`]: "true",
				[`${featureOptionsNamespace}.numberFeature`]: "99",
				[`${featureOptionsNamespace}.objectFeature`]: `{"nestedBoolean": true}`,
			}),
			featureOptionsNamespace,
			{
				stringFeature: (c, n) => c.getString(n),
				arrayFeature: (c, n) => c.getNumberArray(n),
				booleanFeature: (c, n) => c.getBoolean(n),
				numberFeature: (c, n) => c.getNumber(n),
				objectFeature: (c, n) => {
					const str = c.getString(n);
					if (str !== undefined) {
						// eslint-disable-next-line @typescript-eslint/no-unsafe-return
						return JSON.parse(str);
					}
				},
			},
			{},
		);
		assert.strictEqual(options.stringFeature, "fromConfig");
		assert(options.arrayFeature !== undefined);
		assert(compareArrays(options.arrayFeature, [1, 2, 3]));
		assert.strictEqual(options.booleanFeature, true);
		assert.strictEqual(options.numberFeature, 99);
		assert.strictEqual(options.objectFeature?.nestedBoolean, true);
	});
	// Handling of invalid JSON for complex types
	it("handles invalid JSON for complex types gracefully", () => {
		const options = createConfigBasedOptionsProxy<IFeatureOptions>(
			untypedProvider({ [`${featureOptionsNamespace}.arrayFeature`]: "notAnArray" }),
			featureOptionsNamespace,
			{
				arrayFeature: (c, n) => c.getNumberArray(n),
			},
			{ arrayFeature: [1, 2, 3] }, // Default
		);
		assert(options.arrayFeature !== undefined);
		assert(compareArrays(options.arrayFeature, [1, 2, 3])); // Assuming fallback to default
	});

	// Handling of missing default options
	it("behaves correctly when no default options are provided", () => {
		const options = createConfigBasedOptionsProxy<IFeatureOptions>(
			untypedProvider({ [`${featureOptionsNamespace}.booleanFeature`]: "true" }),
			featureOptionsNamespace,
			{
				booleanFeature: (c, n) => c.getBoolean(n),
			},
			{}, // No defaults
		);
		assert.strictEqual(options.booleanFeature, true);
		assert.strictEqual(options.stringFeature, undefined); // No default provided
	});

	// Type coercion failure
	it("handles type coercion failure gracefully", () => {
		const options = createConfigBasedOptionsProxy<IFeatureOptions>(
			untypedProvider({ [`${featureOptionsNamespace}.numberFeature`]: "notANumber" }),
			featureOptionsNamespace,
			{
				numberFeature: (c, n) => c.getNumber(n),
			},
			{ numberFeature: 42 }, // Default
		);
		assert.strictEqual(options.numberFeature, 42); // Assuming fallback to default
	});

	it("ignores invalid config values for simple types, using defaults instead", () => {
		const options = createConfigBasedOptionsProxy<IFeatureOptions>(
			untypedProvider({
				[`${featureOptionsNamespace}.booleanFeature`]: "notABoolean",
				[`${featureOptionsNamespace}.numberFeature`]: "notANumber",
			}),
			featureOptionsNamespace,
			{
				booleanFeature: (c, n) => c.getBoolean(n),
				numberFeature: (c, n) => c.getNumber(n),
			},
			{
				booleanFeature: true,
				numberFeature: 42,
			},
		);
		assert.strictEqual(options.booleanFeature, true);
		assert.strictEqual(options.numberFeature, 42);
	});

	it("in can be used to determine if an options has a value", () => {
		const options = createConfigBasedOptionsProxy<IFeatureOptions>(
			untypedProvider({ [`${featureOptionsNamespace}.stringFeature`]: "fromConfig" }),
			featureOptionsNamespace,
			{
				stringFeature: (c, n) => c.getString(n),
			},
			{
				booleanFeature: true,
			},
		);

		assert("stringFeature" in options);
		assert("booleanFeature" in options);
		assert(!("numberFeature" in options));
	});

	it("cannot spread options proxy as values must be lazy loaded from config", () => {
		const options = createConfigBasedOptionsProxy<IFeatureOptions>(
			untypedProvider({ [`${featureOptionsNamespace}.stringFeature`]: "fromConfig" }),
			featureOptionsNamespace,
			{
				stringFeature: (c, n) => c.getString(n),
			},
			{
				booleanFeature: true,
			},
		);
		try {
			const spreadOptions = { ...options };
			assert(spreadOptions === undefined);
			assert.fail("Spread should not be allowed");
		} catch (error) {
			assert(error instanceof TypeError);
			assert.strictEqual(error.message, "OptionsProxy keys are not enumerable");
		}
	});
});
