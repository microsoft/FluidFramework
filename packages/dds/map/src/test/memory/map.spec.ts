/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    MockFluidDataStoreRuntime,
} from "@fluidframework/test-runtime-utils";
import { benchmarkMemory } from "@fluid-tools/benchmark";
import { MapFactory, SharedMap } from "../../map";

function createLocalMap(id: string) {
    const map = new SharedMap(id, new MockFluidDataStoreRuntime(), MapFactory.Attributes);
    return map;
}

describe("benchmarkTests", () => {
    let map: SharedMap;
    // const consoleLog = console.log;

    beforeEach(async () => {
        map = createLocalMap("testMap");
        // consoleLog("my custom before");
    });

    benchmarkMemory({
        title: "Mem benchmark test",
        benchmarkFn: () => {
            for (let i = 0; i < 10_000; i++) {
                map.set(`testKey_${i}`, `testValue_${i}`);
            }
        },
    });

    benchmarkMemory({
        title: "Test that fails",
        benchmarkFn: () => {
            assert.fail("FAILED");
        },
    });

    afterEach(() => {
        // consoleLog("my custom after");
    });
});
