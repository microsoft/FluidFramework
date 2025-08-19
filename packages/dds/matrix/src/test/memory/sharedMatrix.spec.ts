/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	type IMemoryTestObject,
	benchmarkMemory,
	isInPerformanceTestingMode,
} from "@fluid-tools/benchmark";
import type { IMatrixConsumer } from "@tiny-calc/nano";

import type { ISharedMatrix } from "../../index.js";
import { UndoRedoStackManager } from "../undoRedoStackManager.js";
import { createLocalMatrix, type TestMatrixOptions } from "../utils.js";

/**
 * Note: These benchmarks are designed to closely match the benchmarks in SharedTree.
 * If you modify or add tests here, consider updating the corresponding SharedTree benchmarks as well
 * to ensure consistency and comparability between the two implementations.
 */

// TODOs (AB#46340):
// - single helper function with before and after hooks for setup and teardown
// - unify with time measurement tests (in terms of API)

/**
 * Initializes a SharedMatrix for testing.
 * @remarks Includes initialization of the undo/redo stack, as well as mock event subscriptions.
 */
function createMatrix(options: TestMatrixOptions): {
	/**
	 * The initialized matrix.
	 */
	matrix: ISharedMatrix;

	/**
	 * The undo/redo stack manager for the matrix.
	 */
	undoRedoStack: UndoRedoStackManager;

	/**
	 * Cleanup function to run after the test to close the matrix and release resources.
	 */
	cleanUp: () => void;
} {
	const matrix = createLocalMatrix(options);

	// Configure event listeners
	const eventListeners: IMatrixConsumer<string> = {
		rowsChanged: () => {},
		colsChanged: () => {},
		cellsChanged: () => {},
	};
	matrix.openMatrix(eventListeners);

	// Configure undo/redo
	const undoRedoStack = new UndoRedoStackManager();
	matrix.openUndo(undoRedoStack);

	const cleanUp = (): void => {
		matrix.closeMatrix(eventListeners);
	};

	return {
		matrix,
		undoRedoStack,
		cleanUp,
	};
}

/**
 * {@link createBenchmark} options.
 */
interface BenchmarkOptions extends TestMatrixOptions {
	/**
	 * The title of the benchmark test.
	 */
	readonly title: string;

	/**
	 * The operation to be measured.
	 */
	readonly operation: (matrix: ISharedMatrix) => void;
}

/**
 * Creates a benchmark for operations on a SharedMatrix.
 */
function createBenchmark({
	title,
	matrixSize,
	initialCellValue,
	operation,
}: BenchmarkOptions): IMemoryTestObject {
	return new (class implements IMemoryTestObject {
		readonly title = title;

		private matrix: ISharedMatrix | undefined;
		private cleanUp: (() => void) | undefined;

		async run(): Promise<void> {
			assert(this.matrix !== undefined, "matrix is not initialized");
			operation(this.matrix);
		}

		beforeIteration(): void {
			const {
				matrix,
				undoRedoStack: undoStack,
				cleanUp,
			} = createMatrix({
				matrixSize,
				initialCellValue,
			});
			this.matrix = matrix;
			this.cleanUp = cleanUp;
		}

		afterIteration(): void {
			assert(this.cleanUp !== undefined, "cleanUp is not initialized");

			this.cleanUp();
			this.matrix = undefined;
			this.cleanUp = undefined;
		}
	})();
}

interface UndoRedoBenchmarkOptions extends BenchmarkOptions {
	/**
	 * The number of times undo/redo operations should be performed.
	 */
	readonly stackCount: number;
}

/**
 * Creates a benchmark for undo operations on a SharedMatrix.
 */
function createUndoBenchmark({
	title,
	matrixSize,
	initialCellValue,
	stackCount,
	operation,
}: UndoRedoBenchmarkOptions): IMemoryTestObject {
	return new (class implements IMemoryTestObject {
		readonly title = title;

		private matrix: ISharedMatrix | undefined;
		private undoRedoStack: UndoRedoStackManager | undefined;
		private cleanUp: (() => void) | undefined;

		async run(): Promise<void> {
			assert(this.undoRedoStack !== undefined, "undoRedoStack is not initialized");
			for (let i = 0; i < stackCount; i++) {
				this.undoRedoStack.undoOperation();
			}
		}

		beforeIteration(): void {
			const {
				matrix,
				undoRedoStack: undoStack,
				cleanUp,
			} = createMatrix({
				matrixSize,
				initialCellValue,
			});
			this.matrix = matrix;
			this.undoRedoStack = undoStack;
			this.cleanUp = cleanUp;

			operation(this.matrix);
			assert.equal(this.undoRedoStack.undoStackLength, stackCount);
		}

		afterIteration(): void {
			assert(this.cleanUp !== undefined, "cleanUp is not initialized");

			this.cleanUp();
			this.matrix = undefined;
			this.cleanUp = undefined;
		}
	})();
}

/**
 * Creates a benchmark for redo operations on a SharedMatrix.
 */
function createRedoBenchmark({
	title,
	matrixSize,
	initialCellValue,
	stackCount,
	operation,
}: UndoRedoBenchmarkOptions): IMemoryTestObject {
	return new (class implements IMemoryTestObject {
		readonly title = title;

		private matrix: ISharedMatrix | undefined;
		private undoRedoStack: UndoRedoStackManager | undefined;
		private cleanUp: (() => void) | undefined;

		async run(): Promise<void> {
			assert(this.undoRedoStack !== undefined, "undoRedoStack is not initialized");
			for (let i = 0; i < stackCount; i++) {
				this.undoRedoStack.redoOperation();
			}
		}

		beforeIteration(): void {
			const { matrix, undoRedoStack, cleanUp } = createMatrix({
				matrixSize,
				initialCellValue,
			});
			this.matrix = matrix;
			this.undoRedoStack = undoRedoStack;
			this.cleanUp = cleanUp;

			operation(this.matrix);
			assert.equal(this.undoRedoStack.undoStackLength, stackCount);

			for (let i = 0; i < stackCount; i++) {
				this.undoRedoStack.undoOperation();
			}
			assert.equal(this.undoRedoStack.undoStackLength, 0);
			assert.equal(this.undoRedoStack.redoStackLength, stackCount);
		}

		afterIteration(): void {
			assert(this.cleanUp !== undefined, "cleanUp is not initialized");

			this.cleanUp();
			this.matrix = undefined;
			this.cleanUp = undefined;
		}
	})();
}

describe("SharedMatrix memory usage", () => {
	// The value to be set in the cells of the matrix.
	const initialCellValue = "cellValue";

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
						createBenchmark({
							title: `Insert a column in the middle ${count} times`,
							matrixSize,
							initialCellValue,
							operation: (matrix) => {
								for (let i = 0; i < count; i++) {
									matrix.insertCols(Math.floor(matrix.colCount / 2), 1);
								}
							},
						}),
					);

					// Test the memory usage of the SharedMatrix for undoing the insertion of a column in the middle for a given number of times.
					benchmarkMemory(
						createUndoBenchmark({
							title: `Undo insert column in the middle ${count} times`,
							matrixSize,
							initialCellValue,
							stackCount: count,
							operation: (matrix) => {
								for (let i = 0; i < count; i++) {
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
							initialCellValue,
							stackCount: count,
							operation: (matrix) => {
								for (let i = 0; i < count; i++) {
									matrix.insertCols(Math.floor(matrix.colCount / 2), 1);
								}
							},
						}),
					);
				});

				describe("Row Insertion", () => {
					// Test the memory usage of the SharedMatrix for inserting a row in the middle for a given number of times.
					benchmarkMemory(
						createBenchmark({
							title: `Insert a row in the middle ${count} times`,
							matrixSize,
							initialCellValue,
							operation: (matrix) => {
								for (let i = 0; i < count; i++) {
									matrix.insertRows(Math.floor(matrix.colCount / 2), 1);
								}
							},
						}),
					);

					// Test the memory usage of the SharedMatrix for undoing the insertion of a row in the middle for a given number of times.
					benchmarkMemory(
						createUndoBenchmark({
							title: `Undo insert row in the middle ${count} times`,
							matrixSize,
							initialCellValue,
							stackCount: count,
							operation: (matrix) => {
								for (let i = 0; i < count; i++) {
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
							initialCellValue,
							stackCount: count,
							operation: (matrix) => {
								for (let i = 0; i < count; i++) {
									matrix.insertRows(Math.floor(matrix.colCount / 2), 1);
								}
							},
						}),
					);
				});

				describe("Row and Column Insertion", () => {
					// Test the memory usage of the SharedMatrix for inserting a row and a column in the middle for a given number of times.
					benchmarkMemory(
						createBenchmark({
							title: `Insert a row and a column ${count} times`,
							matrixSize,
							initialCellValue,
							operation: (matrix) => {
								for (let i = 0; i < count; i++) {
									matrix.insertCols(Math.floor(matrix.colCount / 2), 1);
									matrix.insertRows(Math.floor(matrix.rowCount / 2), 1);
								}
							},
						}),
					);

					// Test the memory usage of the SharedMatrix for undoing the insertion of a row and a column in the middle for a given number of times.
					benchmarkMemory(
						createUndoBenchmark({
							title: `Undo insert a row and a column ${count} times`,
							matrixSize,
							initialCellValue,
							stackCount: 2 * count,
							operation: (matrix) => {
								for (let i = 0; i < count; i++) {
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
							initialCellValue,
							stackCount: 2 * count,
							operation: (matrix) => {
								for (let i = 0; i < count; i++) {
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
						createBenchmark({
							title: `Insert and remove a row and a column ${count} times`,
							matrixSize,
							initialCellValue,
							operation: (matrix) => {
								for (let i = 0; i < count; i++) {
									matrix.insertCols(Math.floor(matrix.colCount / 2), 1);
									matrix.insertRows(Math.floor(matrix.rowCount / 2), 1);
									matrix.removeCols(Math.floor(matrix.colCount / 2), 1);
									matrix.removeRows(Math.floor(matrix.rowCount / 2), 1);
								}
							},
						}),
					);

					// Test the memory usage of the SharedMatrix for undoing the insertion of a row and a column and then removing them right away for a given number of times.
					benchmarkMemory(
						createUndoBenchmark({
							title: `Undo insert and remove a row and a column ${count} times`,
							matrixSize,
							initialCellValue,
							stackCount: 4 * count,
							operation: (matrix) => {
								for (let i = 0; i < count; i++) {
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
							initialCellValue,
							stackCount: 4 * count,
							operation: (matrix) => {
								for (let i = 0; i < count; i++) {
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
						createBenchmark({
							title: `Remove the middle column ${count} times`,
							matrixSize,
							initialCellValue,
							operation: (matrix) => {
								for (let i = 0; i < count; i++) {
									matrix.removeCols(Math.floor(matrix.colCount / 2), 1);
								}
							},
						}),
					);

					// Test the memory usage of the SharedMatrix for undoing the removal of a column in the middle for a given number of times.
					benchmarkMemory(
						createUndoBenchmark({
							title: `Undo remove the middle column ${count} times`,
							matrixSize,
							initialCellValue,
							stackCount: count,
							operation: (matrix) => {
								for (let i = 0; i < count; i++) {
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
							initialCellValue,
							stackCount: count,
							operation: (matrix) => {
								for (let i = 0; i < count; i++) {
									matrix.removeCols(Math.floor(matrix.colCount / 2), 1);
								}
							},
						}),
					);
				});

				describe("Row Removal", () => {
					// Test the memory usage of the SharedMatrix for removing a row in the middle for a given number of times.
					benchmarkMemory(
						createBenchmark({
							title: `Remove the middle row ${count} times`,
							matrixSize,
							initialCellValue,
							operation: (matrix) => {
								for (let i = 0; i < count; i++) {
									matrix.removeRows(Math.floor(matrix.rowCount / 2), 1);
								}
							},
						}),
					);

					// Test the memory usage of the SharedMatrix for undoing the removal of a row in the middle for a given number of times.
					benchmarkMemory(
						createUndoBenchmark({
							title: `Undo remove the middle row ${count} times`,
							matrixSize,
							initialCellValue,
							stackCount: count,
							operation: (matrix) => {
								for (let i = 0; i < count; i++) {
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
							initialCellValue,
							stackCount: count,
							operation: (matrix) => {
								for (let i = 0; i < count; i++) {
									matrix.removeRows(Math.floor(matrix.rowCount / 2), 1);
								}
							},
						}),
					);
				});

				describe("Row and Column Removal", () => {
					// Test the memory usage of the SharedMatrix for removing a row and a column in the middle for a given number of times.
					benchmarkMemory(
						createBenchmark({
							title: `Remove a row and a column ${count} times`,
							matrixSize,
							initialCellValue,
							operation: (matrix) => {
								for (let i = 0; i < count; i++) {
									matrix.removeCols(Math.floor(matrix.colCount / 2), 1);
									matrix.removeRows(Math.floor(matrix.rowCount / 2), 1);
								}
							},
						}),
					);

					// Test the memory usage of the SharedMatrix for undoing the removal of a row and a column in the middle for a given number of times.
					benchmarkMemory(
						createUndoBenchmark({
							title: `Undo remove a row and a column ${count} times`,
							matrixSize,
							initialCellValue,
							stackCount: 2 * count,
							operation: (matrix) => {
								for (let i = 0; i < count; i++) {
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
							initialCellValue,
							stackCount: 2 * count,
							operation: (matrix) => {
								for (let i = 0; i < count; i++) {
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
						createBenchmark({
							title: `Set a 3-character string in ${count} cells`,
							matrixSize,
							initialCellValue,
							operation: (matrix) => {
								for (let i = 0; i < count; i++) {
									matrix.setCell(i, i, "abc");
								}
							},
						}),
					);

					// Test the memory usage of the SharedMatrix for undoing the setting of a 3-character string in a given number of cells.
					benchmarkMemory(
						createUndoBenchmark({
							title: `Undo setting a 3-character string in ${count} cells`,
							matrixSize,
							initialCellValue,
							stackCount: count,
							operation: (matrix) => {
								for (let i = 0; i < count; i++) {
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
							initialCellValue,
							stackCount: count,
							operation: (matrix) => {
								for (let i = 0; i < count; i++) {
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
