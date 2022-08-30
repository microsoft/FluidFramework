/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    MockFluidDataStoreRuntime,
} from "@fluidframework/test-runtime-utils";
import { benchmarkMemory } from "@fluid-tools/benchmark";
import {
    Marker,
    ReferenceType,
    reservedMarkerIdKey,
} from "@fluidframework/merge-tree";
import { SharedString } from "../../sharedString";
import { SharedStringFactory } from "../../sequenceFactory";

function createLocalSharedString(id: string) {
    return new SharedString(new MockFluidDataStoreRuntime(), id, SharedStringFactory.Attributes);
}

describe("SharedString memory usage", () => {
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
        title: "Create empty SharedString",
        minSampleCount: 1000,
        benchmarkFn: async () => {
            createLocalSharedString("testSharedString");
        },
    });

    const numbersOfEntriesForTests = [100, 1000, 10_000];

    numbersOfEntriesForTests.forEach((x) => {
        benchmarkMemory({
            title: `Insert and remove text ${x} times`,
            benchmarkFn: async () => {
                const sharedString = createLocalSharedString("testSharedString");
                for (let i = 0; i < x; i++) {
                    sharedString.insertText(0, "my-test-text");
                    sharedString.removeText(0, 12);
                }
            },
        });

        benchmarkMemory({
            title: `Replace text ${x} times`,
            benchmarkFn: async () => {
                const sharedString = createLocalSharedString("testSharedString");
                sharedString.insertText(0, "0000");
                for (let i = 0; i < x; i++) {
                    sharedString.replaceText(0, 4, i.toString().padStart(4, "0"));
                }
            },
        });

        benchmarkMemory({
            title: `Get text annotation ${x} times`,
            benchmarkFn: async () => {
                const sharedString = createLocalSharedString("testSharedString");

                const text = "hello world";
                const styleProps = { style: "bold" };
                sharedString.insertText(0, text, styleProps);

                for (let i = 0; i < x; i++) {
                    sharedString.getPropertiesAtPosition(i);
                }
            },
        });

        benchmarkMemory({
            title: `Get marker ${x} times`,
            benchmarkFn: async () => {
                const markerId = "myMarkerId";
                const sharedString = createLocalSharedString("testSharedString");
                sharedString.insertText(0, "my-test-text");
                sharedString.insertMarker(
                    0,
                    ReferenceType.Simple,
                    {
                        [reservedMarkerIdKey]: markerId,
                    });
                for (let i = 0; i < x; i++) {
                    sharedString.getMarkerFromId(markerId);
                }
            },
        });

        benchmarkMemory({
            title: `Annotate marker ${x} times with same options`,
            benchmarkFn: async () => {
                const markerId = "myMarkerId";
                const sharedString = createLocalSharedString("testSharedString");
                sharedString.insertText(0, "my-test-text");
                sharedString.insertMarker(
                    0,
                    ReferenceType.Simple,
                    {
                        [reservedMarkerIdKey]: markerId,
                    },
                );

                const simpleMarker = sharedString.getMarkerFromId(markerId) as Marker;
                for (let i = 0; i < x; i++) {
                    sharedString.annotateMarker(simpleMarker, { color: "blue" });
                }
            },
        });
    });
});
