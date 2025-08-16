/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";
import type { IMatrixConsumer } from "@tiny-calc/nano";

import type { ISharedMatrix } from "../index.js";

import { UndoRedoStackManager } from "./undoRedoStackManager.js";
import { matrixFactory } from "./utils.js";

/**
 * {@link createTestMatrix} options.
 */
export interface TestMatrixOptions {
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
export function createTestMatrix(options: TestMatrixOptions): {
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
export interface MatrixBenchmarkOptions extends TestMatrixOptions {
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
	 */
	readonly afterOperation?: (
		matrix: ISharedMatrix,
		undoRedoStack: UndoRedoStackManager,
	) => void;
}
