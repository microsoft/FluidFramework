/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	IMatrixConsumer,
	IMatrixProducer,
	IMatrixReader,
	IMatrixWriter,
} from "@tiny-calc/nano";

import { SharedMatrix } from "../index.js";

/**
 * Convenience export of SharedMatrix's factory for usage in tests.
 */
export const matrixFactory = SharedMatrix.getFactory();

export type IMatrix<T> = IMatrixReader<T> & IMatrixWriter<T>;

class NullMatrixConsumer implements IMatrixConsumer<any> {
	rowsChanged(
		rowStart: number,
		removedCount: number,
		insertedCount: number,
		producer: IMatrixProducer<any>,
	): void {}
	colsChanged(
		colStart: number,
		removedCount: number,
		insertedCount: number,
		producer: IMatrixProducer<any>,
	): void {}
	cellsChanged(
		rowStart: number,
		colStart: number,
		rowCount: number,
		colCount: number,
		producer: IMatrixProducer<any>,
	): void {}
}

const nullConsumer = new NullMatrixConsumer();

/**
 * Fills the designated region of the matrix with values computed by the `value` callback.
 */
export function fill<T extends IMatrix<U>, U>(
	matrix: T,
	rowStart = 0,
	colStart = 0,
	rowCount = matrix.rowCount - rowStart,
	colCount = matrix.colCount - colStart,
	value = (row: number, col: number) => row * rowCount + col,
): T {
	const rowEnd = rowStart + rowCount;
	const colEnd = colStart + colCount;

	for (let r = rowStart; r < rowEnd; r++) {
		for (let c = colStart; c < colEnd; c++) {
			matrix.setCell(r, c, value(r, c) as any);
		}
	}

	return matrix;
}

/**
 * Sets the corners of the given matrix.
 */
export function setCorners<T extends IMatrix<U>, U>(matrix: T) {
	matrix.setCell(0, 0, "TopLeft" as any);
	matrix.setCell(0, matrix.colCount - 1, "TopRight" as any);
	matrix.setCell(matrix.rowCount - 1, matrix.colCount - 1, "BottomRight" as any);
	matrix.setCell(matrix.rowCount - 1, 0, "BottomLeft" as any);
}

/**
 * Checks the corners of the given matrix.
 */
export function checkCorners<T extends IMatrix<U>, U>(matrix: T) {
	assert.equal(matrix.getCell(0, 0), "TopLeft");
	assert.equal(matrix.getCell(0, matrix.colCount - 1), "TopRight");
	assert.equal(matrix.getCell(matrix.rowCount - 1, matrix.colCount - 1), "BottomRight");
	assert.equal(matrix.getCell(matrix.rowCount - 1, 0), "BottomLeft");
}

/**
 * Vets that cells are equal to the values computed by the 'value' callback for the designated
 * region of the matrix.
 */
export function check<T extends IMatrix<U>, U>(
	matrix: T,
	rowStart = 0,
	colStart = 0,
	rowCount = matrix.rowCount - rowStart,
	colCount = matrix.colCount - colStart,
	// eslint-disable-next-line @typescript-eslint/no-unsafe-return
	value = (row: number, col: number): U => (row * rowCount + col) as any,
): T {
	const rowEnd = rowStart + rowCount;
	const colEnd = colStart + colCount;

	for (let r = rowStart; r < rowEnd; r++) {
		for (let c = colStart; c < colEnd; c++) {
			assert.equal(matrix.getCell(r, c), value(r, c));
		}
	}
	return matrix;
}

export function checkValue<T extends IMatrix<U>, U>(
	matrix: T,
	test: unknown,
	r: number,
	c: number,
	rowStart = 0,
	rowCount = matrix.rowCount - rowStart,
	// eslint-disable-next-line @typescript-eslint/no-unsafe-return
	value = (row: number, col: number) => (row * rowCount + col) as any,
) {
	assert.equal(test, value(r, c));
}

function withReader<TCells, TResult>(
	producerOrReader: IMatrixReader<TCells> | IMatrixProducer<TCells>,
	callback: (reader: IMatrixReader<TCells>) => TResult,
) {
	if ("openMatrix" in producerOrReader) {
		const reader = producerOrReader.openMatrix(nullConsumer);
		try {
			return callback(reader);
		} finally {
			producerOrReader.closeMatrix(nullConsumer);
		}
	} else {
		return callback(producerOrReader);
	}
}

/**
 * Extracts the contents of the given `matrix` as a jagged 2D array.  This is convenient for
 * comparing matrices via `assert.deepEqual()`.
 */
export const extract = <T>(
	matrix: IMatrixReader<T> | IMatrixProducer<T>,
	rowStart = 0,
	colStart = 0,
	rowCount?: number,
	colCount?: number,
) =>
	withReader(matrix, (reader) => {
		const _rowCount = rowCount ?? reader.rowCount - rowStart;
		const _colCount = colCount ?? reader.colCount - colStart;

		const rows: T[][] = [];
		for (let r = rowStart; r < rowStart + _rowCount; r++) {
			const row: T[] = [];
			rows.push(row);

			for (let c = colStart; c < colStart + _colCount; c++) {
				row.push(reader.getCell(r, c));
			}
		}

		return rows;
	});

/**
 * Asserts that given `matrix` has the specified dimensions.  This is useful for distinguishing
 * between variants of empty matrices (zero rows vs. zero cols vs. zero rows and zero cols).
 */
export function expectSize<T>(
	matrix: IMatrixReader<T> | IMatrixProducer<T>,
	rowCount: number,
	colCount: number,
) {
	withReader(matrix, (reader) => {
		assert.equal(reader.rowCount, rowCount, "'matrix' must have expected number of rows.");
		assert.equal(reader.colCount, colCount, "'matrix' must have expected number of columns.");
	});
}

/**
 * Constructs a worst-case SharedMatrix where each row/col is positioned as far as possible
 * from it's neighboring row/cols in the physical storage layer.
 *
 * This is achieved by inserting even row/cols at the end of the matrix and odd row/cols
 * at the middle of the matrix (e.g, [1,3,5,7,0,2,4,6]).
 */
export function insertFragmented(matrix: SharedMatrix, rowCount: number, colCount: number) {
	for (let r = 0; r < rowCount; r++) {
		matrix.insertRows(
			// eslint-disable-next-line no-bitwise
			(r & 1) === 0
				? matrix.rowCount
				: // eslint-disable-next-line no-bitwise
					r >> 1,
			1,
		);
	}

	for (let c = 0; c < colCount; c++) {
		matrix.insertCols(
			// eslint-disable-next-line no-bitwise
			(c & 1) === 0
				? matrix.colCount
				: // eslint-disable-next-line no-bitwise
					c >> 1,
			1,
		);
	}

	expectSize(matrix, rowCount, colCount);

	return matrix;
}
