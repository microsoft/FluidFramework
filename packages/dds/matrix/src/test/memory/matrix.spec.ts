/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    MockFluidDataStoreRuntime,
} from "@fluidframework/test-runtime-utils";
import { benchmarkMemory } from "@fluid-tools/benchmark";
import { SharedMatrix, SharedMatrixFactory } from "../..";

function createLocalMatrix(id: string) {
    return new SharedMatrix(new MockFluidDataStoreRuntime(), "matrix1", SharedMatrixFactory.Attributes);
}

describe("Matrix memory usage", () => {
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

    benchmarkMemory({
        title: "Create empty Matrix",
        minSampleCount: 1000,
        benchmarkFn: async () => {
            createLocalMatrix("testMatrix");
        },
    });

    const numbersOfEntriesForTests = [100, 1000, 10_000];

    numbersOfEntriesForTests.forEach((x) => {
        benchmarkMemory({
            title: `Insert and remove ${x} columns`,
            benchmarkFn: async () => {
                const localMatrix = createLocalMatrix("testLocalMatrix");
                for (let i = 0; i < x; i++) {
                    localMatrix.insertCols(0, 100);
                    localMatrix.removeCols(0, 100);
                }
            },
        });

        benchmarkMemory({
            title: `Insert and remove ${x} rows`,
            benchmarkFn: async () => {
                const localMatrix = createLocalMatrix("testLocalMatrix");
                for (let i = 0; i < x; i++) {
                    localMatrix.insertRows(0, 100);
                    localMatrix.removeRows(0, 100);
                }
            },
        });

        benchmarkMemory({
            title: `Insert and remove ${x} rows and columns`,
            benchmarkFn: async () => {
                const localMatrix = createLocalMatrix("testLocalMatrix");
                for (let i = 0; i < x; i++) {
                    localMatrix.insertCols(0, 100);
                    localMatrix.insertRows(0, 100);
                    localMatrix.removeCols(0, 100);
                    localMatrix.removeRows(0, 100);
                }
            },
        });

        benchmarkMemory({
            title: `Set ${x} cells`,
            benchmarkFn: async () => {
                const localMatrix = createLocalMatrix("testLocalMatrix");
                localMatrix.insertCols(0, x);
                localMatrix.insertRows(0, x);
                for (let i = 0; i < x; i++) {
                    localMatrix.setCell(0, i, "a");
                }
            },
        });
    });
});
