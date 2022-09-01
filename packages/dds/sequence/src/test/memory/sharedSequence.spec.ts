/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { benchmarkMemory } from "@fluid-tools/benchmark";
import { SubSequence } from "../../sharedSequence";

describe("SharedSequence memory usage", () => {
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

    const numbersOfEntriesForTests = [100, 1000, 10_000];

    numbersOfEntriesForTests.forEach((x) => {
        benchmarkMemory({
            title: `Append and remove ${x} subsequences`,
            benchmarkFn: async () => {
                const segment = new SubSequence<number>([]);
                for (let i = 0; i < x; i++) {
                    segment.append(new SubSequence<number>([i]));
                    segment.removeRange(0, 1);
                }
            },
        });

        // NOTE: This test is commented out because SharedSequence does not exist
        // as an implementable standalone datastructure. In order to implement the
        // test for it, we need to define a SharedSequenceFactory and implement the
        // various functions within it to instantiate and process the different
        // datatypes within the Sequence. However, as we are depracating
        // SharedObjectSequence and SharedNumberSequence, and SharedString has it's
        // own performance tests, it makes little sense to make up and implement a
        // ShareSequence standalone factory to benchmark performance as is. So we
        // are leaving this test skipped over for now until there is a reason to
        // invest more effort into benchmarking it's performance.
        //
        //  function createLocalSharedSequence(id: string) {
        //     return new SharedSequence<number>(
        //         new MockFluidDataStoreRuntime(),
        //         id,
        //         SharedStringFactory.Attributes,
        //         SharedStringFactory.segmentFromSpec
        //     );
        // }
        // benchmarkMemory.skip({
        //     title: `Insert and remove ${x} subsequences`,
        //     benchmarkFn: async () => {
        //         const sharedSequence = createLocalSharedSequence("subsequence");
        //         sharedSequence.insert(0, [1]);
        //         for (let i = 0; i < x; i++) {
        //             sharedSequence.insert(0, [i]);
        //             sharedSequence.remove(0, 1);
        //         }
        //     },
        // });
    });
});
