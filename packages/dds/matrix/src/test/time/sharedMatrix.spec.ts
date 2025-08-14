/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert";

import {
	benchmark,
	BenchmarkType,
	isInPerformanceTestingMode,
	type BenchmarkTimer,
	type BenchmarkTimingOptions,
} from "@fluid-tools/benchmark";
import type { IMatrixConsumer } from "@tiny-calc/nano";

import type { ISharedMatrix } from "../../index.js";
import { createLocalMatrix, type TestMatrixOptions } from "../performanceTestUtilities.js";
import { UndoRedoStackManager } from "../undoRedoStackManager.js";

/**
 * Note: These benchmarks are designed to closely match the benchmarks in SharedTree.
 * If you modify or add tests here, consider updating the corresponding SharedTree benchmarks as well
 * to ensure consistency and comparability between the two implementations.
 */

/**
 * {@link runBenchmark} configuration.
 */
interface BenchmarkConfig extends BenchmarkTimingOptions, TestMatrixOptions {
	/**
	 * The title of the benchmark test.
	 */
	readonly title: string;

	/**
	 * Optional action to perform on the matrix before the operation being measured.
	 */
	readonly beforeOperation?: (
		matrix: ISharedMatrix,
		undoRedoStack: UndoRedoStackManager,
	) => void;

	/**
	 * The operation to be measured.
	 */
	readonly operation: (matrix: ISharedMatrix, undoRedoStack: UndoRedoStackManager) => void;

	/**
	 * Optional action to perform on the matrix after the operation being measured.
	 */
	readonly afterOperation?: (
		matrix: ISharedMatrix,
		undoRedoStack: UndoRedoStackManager,
	) => void;

	/**
	 * {@inheritDoc @fluid-tools/benchmark#BenchmarkTimingOptions.maxBenchmarkDurationSeconds}
	 */
	readonly maxBenchmarkDurationSeconds: number;
}

/**
 * Runs a benchmark for measuring the execution time of operations on a SharedMatrix.
 */
function runBenchmark({
	title,
	matrixSize,
	initialCellValue,
	beforeOperation,
	operation,
	afterOperation,
	minBatchDurationSeconds = 0,
	maxBenchmarkDurationSeconds,
}: BenchmarkConfig): void {
	benchmark({
		type: BenchmarkType.Measurement,
		title,
		benchmarkFnCustom: async <T>(state: BenchmarkTimer<T>) => {
			let duration: number;
			do {
				assert.equal(state.iterationsPerBatch, 1, "Expected exactly one iteration per batch");

				// Create matrix
				const localMatrix = createLocalMatrix({
					matrixSize,
					initialCellValue,
				});

				// Configure event listeners
				const eventListeners: IMatrixConsumer<string> = {
					rowsChanged: () => {},
					colsChanged: () => {},
					cellsChanged: () => {},
				};
				localMatrix.openMatrix(eventListeners);

				// Configure undo/redo
				const undoRedoStack = new UndoRedoStackManager();
				localMatrix.openUndo(undoRedoStack);

				beforeOperation?.(localMatrix, undoRedoStack);

				// Operation
				const before = state.timer.now();
				operation(localMatrix, undoRedoStack);
				const after = state.timer.now();

				// Measure
				duration = state.timer.toSeconds(before, after);

				afterOperation?.(localMatrix, undoRedoStack);

				// Cleanup
				localMatrix.closeMatrix(eventListeners);
			} while (state.recordBatch(duration));
		},
		minBatchDurationSeconds,
		maxBenchmarkDurationSeconds,
	});
}

describe("SharedMatrix execution time", () => {
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
	let maxBenchmarkDurationSeconds: number;

	for (const matrixSize of matrixSizes) {
		maxBenchmarkDurationSeconds = matrixSize === 100 ? 10 : 5;
		describe(`Size of ${matrixSize}*${matrixSize} SharedMatrix`, () => {
			// Filter counts to ensure remove operation do not exceed matrixSize
			const validRemoveCounts = operationCounts.filter((count) => count <= matrixSize);

			// Insert-related tests that are not limited by matrixSize
			for (const count of operationCounts) {
				describe(`Column Insertion`, () => {
					// Test the execute time of the SharedMatrix for inserting a column in the middle for a given number of times.
					runBenchmark({
						title: `Insert a column in the middle ${count} times`,
						matrixSize,
						initialCellValue,
						operation: (matrix) => {
							for (let i = 0; i < count; i++) {
								matrix.insertCols(Math.floor(matrix.colCount / 2), 1);
							}
						},
						maxBenchmarkDurationSeconds,
					});

					// Test the execute time of the SharedMatrix for inserting a column in the middle for a given number of times.
					runBenchmark({
						title: `Undo insert the middle column ${count} times`,
						matrixSize,
						initialCellValue,
						beforeOperation: (matrix, undoRedoStack) => {
							for (let i = 0; i < count; i++) {
								matrix.insertCols(Math.floor(matrix.colCount / 2), 1);
							}
							assert.equal(undoRedoStack.undoStackLength, count);
						},
						operation: (_matrix, undoRedoStack) => {
							for (let i = 0; i < count; i++) {
								undoRedoStack.undoOperation();
							}
						},
						afterOperation: (_matrix, undoRedoStack) => {
							assert.equal(undoRedoStack.undoStackLength, 0);
						},
						maxBenchmarkDurationSeconds,
					});

					// Test the execute time of the SharedMatrix for inserting a column in the middle for a given number of times.
					runBenchmark({
						title: `Redo insert the middle column ${count} times`,
						matrixSize,
						initialCellValue,
						beforeOperation: (matrix, undoRedoStack) => {
							for (let i = 0; i < count; i++) {
								matrix.insertCols(Math.floor(matrix.colCount / 2), 1);
							}
							assert.equal(undoRedoStack.undoStackLength, count);
							for (let i = 0; i < count; i++) {
								undoRedoStack.undoOperation();
							}
							assert.equal(undoRedoStack.undoStackLength, 0);
							assert.equal(undoRedoStack.redoStackLength, count);
						},
						operation: (_matrix, undoRedoStack) => {
							for (let i = 0; i < count; i++) {
								undoRedoStack.redoOperation();
							}
						},
						afterOperation: (_matrix, undoRedoStack) => {
							assert.equal(undoRedoStack.redoStackLength, 0);
						},
						maxBenchmarkDurationSeconds,
					});
				});

				describe(`Row Insertion`, () => {
					// Test the execute time of the SharedMatrix for inserting a row in the middle for a given number of times.
					runBenchmark({
						title: `Insert a row in the middle ${count} times`,
						matrixSize,
						initialCellValue,
						operation: (matrix) => {
							for (let i = 0; i < count; i++) {
								matrix.insertRows(Math.floor(matrix.rowCount / 2), 1);
							}
						},
						maxBenchmarkDurationSeconds,
					});

					// Test the execute time of the SharedMatrix for inserting a row in the middle for a given number of times.
					runBenchmark({
						title: `Undo insert the middle row ${count} times`,
						matrixSize,
						initialCellValue,
						beforeOperation: (matrix, undoRedoStack) => {
							for (let i = 0; i < count; i++) {
								matrix.insertRows(Math.floor(matrix.rowCount / 2), 1);
							}
							assert.equal(undoRedoStack.undoStackLength, count);
						},
						operation: (_matrix, undoRedoStack) => {
							for (let i = 0; i < count; i++) {
								undoRedoStack.undoOperation();
							}
						},
						afterOperation: (_matrix, undoRedoStack) => {
							assert.equal(undoRedoStack.undoStackLength, 0);
						},
						maxBenchmarkDurationSeconds,
					});

					// Test the execute time of the SharedMatrix for inserting a row in the middle for a given number of times.
					runBenchmark({
						title: `Redo insert the middle row ${count} times`,
						matrixSize,
						initialCellValue,
						beforeOperation: (matrix, undoRedoStack) => {
							for (let i = 0; i < count; i++) {
								matrix.insertRows(Math.floor(matrix.rowCount / 2), 1);
							}
							assert.equal(undoRedoStack.undoStackLength, count);
							for (let i = 0; i < count; i++) {
								undoRedoStack.undoOperation();
							}
							assert.equal(undoRedoStack.undoStackLength, 0);
							assert.equal(undoRedoStack.redoStackLength, count);
						},
						operation: (_matrix, undoRedoStack) => {
							for (let i = 0; i < count; i++) {
								undoRedoStack.redoOperation();
							}
						},
						afterOperation: (_matrix, undoRedoStack) => {
							assert.equal(undoRedoStack.redoStackLength, 0);
						},
						maxBenchmarkDurationSeconds,
					});
				});

				describe(`Column and Row Insertion`, () => {
					// Test the execute time of the SharedMatrix for inserting a row and a column in the middle for a given number of times.
					runBenchmark({
						title: `Insert a row and a column in the middle ${count} times`,
						matrixSize,
						initialCellValue,
						operation: (matrix) => {
							for (let i = 0; i < count; i++) {
								matrix.insertRows(Math.floor(matrix.rowCount / 2), 1);
								matrix.insertCols(Math.floor(matrix.colCount / 2), 1);
							}
						},
						maxBenchmarkDurationSeconds,
					});

					// Test the execute time of the SharedMatrix for inserting a row and a column in the middle for a given number of times.
					runBenchmark({
						title: `Undo insert the middle a row and a column ${count} times`,
						matrixSize,
						initialCellValue,
						beforeOperation: (matrix, undoRedoStack) => {
							for (let i = 0; i < count; i++) {
								matrix.insertRows(Math.floor(matrix.rowCount / 2), 1);
								matrix.insertCols(Math.floor(matrix.colCount / 2), 1);
							}
							assert.equal(undoRedoStack.undoStackLength, 2 * count);
						},
						operation: (_matrix, undoRedoStack) => {
							for (let i = 0; i < 2 * count; i++) {
								undoRedoStack.undoOperation();
							}
						},
						afterOperation: (_matrix, undoRedoStack) => {
							assert.equal(undoRedoStack.undoStackLength, 0);
						},
						maxBenchmarkDurationSeconds,
					});

					// Test the execute time of the SharedMatrix for inserting a row and a column in the middle for a given number of times.
					runBenchmark({
						title: `Redo insert the middle a row and a column ${count} times`,
						matrixSize,
						initialCellValue,
						beforeOperation: (matrix, undoRedoStack) => {
							for (let i = 0; i < count; i++) {
								matrix.insertRows(Math.floor(matrix.rowCount / 2), 1);
								matrix.insertCols(Math.floor(matrix.colCount / 2), 1);
							}
							for (let i = 0; i < 2 * count; i++) {
								undoRedoStack.undoOperation();
							}
							assert.equal(undoRedoStack.undoStackLength, 0);
							assert.equal(undoRedoStack.redoStackLength, 2 * count);
						},
						operation: (_matrix, undoRedoStack) => {
							for (let i = 0; i < 2 * count; i++) {
								undoRedoStack.redoOperation();
							}
						},
						afterOperation: (_matrix, undoRedoStack) => {
							assert.equal(undoRedoStack.redoStackLength, 0);
						},
						maxBenchmarkDurationSeconds,
					});
				});
			}

			// Set/Remove-related tests that are limited by matrixSize
			for (const count of validRemoveCounts) {
				describe(`Column Removal`, () => {
					// Test the execute time of the SharedMatrix for removing a column in the middle for a given number of times.
					runBenchmark({
						title: `Remove the middle column ${count} times`,
						matrixSize,
						initialCellValue,
						operation: (matrix) => {
							for (let i = 0; i < count; i++) {
								matrix.removeCols(Math.floor(matrix.colCount / 2), 1);
							}
						},
						maxBenchmarkDurationSeconds,
					});

					// Test the execute time of the SharedMatrix for removing a column in the middle for a given number of times.
					runBenchmark({
						title: `Undo remove the middle column ${count} times`,
						matrixSize,
						initialCellValue,
						beforeOperation: (matrix, undoRedoStack) => {
							for (let i = 0; i < count; i++) {
								matrix.removeCols(Math.floor(matrix.colCount / 2), 1);
							}
							assert.equal(undoRedoStack.undoStackLength, count);
						},
						operation: (_matrix, undoRedoStack) => {
							for (let i = 0; i < count; i++) {
								undoRedoStack.undoOperation();
							}
						},
						afterOperation: (_matrix, undoRedoStack) => {
							assert.equal(undoRedoStack.undoStackLength, 0);
						},
						maxBenchmarkDurationSeconds,
					});

					// Test the execute time of the SharedMatrix for removing a column in the middle for a given number of times.
					runBenchmark({
						title: `Redo remove the middle column ${count} times`,
						matrixSize,
						initialCellValue,
						beforeOperation: (matrix, undoRedoStack) => {
							for (let i = 0; i < count; i++) {
								matrix.removeCols(Math.floor(matrix.colCount / 2), 1);
							}
							assert.equal(undoRedoStack.undoStackLength, count);
							for (let i = 0; i < count; i++) {
								undoRedoStack.undoOperation();
							}
							assert.equal(undoRedoStack.undoStackLength, 0);
							assert.equal(undoRedoStack.redoStackLength, count);
						},
						operation: (_matrix, undoRedoStack) => {
							for (let i = 0; i < count; i++) {
								undoRedoStack.redoOperation();
							}
						},
						afterOperation: (_matrix, undoRedoStack) => {
							assert.equal(undoRedoStack.redoStackLength, 0);
						},
						maxBenchmarkDurationSeconds,
					});
				});

				describe(`Row Removal`, () => {
					// Test the execute time of the SharedMatrix for removing a row in the middle for a given number of times.
					runBenchmark({
						title: `Remove the middle row ${count} times`,
						matrixSize,
						initialCellValue,
						operation: (matrix) => {
							for (let i = 0; i < count; i++) {
								matrix.removeRows(Math.floor(matrix.rowCount / 2), 1);
							}
						},
						maxBenchmarkDurationSeconds,
					});

					// Test the execute time of the SharedMatrix for removing a row in the middle for a given number of times.
					runBenchmark({
						title: `Undo remove the middle row ${count} times`,
						matrixSize,
						initialCellValue,
						beforeOperation: (matrix, undoRedoStack) => {
							for (let i = 0; i < count; i++) {
								matrix.removeRows(Math.floor(matrix.rowCount / 2), 1);
							}
							assert.equal(undoRedoStack.undoStackLength, count);
						},
						operation: (_matrix, undoRedoStack) => {
							for (let i = 0; i < count; i++) {
								undoRedoStack.undoOperation();
							}
						},
						afterOperation: (_matrix, undoRedoStack) => {
							assert.equal(undoRedoStack.undoStackLength, 0);
						},
						maxBenchmarkDurationSeconds,
					});

					// Test the execute time of the SharedMatrix for removing a row in the middle for a given number of times.
					runBenchmark({
						title: `Redo remove the middle row ${count} times`,
						matrixSize,
						initialCellValue,
						beforeOperation: (matrix, undoRedoStack) => {
							for (let i = 0; i < count; i++) {
								matrix.removeRows(Math.floor(matrix.rowCount / 2), 1);
							}
							assert.equal(undoRedoStack.undoStackLength, count);
							for (let i = 0; i < count; i++) {
								undoRedoStack.undoOperation();
							}
							assert.equal(undoRedoStack.undoStackLength, 0);
							assert.equal(undoRedoStack.redoStackLength, count);
						},
						operation: (_matrix, undoRedoStack) => {
							for (let i = 0; i < count; i++) {
								undoRedoStack.redoOperation();
							}
						},
						afterOperation: (_matrix, undoRedoStack) => {
							assert.equal(undoRedoStack.redoStackLength, 0);
						},
						maxBenchmarkDurationSeconds,
					});
				});

				describe(`Column and Row Removal`, () => {
					// Test the execute time of the SharedMatrix for removing a row and a column in the middle for a given number of times.
					runBenchmark({
						title: `Remove the middle row and column ${count} times`,
						matrixSize,
						initialCellValue,
						operation: (matrix) => {
							for (let i = 0; i < count; i++) {
								matrix.removeCols(Math.floor(matrix.colCount / 2), 1);
								matrix.removeRows(Math.floor(matrix.rowCount / 2), 1);
							}
						},
						maxBenchmarkDurationSeconds,
					});

					// Test the execute time of the SharedMatrix for removing a row and a column in the middle for a given number of times.
					runBenchmark({
						title: `Undo remove the middle row and column ${count} times`,
						matrixSize,
						initialCellValue,
						beforeOperation: (matrix, undoRedoStack) => {
							for (let i = 0; i < count; i++) {
								matrix.removeCols(Math.floor(matrix.colCount / 2), 1);
								matrix.removeRows(Math.floor(matrix.rowCount / 2), 1);
							}
							assert.equal(undoRedoStack.undoStackLength, 2 * count);
						},
						operation: (_matrix, undoRedoStack) => {
							for (let i = 0; i < 2 * count; i++) {
								undoRedoStack.undoOperation();
							}
						},
						afterOperation: (_matrix, undoRedoStack) => {
							assert.equal(undoRedoStack.undoStackLength, 0);
						},
						maxBenchmarkDurationSeconds,
					});

					// Test the execute time of the SharedMatrix for removing a row and a column in the middle for a given number of times.
					runBenchmark({
						title: `Redo remove the middle row and column ${count} times`,
						matrixSize,
						initialCellValue,
						beforeOperation: (matrix, undoRedoStack) => {
							for (let i = 0; i < count; i++) {
								matrix.removeCols(Math.floor(matrix.colCount / 2), 1);
								matrix.removeRows(Math.floor(matrix.rowCount / 2), 1);
							}
							assert.equal(undoRedoStack.undoStackLength, 2 * count);
							for (let i = 0; i < 2 * count; i++) {
								undoRedoStack.undoOperation();
							}
							assert.equal(undoRedoStack.undoStackLength, 0);
							assert.equal(undoRedoStack.redoStackLength, 2 * count);
						},
						operation: (_matrix, undoRedoStack) => {
							for (let i = 0; i < 2 * count; i++) {
								undoRedoStack.redoOperation();
							}
						},
						afterOperation: (_matrix, undoRedoStack) => {
							assert.equal(undoRedoStack.redoStackLength, 0);
						},
						maxBenchmarkDurationSeconds,
					});
				});

				describe(`Insert a Column and a Row and Remove right away`, () => {
					// Test the execute time of the SharedMatrix for inserting a row and a column and removing them right away for a given number of times.
					runBenchmark({
						title: `Insert a row and a column and remove them right away ${count} times`,
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
						maxBenchmarkDurationSeconds,
					});

					// Test the execute time of the SharedMatrix for inserting a row and a column and removing them right away for a given number of times.
					runBenchmark({
						title: `Undo insert a row and a column and remove them right away ${count} times`,
						matrixSize,
						initialCellValue,
						beforeOperation: (matrix, undoRedoStack) => {
							for (let i = 0; i < count; i++) {
								matrix.insertCols(Math.floor(matrix.colCount / 2), 1);
								matrix.insertRows(Math.floor(matrix.rowCount / 2), 1);
								matrix.removeCols(Math.floor(matrix.colCount / 2), 1);
								matrix.removeRows(Math.floor(matrix.rowCount / 2), 1);
							}
							assert.equal(undoRedoStack.undoStackLength, 4 * count);
						},
						operation: (_matrix, undoRedoStack) => {
							for (let i = 0; i < 4 * count; i++) {
								undoRedoStack.undoOperation();
							}
						},
						afterOperation: (_matrix, undoRedoStack) => {
							assert.equal(undoRedoStack.undoStackLength, 0);
						},
						maxBenchmarkDurationSeconds,
					});

					// Test the execute time of the SharedMatrix for inserting a row and a column and removing them right away for a given number of times.
					runBenchmark({
						title: `Redo insert a row and a column and remove them right away ${count} times`,
						matrixSize,
						initialCellValue,
						beforeOperation: (matrix, undoRedoStack) => {
							for (let i = 0; i < count; i++) {
								matrix.insertCols(Math.floor(matrix.colCount / 2), 1);
								matrix.insertRows(Math.floor(matrix.rowCount / 2), 1);
								matrix.removeCols(Math.floor(matrix.colCount / 2), 1);
								matrix.removeRows(Math.floor(matrix.rowCount / 2), 1);
							}
							assert.equal(undoRedoStack.undoStackLength, 4 * count);
							for (let i = 0; i < 4 * count; i++) {
								undoRedoStack.undoOperation();
							}
							assert.equal(undoRedoStack.undoStackLength, 0);
							assert.equal(undoRedoStack.redoStackLength, 4 * count);
						},
						operation: (_matrix, undoRedoStack) => {
							for (let i = 0; i < 4 * count; i++) {
								undoRedoStack.redoOperation();
							}
						},
						afterOperation: (_matrix, undoRedoStack) => {
							assert.equal(undoRedoStack.redoStackLength, 0);
						},
						maxBenchmarkDurationSeconds,
					});
				});

				describe(`Cell Value Setting`, () => {
					// Test the execute time of the SharedMatrix for setting a string in a cell for a given number of times.
					runBenchmark({
						title: `Set a 3-character string in ${count} cells`,
						matrixSize,
						initialCellValue,
						operation: (matrix) => {
							for (let i = 0; i < count; i++) {
								matrix.setCell(i, i, "abc");
							}
						},
						maxBenchmarkDurationSeconds,
					});

					// Test the execute time of the SharedMatrix for setting a string in a cell for a given number of times.
					runBenchmark({
						title: `Undo set a 3-character string in ${count} cells`,
						matrixSize,
						initialCellValue,
						beforeOperation: (matrix, undoRedoStack) => {
							for (let i = 0; i < count; i++) {
								matrix.setCell(i, i, "abc");
							}
							assert.equal(undoRedoStack.undoStackLength, count);
						},
						operation: (_matrix, undoRedoStack) => {
							for (let i = 0; i < count; i++) {
								undoRedoStack.undoOperation();
							}
						},
						afterOperation: (_matrix, undoRedoStack) => {
							assert.equal(undoRedoStack.undoStackLength, 0);
						},
						maxBenchmarkDurationSeconds,
					});

					// Test the execute time of the SharedMatrix for setting a string in a cell for a given number of times.
					runBenchmark({
						title: `Redo set a 3-character string in ${count} cells`,
						matrixSize,
						initialCellValue,
						beforeOperation: (matrix, undoRedoStack) => {
							for (let i = 0; i < count; i++) {
								matrix.setCell(i, i, "abc");
							}
							assert.equal(undoRedoStack.undoStackLength, count);
							for (let i = 0; i < count; i++) {
								undoRedoStack.undoOperation();
							}
							assert.equal(undoRedoStack.undoStackLength, 0);
							assert.equal(undoRedoStack.redoStackLength, count);
						},
						operation: (_matrix, undoRedoStack) => {
							for (let i = 0; i < count; i++) {
								undoRedoStack.redoOperation();
							}
						},
						afterOperation: (_matrix, undoRedoStack) => {
							assert.equal(undoRedoStack.redoStackLength, 0);
						},
						maxBenchmarkDurationSeconds,
					});
				});
			}
		});
	}
});
