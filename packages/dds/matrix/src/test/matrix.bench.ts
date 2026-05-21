/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	BenchmarkMode,
	benchmarkDurationBatchless,
	benchmarkIt,
	benchmarkMemoryUse,
	currentBenchmarkMode,
	memoryAddedBy,
} from "@fluid-tools/benchmark";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";
import type { IMatrixConsumer } from "@tiny-calc/nano";

import type { ISharedMatrix } from "../index.js";

import { UndoRedoStackManager } from "./undoRedoStackManager.js";
import { matrixFactory } from "./utils.js";

/**
 * {@link createTestMatrix} options.
 */
interface TestMatrixOptions {
	/**
	 * The number of rows and columns that will be in the matrix.
	 */
	readonly matrixSize: number;
	/**
	 * The initial value of each cell in the dense matrix.
	 * @remarks If not specified, no cell values will be inserted into the table, leaving it sparse.
	 */
	readonly initialCellValue?: string | undefined;
}

/**
 * Initializes a SharedMatrix for testing.
 * @remarks Includes initialization of the undo/redo stack, as well as mock event subscriptions.
 */
function createTestMatrix(options: TestMatrixOptions): {
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
	const { matrixSize, initialCellValue } = options;

	// Create and initialize the matrix
	const matrix = matrixFactory.create(new MockFluidDataStoreRuntime(), "test-matrix");
	matrix.insertRows(0, matrixSize);
	matrix.insertCols(0, matrixSize);

	if (initialCellValue !== undefined) {
		for (let row = 0; row < matrixSize; row++) {
			for (let col = 0; col < matrixSize; col++) {
				matrix.setCell(row, col, initialCellValue);
			}
		}
	}

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
 * Benchmark test options.
 */
interface MatrixBenchmarkOptions extends TestMatrixOptions {
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
	readonly operation: (matrix: ISharedMatrix, undoRedo: UndoRedoStackManager) => void;

	/**
	 * Validation to perform after `operation` is executed.
	 *
	 * @remarks
	 * In duration tests, this is not included in the measurement.
	 *
	 * In memory benchmarking tests, this is executed after the memory snapshot is taken
	 * (after {@link MatrixBenchmarkOptions.operation}) so it does not affect the memory measurement.
	 */
	readonly afterOperation?: (
		matrix: ISharedMatrix,
		undoRedoStack: UndoRedoStackManager,
	) => void;
}

interface BenchmarkConfig extends MatrixBenchmarkOptions {
	readonly maxBenchmarkDurationSeconds: number;
}

function runExecutionTimeBenchmark({
	title,
	matrixSize,
	initialCellValue,
	beforeOperation,
	operation,
	afterOperation,
	maxBenchmarkDurationSeconds,
}: BenchmarkConfig): void {
	benchmarkIt({
		title,
		...benchmarkDurationBatchless({
			benchmarkFn: (state) => {
				let running: boolean;
				do {
					const { matrix, undoRedoStack, cleanUp } = createTestMatrix({
						matrixSize,
						initialCellValue,
					});

					beforeOperation?.(matrix, undoRedoStack);

					running = state.time(() => {
						operation(matrix, undoRedoStack);
					});

					afterOperation?.(matrix, undoRedoStack);
					cleanUp();
				} while (running);
			},
			maxBenchmarkDurationSeconds,
		}),
	});
}

function runMemoryBenchmark({
	title,
	matrixSize,
	initialCellValue,
	beforeOperation,
	operation,
	afterOperation,
}: BenchmarkConfig): void {
	benchmarkIt({
		title,
		...benchmarkMemoryUse(
			memoryAddedBy({
				setup: () => {
					const result = createTestMatrix({ matrixSize, initialCellValue });
					beforeOperation?.(result.matrix, result.undoRedoStack);
					return result;
				},
				modify: ({ matrix, undoRedoStack }) => {
					operation(matrix, undoRedoStack);
				},
				after: ({ matrix, undoRedoStack, cleanUp }) => {
					afterOperation?.(matrix, undoRedoStack);
					// In practice this does not seem to help reduce memory leaks, but calling it is
					// good for consistency with other benchmarks.
					cleanUp();
				},
			}),
		),
	});
}

function runBenchmarks(options: BenchmarkConfig): void {
	runExecutionTimeBenchmark(options);
	runMemoryBenchmark(options);
}

/**
 * Shared test suite for matrix execution time and memory benchmarks
 *
 * @remarks
 * Note: These benchmarks are designed to closely match the TableSchema SharedTree benchmarks in the `tree` package.
 * If you modify or add tests here, consider updating the corresponding SharedTree benchmarks as well
 * to ensure consistency and comparability between the two implementations.
 */
describe("Matrix Benchmarks", () => {
	// The value to be set in the cells of the matrix.
	const initialCellValue = "cellValue";

	// The test matrix's size will be 5*5, 50*50.
	// Matrix size 1000 benchmarks removed due to high overhead and unreliable results.
	const matrixSizes =
		currentBenchmarkMode === BenchmarkMode.Performance
			? [5, 50]
			: // When not measuring perf, use a single smaller data size so the tests run faster.
				[5];

	// The number of operations to perform on the matrix.
	// Operation counts 1000 removed due to high overhead and unreliable results.
	const operationCounts =
		currentBenchmarkMode === BenchmarkMode.Performance
			? [5, 50]
			: // When not measuring perf, use a single smaller data size so the tests run faster.
				[5];

	let maxBenchmarkDurationSeconds: number;

	for (const matrixSize of matrixSizes) {
		maxBenchmarkDurationSeconds = matrixSize === 50 ? 10 : 5;

		describe(`Size of ${matrixSize}*${matrixSize} SharedMatrix`, () => {
			// Filter counts to ensure remove operation do not exceed matrixSize
			const validRemoveCounts = operationCounts.filter((count) => count <= matrixSize);

			// Insert-related tests that are not limited by matrixSize
			for (const count of operationCounts) {
				describe("Column insertion", () => {
					describe("Single column insertion", () => {
						const scenarioName = `Insert a single column in the middle of the table ${count} times`;
						runBenchmarks({
							title: scenarioName,
							matrixSize,
							initialCellValue,
							operation: (matrix) => {
								for (let i = 0; i < count; i++) {
									matrix.insertCols(Math.floor(matrix.colCount / 2), 1);
								}
							},
							maxBenchmarkDurationSeconds,
						});

						runBenchmarks({
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
							maxBenchmarkDurationSeconds,
						});

						runBenchmarks({
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
							maxBenchmarkDurationSeconds,
						});
					});

					describe("Batch column insertion", () => {
						const scenarioName = `Insert a batch of ${count} columns in the middle of the table`;
						runBenchmarks({
							title: scenarioName,
							matrixSize,
							initialCellValue,
							operation: (matrix) => {
								matrix.insertCols(Math.floor(matrix.colCount / 2), count);
							},
							maxBenchmarkDurationSeconds,
						});

						runBenchmarks({
							title: `Undo: ${scenarioName}`,
							matrixSize,
							initialCellValue,
							beforeOperation: (matrix, undoRedoStack) => {
								matrix.insertCols(Math.floor(matrix.colCount / 2), count);
								assert.equal(undoRedoStack.undoStackLength, 1);
							},
							operation: (_matrix, undoRedoStack) => {
								undoRedoStack.undoOperation();
							},
							afterOperation: (_matrix, undoRedoStack) => {
								assert.equal(undoRedoStack.undoStackLength, 0);
							},
							maxBenchmarkDurationSeconds,
						});

						runBenchmarks({
							title: `Redo: ${scenarioName}`,
							matrixSize,
							initialCellValue,
							beforeOperation: (matrix, undoRedoStack) => {
								matrix.insertCols(Math.floor(matrix.colCount / 2), count);
								assert.equal(undoRedoStack.undoStackLength, 1);
								undoRedoStack.undoOperation();
								assert.equal(undoRedoStack.undoStackLength, 0);
								assert.equal(undoRedoStack.redoStackLength, 1);
							},
							operation: (_matrix, undoRedoStack) => {
								undoRedoStack.redoOperation();
							},
							afterOperation: (_matrix, undoRedoStack) => {
								assert.equal(undoRedoStack.redoStackLength, 0);
							},
							maxBenchmarkDurationSeconds,
						});
					});
				});

				describe("Row insertion", () => {
					describe("Single row insertion", () => {
						const scenarioName = `Insert a single row in the middle of the table ${count} times`;
						runBenchmarks({
							title: scenarioName,
							matrixSize,
							initialCellValue,
							operation: (matrix) => {
								for (let i = 0; i < count; i++) {
									matrix.insertRows(Math.floor(matrix.rowCount / 2), 1);
								}
							},
							maxBenchmarkDurationSeconds,
						});

						runBenchmarks({
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
							maxBenchmarkDurationSeconds,
						});

						runBenchmarks({
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
							maxBenchmarkDurationSeconds,
						});
					});

					describe("Batch row insertion", () => {
						const scenarioName = `Insert a batch of ${count} rows in the middle of the table`;
						runBenchmarks({
							title: scenarioName,
							matrixSize,
							initialCellValue,
							operation: (matrix) => {
								matrix.insertRows(Math.floor(matrix.rowCount / 2), count);
							},
							maxBenchmarkDurationSeconds,
						});

						runBenchmarks({
							title: `Undo: ${scenarioName}`,
							matrixSize,
							initialCellValue,
							beforeOperation: (matrix, undoRedoStack) => {
								matrix.insertRows(Math.floor(matrix.rowCount / 2), count);
								assert.equal(undoRedoStack.undoStackLength, 1);
							},
							operation: (_matrix, undoRedoStack) => {
								undoRedoStack.undoOperation();
							},
							afterOperation: (_matrix, undoRedoStack) => {
								assert.equal(undoRedoStack.undoStackLength, 0);
							},
							maxBenchmarkDurationSeconds,
						});

						runBenchmarks({
							title: `Redo: ${scenarioName}`,
							matrixSize,
							initialCellValue,
							beforeOperation: (matrix, undoRedoStack) => {
								matrix.insertRows(Math.floor(matrix.rowCount / 2), count);
								assert.equal(undoRedoStack.undoStackLength, 1);
								undoRedoStack.undoOperation();
								assert.equal(undoRedoStack.undoStackLength, 0);
								assert.equal(undoRedoStack.redoStackLength, 1);
							},
							operation: (_matrix, undoRedoStack) => {
								undoRedoStack.redoOperation();
							},
							afterOperation: (_matrix, undoRedoStack) => {
								assert.equal(undoRedoStack.redoStackLength, 0);
							},
							maxBenchmarkDurationSeconds,
						});
					});
				});

				describe(`Single column and row insertion`, () => {
					const scenarioName = `Insert a single row and a single column in the middle of the table ${count} times`;
					runBenchmarks({
						title: scenarioName,
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

					runBenchmarks({
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
						maxBenchmarkDurationSeconds,
					});

					runBenchmarks({
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
						maxBenchmarkDurationSeconds,
					});
				});
			}

			// Set/Remove-related tests that are limited by matrixSize
			for (const count of validRemoveCounts) {
				describe("Column removal", () => {
					describe("Single column removal", () => {
						const scenarioName = `Remove the middle column ${count} times`;
						runBenchmarks({
							title: scenarioName,
							matrixSize,
							initialCellValue,
							operation: (matrix) => {
								for (let i = 0; i < count; i++) {
									matrix.removeCols(Math.floor(matrix.colCount / 2), 1);
								}
							},
							maxBenchmarkDurationSeconds,
						});

						runBenchmarks({
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
							maxBenchmarkDurationSeconds,
						});

						runBenchmarks({
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
							maxBenchmarkDurationSeconds,
						});
					});

					describe("Batch column removal", () => {
						const scenarioName = `Remove ${count} columns from the middle of the table`;
						runBenchmarks({
							title: scenarioName,
							matrixSize,
							initialCellValue,
							operation: (matrix) => {
								matrix.removeCols(Math.floor(matrix.colCount / 2), count);
							},
							maxBenchmarkDurationSeconds,
						});

						runBenchmarks({
							title: `Undo: ${scenarioName}`,
							matrixSize,
							initialCellValue,
							beforeOperation: (matrix, undoRedoStack) => {
								matrix.removeCols(Math.floor(matrix.colCount / 2), count);
								assert.equal(undoRedoStack.undoStackLength, 1);
							},
							operation: (_matrix, undoRedoStack) => {
								undoRedoStack.undoOperation();
							},
							afterOperation: (_matrix, undoRedoStack) => {
								assert.equal(undoRedoStack.undoStackLength, 0);
							},
							maxBenchmarkDurationSeconds,
						});

						runBenchmarks({
							title: `Redo: ${scenarioName}`,
							matrixSize,
							initialCellValue,
							beforeOperation: (matrix, undoRedoStack) => {
								matrix.removeCols(Math.floor(matrix.colCount / 2), count);
								assert.equal(undoRedoStack.undoStackLength, 1);
								undoRedoStack.undoOperation();
								assert.equal(undoRedoStack.undoStackLength, 0);
								assert.equal(undoRedoStack.redoStackLength, 1);
							},
							operation: (_matrix, undoRedoStack) => {
								undoRedoStack.redoOperation();
							},
							afterOperation: (_matrix, undoRedoStack) => {
								assert.equal(undoRedoStack.redoStackLength, 0);
							},
							maxBenchmarkDurationSeconds,
						});
					});
				});

				describe("Row removal", () => {
					describe("Single row removal", () => {
						const scenarioName = `Remove the middle row ${count} times`;
						runBenchmarks({
							title: scenarioName,
							matrixSize,
							initialCellValue,
							operation: (matrix) => {
								for (let i = 0; i < count; i++) {
									matrix.removeRows(Math.floor(matrix.rowCount / 2), 1);
								}
							},
							maxBenchmarkDurationSeconds,
						});

						runBenchmarks({
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
							maxBenchmarkDurationSeconds,
						});

						runBenchmarks({
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
							maxBenchmarkDurationSeconds,
						});
					});

					describe("Batch row removal", () => {
						const scenarioName = `Remove ${count} rows from the middle of the table`;
						runBenchmarks({
							title: scenarioName,
							matrixSize,
							initialCellValue,
							operation: (matrix) => {
								matrix.removeRows(Math.floor(matrix.rowCount / 2), count);
							},
							maxBenchmarkDurationSeconds,
						});

						runBenchmarks({
							title: `Undo: ${scenarioName}`,
							matrixSize,
							initialCellValue,
							beforeOperation: (matrix, undoRedoStack) => {
								matrix.removeRows(Math.floor(matrix.rowCount / 2), count);
								assert.equal(undoRedoStack.undoStackLength, 1);
							},
							operation: (_matrix, undoRedoStack) => {
								undoRedoStack.undoOperation();
							},
							afterOperation: (_matrix, undoRedoStack) => {
								assert.equal(undoRedoStack.undoStackLength, 0);
							},
							maxBenchmarkDurationSeconds,
						});

						runBenchmarks({
							title: `Redo: ${scenarioName}`,
							matrixSize,
							initialCellValue,
							beforeOperation: (matrix, undoRedoStack) => {
								matrix.removeRows(Math.floor(matrix.rowCount / 2), count);
								assert.equal(undoRedoStack.undoStackLength, 1);
								undoRedoStack.undoOperation();
								assert.equal(undoRedoStack.undoStackLength, 0);
								assert.equal(undoRedoStack.redoStackLength, 1);
							},
							operation: (_matrix, undoRedoStack) => {
								undoRedoStack.redoOperation();
							},
							afterOperation: (_matrix, undoRedoStack) => {
								assert.equal(undoRedoStack.redoStackLength, 0);
							},
							maxBenchmarkDurationSeconds,
						});
					});
				});

				describe(`Single column and row removal`, () => {
					const scenarioName = `Remove the middle row and column ${count} times`;
					runBenchmarks({
						title: scenarioName,
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

					runBenchmarks({
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
						maxBenchmarkDurationSeconds,
					});

					runBenchmarks({
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
						maxBenchmarkDurationSeconds,
					});
				});

				describe(`Insert a row and a column and remove them right away`, () => {
					const scenarioName = `Insert a row and a column and remove them right away ${count} times`;
					runBenchmarks({
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
						maxBenchmarkDurationSeconds,
					});

					runBenchmarks({
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
						maxBenchmarkDurationSeconds,
					});

					runBenchmarks({
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
						maxBenchmarkDurationSeconds,
					});
				});

				describe(`Set cell values`, () => {
					const scenarioName = `Set a 3-character string in ${count} cells`;
					runBenchmarks({
						title: scenarioName,
						matrixSize,
						initialCellValue,
						operation: (matrix) => {
							for (let i = 0; i < count; i++) {
								matrix.setCell(i, i, "abc");
							}
						},
						maxBenchmarkDurationSeconds,
					});

					runBenchmarks({
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
						maxBenchmarkDurationSeconds,
					});

					runBenchmarks({
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
						maxBenchmarkDurationSeconds,
					});
				});
			}
		});
	}
});
