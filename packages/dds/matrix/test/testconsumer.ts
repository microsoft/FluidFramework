/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IMatrixConsumer, IMatrixReader, IMatrixProducer } from "@tiny-calc/nano";
import { DenseVector, RowMajorMatrix } from "@tiny-calc/micro";
import { Serializable } from "@fluidframework/datastore-definitions";

/**
 * IMatrixConsumer implementation that applies change notifications to it's own
 * dense matrix.
 *
 * Comparing the state of the TestConsumer with the original IMatrixProducer is a
 * convenient way to vet that the producer is emitting the correct change notifications.
 */
export class TestConsumer<T extends Serializable = Serializable> implements IMatrixConsumer<T>, IMatrixReader<T> {
    private rows: DenseVector<void> = new DenseVector<void>();
    private cols: DenseVector<void> = new DenseVector<void>();
    private actual: RowMajorMatrix<T> = new RowMajorMatrix<T>(this.rows, this.cols);
    private readonly expected: IMatrixReader<T>;

    constructor (producer: IMatrixProducer<T>) {
        this.expected = producer.openMatrix(this);

        this.rows.splice(/* start: */ 0, /* deleteCount: */ 0, /* insertCount: */ this.expected.rowCount);
        this.cols.splice(/* start: */ 0, /* deleteCount: */ 0, /* insertCount: */ this.expected.colCount);
        this.updateCells();
    }

    private forEachCell(
        callback: (row, col) => void,
        rowStart = 0,
        colStart = 0,
        rowCount = this.rowCount,
        colCount = this.colCount
    ) {
        const rowEnd = rowStart + rowCount;
        const colEnd = colStart + colCount;

        for (let row = rowStart; row < rowEnd; row++) {
            for (let col = colStart; col < colEnd; col++) {
                callback(row, col);
            }
        }
    }

    private updateCells(
        rowStart = 0,
        colStart = 0,
        rowCount = this.rowCount,
        colCount = this.colCount
    ) {
        this.forEachCell((row, col) => {
            this.actual.setCell(row, col, this.expected.getCell(row, col));
        }, rowStart, colStart, rowCount, colCount);
    }

    public get rowCount() { return this.actual.rowCount; }
    public get colCount() { return this.actual.colCount; }
    public get matrixProducer() { return undefined as any; }

    // #region IMatrixConsumer

    rowsChanged(rowStart: number, removedCount: number, insertedCount: number): void {
        this.rows.splice(rowStart, removedCount, insertedCount);
        this.updateCells(rowStart, /* colStart: */ 0, /* rowCount: */ insertedCount, this.actual.colCount);
    }

    colsChanged(colStart: number, removedCount: number, insertedCount: number): void {
        this.cols.splice(colStart, removedCount, insertedCount);
        this.updateCells(/* rowStart: */ 0, colStart, /* rowCount: */ this.actual.rowCount, /* colCount: */ insertedCount);
    }

    cellsChanged(rowStart: number, colStart: number, rowCount: number, colCount: number): void {
        this.updateCells(rowStart, colStart, rowCount, colCount);
    }

    // #endregion IMatrixConsumer

    // #region IMatrixReader

    getCell(row: number, col: number): T {
        return this.expected.getCell(row, col);
    }

    // #endregion IMatrixReader
}
