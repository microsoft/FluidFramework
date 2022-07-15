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
    // IMPORTANT: variables scoped to the test suite are a big problem for memory-profiling tests
    // because they won't be out of scope when we garbage-collect between runs of the same test,
    // and that will skew measurements. Tests should allocate all the memory they need using variables
    // scoped to the test function itself, so several iterations of a given test can measure from
    // the same baseline (as much as possible).

    beforeEach(async () => {
        // CAREFUL: usually beforeEach/afterEach hooks are used to initialize or interact with variables
        // whose scope is the encompasing test suite, but that's a problem for memory-profiling tests.
        // See the comment at the top of the test suite for more details.
    });

    benchmarkMemory({
        title: "Mem benchmark test",
        minSampleCount: 100,
        benchmarkFn: () => {
            const map = createLocalMap("testMap");
            for (let i = 0; i < 10_000; i++) {
                map.set(`testKey_${i}`, `testValue_${i}`);
            }
        },
    });

    benchmarkMemory({
        title: "Mem benchmark test 2",
        minSampleCount: 15,
        benchmarkFn: () => {
            const map = createLocalMap("testMap");
            for (let i = 0; i < 100_000; i++) {
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
        // CAREFUL: usually beforeEach/afterEach hooks are used to initialize or interact with variables
        // whose scope is the encompasing test suite, but that's a problem for memory-profiling tests.
        // See the comment at the top of the test suite for more details.
    });
});
