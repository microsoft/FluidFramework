/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	benchmark,
	benchmarkMemory,
	BenchmarkType,
	isInPerformanceTestingMode,
	type BenchmarkTimer,
	type BenchmarkTimingOptions,
	type IMemoryTestObject,
} from "@fluid-tools/benchmark";
import { unreachableCase } from "@fluidframework/core-utils/internal";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";
import type { IMatrixConsumer } from "@tiny-calc/nano";
import type { Suite, Test } from "mocha";

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
	 * Optional action to perform on the matrix after the operation being measured.
	 *
	 * @remarks Note: in memory benchmarking tests, this currently gets executed after
	 * {@link MatrixBenchmarkOptions.operation} but *before* the memory is measured.
	 * This is an issue and makes it difficult to do proper cleanup without impacting the memory measurement.
	 *
	 * AB#46769 tracks adding a hook to the benchmark infrastructure to allow post-measurement cleanup steps.
	 * Once that has been completed, this code should be updated to leverage it to perform the necessary
	 * post-measurement cleanup steps.
	 */
	readonly afterOperation?: (
		matrix: ISharedMatrix,
		undoRedoStack: UndoRedoStackManager,
	) => void;
}

/**
 * {@link runExecutionTimeBenchmark} configuration.
 */
interface ExecutionTimeBenchmarkConfig extends BenchmarkTimingOptions, MatrixBenchmarkOptions {
	readonly maxBenchmarkDurationSeconds: number;
}

/**
 * Runs a benchmark for measuring the execution time of operations on a SharedMatrix.
 */
function runExecutionTimeBenchmark({
	title,
	matrixSize,
	initialCellValue,
	beforeOperation,
	operation,
	afterOperation,
	minBatchDurationSeconds = 0,
	maxBenchmarkDurationSeconds,
}: ExecutionTimeBenchmarkConfig): Test {
	return benchmark({
		type: BenchmarkType.Measurement,
		title,
		benchmarkFnCustom: async <T>(state: BenchmarkTimer<T>) => {
			let duration: number;
			do {
				assert.equal(state.iterationsPerBatch, 1, "Expected exactly one iteration per batch");

				// Create matrix
				const { matrix, undoRedoStack, cleanUp } = createTestMatrix({
					matrixSize,
					initialCellValue,
				});

				beforeOperation?.(matrix, undoRedoStack);

				// Operation
				const before = state.timer.now();
				operation(matrix, undoRedoStack);
				const after = state.timer.now();

				// Measure
				duration = state.timer.toSeconds(before, after);

				afterOperation?.(matrix, undoRedoStack);

				// Cleanup
				cleanUp();
			} while (state.recordBatch(duration));
		},
		minBatchDurationSeconds,
		maxBenchmarkDurationSeconds,
	});
}

/**
 * {@link runMemoryBenchmark} configuration.
 */
type MemoryBenchmarkConfig = MatrixBenchmarkOptions;

/**
 * Runs a benchmark for measuring the memory usage of operations on a SharedMatrix.
 */
function runMemoryBenchmark({
	title,
	matrixSize,
	initialCellValue,
	beforeOperation,
	operation,
	afterOperation,
}: MemoryBenchmarkConfig): Test {
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

				// TODO: AB#46769: this.matrix = undefined;'
				this.cleanUp = undefined;
			}
		})(),
	);
}

type BenchmarkOptions =
	| (ExecutionTimeBenchmarkConfig & { mode: "execution-time" })
	| (MemoryBenchmarkConfig & { mode: "memory" });

function runBenchmark(options: BenchmarkOptions): Test {
	const mode = options.mode;
	switch (mode) {
		case "execution-time": {
			return runExecutionTimeBenchmark(options);
		}
		case "memory": {
			return runMemoryBenchmark(options);
		}
		default: {
			unreachableCase(mode);
		}
	}
}

/**
 * Shared test suite for matrix execution time and memory benchmarks
 * Note: These benchmarks are designed to closely match the benchmarks in SharedTree.
 * If you modify or add tests here, consider updating the corresponding SharedTree benchmarks as well
 * to ensure consistency and comparability between the two implementations.
 */
export function runBenchmarkTestSuite(mode: "memory" | "execution-time"): Suite {
	return describe(`SharedMatrix ${mode} benchmark`, () => {
		// The value to be set in the cells of the matrix.
		const initialCellValue = "cellValue";

		// The test matrix's size will be 5*5, 50*50.
		// Matrix size 1000 benchmarks removed due to high overhead and unreliable results.
		const matrixSizes = isInPerformanceTestingMode
			? [5, 50]
			: // When not measuring perf, use a single smaller data size so the tests run faster.
				[5];

		// The number of operations to perform on the matrix.
		// Operation counts 1000 removed due to high overhead and unreliable results.
		const operationCounts = isInPerformanceTestingMode
			? [5, 50]
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
							runBenchmark({
								title: scenarioName,
								matrixSize,
								initialCellValue,
								operation: (matrix) => {
									for (let i = 0; i < count; i++) {
										matrix.insertCols(Math.floor(matrix.colCount / 2), 1);
									}
								},
								maxBenchmarkDurationSeconds,
								mode,
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
								maxBenchmarkDurationSeconds,
								mode,
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
								maxBenchmarkDurationSeconds,
								mode,
							});
						});

						describe("Batch column insertion", () => {
							const scenarioName = `Insert a batch of ${count} columns in the middle of the table`;
							runBenchmark({
								title: scenarioName,
								matrixSize,
								initialCellValue,
								operation: (matrix) => {
									matrix.insertCols(Math.floor(matrix.colCount / 2), count);
								},
								maxBenchmarkDurationSeconds,
								mode,
							});

							runBenchmark({
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
								mode,
							});

							runBenchmark({
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
								mode,
							});
						});
					});

					describe("Row insertion", () => {
						describe("Single row insertion", () => {
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
								maxBenchmarkDurationSeconds,
								mode,
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
								maxBenchmarkDurationSeconds,
								mode,
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
								maxBenchmarkDurationSeconds,
								mode,
							});
						});

						describe("Batch row insertion", () => {
							const scenarioName = `Insert a batch of ${count} rows in the middle of the table`;
							runBenchmark({
								title: scenarioName,
								matrixSize,
								initialCellValue,
								operation: (matrix) => {
									matrix.insertRows(Math.floor(matrix.rowCount / 2), count);
								},
								maxBenchmarkDurationSeconds,
								mode,
							});

							runBenchmark({
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
								mode,
							});

							runBenchmark({
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
								mode,
							});
						});
					});

					describe(`Single column and row insertion`, () => {
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
							maxBenchmarkDurationSeconds,
							mode,
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
							maxBenchmarkDurationSeconds,
							mode,
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
							maxBenchmarkDurationSeconds,
							mode,
						});
					});
				}

				// Set/Remove-related tests that are limited by matrixSize
				for (const count of validRemoveCounts) {
					describe("Column removal", () => {
						describe("Single column removal", () => {
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
								maxBenchmarkDurationSeconds,
								mode,
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
								maxBenchmarkDurationSeconds,
								mode,
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
								maxBenchmarkDurationSeconds,
								mode,
							});
						});

						describe("Batch column removal", () => {
							const scenarioName = `Remove ${count} columns from the middle of the table`;
							runBenchmark({
								title: scenarioName,
								matrixSize,
								initialCellValue,
								operation: (matrix) => {
									matrix.removeCols(Math.floor(matrix.colCount / 2), count);
								},
								maxBenchmarkDurationSeconds,
								mode,
							});

							runBenchmark({
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
								mode,
							});

							runBenchmark({
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
								mode,
							});
						});
					});

					describe("Row removal", () => {
						describe("Single row removal", () => {
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
								maxBenchmarkDurationSeconds,
								mode,
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
								maxBenchmarkDurationSeconds,
								mode,
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
								maxBenchmarkDurationSeconds,
								mode,
							});
						});

						describe("Batch row removal", () => {
							const scenarioName = `Remove ${count} rows from the middle of the table`;
							runBenchmark({
								title: scenarioName,
								matrixSize,
								initialCellValue,
								operation: (matrix) => {
									matrix.removeRows(Math.floor(matrix.rowCount / 2), count);
								},
								maxBenchmarkDurationSeconds,
								mode,
							});

							runBenchmark({
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
								mode,
							});

							runBenchmark({
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
								mode,
							});
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
							maxBenchmarkDurationSeconds,
							mode,
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
							maxBenchmarkDurationSeconds,
							mode,
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
							maxBenchmarkDurationSeconds,
							mode,
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
							maxBenchmarkDurationSeconds,
							mode,
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
							maxBenchmarkDurationSeconds,
							mode,
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
							maxBenchmarkDurationSeconds,
							mode,
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
							maxBenchmarkDurationSeconds,
							mode,
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
							maxBenchmarkDurationSeconds,
							mode,
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
							maxBenchmarkDurationSeconds,
							mode,
						});
					});
				}
			});
		}
	});
}
