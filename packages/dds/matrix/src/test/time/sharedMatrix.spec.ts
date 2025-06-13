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
} from "@fluid-tools/benchmark";

import { SharedMatrix } from "../../index.js";
import { UndoRedoStackManager } from "../undoRedoStackManager.js";
import { createLocalMatrix } from "../utils.js";

/**
 * This file contains benchmarks for measuring the execution time of operations on SharedMatrix.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function runBenchmark({
	title,
	matrixSize,
	initialValue,
	setup,
	operation,
	minBatchDurationSeconds = 0,
	maxBenchmarkDurationSeconds,
}: {
	title: string;
	matrixSize: number;
	initialValue: string;
	setup?: (matrix: SharedMatrix) => void;
	operation: (matrix: SharedMatrix) => void;
	minBatchDurationSeconds?: number;
	maxBenchmarkDurationSeconds: number;
}) {
	benchmark({
		type: BenchmarkType.Measurement,
		title,
		benchmarkFnCustom: async <T>(state: BenchmarkTimer<T>) => {
			let duration: number;
			do {
				assert.equal(state.iterationsPerBatch, 1, "Expected exactly one iteration per batch");

				// Setup
				const localMatrix = createLocalMatrix({
					id: "testLocalMatrix",
					size: matrixSize,
					initialValue,
				});

				if (setup) {
					setup(localMatrix);
				}

				// Operation
				const before = state.timer.now();
				operation(localMatrix);
				const after = state.timer.now();

				// Measure
				duration = state.timer.toSeconds(before, after);
			} while (state.recordBatch(duration));
		},
		minBatchDurationSeconds,
		maxBenchmarkDurationSeconds,
	});
}

/**
 * This function runs a benchmark for undo/redo operations on a SharedMatrix.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function runUndoRedoBenchmark({
	title,
	matrixSize,
	initialValue,
	setupOperation,
	stackOperation,
	minBatchDurationSeconds = 0,
	maxBenchmarkDurationSeconds,
}: {
	title: string;
	matrixSize: number;
	initialValue: string;
	setupOperation: (matrix: SharedMatrix, stack: UndoRedoStackManager) => void;
	stackOperation: (stack: UndoRedoStackManager) => void;
	minBatchDurationSeconds?: number;
	maxBenchmarkDurationSeconds: number;
}) {
	benchmark({
		type: BenchmarkType.Measurement,
		title,
		benchmarkFnCustom: async <T>(state: BenchmarkTimer<T>) => {
			let duration: number;
			do {
				assert.equal(state.iterationsPerBatch, 1, "Expected exactly one iteration per batch");

				// Setup
				const localMatrix = createLocalMatrix({
					id: "testLocalMatrix",
					size: matrixSize,
					initialValue,
				});
				const stack = new UndoRedoStackManager();
				localMatrix.openUndo(stack);
				setupOperation(localMatrix, stack);

				// Operation
				const before = state.timer.now();
				stackOperation(stack);
				const after = state.timer.now();

				// Measure
				duration = state.timer.toSeconds(before, after);
			} while (state.recordBatch(duration));
		},
		minBatchDurationSeconds,
		maxBenchmarkDurationSeconds,
	});
}

describe("SharedMatrix execution time", () => {
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
						initialValue: matrixValue,
						operation: (matrix) => {
							for (let i = 0; i < count; i++) {
								matrix.insertCols(Math.floor(matrix.colCount / 2), 1);
							}
						},
						maxBenchmarkDurationSeconds,
					});

					// Test the execute time of the SharedMatrix for inserting a column in the middle for a given number of times.
					runUndoRedoBenchmark({
						title: `Undo insert the middle column ${count} times`,
						matrixSize,
						initialValue: matrixValue,
						setupOperation: (matrix) => {
							for (let i = 0; i < count; i++) {
								matrix.insertCols(Math.floor(matrix.colCount / 2), 1);
							}
						},
						stackOperation: (stack) => {
							assert.equal(stack.undoStackLength, count);
							for (let i = 0; i < count; i++) {
								stack.undoOperation();
							}
						},
						maxBenchmarkDurationSeconds,
					});

					// Test the execute time of the SharedMatrix for inserting a column in the middle for a given number of times.
					runUndoRedoBenchmark({
						title: `Redo insert the middle column ${count} times`,
						matrixSize,
						initialValue: matrixValue,
						setupOperation: (matrix, stack) => {
							for (let i = 0; i < count; i++) {
								matrix.insertCols(Math.floor(matrix.colCount / 2), 1);
							}
							assert.equal(stack.undoStackLength, count);
							for (let i = 0; i < count; i++) {
								stack.undoOperation();
							}
						},
						stackOperation: (stack) => {
							assert.equal(stack.redoStackLength, count);
							for (let i = 0; i < count; i++) {
								stack.redoOperation();
							}
						},
						maxBenchmarkDurationSeconds,
					});
				});

				describe(`Row Insertion`, () => {
					// Test the execute time of the SharedMatrix for inserting a row in the middle for a given number of times.
					runBenchmark({
						title: `Insert a row in the middle ${count} times`,
						matrixSize,
						initialValue: matrixValue,
						operation: (matrix) => {
							for (let i = 0; i < count; i++) {
								matrix.insertRows(Math.floor(matrix.rowCount / 2), 1);
							}
						},
						maxBenchmarkDurationSeconds,
					});

					// Test the execute time of the SharedMatrix for inserting a row in the middle for a given number of times.
					runUndoRedoBenchmark({
						title: `Undo insert the middle row ${count} times`,
						matrixSize,
						initialValue: matrixValue,
						setupOperation: (matrix) => {
							for (let i = 0; i < count; i++) {
								matrix.insertRows(Math.floor(matrix.rowCount / 2), 1);
							}
						},
						stackOperation: (stack) => {
							assert.equal(stack.undoStackLength, count);
							for (let i = 0; i < count; i++) {
								stack.undoOperation();
							}
						},
						maxBenchmarkDurationSeconds,
					});

					// Test the execute time of the SharedMatrix for inserting a row in the middle for a given number of times.
					runUndoRedoBenchmark({
						title: `Redo insert the middle row ${count} times`,
						matrixSize,
						initialValue: matrixValue,
						setupOperation: (matrix, stack) => {
							for (let i = 0; i < count; i++) {
								matrix.insertRows(Math.floor(matrix.rowCount / 2), 1);
							}
							assert.equal(stack.undoStackLength, count);
							for (let i = 0; i < count; i++) {
								stack.undoOperation();
							}
						},
						stackOperation: (stack) => {
							assert.equal(stack.redoStackLength, count);
							for (let i = 0; i < count; i++) {
								stack.redoOperation();
							}
						},
						maxBenchmarkDurationSeconds,
					});
				});

				describe(`Column and Row Insertion`, () => {
					// Test the execute time of the SharedMatrix for inserting a row and a column in the middle for a given number of times.
					runBenchmark({
						title: `Insert a row and a column in the middle ${count} times`,
						matrixSize,
						initialValue: matrixValue,
						operation: (matrix) => {
							for (let i = 0; i < count; i++) {
								matrix.insertRows(Math.floor(matrix.rowCount / 2), 1);
								matrix.insertCols(Math.floor(matrix.colCount / 2), 1);
							}
						},
						maxBenchmarkDurationSeconds,
					});

					// Test the execute time of the SharedMatrix for inserting a row and a column in the middle for a given number of times.
					runUndoRedoBenchmark({
						title: `Undo insert the middle a row and a column ${count} times`,
						matrixSize,
						initialValue: matrixValue,
						setupOperation: (matrix) => {
							for (let i = 0; i < count; i++) {
								matrix.insertRows(Math.floor(matrix.rowCount / 2), 1);
								matrix.insertCols(Math.floor(matrix.colCount / 2), 1);
							}
						},
						stackOperation: (stack) => {
							assert.equal(stack.undoStackLength, 2 * count);
							for (let i = 0; i < 2 * count; i++) {
								stack.undoOperation();
							}
						},
						maxBenchmarkDurationSeconds,
					});

					// Test the execute time of the SharedMatrix for inserting a row and a column in the middle for a given number of times.
					runUndoRedoBenchmark({
						title: `Redo insert the middle a row and a column ${count} times`,
						matrixSize,
						initialValue: matrixValue,
						setupOperation: (matrix, stack) => {
							for (let i = 0; i < count; i++) {
								matrix.insertRows(Math.floor(matrix.rowCount / 2), 1);
								matrix.insertCols(Math.floor(matrix.colCount / 2), 1);
							}
							for (let i = 0; i < 2 * count; i++) {
								stack.undoOperation();
							}
						},
						stackOperation: (stack) => {
							assert.equal(stack.redoStackLength, 2 * count);
							for (let i = 0; i < 2 * count; i++) {
								stack.redoOperation();
							}
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
						initialValue: matrixValue,
						operation: (matrix) => {
							for (let i = 0; i < count; i++) {
								matrix.removeCols(Math.floor(matrix.colCount / 2), 1);
							}
						},
						maxBenchmarkDurationSeconds,
					});

					// Test the execute time of the SharedMatrix for removing a column in the middle for a given number of times.
					runUndoRedoBenchmark({
						title: `Undo remove the middle column ${count} times`,
						matrixSize,
						initialValue: matrixValue,
						setupOperation: (matrix, stack) => {
							for (let i = 0; i < count; i++) {
								matrix.removeCols(Math.floor(matrix.colCount / 2), 1);
							}
						},
						stackOperation: (stack) => {
							assert.equal(stack.undoStackLength, count);
							for (let i = 0; i < count; i++) {
								stack.undoOperation();
							}
						},
						maxBenchmarkDurationSeconds,
					});

					// Test the execute time of the SharedMatrix for removing a column in the middle for a given number of times.
					runUndoRedoBenchmark({
						title: `Redo remove the middle column ${count} times`,
						matrixSize,
						initialValue: matrixValue,
						setupOperation: (matrix, stack) => {
							for (let i = 0; i < count; i++) {
								matrix.removeCols(Math.floor(matrix.colCount / 2), 1);
							}
							assert.equal(stack.undoStackLength, count);
							for (let i = 0; i < count; i++) {
								stack.undoOperation();
							}
						},
						stackOperation: (stack) => {
							assert.equal(stack.redoStackLength, count);
							for (let i = 0; i < count; i++) {
								stack.redoOperation();
							}
						},
						maxBenchmarkDurationSeconds,
					});
				});

				describe(`Row Removal`, () => {
					// Test the execute time of the SharedMatrix for removing a row in the middle for a given number of times.
					runBenchmark({
						title: `Remove the middle row ${count} times`,
						matrixSize,
						initialValue: matrixValue,
						operation: (matrix) => {
							for (let i = 0; i < count; i++) {
								matrix.removeRows(Math.floor(matrix.rowCount / 2), 1);
							}
						},
						maxBenchmarkDurationSeconds,
					});

					// Test the execute time of the SharedMatrix for removing a row in the middle for a given number of times.
					runUndoRedoBenchmark({
						title: `Undo remove the middle row ${count} times`,
						matrixSize,
						initialValue: matrixValue,
						setupOperation: (matrix, stack) => {
							for (let i = 0; i < count; i++) {
								matrix.removeRows(Math.floor(matrix.rowCount / 2), 1);
							}
						},
						stackOperation: (stack) => {
							assert.equal(stack.undoStackLength, count);
							for (let i = 0; i < count; i++) {
								stack.undoOperation();
							}
						},
						maxBenchmarkDurationSeconds,
					});

					// Test the execute time of the SharedMatrix for removing a row in the middle for a given number of times.
					runUndoRedoBenchmark({
						title: `Redo remove the middle row ${count} times`,
						matrixSize,
						initialValue: matrixValue,
						setupOperation: (matrix, stack) => {
							for (let i = 0; i < count; i++) {
								matrix.removeRows(Math.floor(matrix.rowCount / 2), 1);
							}
							assert.equal(stack.undoStackLength, count);
							for (let i = 0; i < count; i++) {
								stack.undoOperation();
							}
						},
						stackOperation: (stack) => {
							assert.equal(stack.redoStackLength, count);
							for (let i = 0; i < count; i++) {
								stack.redoOperation();
							}
						},
						maxBenchmarkDurationSeconds,
					});
				});

				describe(`Column and Row Removal`, () => {
					// Test the execute time of the SharedMatrix for removing a row and a column in the middle for a given number of times.
					runBenchmark({
						title: `Remove the middle row and column ${count} times`,
						matrixSize,
						initialValue: matrixValue,
						operation: (matrix) => {
							for (let i = 0; i < count; i++) {
								matrix.removeCols(Math.floor(matrix.colCount / 2), 1);
								matrix.removeRows(Math.floor(matrix.rowCount / 2), 1);
							}
						},
						maxBenchmarkDurationSeconds,
					});

					// Test the execute time of the SharedMatrix for removing a row and a column in the middle for a given number of times.
					runUndoRedoBenchmark({
						title: `Undo remove the middle row and column ${count} times`,
						matrixSize,
						initialValue: matrixValue,
						setupOperation: (matrix, stack) => {
							for (let i = 0; i < count; i++) {
								matrix.removeCols(Math.floor(matrix.colCount / 2), 1);
								matrix.removeRows(Math.floor(matrix.rowCount / 2), 1);
							}
						},
						stackOperation: (stack) => {
							assert.equal(stack.undoStackLength, 2 * count);
							for (let i = 0; i < 2 * count; i++) {
								stack.undoOperation();
							}
						},
						maxBenchmarkDurationSeconds,
					});

					// Test the execute time of the SharedMatrix for removing a row and a column in the middle for a given number of times.
					runUndoRedoBenchmark({
						title: `Redo remove the middle row and column ${count} times`,
						matrixSize,
						initialValue: matrixValue,
						setupOperation: (matrix, stack) => {
							for (let i = 0; i < count; i++) {
								matrix.removeCols(Math.floor(matrix.colCount / 2), 1);
								matrix.removeRows(Math.floor(matrix.rowCount / 2), 1);
							}
							assert.equal(stack.undoStackLength, 2 * count);
							for (let i = 0; i < 2 * count; i++) {
								stack.undoOperation();
							}
						},
						stackOperation: (stack) => {
							assert.equal(stack.redoStackLength, 2 * count);
							for (let i = 0; i < 2 * count; i++) {
								stack.redoOperation();
							}
						},
						maxBenchmarkDurationSeconds,
					});
				});

				describe(`Insert a Column and a Row and Remove right away`, () => {
					// Test the execute time of the SharedMatrix for inserting a row and a column and removing them right away for a given number of times.
					runBenchmark({
						title: `Insert a row and a column and remove them right away ${count} times`,
						matrixSize,
						initialValue: matrixValue,
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
					runUndoRedoBenchmark({
						title: `Undo insert a row and a column and remove them right away ${count} times`,
						matrixSize,
						initialValue: matrixValue,
						setupOperation: (matrix) => {
							for (let i = 0; i < count; i++) {
								matrix.insertCols(Math.floor(matrix.colCount / 2), 1);
								matrix.insertRows(Math.floor(matrix.rowCount / 2), 1);
								matrix.removeCols(Math.floor(matrix.colCount / 2), 1);
								matrix.removeRows(Math.floor(matrix.rowCount / 2), 1);
							}
						},
						stackOperation: (stack) => {
							assert.equal(stack.undoStackLength, 4 * count);
							for (let i = 0; i < 4 * count; i++) {
								stack.undoOperation();
							}
						},
						maxBenchmarkDurationSeconds,
					});

					// Test the execute time of the SharedMatrix for inserting a row and a column and removing them right away for a given number of times.
					runUndoRedoBenchmark({
						title: `Redo insert a row and a column and remove them right away ${count} times`,
						matrixSize,
						initialValue: matrixValue,
						setupOperation: (matrix, stack) => {
							for (let i = 0; i < count; i++) {
								matrix.insertCols(Math.floor(matrix.colCount / 2), 1);
								matrix.insertRows(Math.floor(matrix.rowCount / 2), 1);
								matrix.removeCols(Math.floor(matrix.colCount / 2), 1);
								matrix.removeRows(Math.floor(matrix.rowCount / 2), 1);
							}
							assert.equal(stack.undoStackLength, 4 * count);
							for (let i = 0; i < 4 * count; i++) {
								stack.undoOperation();
							}
						},
						stackOperation: (stack) => {
							assert.equal(stack.redoStackLength, 4 * count);
							for (let i = 0; i < 4 * count; i++) {
								stack.redoOperation();
							}
						},
						maxBenchmarkDurationSeconds,
					});
				});

				describe(`Cell Value Setting`, () => {
					// Test the execute time of the SharedMatrix for setting a string in a cell for a given number of times.
					runBenchmark({
						title: `Set a 3-character string in ${count} cells`,
						matrixSize,
						initialValue: matrixValue,
						operation: (matrix) => {
							for (let i = 0; i < count; i++) {
								matrix.setCell(i, i, "abc");
							}
						},
						maxBenchmarkDurationSeconds,
					});

					// Test the execute time of the SharedMatrix for setting a string in a cell for a given number of times.
					runUndoRedoBenchmark({
						title: `Undo set a 3-character string in ${count} cells`,
						matrixSize,
						initialValue: matrixValue,
						setupOperation: (matrix, stack) => {
							for (let i = 0; i < count; i++) {
								matrix.setCell(i, i, "abc");
							}
						},
						stackOperation: (stack) => {
							assert.equal(stack.undoStackLength, count);
							for (let i = 0; i < count; i++) {
								stack.undoOperation();
							}
						},
						maxBenchmarkDurationSeconds,
					});

					// Test the execute time of the SharedMatrix for setting a string in a cell for a given number of times.
					runUndoRedoBenchmark({
						title: `Redo set a 3-character string in ${count} cells`,
						matrixSize,
						initialValue: matrixValue,
						setupOperation: (matrix, stack) => {
							for (let i = 0; i < count; i++) {
								matrix.setCell(i, i, "abc");
							}
							assert.equal(stack.undoStackLength, count);
							for (let i = 0; i < count; i++) {
								stack.undoOperation();
							}
						},
						stackOperation: (stack) => {
							assert.equal(stack.redoStackLength, count);
							for (let i = 0; i < count; i++) {
								stack.redoOperation();
							}
						},
						maxBenchmarkDurationSeconds,
					});
				});
			}
		});
	}
});
