/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	benchmarkIt,
	benchmarkMemoryUse,
	isInPerformanceTestingMode,
	memoryAddedBy,
	memoryUseOfValue,
} from "@fluid-tools/benchmark";
import {
	Marker,
	ReferenceType,
	reservedMarkerIdKey,
} from "@fluidframework/merge-tree/internal";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";

import { SharedStringFactory } from "../../sequenceFactory.js";
import { SharedStringClass } from "../../sharedString.js";

function createLocalSharedString(id: string): SharedStringClass {
	return new SharedStringClass(
		new MockFluidDataStoreRuntime(),
		id,
		SharedStringFactory.Attributes,
	);
}

describe("SharedString memory usage", () => {
	benchmarkIt({
		title: "Create empty SharedString",
		...benchmarkMemoryUse(memoryUseOfValue(() => createLocalSharedString("testSharedString"))),
	});

	const numbersOfEntriesForTests = isInPerformanceTestingMode
		? [100, 1000, 10_000]
		: // When not measuring perf, use a single smaller data size so the tests run faster.
			[10];

	for (const x of numbersOfEntriesForTests) {
		benchmarkIt({
			title: `Insert and remove text ${x} times`,
			...benchmarkMemoryUse(
				memoryAddedBy({
					setup: () => createLocalSharedString("testSharedString"),
					modify: (sharedString) => {
						for (let i = 0; i < x; i++) {
							sharedString.insertText(0, "my-test-text");
							sharedString.removeText(0, 12);
						}
					},
				}),
			),
		});

		benchmarkIt({
			title: `Replace text ${x} times`,
			...benchmarkMemoryUse(
				memoryAddedBy({
					setup: () => {
						const sharedString = createLocalSharedString("testSharedString");
						sharedString.insertText(0, "0000");
						return sharedString;
					},
					modify: (sharedString) => {
						for (let i = 0; i < x; i++) {
							sharedString.replaceText(0, 4, i.toString().padStart(4, "0"));
						}
					},
				}),
			),
		});

		benchmarkIt({
			title: `Get text annotation ${x} times`,
			...benchmarkMemoryUse(
				memoryAddedBy({
					setup: () => {
						const sharedString = createLocalSharedString("testSharedString");
						sharedString.insertText(0, "hello world", { style: "bold" });
						return sharedString;
					},
					modify: (sharedString) => {
						for (let i = 0; i < x; i++) {
							sharedString.getPropertiesAtPosition(i);
						}
					},
				}),
			),
		});

		benchmarkIt({
			title: `Get marker ${x} times`,
			...benchmarkMemoryUse(
				memoryAddedBy({
					setup: () => {
						const sharedString = createLocalSharedString("testSharedString");
						sharedString.insertText(0, "my-test-text");
						sharedString.insertMarker(0, ReferenceType.Simple, {
							[reservedMarkerIdKey]: "myMarkerId",
						});
						return sharedString;
					},
					modify: (sharedString) => {
						for (let i = 0; i < x; i++) {
							sharedString.getMarkerFromId("myMarkerId");
						}
					},
				}),
			),
		});

		benchmarkIt({
			title: `Annotate marker ${x} times with same options`,
			...benchmarkMemoryUse(
				memoryAddedBy({
					setup: () => {
						const sharedString = createLocalSharedString("testSharedString");
						sharedString.insertText(0, "my-test-text");
						sharedString.insertMarker(0, ReferenceType.Simple, {
							[reservedMarkerIdKey]: "myMarkerId",
						});
						return {
							sharedString,
							simpleMarker: sharedString.getMarkerFromId("myMarkerId") as Marker,
						};
					},
					modify: ({ sharedString, simpleMarker }) => {
						for (let i = 0; i < x; i++) {
							sharedString.annotateMarker(simpleMarker, { color: "blue" });
						}
					},
				}),
			),
		});
	}
});
