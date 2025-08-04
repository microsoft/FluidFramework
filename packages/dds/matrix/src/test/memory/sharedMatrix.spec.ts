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

import type { ISharedMatrix } from "../../index.js";
import { UndoRedoStackManager } from "../undoRedoStackManager.js";
import { createLocalMatrix } from "../utils.js";

/**
 * Note: These benchmarks are designed to closely match the benchmarks in SharedTree.
 * If you modify or add tests here, consider updating the corresponding SharedTree benchmarks as well
 * to ensure consistency and comparability between the two implementations.
 */

/**
 * Creates a benchmark for undo operations on a SharedMatrix.
 */
function createUndoBenchmark({
	title,
	matrixSize,
	initialValue,
	operationCount,
	stackCount,
	operation,
}: {
	title: string;
	matrixSize: number;
	initialValue: string;
	operationCount: number;
	stackCount: number;
	operation: (matrix: ISharedMatrix, count: number) => void;
}): IMemoryTestObject {
	return new (class implements IMemoryTestObject {
		readonly title = title;
		private localMatrix: ISharedMatrix | undefined;
		private undoStack: UndoRedoStackManager | undefined;

		async run(): Promise<void> {
			assert(this.undoStack !== undefined, "undoStack is not initialized");
			assert.equal(this.undoStack.undoStackLength, stackCount);
			for (let i = 0; i < stackCount; i++) {
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
			operation(this.localMatrix, operationCount);
		}
	})();
}

/**
 * Creates a benchmark for redo operations on a SharedMatrix.
 */
function createRedoBenchmark({
	title,
	matrixSize,
	initialValue,
	operationCount,
	stackCount,
	operation,
}: {
	title: string;
	matrixSize: number;
	initialValue: string;
	operationCount: number;
	stackCount: number;
	operation: (matrix: ISharedMatrix, count: number) => void;
}): IMemoryTestObject {
	return new (class implements IMemoryTestObject {
		readonly title = title;
		private localMatrix: ISharedMatrix | undefined;
		private redoStack: UndoRedoStackManager | undefined;

		async run(): Promise<void> {
			assert(this.redoStack !== undefined, "redoStack is not initialized");
			assert.equal(this.redoStack.redoStackLength, stackCount);
			for (let i = 0; i < stackCount; i++) {
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
			this.localMatrix.openUndo(this.redoStack);
			operation(this.localMatrix, operationCount);
			assert.equal(this.redoStack.undoStackLength, stackCount);
			for (let i = 0; i < stackCount; i++) {
				this.redoStack.undoOperation();
			}
		}
	})();
}

describe("SharedMatrix memory usage", () => {
	// The value to be set in the cells of the matrix.
	const matrixValue = "cellValue";
	// The test matrix's size will be 10*10, 100*100.
	// Matrix size 1000 benchmarks removed due to high overhead and unreliable results.
	const matrixSizes = isInPerformanceTestingMode
		? [10, 100]
		: // When not measuring perf, use a single smaller data size so the tests run faster.
			[10];

	// The number of operations to perform on the matrix.
	// Operation counts 1000 removed due to high overhead and unreliable results.
	const operationCounts = isInPerformanceTestingMode
		? [10, 100]
		: // When not measuring perf, use a single smaller data size so the tests run faster.
			[5];

	// IMPORTANT: variables scoped to the test suite are a big problem for memory-profiling tests
	// because they won't be out of scope when we garbage-collect between runs of the same test,
	// and that will skew measurements. Tests should allocate all the memory they need using local
	// variables scoped to the test function itself, so several iterations of a given test can
	// measure from the same baseline (as much as possible).

	beforeEach(async () => {
		// CAREFUL: usually beforeEach/afterEach hooks are used to initialize or interact with variables
		// whose scope is the encompassing test suite, but that's a problem for memory-profiling tests.
		// See the comment at the top of the test suite for more details.
	});

	afterEach(() => {
		// CAREFUL: usually beforeEach/afterEach hooks are used to initialize or interact with variables
		// whose scope is the encompassing test suite, but that's a problem for memory-profiling tests.
		// See the comment at the top of the test suite for more details.
	});

	for (const matrixSize of matrixSizes) {
		describe(`Size of ${matrixSize}*${matrixSize} SharedMatrix`, () => {
			// Filter counts to ensure they do not exceed matrixSize
			const validRemoveCounts = operationCounts.filter((count) => count <= matrixSize);

			// Insert-related tests that are not limited by matrixSize
			for (const count of operationCounts) {
				describe(`Column Insertion`, () => {
					// Test the memory usage of the SharedMatrix for inserting a column in the middle for a given number of times.
					benchmarkMemory(
						new (class implements IMemoryTestObject {
							readonly title = `Insert a column in the middle ${count} times`;
							private localMatrix: ISharedMatrix | undefined;

							async run(): Promise<void> {
								assert(this.localMatrix !== undefined, "localMatrix is not initialized");
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

					// Test the memory usage of the SharedMatrix for undoing the insertion of a column in the middle for a given number of times.
					benchmarkMemory(
						createUndoBenchmark({
							title: `Undo insert column in the middle ${count} times`,
							matrixSize,
							initialValue: matrixValue,
							operationCount: count,
							stackCount: count,
							operation: (matrix, operationCount) => {
								for (let i = 0; i < operationCount; i++) {
									matrix.insertCols(Math.floor(matrix.colCount / 2), 1);
								}
							},
						}),
					);

					// Test the memory usage of the SharedMatrix for redoing the insertion of a column in the middle for a given number of times.
					benchmarkMemory(
						createRedoBenchmark({
							title: `Redo insert column in the middle ${count} times`,
							matrixSize,
							initialValue: matrixValue,
							operationCount: count,
							stackCount: count,
							operation: (matrix, operationCount) => {
								for (let i = 0; i < operationCount; i++) {
									matrix.insertCols(Math.floor(matrix.colCount / 2), 1);
								}
							},
						}),
					);
				});

				describe("Row Insertion", () => {
					// Test the memory usage of the SharedMatrix for inserting a row in the middle for a given number of times.
					benchmarkMemory(
						new (class implements IMemoryTestObject {
							readonly title = `Insert a row in the middle ${count} times`;
							private localMatrix: ISharedMatrix | undefined;

							async run(): Promise<void> {
								assert(this.localMatrix !== undefined, "localMatrix is not initialized");
								for (let i = 0; i < count; i++) {
									this.localMatrix.insertRows(Math.floor(this.localMatrix.colCount / 2), 1);
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

					// Test the memory usage of the SharedMatrix for undoing the insertion of a row in the middle for a given number of times.
					benchmarkMemory(
						createUndoBenchmark({
							title: `Undo insert row in the middle ${count} times`,
							matrixSize,
							initialValue: matrixValue,
							operationCount: count,
							stackCount: count,
							operation: (matrix, operationCount) => {
								for (let i = 0; i < operationCount; i++) {
									matrix.insertRows(Math.floor(matrix.colCount / 2), 1);
								}
							},
						}),
					);

					// Test the memory usage of the SharedMatrix for redoing the insertion of a row in the middle for a given number of times.
					benchmarkMemory(
						createRedoBenchmark({
							title: `Redo insert row in the middle ${count} times`,
							matrixSize,
							initialValue: matrixValue,
							operationCount: count,
							stackCount: count,
							operation: (matrix, operationCount) => {
								for (let i = 0; i < operationCount; i++) {
									matrix.insertRows(Math.floor(matrix.colCount / 2), 1);
								}
							},
						}),
					);
				});

				describe("Row and Column Insertion", () => {
					// Test the memory usage of the SharedMatrix for inserting a row and a column in the middle for a given number of times.
					benchmarkMemory(
						new (class implements IMemoryTestObject {
							readonly title = `Insert a row and a column ${count} times`;
							private localMatrix: ISharedMatrix | undefined;

							async run(): Promise<void> {
								assert(this.localMatrix !== undefined, "localMatrix is not initialized");
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

					// Test the memory usage of the SharedMatrix for undoing the insertion of a row and a column in the middle for a given number of times.
					benchmarkMemory(
						createUndoBenchmark({
							title: `Undo insert a row and a column ${count} times`,
							matrixSize,
							initialValue: matrixValue,
							operationCount: count,
							stackCount: 2 * count,
							operation: (matrix, operationCount) => {
								for (let i = 0; i < operationCount; i++) {
									matrix.insertCols(Math.floor(matrix.colCount / 2), 1);
									matrix.insertRows(Math.floor(matrix.rowCount / 2), 1);
								}
							},
						}),
					);

					// Test the memory usage of the SharedMatrix for redoing the insertion of a row and a column in the middle for a given number of times.
					benchmarkMemory(
						createRedoBenchmark({
							title: `Redo insert a row and a column ${count} times`,
							matrixSize,
							initialValue: matrixValue,
							operationCount: count,
							stackCount: 2 * count,
							operation: (matrix, operationCount) => {
								for (let i = 0; i < operationCount; i++) {
									matrix.insertCols(Math.floor(matrix.colCount / 2), 1);
									matrix.insertRows(Math.floor(matrix.rowCount / 2), 1);
								}
							},
						}),
					);
				});

				/**
				 * Test the memory usage of the SharedMatrix for inserting a column and a row
				 * and then removing them right away to see if the memory is released.
				 * Memory usage should be very low for these test cases.
				 */
				describe("Row and Column Insertion and Removal right away", () => {
					// Test the memory usage of the SharedMatrix for inserting a row and a column and then removing them right away for a given number of times.
					benchmarkMemory(
						new (class implements IMemoryTestObject {
							readonly title = `Insert a row and a column ${count} times`;
							private localMatrix: ISharedMatrix | undefined;

							async run(): Promise<void> {
								assert(this.localMatrix !== undefined, "localMatrix is not initialized");
								for (let i = 0; i < count; i++) {
									this.localMatrix.insertCols(Math.floor(this.localMatrix.colCount / 2), 1);
									this.localMatrix.insertRows(Math.floor(this.localMatrix.rowCount / 2), 1);
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

					// Test the memory usage of the SharedMatrix for undoing the insertion of a row and a column and then removing them right away for a given number of times.
					benchmarkMemory(
						createUndoBenchmark({
							title: `Undo insert a row and a column ${count} times`,
							matrixSize,
							initialValue: matrixValue,
							operationCount: count,
							stackCount: 4 * count,
							operation: (matrix, operationCount) => {
								for (let i = 0; i < operationCount; i++) {
									matrix.insertCols(Math.floor(matrix.colCount / 2), 1);
									matrix.insertRows(Math.floor(matrix.rowCount / 2), 1);
									matrix.removeCols(Math.floor(matrix.colCount / 2), 1);
									matrix.removeRows(Math.floor(matrix.rowCount / 2), 1);
								}
							},
						}),
					);

					// Test the memory usage of the SharedMatrix for redoing the insertion of a row and a column and then removing them right away for a given number of times.
					benchmarkMemory(
						createRedoBenchmark({
							title: `Redo insert a row and a column ${count} times`,
							matrixSize,
							initialValue: matrixValue,
							operationCount: count,
							stackCount: 4 * count,
							operation: (matrix, operationCount) => {
								for (let i = 0; i < operationCount; i++) {
									matrix.insertCols(Math.floor(matrix.colCount / 2), 1);
									matrix.insertRows(Math.floor(matrix.rowCount / 2), 1);
									matrix.removeCols(Math.floor(matrix.colCount / 2), 1);
									matrix.removeRows(Math.floor(matrix.rowCount / 2), 1);
								}
							},
						}),
					);
				});
			}

			// Remove-related tests that operation counts are up to matrixSize
			for (const count of validRemoveCounts) {
				describe("Column Removal", () => {
					// Test the memory usage of the SharedMatrix for removing a column in the middle for a given number of times.
					benchmarkMemory(
						new (class implements IMemoryTestObject {
							readonly title = `Remove the middle column ${count} times`;
							private localMatrix: ISharedMatrix | undefined;

							async run(): Promise<void> {
								assert(this.localMatrix !== undefined, "localMatrix is not initialized");
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

					// Test the memory usage of the SharedMatrix for undoing the removal of a column in the middle for a given number of times.
					benchmarkMemory(
						createUndoBenchmark({
							title: `Undo remove the middle column ${count} times`,
							matrixSize,
							initialValue: matrixValue,
							operationCount: count,
							stackCount: count,
							operation: (matrix, operationCount) => {
								for (let i = 0; i < operationCount; i++) {
									matrix.removeCols(Math.floor(matrix.colCount / 2), 1);
								}
							},
						}),
					);

					// Test the memory usage of the SharedMatrix for redoing the removal of a column in the middle for a given number of times.
					benchmarkMemory(
						createRedoBenchmark({
							title: `Redo remove the middle column ${count} times`,
							matrixSize,
							initialValue: matrixValue,
							operationCount: count,
							stackCount: count,
							operation: (matrix, operationCount) => {
								for (let i = 0; i < operationCount; i++) {
									matrix.removeCols(Math.floor(matrix.colCount / 2), 1);
								}
							},
						}),
					);
				});

				describe("Row Removal", () => {
					// Test the memory usage of the SharedMatrix for removing a row in the middle for a given number of times.
					benchmarkMemory(
						new (class implements IMemoryTestObject {
							readonly title = `Remove the middle row ${count} times`;
							private localMatrix: ISharedMatrix | undefined;

							async run(): Promise<void> {
								assert(this.localMatrix !== undefined, "localMatrix is not initialized");
								for (let i = 0; i < count; i++) {
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

					// Test the memory usage of the SharedMatrix for undoing the removal of a row in the middle for a given number of times.
					benchmarkMemory(
						createUndoBenchmark({
							title: `Undo remove the middle row ${count} times`,
							matrixSize,
							initialValue: matrixValue,
							operationCount: count,
							stackCount: count,
							operation: (matrix, operationCount) => {
								for (let i = 0; i < operationCount; i++) {
									matrix.removeRows(Math.floor(matrix.rowCount / 2), 1);
								}
							},
						}),
					);

					// Test the memory usage of the SharedMatrix for redoing the removal of a row in the middle for a given number of times.
					benchmarkMemory(
						createRedoBenchmark({
							title: `Redo remove the middle row ${count} times`,
							matrixSize,
							initialValue: matrixValue,
							operationCount: count,
							stackCount: count,
							operation: (matrix, operationCount) => {
								for (let i = 0; i < operationCount; i++) {
									matrix.removeRows(Math.floor(matrix.rowCount / 2), 1);
								}
							},
						}),
					);
				});

				describe("Row and Column Removal", () => {
					// Test the memory usage of the SharedMatrix for removing a row and a column in the middle for a given number of times.
					benchmarkMemory(
						new (class implements IMemoryTestObject {
							readonly title = `Remove a row and a column ${count} times`;
							private localMatrix: ISharedMatrix | undefined;

							async run(): Promise<void> {
								assert(this.localMatrix !== undefined, "localMatrix is not initialized");
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

					// Test the memory usage of the SharedMatrix for undoing the removal of a row and a column in the middle for a given number of times.
					benchmarkMemory(
						createUndoBenchmark({
							title: `Undo remove a row and a column ${count} times`,
							matrixSize,
							initialValue: matrixValue,
							operationCount: count,
							stackCount: 2 * count,
							operation: (matrix, operationCount) => {
								for (let i = 0; i < operationCount; i++) {
									matrix.removeCols(Math.floor(matrix.colCount / 2), 1);
									matrix.removeRows(Math.floor(matrix.rowCount / 2), 1);
								}
							},
						}),
					);

					// Test the memory usage of the SharedMatrix for redoing the removal of a row and a column in the middle for a given number of times.
					benchmarkMemory(
						createRedoBenchmark({
							title: `Redo remove a row and a column ${count} times`,
							matrixSize,
							initialValue: matrixValue,
							operationCount: count,
							stackCount: 2 * count,
							operation: (matrix, operationCount) => {
								for (let i = 0; i < operationCount; i++) {
									matrix.removeCols(Math.floor(matrix.colCount / 2), 1);
									matrix.removeRows(Math.floor(matrix.rowCount / 2), 1);
								}
							},
						}),
					);
				});

				describe("Cell Value Setting", () => {
					// Test the memory usage of the SharedMatrix for setting a 3-character string in a given number of cells.
					benchmarkMemory(
						new (class implements IMemoryTestObject {
							readonly title = `Set a 3-character string in ${count} cells`;
							private localMatrix: ISharedMatrix | undefined;

							async run(): Promise<void> {
								assert(this.localMatrix !== undefined, "localMatrix is not initialized");
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

					// Test the memory usage of the SharedMatrix for undoing the setting of a 3-character string in a given number of cells.
					benchmarkMemory(
						createUndoBenchmark({
							title: `Undo setting a 3-character string in ${count} cells`,
							matrixSize,
							initialValue: matrixValue,
							operationCount: count,
							stackCount: count,
							operation: (matrix, operationCount) => {
								for (let i = 0; i < operationCount; i++) {
									matrix.setCell(i, i, "abc");
								}
							},
						}),
					);

					// Test the memory usage of the SharedMatrix for redoing the setting of a 3-character string in a given number of cells.
					benchmarkMemory(
						createRedoBenchmark({
							title: `Redo setting a 3-character string in ${count} cells`,
							matrixSize,
							initialValue: matrixValue,
							operationCount: count,
							stackCount: count,
							operation: (matrix, operationCount) => {
								for (let i = 0; i < operationCount; i++) {
									matrix.setCell(i, i, "abc");
								}
							},
						}),
					);
				});
			}
		});
	}
});
