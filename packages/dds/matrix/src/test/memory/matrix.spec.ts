/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import { benchmarkMemory, IMemoryTestObject } from "@fluid-tools/benchmark";
import { SharedMatrix, SharedMatrixFactory } from "../..";

function createLocalMatrix(id: string) {
	return new SharedMatrix(
		new MockFluidDataStoreRuntime(),
		"matrix1",
		SharedMatrixFactory.Attributes,
	);
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

	benchmarkMemory(
		new (class implements IMemoryTestObject {
			title = "Create empty Matrix";
			minSampleCount = 500;

			private localMatrix: SharedMatrix = createLocalMatrix("testLocalMatrix");

			async run() {
				this.localMatrix = createLocalMatrix("testLocalMatrix");
			}
		})(),
	);

	const numbersOfEntriesForTests = [100, 1000, 10_000];

	numbersOfEntriesForTests.forEach((x) => {
		benchmarkMemory(
			new (class implements IMemoryTestObject {
				title = `Insert and remove ${x} columns`;
				private localMatrix: SharedMatrix = createLocalMatrix("testLocalMatrix");

				async run() {
					for (let i = 0; i < x; i++) {
						this.localMatrix.insertCols(0, 100);
						this.localMatrix.removeCols(0, 100);
					}
				}

				beforeIteration() {
					this.localMatrix = createLocalMatrix("testLocalMatrix");
				}
			})(),
		);

		benchmarkMemory(
			new (class implements IMemoryTestObject {
				title = `Insert and remove ${x} rows`;
				private localMatrix: SharedMatrix = createLocalMatrix("testLocalMatrix");

				async run() {
					for (let i = 0; i < x; i++) {
						this.localMatrix.insertRows(0, 100);
						this.localMatrix.removeRows(0, 100);
					}
				}

				beforeIteration() {
					this.localMatrix = createLocalMatrix("testLocalMatrix");
				}
			})(),
		);

		benchmarkMemory(
			new (class implements IMemoryTestObject {
				title = `Insert and remove ${x} rows and columns`;
				private localMatrix: SharedMatrix = createLocalMatrix("testLocalMatrix");

				async run() {
					for (let i = 0; i < x; i++) {
						this.localMatrix.insertCols(0, 100);
						this.localMatrix.insertRows(0, 100);
						this.localMatrix.removeCols(0, 100);
						this.localMatrix.removeRows(0, 100);
					}
				}

				beforeIteration() {
					this.localMatrix = createLocalMatrix("testLocalMatrix");
				}
			})(),
		);

		benchmarkMemory(
			new (class implements IMemoryTestObject {
				title = `Set ${x} cells`;
				private localMatrix = createLocalMatrix("testLocalMatrix");

				async run() {
					this.localMatrix.insertCols(0, x);
					this.localMatrix.insertRows(0, x);
					for (let i = 0; i < x; i++) {
						this.localMatrix.setCell(0, i, "a");
					}
				}

				beforeIteration() {
					this.localMatrix = createLocalMatrix("testLocalMatrix");
				}
			})(),
		);
	});
});
