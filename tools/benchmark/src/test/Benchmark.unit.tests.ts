/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";
import { benchmark } from "../Runner";
import { BenchmarkType, isParentProcess } from "../Configuration";

describe("`benchmark` function", () => {
    describe("uses `before` and `after`", () => {
        let beforeHasBeenCalled = false;
        let afterHasBeenCalled = false;
        benchmark({
            title: "test",
            before: async () =>
                delay(1).then(() => {
                    beforeHasBeenCalled = true;
                }),
            benchmarkFn: () => {
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

    function doLoop(upperLimit: number): void {
        let i = 0;
        while (i < upperLimit) {
            i += 1;
        }
    }

    for (const loopSize of [1e6]) {
        benchmark({
            title: `while loop with ${loopSize} iterations`,
            benchmarkFn: () => doLoop(loopSize),
            type: BenchmarkType.OwnCorrectness,
        });

        benchmark({
            title: `async-initialized while loop with ${loopSize} iterations`,
            benchmarkFnAsync: async () => nextTick(() => doLoop(loopSize)),
            type: BenchmarkType.OwnCorrectness,
        });
    }
});

const dummyPromise = Promise.resolve();

/**
 * Execute a call back on the next possible cycle
 * @param callback - a callback that will get execute in the promise next cycle
 * @returns A promise for completion of the callback
 */
const nextTick = async (callback: () => void): Promise<void> => dummyPromise.then(callback);

/**
 * Waits for the provided duration in milliseconds. See
 * {@link https://javascript.info/settimeout-setinterval | setTimeout}.
 */
const delay = async (milliseconds: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, milliseconds));
