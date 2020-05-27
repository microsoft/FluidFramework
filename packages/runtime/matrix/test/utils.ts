/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from 'assert';
import { SharedMatrix } from '../src';
import { IArray2D } from "../src/sparsearray2d";
import { Serializable } from '@fluidframework/component-runtime-definitions';

/**
 * Fills the designated region of the matrix with values computed by the `value` callback.
 */
export function fill<T extends IArray2D<U>, U>(
    matrix: T,
    row = 0,
    col = 0,
    numRows = 256,
    numCols = 256,
    value = (row: number, col: number) => row * numRows + col
): T {
    for (let r = row + numRows - 1; r >= row; r--) {
        for (let c = col + numCols - 1; c >= col; c--) {
            matrix.setCell(r, c, value(r, c) as any);
        }
    }
    return matrix;
}

/**
 * Sets the corners of the given matrix.
 */
export function setCorners<T extends IArray2D<U>, U>(matrix: T) {
    matrix.setCell(0, 0, "TopLeft" as any);
    matrix.setCell(0, matrix.numCols - 1, "TopRight" as any);
    matrix.setCell(matrix.numRows - 1, matrix.numCols - 1, "BottomRight" as any);
    matrix.setCell(matrix.numRows - 1, 0, "BottomLeft" as any);
}

/**
 * Checks the corners of the given matrix.
 */
export function checkCorners<T extends IArray2D<U>, U>(matrix: T) {
    assert.equal(matrix.read(0, 0), "TopLeft");
    assert.equal(matrix.read(0, matrix.numCols - 1), "TopRight");
    assert.equal(matrix.read(matrix.numRows - 1, matrix.numCols - 1), "BottomRight");
    assert.equal(matrix.read(matrix.numRows - 1, 0), "BottomLeft");
}

/**
 * Vets that cells are equal to the values computed by the 'value' callback for the designated
 * region of the matrix.
 */
export function check<T extends IArray2D<U>, U>(
    matrix: T,
    row = 0,
    col = 0,
    numRows = 256,
    numCols = 256,
    value = (row: number, col: number) => row * numRows + col
): T {
    for (let r = row + numRows - 1; r >= row; r--) {
        for (let c = col + numCols - 1; c >= col; c--) {
            assert.equal(matrix.read(r, c), value(r, c) as any);
        }
    }
    return matrix;
}

/**
 * Extracts the contents of the given `SharedMatrix` as a jagged 2D array.  This is convenient for
 * comparing matrices via `assert.deepEqual()`.
 */
export function extract<T extends Serializable>(actual: SharedMatrix<T>): ReadonlyArray<ReadonlyArray<T>> {
    const m: T[][] = [];
    for (let r = 0; r < actual.numRows; r++) {
        const row: T[] = [];
        m.push(row);

        for (let c = 0; c < actual.numCols; c++) {
            row.push(actual.read(r, c) as T);
        }
    }

    return m;
}

/**
 * Asserts that given `SharedMatrix` has the specified dimensions.  This is useful for distinguishing
 * between variants of empty matrices (zero rows vs. zero cols vs. zero rows and zero cols).
 */
export function expectSize<T extends Serializable>(matrix: SharedMatrix<T>, numRows: number, numCols: number) {
    assert.equal(matrix.numRows, numRows, "'matrix' must have expected number of rows.");
    assert.equal(matrix.numCols, numCols, "'matrix' must have expected number of columns.");
}

/**
 * Constructs a worst-case SharedMatrix where each row/col is positioned as far as possible
 * from it's neighboring row/cols in the physical storage layer.
 *
 * This is achieved by inserting even row/cols at the end of the matrix and odd row/cols
 * at the middle of the matrix (e.g, [1,3,5,7,0,2,4,6]).
 */
export function insertFragmented(matrix: SharedMatrix, numRows: number, numCols: number) {
    for (let r = 0; r < numRows; r++) {
        matrix.insertRows(
            (r & 1) === 0
                ? matrix.numRows
                : r >> 1,
            1);
    }

    for (let c = 0; c < numCols; c++) {
        matrix.insertCols(
            (c & 1) === 0
                ? matrix.numCols
                : c >> 1,
            1);
    }

    return matrix;
}
