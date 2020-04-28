/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import "mocha";

import { strict as assert } from "assert";
import { v4 as uuid } from "uuid";
import { TestHost } from "@microsoft/fluid-local-test-utils";
import { SharedMatrix, SharedMatrixFactory } from "../src";
import { IMatrixConsumer, IMatrixProducer, IMatrixReader } from "@tiny-calc/nano";
import { Serializable } from "@microsoft/fluid-runtime-definitions";
import { extract } from "./utils";

// A "no-op" filter includes all rows/cols.
const nopFilter = () => true;

// A "no-op" ordering leaves rows/cols in their original order.
const nopOrder = (_reader: IMatrixReader<unknown>, left: number, right: number) => left - right;

/**
 * A sample matrix transducer that filters & sorts the row/cols of the input matrix per the
 * given filter/order functions.
 */
class MatrixView<T extends Serializable = Serializable> implements IMatrixConsumer<T>, IMatrixProducer<T>, IMatrixReader<T> {
    // Forward mapping from the producer's position -> view's position.
    private readonly rowInToOut: number[] = [];
    private readonly colInToOut: number[] = [];

    // Reverse mapping from the view's position -> producer's position.
    private readonly rowOutToIn: number[] = [];
    private readonly colOutToIn: number[] = [];

    private readonly reader: IMatrixReader<T>;
    private readonly consumers = new Set<IMatrixConsumer<T>>();

    private _rowFilter: (reader: IMatrixReader<T>, row: number) => boolean = nopFilter;
    private _colFilter: (reader: IMatrixReader<T>, col: number) => boolean = nopFilter;
    private _rowOrder: (reader: IMatrixReader<T>, leftRow: number, rightRow: number) => number = nopOrder;
    private _colOrder: (reader: IMatrixReader<T>, leftCol: number, rightCol: number) => number = nopOrder;

    constructor (producer: IMatrixProducer<T>) {
        this.reader = producer.openMatrix(/* consumer: */ this);
    }

    public get rowFilter() { return this._rowFilter }
    public set rowFilter(fn: (reader: IMatrixReader<T>, row: number) => boolean) {
        this._rowFilter = fn;
        this.invalidate();
    }

    public get colFilter() { return this._colFilter }
    public set colFilter(fn: (reader: IMatrixReader<T>, col: number) => boolean) {
        this._colFilter = fn;
        this.invalidate();
    }

    public get rowOrder() { return this._rowOrder }
    public set rowOrder(fn: (reader: IMatrixReader<T>, leftRow: number, rightRow: number) => number) {
        this._rowOrder = fn;
        this.invalidate();
    }

    public get colOrder() { return this._colOrder }
    public set colOrder(fn: (reader: IMatrixReader<T>, leftCol: number, rightCol: number) => number) {
        this._colOrder = fn;
        this.invalidate();
    }

    protected invalidate() {
        const { reader, rowInToOut, colInToOut, rowOutToIn, colOutToIn } = this;

        // Begin building the reverse map from view position -> matrix position by applying the
        // filter function to each input row.  Put the input indices of included rows into the
        // 'rowOutToIn' array.
        rowOutToIn.length = 0;
        for (let row = 0; row < reader.numRows; row++) {
            if (this._rowFilter(reader, row)) {
                rowOutToIn.push(row);
            }
        }

        // Sort the 'rowOutToIn' array using the order function to get the desired view of rows.
        rowOutToIn.sort((leftRow, rightRow) => this._rowOrder(reader, leftRow, rightRow));

        // Use the 'rowOutToIn' array to build the forward mapping from input row index -> output
        // row index.  Excluded rows are assigned an output index of '-1'.
        rowInToOut.length = reader.numRows;
        rowInToOut.fill(-1);
        for (let r = 0; r < rowOutToIn.length; r++) {
            rowInToOut[rowOutToIn[r]] = r;
        }

        // Ditto for columns.
        colOutToIn.length = 0;
        for (let col = 0; col < reader.numCols; col++) {
            if (this._colFilter(reader, col)) {
                colOutToIn.push(col);
            }
        }

        colOutToIn.sort((leftCol, rightCol) => this._colOrder(reader, leftCol, rightCol));
        colInToOut.length = reader.numCols;
        colInToOut.fill(-1);
        for (let c = 0; c < colOutToIn.length; c++) {
            colInToOut[colOutToIn[c]] = c;
        }
    }

    //#region IMatrixConsumer

    rowsChanged(row: number, numRemoved: number, numInserted: number, producer: IMatrixProducer<T>): void {
        this.invalidate();
    }

    colsChanged(col: number, numRemoved: number, numInserted: number, producer: IMatrixProducer<T>): void {
        this.invalidate();
    }

    cellsChanged(row: number, col: number, numRows: number, numCols: number, values: readonly T[], producer: IMatrixProducer<T>): void {
        this.invalidate();
    }

    //#endregion IMatrixConsumer

    //#region IMatrixProducer

    removeMatrixConsumer(consumer: IMatrixConsumer<T>): void {
        this.consumers.delete(consumer);
    }

    openMatrix(consumer: IMatrixConsumer<T>): IMatrixReader<T> {
        this.consumers.add(consumer);
        return this;
    }

    //#endregion IMatrixProducer

    //#region IMatrixReader

    get numRows() { return this.rowOutToIn.length; }
    get numCols() { return this.colOutToIn.length; }

    read(row: number, col: number): T {
        return this.reader.read(this.rowOutToIn[row], this.colOutToIn[col]) as unknown as T;
    }

    //#endregion IMatrixReader
}

describe("MatrixView", () => {
    let host: TestHost;
    let matrix: SharedMatrix<number | string>;
    let view: MatrixView<null | undefined | number | string>;

    before(async () => {
        host = new TestHost([], [SharedMatrix.getFactory()]);
        matrix = await host.createType(uuid(), SharedMatrixFactory.Type);
    });

    after(async () => {
        await host.close();
    });

    describe("filtered/sorted view", () => {
        it("adjusts after set", async () => {
            // Create a 4x4 matrix
            matrix.insertRows(/* start: */ 0, /* count: */ 4);
            matrix.insertCols(/* start: */ 0, /* count: */ 4);

            view = new MatrixView(matrix);

            // Hide rows with a negative value in the 0th col.  If there is no 0th col, hide the row.
            view.rowFilter = (reader, row) =>
                reader.numCols > 0 && !(reader.read(row, 0)! < 0);

            // Hide cols with a negative value in the 0th row.  If there is no 0th row, hide the col.
            view.colFilter = (reader, col) =>
                reader.numRows > 0 && !(reader.read(0, col)! < 0);

            // For remaining rows, sort by the value in the 0th col:
            view.rowOrder = (reader, leftRow, rightRow) =>
                (reader.read(leftRow, 0) as number) - (reader.read(rightRow, 0) as number);

            // For remaining cols, sort by the value in the 0th row:
            view.colOrder = (reader, leftCol, rightCol) =>
                (reader.read(0, leftCol) as number) - (reader.read(0, rightCol) as number);

            // Populate the matrix.
            matrix.setCells(/* row: */ 0, /* col: */ 0, /* numCols: */ 4, [
                -1,   2,   1,   0,
                 2, "A", "B", "C",
                 1, "D", "E", "F",
                 0, "G", "H", "I",
            ]);

            // Ensure that that 0th row/col are hidden and that the remaining cells are in
            // reverse order, per the filter/sort functions given above.
            assert.deepEqual(extract(view), [
                ["I", "H", "G"],
                ["F", "E", "D"],
                ["C", "B", "A"],
            ]);

            // Move the row containing ["I", "H", "G"] to the end by updating the cell used
            // to sort it.
            matrix.setCell(/* row: */ 3, /* col: */ 0, /* value: */ 3);

            assert.deepEqual(extract(view), [
                ["F", "E", "D"],
                ["C", "B", "A"],
                ["I", "H", "G"],
            ]);
        });
    });
});
