/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import {
	CachedConfigProvider,
	ConfigTypes,
	IConfigProviderBase,
	inMemoryConfigProvider,
} from "../config";
import { TelemetryDataTag } from "../logger";
import { MockLogger } from "../mockLogger";

const getMockStore = (settings: Record<string, string>): Storage => {
	const ops: string[] = [];
	return {
		getItem: (key: string): string | null => {
			ops.push(key);
			return settings[key];
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
		constructor(private readonly store: Record<string, SettingType | ConfigTypes>) {}

		getRawConfig(name: string): ConfigTypes {
			// The point here is to use `getSetting`
			// eslint-disable-next-line unicorn/no-null
			const val = this.getSetting(name, null);
			return val ?? undefined;
		}

		getSetting<T extends SettingType>(
			settingName: string,
			defaultValue: T,
			namespace?: string,
		): T {
			const key = namespace === undefined ? settingName : `${namespace}.${settingName}`;
			return (this.store[key] as T) ?? defaultValue;
		}

		SettingsProvider: SettingsProvider = this;
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
