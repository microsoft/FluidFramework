/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";
import { BenchmarkType, isParentProcess } from "../Configuration";
import { benchmarkMemory } from "../MemoryTestRunner";

describe("`benchmarkMemory` function", () => {
    describe("uses `before` and `after`", () => {
        let beforeHasBeenCalled = false;
        let afterHasBeenCalled = false;
        benchmarkMemory({
            title: "test",
            before: async () =>
                delay(1).then(() => {
                    beforeHasBeenCalled = true;
                }),
            benchmarkFn: async () => {
                expect(beforeHasBeenCalled).to.equal(true, "before should be called before test body");
                expect(afterHasBeenCalled).to.equal(false, "after should not be called during test execution");
            },
            after: async () =>
                delay(1).then(() => {
                    afterHasBeenCalled = true;
                }),
            type: BenchmarkType.OwnCorrectness,
        });

        afterEach(() => {
            if (!isParentProcess) {
                // If running with separate processes,
                // this check must only be done in the child process (it will fail in the parent process)
                expect(afterHasBeenCalled).to.equal(true, "after should be called after test execution");
            }
        });
    });
});
/**
 * Waits for the provided duration in milliseconds. See
 * {@link https://javascript.info/settimeout-setinterval | setTimeout}.
 */
const delay = async (milliseconds: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, milliseconds));
