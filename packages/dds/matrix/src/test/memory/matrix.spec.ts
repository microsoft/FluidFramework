/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type IMemoryTestObject,
	benchmarkMemory,
	isInPerformanceTestingMode,
} from "@fluid-tools/benchmark";
import type { IChannel } from "@fluidframework/datastore-definitions/internal";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";

import { SharedMatrix, type ISharedMatrix } from "../../index.js";
import { matrixFactory } from "../utils.js";

function createLocalMatrix(id: string): ISharedMatrix & IChannel {
	return matrixFactory.create(new MockFluidDataStoreRuntime(), id);
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

	describe("Detached Matrix", () => {
		benchmarkMemory(
			new (class implements IMemoryTestObject {
				readonly title = "Create empty Matrix";
				minSampleCount = 500;

				private localMatrix: SharedMatrix = createLocalMatrix("testLocalMatrix");

				async run(): Promise<void> {
					this.localMatrix = createLocalMatrix("testLocalMatrix");
				}
			})(),
		);

		const numbersOfEntriesForTests = isInPerformanceTestingMode
			? [100, 1000, 5000]
			: // When not measuring perf, use a single smaller data size so the tests run faster.
				[10];

		for (const x of numbersOfEntriesForTests) {
			benchmarkMemory(
				new (class implements IMemoryTestObject {
					readonly title = `Insert and remove a column ${x} times`;
					private localMatrix: SharedMatrix = createLocalMatrix("testLocalMatrix");

					async run(): Promise<void> {
						for (let i = 0; i < x; i++) {
							this.localMatrix.insertCols(0, 1);
							this.localMatrix.removeCols(0, 1);
						}
					}

					beforeIteration(): void {
						this.localMatrix = createLocalMatrix("testLocalMatrix");
					}
				})(),
			);

			benchmarkMemory(
				new (class implements IMemoryTestObject {
					readonly title = `Insert and remove one row ${x} times`;
					private localMatrix: SharedMatrix = createLocalMatrix("testLocalMatrix");

					async run(): Promise<void> {
						for (let i = 0; i < x; i++) {
							this.localMatrix.insertRows(0, 1);
							this.localMatrix.removeRows(0, 1);
						}
					}

					beforeIteration(): void {
						this.localMatrix = createLocalMatrix("testLocalMatrix");
					}
				})(),
			);

			benchmarkMemory(
				new (class implements IMemoryTestObject {
					readonly title = `Insert and remove a row and column ${x} times`;
					private localMatrix: SharedMatrix = createLocalMatrix("testLocalMatrix");

					async run(): Promise<void> {
						for (let i = 0; i < x; i++) {
							this.localMatrix.insertCols(0, 1);
							this.localMatrix.insertRows(0, 1);
							this.localMatrix.removeCols(0, 1);
							this.localMatrix.removeRows(0, 1);
						}
					}

					beforeIteration(): void {
						this.localMatrix = createLocalMatrix("testLocalMatrix");
					}
				})(),
			);

			benchmarkMemory(
				new (class implements IMemoryTestObject {
					readonly title = `Set a 3-character string in ${x} cells`;
					private localMatrix = createLocalMatrix("testLocalMatrix");

					async run(): Promise<void> {
						for (let i = 0; i < x; i++) {
							this.localMatrix.setCell(0, i, "abc");
						}
					}

					beforeIteration(): void {
						this.localMatrix = createLocalMatrix("testLocalMatrix");
						this.localMatrix.insertRows(0, 1);
						this.localMatrix.insertCols(0, x);
					}
				})(),
			);

			benchmarkMemory(
				new (class implements IMemoryTestObject {
					readonly title = `Set a number in ${x} cells`;
					private localMatrix = createLocalMatrix("testLocalMatrix");

					async run(): Promise<void> {
						for (let i = 0; i < x; i++) {
							this.localMatrix.setCell(0, i, 1);
						}
					}

					beforeIteration(): void {
						this.localMatrix = createLocalMatrix("testLocalMatrix");
						this.localMatrix.insertRows(0, 1);
						this.localMatrix.insertCols(0, x);
					}
				})(),
			);
		}
	});
});
