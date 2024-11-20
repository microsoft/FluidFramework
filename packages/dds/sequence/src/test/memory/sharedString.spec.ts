/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type IMemoryTestObject,
	benchmarkMemory,
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

	benchmarkMemory(
		new (class implements IMemoryTestObject {
			title = "Create empty SharedString";
			minSampleCount = 500;

			sharedString = createLocalSharedString("testSharedString");

			async run() {
				this.sharedString = createLocalSharedString("testSharedString");
			}
		})(),
	);

	const numbersOfEntriesForTests = isInPerformanceTestingMode
		? [100, 1000, 10_000]
		: // When not measuring perf, use a single smaller data size so the tests run faster.
			[10];

	numbersOfEntriesForTests.forEach((x) => {
		benchmarkMemory(
			new (class implements IMemoryTestObject {
				title = `Insert and remove text ${x} times`;
				private sharedString = createLocalSharedString("testSharedString");

				async run() {
					for (let i = 0; i < x; i++) {
						this.sharedString.insertText(0, "my-test-text");
						this.sharedString.removeText(0, 12);
					}
				}

				beforeIteration() {
					this.sharedString = createLocalSharedString("testestSharedString");
				}
			})(),
		);

		benchmarkMemory(
			new (class implements IMemoryTestObject {
				title = `Replace text ${x} times`;
				private sharedString = createLocalSharedString("testSharedString");

				async run() {
					for (let i = 0; i < x; i++) {
						this.sharedString.replaceText(0, 4, i.toString().padStart(4, "0"));
					}
				}

				beforeIteration() {
					this.sharedString = createLocalSharedString("testestSharedString");
					this.sharedString.insertText(0, "0000");
				}
			})(),
		);

		benchmarkMemory(
			new (class implements IMemoryTestObject {
				title = `Get text annotation ${x} times`;
				private sharedString = createLocalSharedString("testSharedString");
				private text = "hello world";
				private styleProps = { style: "bold" };

				async run() {
					for (let i = 0; i < x; i++) {
						this.sharedString.getPropertiesAtPosition(i);
					}
				}

				beforeIteration() {
					this.sharedString = createLocalSharedString("testSharedString");
					this.text = "hello world";
					this.styleProps = { style: "bold" };
					this.sharedString.insertText(0, this.text, this.styleProps);
				}
			})(),
		);

		benchmarkMemory(
			new (class implements IMemoryTestObject {
				title = `Get marker ${x} times`;
				private markerId = "myMarkerId";
				private sharedString = createLocalSharedString("testSharedString");

				async run() {
					for (let i = 0; i < x; i++) {
						this.sharedString.getMarkerFromId(this.markerId);
					}
				}

				beforeIteration() {
					this.markerId = "myMarkerId";
					this.sharedString = createLocalSharedString("testSharedString");
					this.sharedString.insertText(0, "my-test-text");
					this.sharedString.insertMarker(0, ReferenceType.Simple, {
						[reservedMarkerIdKey]: this.markerId,
					});
				}
			})(),
		);

		benchmarkMemory(
			new (class implements IMemoryTestObject {
				title = `Annotate marker ${x} times with same options`;
				private markerId = "myMarkerId";
				private sharedString = createLocalSharedString("testSharedString");
				private simpleMarker = this.sharedString.getMarkerFromId(this.markerId) as Marker;

				async run() {
					for (let i = 0; i < x; i++) {
						this.sharedString.annotateMarker(this.simpleMarker, { color: "blue" });
					}
				}

				beforeIteration() {
					this.markerId = "myMarkerId";
					this.sharedString = createLocalSharedString("testSharedString");
					this.sharedString.insertText(0, "my-test-text");
					this.sharedString.insertMarker(0, ReferenceType.Simple, {
						[reservedMarkerIdKey]: this.markerId,
					});
					this.simpleMarker = this.sharedString.getMarkerFromId(this.markerId) as Marker;
				}
			})(),
		);
	});
});
