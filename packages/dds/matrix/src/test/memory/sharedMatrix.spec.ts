/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type IMemoryTestObject,
	benchmarkMemory,
	isInPerformanceTestingMode,
} from "@fluid-tools/benchmark";

import { SharedMatrix } from "../../index.js";
import { createLocalMatrix } from "../utils.js";

describe("SharedMatrix memory usage", () => {
	// The value to be set in the cells of the matrix.
	const matrixValue = "cellValue";
	// The test matrix's size will be 0*0, 10*10, 100*100, 1000*1000.
	const matrixSizes = isInPerformanceTestingMode
		? [10, 100, 1000]
		: // When not measuring perf, use a single smaller data size so the tests run faster.
			[10];

	// The number of operations to perform on the matrix.
	const operationCounts = isInPerformanceTestingMode
		? [10, 100, 1000]
		: // When not measuring perf, use a single smaller data size so the tests run faster.
			[5];

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

	for (const matrixSize of matrixSizes) {
		describe(`Size of ${matrixSize}*${matrixSize} SharedMatrix`, () => {
			// Filter counts to ensure they do not exceed matrixSize
			const validRemoveCounts = operationCounts.filter((count) => count <= matrixSize);

			// Insert related tests that are not limited by matrixSize
			for (const count of operationCounts) {
				// Test the memory usage of the SharedMatrix for inserting a column in the middle for a given number of times.
				benchmarkMemory(
					new (class implements IMemoryTestObject {
						readonly title = `Insert a column in the middle ${count} times`;
						private localMatrix: SharedMatrix | undefined;

						async run(): Promise<void> {
							if (this.localMatrix === undefined) {
								throw new Error("localMatrix is not initialized");
							}

							for (let i = 0; i < count; i++) {
								this.localMatrix.insertCols(Math.floor(this.localMatrix.colCount / 2), 1);
							}
						}

						beforeIteration(): void {
							this.localMatrix = createLocalMatrix({
								id: "testLocalMatrix",
								size: matrixSize,
								initialValue: matrixValue,
							});
						}
					})(),
				);

				// Test the memory usage of the SharedMatrix for inserting a row in the middle for a given number of times.
				benchmarkMemory(
					new (class implements IMemoryTestObject {
						readonly title = `Insert a row in the middle ${count} times`;
						private localMatrix: SharedMatrix | undefined;

						async run(): Promise<void> {
							if (this.localMatrix === undefined) {
								throw new Error("localMatrix is not initialized");
							}

							for (let i = 0; i < count; i++) {
								this.localMatrix.insertRows(Math.floor(this.localMatrix.rowCount / 2), 1);
							}
						}

						beforeIteration(): void {
							this.localMatrix = createLocalMatrix({
								id: "testLocalMatrix",
								size: matrixSize,
								initialValue: matrixValue,
							});
						}
					})(),
				);

				// Test the memory usage of the SharedMatrix for inserting a row and a column in the middle for a given number of times.
				benchmarkMemory(
					new (class implements IMemoryTestObject {
						readonly title = `Insert a row and a column ${count} times`;
						private localMatrix: SharedMatrix | undefined;

						async run(): Promise<void> {
							if (this.localMatrix === undefined) {
								throw new Error("localMatrix is not initialized");
							}

							for (let i = 0; i < count; i++) {
								this.localMatrix.insertCols(Math.floor(this.localMatrix.colCount / 2), 1);
								this.localMatrix.insertRows(Math.floor(this.localMatrix.rowCount / 2), 1);
							}
						}

						beforeIteration(): void {
							this.localMatrix = createLocalMatrix({
								id: "testLocalMatrix",
								size: matrixSize,
								initialValue: matrixValue,
							});
						}
					})(),
				);

				/**
				 * Test the memory usage of the SharedMatrix for inserting a column and a row
				 *and then removing them right away to see if the memory is released.
				 * Memory usage should be very low for these test cases.
				 */
				benchmarkMemory(
					new (class implements IMemoryTestObject {
						readonly title =
							`Insert a row and a column and remove them right away ${count} times`;
						private localMatrix: SharedMatrix | undefined;

						async run(): Promise<void> {
							if (this.localMatrix === undefined) {
								throw new Error("localMatrix is not initialized");
							}

							for (let i = 0; i < count; i++) {
								const middleCol = Math.floor(this.localMatrix.colCount / 2);
								const middleRow = Math.floor(this.localMatrix.rowCount / 2);

								this.localMatrix.insertCols(middleCol, 1);
								this.localMatrix.removeCols(middleCol, 1);
								this.localMatrix.insertRows(middleRow, 1);
								this.localMatrix.removeRows(middleRow, 1);
							}
						}

						beforeIteration(): void {
							this.localMatrix = createLocalMatrix({
								id: "testLocalMatrix",
								size: matrixSize,
								initialValue: matrixValue,
							});
						}
					})(),
				);
			}

			// Remove related tests that operation counts are up to matrixSize
			for (const count of validRemoveCounts) {
				// Test the memory usage of the SharedMatrix for removing a column for a given number of times.
				benchmarkMemory(
					new (class implements IMemoryTestObject {
						readonly title = `Remove the middle column ${count} times`;
						private localMatrix: SharedMatrix | undefined;

						async run(): Promise<void> {
							if (this.localMatrix === undefined) {
								throw new Error("localMatrix is not initialized");
							}

							for (let i = 0; i < count; i++) {
								this.localMatrix.removeCols(Math.floor(this.localMatrix.colCount / 2), 1);
							}
						}

						beforeIteration(): void {
							this.localMatrix = createLocalMatrix({
								id: "testLocalMatrix",
								size: matrixSize,
								initialValue: matrixValue,
							});
						}
					})(),
				);

				// Test the memory usage of the SharedMatrix for removing a row for a given number of times.
				benchmarkMemory(
					new (class implements IMemoryTestObject {
						readonly title = `Remove the middle row ${count} times`;
						private localMatrix: SharedMatrix | undefined;

						async run(): Promise<void> {
							if (this.localMatrix === undefined) {
								throw new Error("localMatrix is not initialized");
							}

							for (let i = 0; i < Math.min(count, matrixSize); i++) {
								this.localMatrix.removeRows(Math.floor(this.localMatrix.rowCount / 2), 1);
							}
						}

						beforeIteration(): void {
							this.localMatrix = createLocalMatrix({
								id: "testLocalMatrix",
								size: matrixSize,
								initialValue: matrixValue,
							});
						}
					})(),
				);

				// Test the memory usage of the SharedMatrix for removing a row and a column in the middle for a given number of times.
				benchmarkMemory(
					new (class implements IMemoryTestObject {
						readonly title = `Remove a row and a column ${count} times`;
						private localMatrix: SharedMatrix | undefined;

						async run(): Promise<void> {
							if (this.localMatrix === undefined) {
								throw new Error("localMatrix is not initialized");
							}

							for (let i = 0; i < count; i++) {
								this.localMatrix.removeCols(Math.floor(this.localMatrix.colCount / 2), 1);
								this.localMatrix.removeRows(Math.floor(this.localMatrix.rowCount / 2), 1);
							}
						}

						beforeIteration(): void {
							this.localMatrix = createLocalMatrix({
								id: "testLocalMatrix",
								size: matrixSize,
								initialValue: matrixValue,
							});
						}
					})(),
				);

				// Test the memory usage of the SharedMatrix for setting a string in a cell for a given number of times.
				benchmarkMemory(
					new (class implements IMemoryTestObject {
						readonly title = `Set a 3-character string in ${count} cells`;
						private localMatrix: SharedMatrix | undefined;

						async run(): Promise<void> {
							if (this.localMatrix === undefined) {
								throw new Error("localMatrix is not initialized");
							}

							for (let i = 0; i < count; i++) {
								this.localMatrix.setCell(i, i, "abc");
							}
						}

						beforeIteration(): void {
							this.localMatrix = createLocalMatrix({
								id: "testLocalMatrix",
								size: matrixSize,
								initialValue: matrixValue,
							});
						}
					})(),
				);
			}
		});
	}
});
