/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    MockFluidDataStoreRuntime,
} from "@fluidframework/test-runtime-utils";
import { benchmarkMemory } from "@fluid-tools/benchmark";
import {
    IJSONSegment, ISegment,
} from "@fluidframework/merge-tree";
import { IChannelAttributes, IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";

// import { TestClient } from "@fluidframework/merge-tree/dist/test";
import { SharedStringFactory } from "../../sequenceFactory";
import { SubSequence, SharedSequence } from "../../sharedSequence";

// class SubSequenceTestClient extends TestClient {
//     constructor() {
//         super(undefined,
//             (spec) => {
//                 const subSequence = SubSequence.fromJSONObject(spec);
//                 return subSequence;
//             });
//     }
// }

class SharedSequenceTest extends SharedSequence<number> {
    constructor(
        document: IFluidDataStoreRuntime,
        public id: string,
        attributes: IChannelAttributes,
        specToSegment: (spec: IJSONSegment) => ISegment,
    ) {
        super(document, id, attributes, specToSegment);
    }
}

function createLocalSharedSequence(id: string) {
    return new SharedSequenceTest(
    // return new SharedSequence<number>(
        new MockFluidDataStoreRuntime(), id, SharedStringFactory.Attributes, SharedStringFactory.segmentFromSpec);
}

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

    benchmarkMemory({
        title: "Create empty SharedSequence",
        minSampleCount: 1000,
        benchmarkFn: async () => {
            createLocalSharedSequence("testSharedSequence");
        },
    });

    const numbersOfEntriesForTests = [100, 1000, 10_000];

    numbersOfEntriesForTests.forEach((x) => {
        benchmarkMemory({
            title: `Insert and remove ${x} subsequences`,
            benchmarkFn: async () => {
                const sharedSequence = createLocalSharedSequence("subsequence");
                for (let i = 0; i < x; i++) {
                    sharedSequence.insert(0, [i]);
                    sharedSequence.remove(0, 1);
                }
            },
        });

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

    //     benchmarkMemory({
    //         title: `Get text annotation ${x} times`,
    //         benchmarkFn: async () => {
    //             const sharedSequence = createLocalSharedSequence("testSharedString");

    //             const text = "hello world";
    //             const styleProps = { style: "bold" };
    //             sharedSequence.insert(0, text.split(""), styleProps);

    //             for (let i = 0; i < x; i++) {
    //                 sharedSequence.getPropertiesAtPosition(i);
    //             }
    //         },
    //     });

    //     benchmarkMemory({
    //         title: `Get items ${x} times from sequence`,
    //         benchmarkFn: async () => {
    //             const sharedSequence = createLocalSharedSequence("testSharedString");
    //             for (let i = 0; i < x; i++) {
    //                 sharedSequence.insert(0, "my-test-text".split(""));
    //                 sharedSequence.getItems(0, 12);
    //             }
    //         },
    //     });
    });
});
