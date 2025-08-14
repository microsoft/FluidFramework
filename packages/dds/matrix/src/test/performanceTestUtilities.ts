/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IChannel } from "@fluidframework/datastore-definitions/internal";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";

import type { ISharedMatrix } from "../index.js";

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
 * Creates a local matrix with the specified size and for dense test matrix given initial value.
 * Otherwise, leaving the initial value as undefined will create a sparse matrix.
 */
export function createTestMatrix({
	matrixSize,
	initialCellValue,
}: TestMatrixOptions): ISharedMatrix & IChannel {
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
	return matrix;
}
