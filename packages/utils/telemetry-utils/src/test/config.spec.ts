/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { MockLogger } from "../mockLogger";
import {
    ConfigProvider,
    ConfigTypes,
    IConfigProviderBase,
    inMemoryConfigProvider,
    mixinChildLoggerWithConfigProvider,
    mixinConfigProvider,
} from "../config";

describe("Config", () => {
    const mockLogger = new MockLogger();
    const getMockStore = ((settings: Record<string, string>): Storage => {
        const ops: string[] = [];
        return {
            getItem: (key: string): string | null => {
                ops.push(key);
                return settings[key];
            },
            getOps: (): Readonly<string[]> => ops,
            length: Object.keys(settings).length,
            clear: () => { },
            key: (_index: number): string | null => null,
            removeItem: (_key: string) => { },
            setItem: (_key: string, _value: string) => { },
        };
    });

    const untypedProvider = ((settings: Record<string, ConfigTypes>): IConfigProviderBase => {
        return {
            getRawConfig: (name: string): ConfigTypes => settings[name],
        };
    });

    it("Test mixin namespaces", () => {
        const settings = {
            "Fluid.number": "1",
            "Fluid.First.number": "2",
            "Fluid.First.Unit.number": "3",
            "Fluid.First.Unit.Test.number": "4",
            "Fluid.Second.number": "5",
            "Fluid.Second.Unit.number": "6",
        };
        const mockStore = getMockStore(settings);
        const fluid = mixinConfigProvider(
            mockLogger,
            ConfigProvider.create("Fluid", [inMemoryConfigProvider(mockStore).value, mockLogger]));
        const first = mixinChildLoggerWithConfigProvider(fluid, "First");
        const firstUnit = mixinChildLoggerWithConfigProvider(first, "Unit");
        const firstUnitTest = mixinChildLoggerWithConfigProvider(firstUnit, "Test");

        const second = mixinChildLoggerWithConfigProvider(fluid, "Second");
        const secondUnit = mixinChildLoggerWithConfigProvider(second, "Unit");

        assert.equal(fluid.config.getNumber("number"), 1);
        assert.equal(first.config.getNumber("number"), 2);
        assert.equal(firstUnit.config.getNumber("number"), 3);
        assert.equal(firstUnitTest.config.getNumber("number"), 4);
        assert.equal(second.config.getNumber("number"), 5);
        assert.equal(secondUnit.config.getNumber("number"), 6);
        assert.deepEqual(mockStore.getOps(), Object.keys(settings));
    });

    it("Test proper typing - storage provider", () => {
        const settings = {
            "Fluid.number": "1",
            "Fluid.badNumber": "{1}",
            "Fluid.stringThatLooksLikeANumber": "1",
            "Fluid.stringThatLooksLikeABoolean": "true",
            "Fluid.string": "string",
            "Fluid.boolean": "true",
            "Fluid.badBoolean": "truthy",
            "Fluid.numberArray": `[1, 2, 3]`,
            "Fluid.badNumberArray": `["one", "two", "three"]`,
            "Fluid.stringArray": `["1", "2", "3"]`,
            "Fluid.badStringArray": "1",
            "Fluid.booleanArray": "[true, false, true]",
            "Fluid.BadBooleanArray": "[true, 1, true]",
        };

        const mockStore = getMockStore(settings);
        const config = ConfigProvider.create("Fluid", [inMemoryConfigProvider(mockStore).value]);

        assert.equal(config.getNumber("number"), 1);
        assert.equal(config.getNumber("badNumber"), undefined);

        assert.equal(config.getString("stringThatLooksLikeANumber"), "1");
        assert.equal(config.getString("stringThatLooksLikeABoolean"), "true");
        assert.equal(config.getString("string"), "string");

        assert.equal(config.getBoolean("boolean"), true);
        assert.equal(config.getBoolean("badBoolean"), undefined);

        assert.deepEqual(config.getNumberArray("numberArray"), [1, 2, 3]);
        assert.equal(config.getNumberArray("badNumberArray"), undefined);

        assert.deepEqual(config.getStringArray("stringArray"), ["1", "2", "3"]);
        assert.equal(config.getStringArray("badStringArray"), undefined);

        assert.deepEqual(config.getBooleanArray("booleanArray"), [true, false, true]);
        assert.equal(config.getBooleanArray("BadBooleanArray"), undefined);
    });

    it("Test proper typing - custom provider", () => {
        const settings = {
            "Fluid.number": 1,
            "Fluid.sortOfNumber": "1",
            "Fluid.badNumber": "{1}",
            "Fluid.stringThatLooksLikeANumber": "1",
            "Fluid.stringThatLooksLikeABoolean": "true",
            "Fluid.string": "string",
            "Fluid.badString": [],
            "Fluid.boolean": "true",
            "Fluid.badBoolean": "truthy",
            "Fluid.numberArray": `[1, 2, 3]`,
            "Fluid.badNumberArray": ["one", "two", "three"],
            "Fluid.stringArray": `["1", "2", "3"]`,
            "Fluid.badStringArray": "1",
            "Fluid.booleanArray": [true, false, true],
            "Fluid.badBooleanArray": [1, 2, 3],
            "Fluid.badBooleanArray2": ["true", "false", "true"],
        };

        const mockStore = untypedProvider(settings);
        const config = ConfigProvider.create("Fluid", [mockStore]);

        assert.equal(config.getNumber("number"), 1);
        assert.equal(config.getNumber("sortOfNumber"), 1);
        assert.equal(config.getNumber("badNumber"), undefined);

        assert.equal(config.getString("stringThatLooksLikeANumber"), "1");
        assert.equal(config.getString("stringThatLooksLikeABoolean"), "true");
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

    it("Test fallback", () => {
        const settings = {
            "BadConfig.number": "{1}",
            "BadConfig.boolean": "truthy",
            "BadConfig.numberArray": `["one", "two", "three"]`,
            "BadConfig.stringArray": "1",
            "BadConfig.booleanArray": "[true, 1, true]",
        };

        const mockStore = getMockStore(settings);
        const config = ConfigProvider.create("BadConfig", [inMemoryConfigProvider(mockStore).value]);

        assert.equal(config.getNumber("number", 0), 0);
        assert.equal(config.getNumber("does not exist", 1), 1);
        assert.equal(config.getBoolean("boolean", true), true);
        assert.equal(config.getBoolean("does not exist", false), false);
        assert.deepEqual(config.getNumberArray("numberArray", [1, 2, 3]), [1, 2, 3]);
        assert.deepEqual(config.getNumberArray("does not exist", [1, 2]), [1, 2]);
        assert.deepEqual(config.getStringArray("stringArray", ["1", "2", "3"]), ["1", "2", "3"]);
        assert.deepEqual(config.getStringArray("does not exist", ["1", "2"]), ["1", "2"]);
        assert.deepEqual(config.getBooleanArray("booleanArray", [true, false, true]), [true, false, true]);
        assert.deepEqual(config.getBooleanArray("does not exist", [true, false]), [true, false]);
    });

    it("Test config priority", () => {
        const settings1 = {
            "Priority.number": "1",
            "Priority.string": "string1",
            "Priority.boolean": "true",
            "Priority.featureEnabled": "true",
            "BreakGlass.Priority.featureEnabled": "false",
        };
        const settings2 = {
            "Priority.number": "2",
            "Priority.string": "string2",
            "Priority.boolean": "false",
            "Priority.number2": "3",
            "Priority.featureEnabled": "true",
        };
        const settings3 = {
            "Priority.number2": "4",
            "Priority.number3": "4",
            "Priority.featureEnabled": "true",
        };

        const config1 = ConfigProvider.create(
            "Priority",
            [
                inMemoryConfigProvider(getMockStore(settings1), "BreakGlass").value,
                inMemoryConfigProvider(getMockStore(settings1)).value,
                inMemoryConfigProvider(getMockStore(settings2)).value,
                inMemoryConfigProvider(getMockStore(settings3)).value,
            ]);

        assert.equal(config1.getNumber("number", 2), 1); // from settings1
        assert.equal(config1.getString("string"), "string1"); // from settings1
        assert.equal(config1.getBoolean("boolean", true), true); // from settings1
        assert.equal(config1.getNumber("number2"), 3); // from settings2
        assert.equal(config1.getNumber("number3"), 4); // from settings3
        assert.equal(config1.getBoolean("featureEnabled"), false); // from settings1.BreakGlass

        const config2 = ConfigProvider.create(
            "Priority",
            [
                inMemoryConfigProvider(getMockStore(settings3)).value,
                inMemoryConfigProvider(getMockStore(settings2)).value,
                inMemoryConfigProvider(getMockStore(settings1)).value,
                inMemoryConfigProvider(getMockStore(settings1), "BreakGlass").value,
            ]);

        assert.equal(config2.getNumber("number"), 2); // from settings2
        assert.equal(config2.getString("string"), "string2"); // from settings2
        assert.equal(config2.getBoolean("boolean", false), false); // from settings2
        assert.equal(config2.getNumber("number2"), 4); // from settings3
        assert.equal(config2.getNumber("number3"), 4); // from settings3
        assert.equal(config1.getBoolean("featureEnabled"), false); // from settings1.BreakGlass
    });
});
