/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    MockFluidDataStoreRuntime,
} from "@fluidframework/test-runtime-utils";
import { benchmarkMemory, IMemoryTestObject } from "@fluid-tools/benchmark";
import { MapFactory, SharedMap } from "../../map";

function createLocalMap(id: string) {
    const map = new SharedMap(id, new MockFluidDataStoreRuntime(), MapFactory.Attributes);
    return map;
}

describe("SharedMap memory usage", () => {
    // IMPORTANT: variables scoped to the test suite are a big problem for memory-profiling tests
    // because they won't be out of scope when we garbage-collect between runs of the same test,
    // and that will skew measurements. Tests should allocate all the memory they need using local
    // variables scoped to the test function itself, so several iterations of a given test can
    // measure from the same baseline (as much as possible).

    beforeEach(async () => {
        // CAREFUL: usually beforeEach/afterEach hooks are used to initialize or interact with variables
        // whose scope is the encompasing test suite, but that's a problem for memory-profiling tests.
        // See the comment at the top of the test suite for more details.
    });

    afterEach(() => {
        // CAREFUL: usually beforeEach/afterEach hooks are used to initialize or interact with variables
        // whose scope is the encompasing test suite, but that's a problem for memory-profiling tests.
        // See the comment at the top of the test suite for more details.
    });

    benchmarkMemory(new class implements IMemoryTestObject {
        title = "Create empty map";
        minSampleCount = 500;

        private map: SharedMap = createLocalMap("testMap");

        async run() {
            this.map = createLocalMap("testMap");
        }
    }());

    const numbersOfEntriesForTests = [1000, 10_000, 100_000];

    numbersOfEntriesForTests.forEach((x) => {
        benchmarkMemory(new class implements IMemoryTestObject {
            title = `Add ${x} integers to a local map`;
            private map: SharedMap = createLocalMap("testMap");

            async run() {
                for (let i = 0; i < x; i++) {
                    this.map.set(i.toString().padStart(6, "0"), i);
                }
            }

            beforeIteration() {
                this.map = createLocalMap("testMap");
            }
        }());

        benchmarkMemory(new class implements IMemoryTestObject {
            title = `Add ${x} integers to a local map, clear it`;
            private map: SharedMap = createLocalMap("testMap");

            async run() {
                for (let i = 0; i < x; i++) {
                    this.map.set(i.toString().padStart(6, "0"), i);
                }
                this.map.clear();
            }

            beforeIteration() {
                this.map = createLocalMap("testMap");
            }
        }());
    });
});
