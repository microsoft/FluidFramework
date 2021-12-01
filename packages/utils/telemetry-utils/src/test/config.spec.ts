/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { MockLogger } from "../mockLogger";
import {
    ConfigProvider,
    inMemoryConfigProvider,
    mixinChildLoggerWithConfigProvider,
    mixinConfigProvider,
} from "../config";

describe("Config", () => {
    const mockLogger = new MockLogger();
    const getMockStore = ((settings: Record<string, string>) => {
        const ops: string[] = [];
        return {
          getItem: (key: string): string | null => {
              ops.push(key);
              return settings[key];
          },
          getOps: (): Readonly<string[]> => ops,
          length: Object.keys(settings).length,
          clear: () => {},
          key: (_index: number): string | null => null,
          removeItem: (_key: string) => {},
          setItem: (_key: string, _value: string) => {},
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
            ConfigProvider.create("Fluid",[inMemoryConfigProvider(mockStore).value, mockLogger]));
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
        const config = ConfigProvider.create("Fluid",[inMemoryConfigProvider(mockStore).value]);

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

    it("Test fallback", () => {
        const settings = {
            "BadConfig.number": "{1}",
            "BadConfig.boolean": "truthy",
            "BadConfig.numberArray": `["one", "two", "three"]`,
            "BadConfig.stringArray": "1",
            "BadConfig.booleanArray": "[true, 1, true]",
        };

        const mockStore = getMockStore(settings);
        const config = ConfigProvider.create("BadConfig",[inMemoryConfigProvider(mockStore).value]);

        assert.equal(config.getNumber("number", 0), 0);
        assert.equal(config.getNumber("does not exist", 1), 1);
        assert.equal(config.getBoolean("boolean", true), true);
        assert.equal(config.getBoolean("does not exist", false), false);
        assert.deepEqual(config.getNumberArray("numberArray",  [1, 2, 3]), [1, 2, 3]);
        assert.deepEqual(config.getNumberArray("does not exist",  [1, 2]), [1, 2]);
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
        };
        const settings2 = {
            "Priority.number": "2", // will be shadowed by settings1.Fluid.number
            "Priority.string": "string2", // will be shadowed by settings1.Fluid.string
            "Priority.boolean": "false",  // will be shadowed by settings1.Fluid.boolean
            "Priority.number2": "3",
        };
        const settings3 = {
            "Priority.number2": "3",  // will be shadowed by settings2.Fluid.number2
            "Priority.number3": "4",
        };

        const config = ConfigProvider.create(
            "Priority",
            [
                inMemoryConfigProvider(getMockStore(settings1)).value,
                inMemoryConfigProvider(getMockStore(settings2)).value,
                inMemoryConfigProvider(getMockStore(settings3)).value,
            ]);

        assert.equal(config.getNumber("number"), 1);
        assert.equal(config.getString("string"), "string1");
        assert.equal(config.getBoolean("boolean", true), true);
        assert.equal(config.getNumber("number2"), 3);
        assert.equal(config.getNumber("number3"), 4);
    });
});
