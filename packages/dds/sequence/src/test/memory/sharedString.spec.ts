/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	benchmarkIt,
	benchmarkMemoryUse,
	isInPerformanceTestingMode,
} from "@fluid-tools/benchmark";
import {
	Marker,
	ReferenceType,
	reservedMarkerIdKey,
} from "@fluidframework/merge-tree/internal";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";

import { SharedStringFactory } from "../../sequenceFactory.js";
import { SharedStringClass } from "../../sharedString.js";

function createLocalSharedString(id: string) {
	return new SharedStringClass(
		new MockFluidDataStoreRuntime(),
		id,
		SharedStringFactory.Attributes,
	);
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

	benchmarkIt({
		title: "Create empty SharedString",
		...benchmarkMemoryUse({
			benchmarkFn: async (state) => {
				while (state.continue()) {
					await state.beforeAllocation();
					{
						// eslint-disable-next-line @typescript-eslint/no-unused-vars
						const sharedString = createLocalSharedString("testSharedString");
						await state.whileAllocated();
					}
					await state.afterDeallocation();
				}
			},
		}),
	});

	const numbersOfEntriesForTests = isInPerformanceTestingMode
		? [100, 1000, 10_000]
		: // When not measuring perf, use a single smaller data size so the tests run faster.
			[10];

	for (const x of numbersOfEntriesForTests) {
		benchmarkIt({
			title: `Insert and remove text ${x} times`,
			...benchmarkMemoryUse({
				benchmarkFn: async (state) => {
					while (state.continue()) {
						await state.beforeAllocation();
						{
							const sharedString = createLocalSharedString("testSharedString");
							for (let i = 0; i < x; i++) {
								sharedString.insertText(0, "my-test-text");
								sharedString.removeText(0, 12);
							}
							await state.whileAllocated();
						}
						await state.afterDeallocation();
					}
				},
			}),
		});

		benchmarkIt({
			title: `Replace text ${x} times`,
			...benchmarkMemoryUse({
				benchmarkFn: async (state) => {
					while (state.continue()) {
						await state.beforeAllocation();
						{
							const sharedString = createLocalSharedString("testSharedString");
							sharedString.insertText(0, "0000");
							for (let i = 0; i < x; i++) {
								sharedString.replaceText(0, 4, i.toString().padStart(4, "0"));
							}
							await state.whileAllocated();
						}
						await state.afterDeallocation();
					}
				},
			}),
		});

		benchmarkIt({
			title: `Get text annotation ${x} times`,
			...benchmarkMemoryUse({
				benchmarkFn: async (state) => {
					while (state.continue()) {
						await state.beforeAllocation();
						{
							const text = "hello world";
							const styleProps = { style: "bold" };
							const sharedString = createLocalSharedString("testSharedString");
							sharedString.insertText(0, text, styleProps);
							for (let i = 0; i < x; i++) {
								sharedString.getPropertiesAtPosition(i);
							}
							await state.whileAllocated();
						}
						await state.afterDeallocation();
					}
				},
			}),
		});

		benchmarkIt({
			title: `Get marker ${x} times`,
			...benchmarkMemoryUse({
				benchmarkFn: async (state) => {
					while (state.continue()) {
						await state.beforeAllocation();
						{
							const markerId = "myMarkerId";
							const sharedString = createLocalSharedString("testSharedString");
							sharedString.insertText(0, "my-test-text");
							sharedString.insertMarker(0, ReferenceType.Simple, {
								[reservedMarkerIdKey]: markerId,
							});
							for (let i = 0; i < x; i++) {
								sharedString.getMarkerFromId(markerId);
							}
							await state.whileAllocated();
						}
						await state.afterDeallocation();
					}
				},
			}),
		});

		benchmarkIt({
			title: `Annotate marker ${x} times with same options`,
			...benchmarkMemoryUse({
				benchmarkFn: async (state) => {
					while (state.continue()) {
						await state.beforeAllocation();
						{
							const markerId = "myMarkerId";
							const sharedString = createLocalSharedString("testSharedString");
							sharedString.insertText(0, "my-test-text");
							sharedString.insertMarker(0, ReferenceType.Simple, {
								[reservedMarkerIdKey]: markerId,
							});
							const simpleMarker = sharedString.getMarkerFromId(markerId) as Marker;
							for (let i = 0; i < x; i++) {
								sharedString.annotateMarker(simpleMarker, { color: "blue" });
							}
							await state.whileAllocated();
						}
						await state.afterDeallocation();
					}
				},
			}),
		});
	}
});
