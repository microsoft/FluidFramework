/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

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
	benchmarkIt({
		title: "Create empty SharedString",
		...benchmarkMemoryUse({
			benchmarkFn: async (state) => {
				while (state.continue()) {
					await state.beforeAllocation();
					{
						const sharedString = createLocalSharedString("testSharedString");
						await state.whileAllocated();
						assert(sharedString.id === "testSharedString");
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
