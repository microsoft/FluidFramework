/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IMatrixConsumer, IMatrixReader, IMatrixProducer } from "@tiny-calc/nano";

/**
 * IMatrixConsumer implementation that applies change notifications to it's own
 * dense matrix.
 *
 * Comparing the state of the TestConsumer with the original IMatrixProducer is a
 * convenient way to vet that the producer is emitting the correct change notifications.
 */
export class TestConsumer<T = any> implements IMatrixConsumer<T>, IMatrixReader<T> {
    private _rowCount = 0;
    private _colCount = 0;
    private readonly cells: T[] = [];
    private readonly reader: IMatrixReader<T>;

    constructor (producer: IMatrixProducer<T>) {
        this.reader = producer.openMatrix(this);
    }

    public get rowCount() { this.vet(); return this._rowCount; }
    public get colCount() { this.vet(); return this._colCount; }
    public get matrixProducer() { return undefined as any; }

    // #region IMatrixConsumer

    rowsChanged(rowStart: number, removedCount: number, insertedCount: number): void {
        if (removedCount > 0) {
            this.removeRows(rowStart, removedCount);
        }

        if (insertedCount > 0) {
            this.insertRows(rowStart, insertedCount);
        }

        this.vet();
    }

    colsChanged(colStart: number, removedCount: number, insertedCount: number): void {
        if (removedCount > 0) {
            this.removeCols(colStart, removedCount);
        }

        if (insertedCount > 0) {
            this.insertCols(colStart, insertedCount);
        }

        this.vet();
    }

    cellsChanged(rowStart: number, colStart: number, rowCount: number, colCount: number): void {
        const rowEnd = rowStart + rowCount;
        const colEnd = colStart + colCount;

        for (let row = rowStart; row < rowEnd; row++) {
            for (let col = colStart; col < colEnd; col++) {
                this.cells[this.getRowIndex(row) + col] = this.reader.getCell(row, col);
            }
        }

        // Vet that `rowCount` & `colCount` are consistent with the source `reader`.
        assert(this._rowCount === this.reader.rowCount
            && this._colCount == this.reader.colCount);

        for (let i = 0, r = 0; r < this._rowCount; r++) {
            for (let c = 0; c < this._colCount; c++) {
                assert.equal(this.cells[i++], this.reader.getCell(r, c));
            }
        }
    }

    // #endregion IMatrixConsumer

    // #region IMatrixReader

    getCell(row: number, col: number): T {
        return this.cells[this.getRowIndex(row) + col];
    }

    // #endregion IMatrixReader

    private insertRows(row: number, rowCount: number) {
        this.cells.splice(this.getRowIndex(row), 0, ...new Array(rowCount * this._colCount));
        this._rowCount += rowCount;
    }

    private removeRows(row: number, rowCount: number) {
        this.cells.splice(this.getRowIndex(row), rowCount * this._colCount);
        this._rowCount -= rowCount;
    }

    private insertCols(col: number, colCount: number) {
        const stride = this._colCount + colCount;
        const max = this._rowCount * stride;
        for (let c = col; c < max; c += stride) {
            this.cells.splice(c, 0, ...new Array(colCount));
        }

        this._colCount = stride;
    }

    private removeCols(col: number, colCount: number) {
        const stride = this._colCount - colCount;
        for (let c = col; c < this.cells.length; c += stride) {
            this.cells.splice(c, colCount);
        }
        this._colCount = stride;
    }

    private getRowIndex(row: number) {
        return row * this._colCount;
    }

    public extract(this): ReadonlyArray<ReadonlyArray<T>> {
        const m: T[][] = [];
        for (let r = 0; r < this._rowCount; r++) {
            const row: T[] = [];
            m.push(row);

            for (let c = 0; c < this.colCount; c++) {
                row.push(this.getCell(r, c));
            }
        }

        return m;
    }

    private vet() {
        // Vet that `rowCount` & `colCount` are consistent with the `cells` array.
        assert((this._colCount === 0 && this.cells.length === 0)
            || (this._rowCount === this.cells.length / this._colCount));
    }
}
