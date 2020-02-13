/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IMatrixConsumer, IMatrixReader } from "@tiny-calc/nano";

/**
 * IMatrixConsumer implementation that applies change notifications to it's own
 * dense matrix.
 * 
 * Comparing the state of the TestConsumer with the original IMatrixProducer is a
 * convenient way to vet that the producer is emitting the correct change notifications.
 */
export class TestConsumer<T> implements IMatrixConsumer<T>, IMatrixReader<T> {
    private _numCols = 0;
    private _numRows = 0;
    private readonly cells: T[] = [];

    public get numRows() { this.vet(); return this._numRows; } 
    public get numCols() { this.vet(); return this._numCols; }

    // #region IMatrixConsumer

    rowsChanged(row: number, numRemoved: number, numInserted: number): void {
        if (numRemoved > 0) {
            this.removeRows(row, numRemoved);
        }

        if (numInserted > 0) {
            this.insertRows(row, numInserted);
        }
    }
    
    colsChanged(col: number, numRemoved: number, numInserted: number): void {
        if (numRemoved > 0) {
            this.removeCols(col, numRemoved);
        }

        if (numInserted > 0) {
            this.insertCols(col, numInserted);
        }
    }
    
    cellsChanged(row: number, col: number, numRows: number, numCols: number, values: readonly T[]): void {
        let c = this.getRowIndex(row) + col;
        let end = c + numCols;
        for (const value of values) {
            this.cells[c++] = value;
            if (c === end) {
                if (++row > numRows) {
                    break;
                }
                c = this.getRowIndex(row) + col;
                end = c + numCols;
            }
        }
    }

    // #endregion IMatrixConsumer

    // #region IMatrixReader

    read(row: number, col: number): T {
        return this.cells[this.getRowIndex(row) + col];
    }

    // #endregion IMatrixReader

    private insertRows(row: number, numRows: number) {
        this.cells.splice(this.getRowIndex(row), 0, ...new Array(numRows * this._numCols));
        this._numRows += numRows;
        this.vet();
    }

    private removeRows(row: number, numRows: number) {
        this.cells.splice(this.getRowIndex(row), numRows * this._numCols);
        this._numRows -= numRows;
        this.vet();
    }

    private insertCols(col: number, numCols: number) {
        const stride = this.numCols + numCols;
        const max = this.numRows * stride;
        for (let c = col; c < max; c += stride) {
            this.cells.splice(c, 0, ...new Array(numCols));
        }

        this._numCols = stride;
        this.vet();
    }

    private removeCols(col: number, numCols: number) {
        const stride = this.numCols - numCols;
        for (let c = col; c < this.cells.length; c += stride) {
            this.cells.splice(c, numCols);
        }
        this._numCols = stride;
        this.vet();
    }

    private getRowIndex(row: number) {
        this.vet();
        return row * this._numCols;
    }

    public extract(this): ReadonlyArray<ReadonlyArray<T>> {
        const m: T[][] = [];
        for (let r = 0; r < this.numRows; r++) {
            const row: T[] = [];
            m.push(row);
    
            for (let c = 0; c < this.numCols; c++) {
                row.push(this.read(r, c));
            }
        }
    
        return m;
    }

    private vet() {
        // Sanity check that `_numCols` and `_numRows` is consistent with the `cells` array.
        assert((this._numCols === 0 && this.cells.length === 0)
            || (this._numRows === this.cells.length / this._numCols));
    }
}
