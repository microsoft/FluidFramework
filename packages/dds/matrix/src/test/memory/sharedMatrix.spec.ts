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
import type { Test } from "mocha";

import type { ISharedMatrix } from "../../index.js";
import { createTestMatrix, type MatrixBenchmarkOptions } from "../performanceTestUtilities.js";
import type { UndoRedoStackManager } from "../undoRedoStackManager.js";

/**
 * Note: These benchmarks are designed to closely match the benchmarks in SharedTree.
 * If you modify or add tests here, consider updating the corresponding SharedTree benchmarks as well
 * to ensure consistency and comparability between the two implementations.
 */

// TODOs (AB#46340):
// - unify with time measurement tests (in terms of API)

/**
 * Creates a benchmark for operations on a SharedMatrix.
 */
function runBenchmark({
	title,
	matrixSize,
	initialCellValue,
	beforeOperation,
	operation,
	afterOperation,
}: MatrixBenchmarkOptions): Test {
	return benchmarkMemory(
		new (class implements IMemoryTestObject {
			readonly title = title;

			private matrix: ISharedMatrix | undefined;
			private undoRedoStack: UndoRedoStackManager | undefined;
			private cleanUp: (() => void) | undefined;

			async run(): Promise<void> {
				assert(this.matrix !== undefined, "matrix is not initialized");
				assert(this.undoRedoStack !== undefined, "undoRedoStack is not initialized");
				operation(this.matrix, this.undoRedoStack);
			}

			beforeIteration(): void {
				const { matrix, undoRedoStack, cleanUp } = createTestMatrix({
					matrixSize,
					initialCellValue,
				});
				this.matrix = matrix;
				this.undoRedoStack = undoRedoStack;
				this.cleanUp = cleanUp;

				beforeOperation?.(this.matrix, this.undoRedoStack);
			}

			afterIteration(): void {
				assert(this.matrix !== undefined, "matrix is not initialized");
				assert(this.undoRedoStack !== undefined, "undoRedoStack is not initialized");
				assert(this.cleanUp !== undefined, "cleanUp is not initialized");

				afterOperation?.(this.matrix, this.undoRedoStack);

				this.cleanUp();
				this.undoRedoStack = undefined;
				this.cleanUp = undefined;
			}
		})(),
	);
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
			// Filter counts to ensure removal operations do not exceed matrixSize
			const validRemoveCounts = operationCounts.filter((count) => count <= matrixSize);

			// Insert-related tests that are not limited by matrixSize
			for (const count of operationCounts) {
				describe(`Column insertion`, () => {
					const scenarioName = `Insert a single column in the middle of the table ${count} times`;
					runBenchmark({
						title: scenarioName,
						matrixSize,
						initialCellValue,
						operation: (matrix) => {
							for (let i = 0; i < count; i++) {
								matrix.insertCols(Math.floor(matrix.colCount / 2), 1);
							}
						},
					});

					runBenchmark({
						title: `Undo: ${scenarioName}`,
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
					});

					runBenchmark({
						title: `Redo: ${scenarioName}`,
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
					});
				});

				describe(`Row insertion`, () => {
					const scenarioName = `Insert a single row in the middle of the table ${count} times`;
					runBenchmark({
						title: scenarioName,
						matrixSize,
						initialCellValue,
						operation: (matrix) => {
							for (let i = 0; i < count; i++) {
								matrix.insertRows(Math.floor(matrix.rowCount / 2), 1);
							}
						},
					});

					runBenchmark({
						title: `Undo: ${scenarioName}`,
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
					});

					runBenchmark({
						title: `Redo: ${scenarioName}`,
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
					});
				});
				describe(`Column and row insertion`, () => {
					const scenarioName = `Insert a single row and a single column in the middle of the table ${count} times`;
					runBenchmark({
						title: scenarioName,
						matrixSize,
						initialCellValue,
						operation: (matrix) => {
							for (let i = 0; i < count; i++) {
								matrix.insertRows(Math.floor(matrix.rowCount / 2), 1);
								matrix.insertCols(Math.floor(matrix.colCount / 2), 1);
							}
						},
					});

					runBenchmark({
						title: `Undo: ${scenarioName}`,
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
					});

					runBenchmark({
						title: `Redo: ${scenarioName}`,
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
					});
				});
			}

			// Set/Remove-related tests that are limited by matrixSize
			for (const count of validRemoveCounts) {
				describe(`Column removal`, () => {
					const scenarioName = `Remove the middle column ${count} times`;
					runBenchmark({
						title: scenarioName,
						matrixSize,
						initialCellValue,
						operation: (matrix) => {
							for (let i = 0; i < count; i++) {
								matrix.removeCols(Math.floor(matrix.colCount / 2), 1);
							}
						},
					});

					runBenchmark({
						title: `Undo: ${scenarioName}`,
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
					});

					runBenchmark({
						title: `Redo: ${scenarioName}`,
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
					});
				});

				describe(`Row removal`, () => {
					const scenarioName = `Remove the middle row ${count} times`;
					runBenchmark({
						title: scenarioName,
						matrixSize,
						initialCellValue,
						operation: (matrix) => {
							for (let i = 0; i < count; i++) {
								matrix.removeRows(Math.floor(matrix.rowCount / 2), 1);
							}
						},
					});

					runBenchmark({
						title: `Undo: ${scenarioName}`,
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
					});

					runBenchmark({
						title: `Redo: ${scenarioName}`,
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
					});
				});

				describe(`Single column and row removal`, () => {
					const scenarioName = `Remove the middle row and column ${count} times`;
					runBenchmark({
						title: scenarioName,
						matrixSize,
						initialCellValue,
						operation: (matrix) => {
							for (let i = 0; i < count; i++) {
								matrix.removeCols(Math.floor(matrix.colCount / 2), 1);
								matrix.removeRows(Math.floor(matrix.rowCount / 2), 1);
							}
						},
					});

					runBenchmark({
						title: `Undo: ${scenarioName}`,
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
					});

					runBenchmark({
						title: `Redo: ${scenarioName}`,
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
					});
				});

				describe(`Insert a row and a column and remove them right away`, () => {
					const scenarioName = `Insert a row and a column and remove them right away ${count} times`;
					runBenchmark({
						title: scenarioName,
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
					});

					runBenchmark({
						title: `Undo: ${scenarioName}`,
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
					});

					runBenchmark({
						title: `Redo: ${scenarioName}`,
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
					});
				});

				describe(`Set cell values`, () => {
					const scenarioName = `Set a 3-character string in ${count} cells`;
					runBenchmark({
						title: scenarioName,
						matrixSize,
						initialCellValue,
						operation: (matrix) => {
							for (let i = 0; i < count; i++) {
								matrix.setCell(i, i, "abc");
							}
						},
					});

					runBenchmark({
						title: `Undo: ${scenarioName}`,
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
					});

					runBenchmark({
						title: `Redo: ${scenarioName}`,
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
					});
				});
			}
		});
	}
});
