/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert";

import {
	type IMemoryTestObject,
	benchmarkMemory,
	isInPerformanceTestingMode,
} from "@fluid-tools/benchmark";

import { SharedMatrix } from "../../index.js";
import { UndoRedoStackManager } from "../undoRedoStackManager.js";
import { createLocalMatrix } from "../utils.js";

// This function creates a benchmark for undo operations on a SharedMatrix.
function createUndoBenchmark({
	title,
	matrixSize,
	initialValue,
	operation,
	count,
}: {
	title: string;
	matrixSize: number;
	initialValue: string;
	operation: (matrix: SharedMatrix, count: number) => void;
	count: number;
}): IMemoryTestObject {
	return new (class implements IMemoryTestObject {
		readonly title = title;
		private localMatrix: SharedMatrix | undefined;
		private undoStack: UndoRedoStackManager | undefined;

		async run(): Promise<void> {
			assert(this.undoStack !== undefined, "undoStack is not initialized");
			for (let i = 0; i < count; i++) {
				this.undoStack.undoOperation();
			}
		}

		beforeIteration(): void {
			this.localMatrix = createLocalMatrix({
				id: "testLocalMatrix",
				size: matrixSize,
				initialValue,
			});
			this.undoStack = new UndoRedoStackManager();
			this.localMatrix.openUndo(this.undoStack);
			operation(this.localMatrix, count);
		}
	})();
}

// This function creates a benchmark for redo operations on a SharedMatrix.
function createRedoBenchmark({
	title,
	matrixSize,
	initialValue,
	operation,
	count,
}: {
	title: string;
	matrixSize: number;
	initialValue: string;
	operation: (matrix: SharedMatrix, count: number) => void;
	count: number;
}): IMemoryTestObject {
	return new (class implements IMemoryTestObject {
		readonly title = title;
		private localMatrix: SharedMatrix | undefined;
		private redoStack: UndoRedoStackManager | undefined;

		async run(): Promise<void> {
			assert(this.redoStack !== undefined, "redoStack is not initialized");
			for (let i = 0; i < count; i++) {
				this.redoStack.redoOperation();
			}
		}

		beforeIteration(): void {
			this.localMatrix = createLocalMatrix({
				id: "testLocalMatrix",
				size: matrixSize,
				initialValue,
			});
			this.redoStack = new UndoRedoStackManager();
			operation(this.localMatrix, count);
		}
	})();
}

describe("SharedMatrix memory usage", () => {
	// The value to be set in the cells of the matrix.
	const matrixValue = "cellValue";
	// The test matrix's size will be 10*10, 100*100.
	const matrixSizes = isInPerformanceTestingMode
		? [10, 100]
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

			// Insert-related tests that are not limited by matrixSize
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
				 * and then removing them right away to see if the memory is released.
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

				// Test the memory usage of the SharedMatrix for undoing an insert column in the middle operation.
				benchmarkMemory(
					createUndoBenchmark({
						title: `Undo insert column in the middle ${count} times`,
						matrixSize,
						initialValue: matrixValue,
						count,
						operation: (matrix, operationCount) => {
							for (let i = 0; i < operationCount; i++) {
								matrix.insertCols(Math.floor(matrix.colCount / 2), 1);
							}
						},
					}),
				);

				// Test the memory usage of the SharedMatrix for undoing an insert row in the middle operation.
				benchmarkMemory(
					createUndoBenchmark({
						title: `Undo insert row in the middle ${count} times`,
						matrixSize,
						initialValue: matrixValue,
						count,
						operation: (matrix, operationCount) => {
							for (let i = 0; i < operationCount; i++) {
								matrix.insertRows(Math.floor(matrix.rowCount / 2), 1);
							}
						},
					}),
				);

				// Test the memory usage of the SharedMatrix for undoing an insert row and column operation.
				benchmarkMemory(
					createUndoBenchmark({
						title: `Undo insert row and column ${count} times`,
						matrixSize,
						initialValue: matrixValue,
						count,
						operation: (matrix, operationCount) => {
							for (let i = 0; i < operationCount; i++) {
								matrix.insertCols(Math.floor(matrix.colCount / 2), 1);
								matrix.insertRows(Math.floor(matrix.rowCount / 2), 1);
							}
						},
					}),
				);

				// Test the memory usage of the SharedMatrix for undoing insert and immediate removal of row and column.
				benchmarkMemory(
					createUndoBenchmark({
						title: `Undo insert row and column and remove them right away ${count} times`,
						matrixSize,
						initialValue: matrixValue,
						count,
						operation: (matrix, operationCount) => {
							for (let i = 0; i < operationCount; i++) {
								const middleCol = Math.floor(matrix.colCount / 2);
								const middleRow = Math.floor(matrix.rowCount / 2);

								matrix.insertCols(middleCol, 1);
								matrix.removeCols(middleCol, 1);
								matrix.insertRows(middleRow, 1);
								matrix.removeRows(middleRow, 1);
							}
						},
					}),
				);

				// Test the memory usage of the SharedMatrix for redoing an insert column in the middle operation.
				benchmarkMemory(
					createRedoBenchmark({
						title: `Redo insert column in the middle ${count} times`,
						matrixSize,
						initialValue: matrixValue,
						count,
						operation: (matrix, operationCount) => {
							for (let i = 0; i < operationCount; i++) {
								matrix.insertCols(Math.floor(matrix.colCount / 2), 1);
							}
						},
					}),
				);

				// Test the memory usage of the SharedMatrix for redoing an insert row in the middle operation.
				benchmarkMemory(
					createRedoBenchmark({
						title: `Redo insert row in the middle ${count} times`,
						matrixSize,
						initialValue: matrixValue,
						count,
						operation: (matrix, operationCount) => {
							for (let i = 0; i < operationCount; i++) {
								matrix.insertRows(Math.floor(matrix.rowCount / 2), 1);
							}
						},
					}),
				);

				// Test the memory usage of the SharedMatrix for redoing an insert row and column operation.
				benchmarkMemory(
					createRedoBenchmark({
						title: `Redo insert row and column ${count} times`,
						matrixSize,
						initialValue: matrixValue,
						count,
						operation: (matrix, operationCount) => {
							for (let i = 0; i < operationCount; i++) {
								matrix.insertCols(Math.floor(matrix.colCount / 2), 1);
								matrix.insertRows(Math.floor(matrix.rowCount / 2), 1);
							}
						},
					}),
				);

				// Test the memory usage of the SharedMatrix for redoing insert and immediate removal of row and column.
				benchmarkMemory(
					createRedoBenchmark({
						title: `Redo insert row and column and remove them right away ${count} times`,
						matrixSize,
						initialValue: matrixValue,
						count,
						operation: (matrix, operationCount) => {
							for (let i = 0; i < operationCount; i++) {
								const middleCol = Math.floor(matrix.colCount / 2);
								const middleRow = Math.floor(matrix.rowCount / 2);

								matrix.insertCols(middleCol, 1);
								matrix.removeCols(middleCol, 1);
								matrix.insertRows(middleRow, 1);
								matrix.removeRows(middleRow, 1);
							}
						},
					}),
				);
			}

			// Remove-related tests that operation counts are up to matrixSize
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

				// Test the memory usage of the SharedMatrix for undoing the removal of columns from the middle.
				benchmarkMemory(
					createUndoBenchmark({
						title: `Undo remove column in the middle ${count} times`,
						matrixSize,
						initialValue: matrixValue,
						count,
						operation: (matrix, operationCount) => {
							for (let i = 0; i < operationCount; i++) {
								matrix.removeCols(Math.floor(matrix.colCount / 2), 1);
							}
						},
					}),
				);

				// Test the memory usage of the SharedMatrix for undoing the removal of rows from the middle.
				benchmarkMemory(
					createUndoBenchmark({
						title: `Undo remove row in the middle ${count} times`,
						matrixSize,
						initialValue: matrixValue,
						count,
						operation: (matrix, operationCount) => {
							for (let i = 0; i < operationCount; i++) {
								matrix.removeRows(Math.floor(matrix.rowCount / 2), 1);
							}
						},
					}),
				);

				// Test the memory usage of the SharedMatrix for undoing the removal of rows and columns from the middle.
				benchmarkMemory(
					createUndoBenchmark({
						title: `Undo remove row and column in the middle ${count} times`,
						matrixSize,
						initialValue: matrixValue,
						count,
						operation: (matrix, operationCount) => {
							for (let i = 0; i < operationCount; i++) {
								matrix.removeRows(Math.floor(matrix.rowCount / 2), 1);
								matrix.removeCols(Math.floor(matrix.colCount / 2), 1);
							}
						},
					}),
				);

				// Test the memory usage of the SharedMatrix for undoing setting cell values.
				benchmarkMemory(
					createUndoBenchmark({
						title: `Undo setting a 3-character string in ${count} cells`,
						matrixSize,
						initialValue: matrixValue,
						count,
						operation: (matrix, operationCount) => {
							for (let i = 0; i < operationCount; i++) {
								matrix.setCell(i, i, "abc");
							}
						},
					}),
				);

				// Test the memory usage of the SharedMatrix for redoing removal of columns from the middle.
				benchmarkMemory(
					createRedoBenchmark({
						title: `Redo remove column in the middle ${count} times`,
						matrixSize,
						initialValue: matrixValue,
						count,
						operation: (matrix, operationCount) => {
							for (let i = 0; i < operationCount; i++) {
								matrix.removeCols(Math.floor(matrix.colCount / 2), 1);
							}
						},
					}),
				);

				// Test the memory usage of the SharedMatrix for redoing removal of rows from the middle.
				benchmarkMemory(
					createRedoBenchmark({
						title: `Redo remove row in the middle ${count} times`,
						matrixSize,
						initialValue: matrixValue,
						count,
						operation: (matrix, operationCount) => {
							for (let i = 0; i < operationCount; i++) {
								matrix.removeRows(Math.floor(matrix.rowCount / 2), 1);
							}
						},
					}),
				);

				// Test the memory usage of the SharedMatrix for redoing removal of rows and columns from the middle.
				benchmarkMemory(
					createRedoBenchmark({
						title: `Redo remove row and column in the middle ${count} times`,
						matrixSize,
						initialValue: matrixValue,
						count,
						operation: (matrix, operationCount) => {
							for (let i = 0; i < operationCount; i++) {
								matrix.removeRows(Math.floor(matrix.rowCount / 2), 1);
								matrix.removeCols(Math.floor(matrix.colCount / 2), 1);
							}
						},
					}),
				);

				// Test the memory usage of the SharedMatrix for redoing setting cell values.
				benchmarkMemory(
					createRedoBenchmark({
						title: `Redo setting a 3-character string in ${count} cells`,
						matrixSize,
						initialValue: matrixValue,
						count,
						operation: (matrix, operationCount) => {
							for (let i = 0; i < operationCount; i++) {
								matrix.setCell(i, i, "abc");
							}
						},
					}),
				);
			}
		});
	}
});
