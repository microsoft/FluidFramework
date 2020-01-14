/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { PrimedComponent, PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import { ICombiningOp, IntervalType, LocalReference, PropertySet } from "@microsoft/fluid-merge-tree";
import { IComponentContext, IComponentRuntime, JsonablePrimitive } from "@microsoft/fluid-runtime-definitions";
import {
    positionToRowCol,
    rowColToPosition,
    SharedNumberSequence,
    SparseMatrix,
} from "@microsoft/fluid-sequence";
import { createSheetlet, ISheetlet } from "@tiny-calc/micro";
import { CellRange } from "./cellrange";
import { TableSliceType } from "./componentTypes";
import { debug } from "./debug";
import { TableSlice } from "./slice";
import { ITable } from "./table";

export const loadCellTextSym = Symbol("TableDocument.loadCellText");
export const storeCellTextSym = Symbol("TableDocument.storeCellText");
export const loadCellSym = Symbol("TableDocument.loadCell");
export const storeCellSym = Symbol("TableDocument.storeCell");
export const cellSym = Symbol("TableDocument.cell");

export type TableDocumentItem = JsonablePrimitive;

export class TableDocument extends PrimedComponent implements ITable {
    public static getFactory() { return TableDocument.factory; }

    private static readonly factory = new PrimedComponentFactory(
        TableDocument,
        [
            SparseMatrix.getFactory(),
            SharedNumberSequence.getFactory(),
        ],
    );

    public get numCols() { return this.maybeCols.getLength(); }
    public get numRows() { return this.matrix.numRows; }

    private get matrix() { return this.maybeMatrix; }
    private get workbook() { return this.maybeWorkbook; }

    private maybeRows?: SharedNumberSequence;
    private maybeCols?: SharedNumberSequence;
    private maybeMatrix?: SparseMatrix;
    private maybeWorkbook?: ISheetlet;

    constructor(runtime: IComponentRuntime, context: IComponentContext) {
        super(runtime, context);
    }

    public evaluateCell(row: number, col: number) {
        try {
            return this.workbook.evaluateCell(row, col);
        } catch (e) {
            return `${e}`;
        }
    }

    public evaluateFormula(formula: string) {
        try {
            return this.workbook.evaluateFormula(formula);
        } catch (e) {
            return `${e}`;
        }
    }

    public getCellValue(row: number, col: number): TableDocumentItem {
        return this[loadCellTextSym](row, col);
    }

    public setCellValue(row: number, col: number, value: TableDocumentItem) {
        this.workbook.setCellText(row, col, value);
    }

    public async getRange(label: string) {
        const intervals = this.matrix.getIntervalCollection(label);
        const interval = (await intervals.getView()).nextInterval(0);
        return new CellRange(interval, this.localRefToRowCol);
    }

    public async createSlice(
        sliceId: string,
        name: string,
        minRow: number,
        minCol: number,
        maxRow: number,
        maxCol: number): Promise<ITable> {
        return super.createAndAttachComponent<TableSlice>(sliceId, TableSliceType,
            { docId: this.runtime.id, name, minRow, minCol, maxRow, maxCol });
    }

    public annotateRows(startRow: number, endRow: number, properties: PropertySet, op?: ICombiningOp) {
        this.maybeRows.annotateRange(startRow, endRow, properties, op);
    }

    public getRowProperties(row: number): PropertySet {
        return this.maybeRows.getPropertiesAtPosition(row);
    }

    public annotateCols(startCol: number, endCol: number, properties: PropertySet, op?: ICombiningOp) {
        this.maybeCols.annotateRange(startCol, endCol, properties, op);
    }

    public getColProperties(col: number): PropertySet {
        return this.maybeCols.getPropertiesAtPosition(col);
    }

    // For internal use by TableSlice: Please do not use.
    public createInterval(label: string, minRow: number, minCol: number, maxRow: number, maxCol: number) {
        debug(`createInterval(${label}, ${minRow}:${minCol}..${maxRow}:${maxCol})`);
        const start = rowColToPosition(minRow, minCol);
        const end = rowColToPosition(maxRow, maxCol);
        const intervals = this.matrix.getIntervalCollection(label);
        intervals.add(start, end, IntervalType.SlideOnRemove);
    }

    public insertRows(startRow: number, numRows: number) {
        this.matrix.insertRows(startRow, numRows);
        this.maybeRows.insert(startRow, new Array(numRows).fill(0));
    }

    public removeRows(startRow: number, numRows: number) {
        this.matrix.removeRows(startRow, numRows);
        this.maybeRows.remove(startRow, startRow + numRows);
    }

    public insertCols(startCol: number, numCols: number) {
        this.matrix.insertCols(startCol, numCols);
        this.maybeCols.insert(startCol, new Array(numCols).fill(0));
    }

    public removeCols(startCol: number, numCols: number) {
        this.matrix.removeCols(startCol, numCols);
        this.maybeCols.remove(startCol, startCol + numCols);
    }

    protected async componentInitializingFirstTime() {
        const rows = SharedNumberSequence.create(this.runtime, "rows");
        this.root.set("rows", rows.handle);

        const cols = SharedNumberSequence.create(this.runtime, "cols");
        this.root.set("cols", cols.handle);

        const matrix = SparseMatrix.create(this.runtime, "matrix");
        this.root.set("matrix", matrix.handle);
    }

    protected async componentHasInitialized() {
        const [maybeMatrixHandle, maybeRowsHandle, maybeColsHandle] = await Promise.all([
            this.root.wait<IComponentHandle>("matrix"),
            this.root.wait<IComponentHandle>("rows"),
            this.root.wait<IComponentHandle>("cols"),
        ]);

        this.maybeMatrix = await maybeMatrixHandle.get<SparseMatrix>();
        this.maybeRows = await maybeRowsHandle.get<SharedNumberSequence>();
        this.maybeCols = await maybeColsHandle.get<SharedNumberSequence>();

        this.matrix.on("op", (op, local, target) => {
            if (!local) {
                for (let row = 0; row < this.numRows; row++) {
                    for (let col = 0; col < this.numCols; col++) {
                        this.workbook.refreshFromModel(row, col);
                    }
                }
            }

            this.emit("op", op, local, target);
        });

        this.maybeCols.on("op", (...args: any[]) => this.emit("op", ...args));
        this.maybeRows.on("op", (...args: any[]) => this.emit("op", ...args));

        this.matrix.on("sequenceDelta", (e, t) => this.emit("sequenceDelta", e, t));
        this.maybeCols.on("sequenceDelta", (e, t) => this.emit("sequenceDelta", e, t));
        this.maybeRows.on("sequenceDelta", (e, t) => this.emit("sequenceDelta", e, t));

        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const table = this;
        this.maybeWorkbook = createSheetlet({
            get numRows() { return table.numRows; },
            get numCols() { return table.numCols; },
            loadCellText: (row, col) => table[loadCellTextSym](row, col),
            storeCellText(row, col, value) { table[storeCellTextSym](row, col, value); },
            loadCellData: (row, col) => table[loadCellSym](row, col),
            storeCellData(row, col, value) { table[storeCellSym](row, col, value); },
        });
    }

    private [loadCellTextSym](row: number, col: number): TableDocumentItem {
        return this.matrix.getItem(row, col) as TableDocumentItem;
    }

    private [storeCellTextSym](row: number, col: number, value: TableDocumentItem) {
        this.matrix.setItems(row, col, [value]);
    }

    private [loadCellSym](row: number, col: number): object | undefined {
        return this.matrix.getTag(row, col);
    }

    private [storeCellSym](row: number, col: number, cell: object | undefined) {
        this.matrix.setTag(row, col, cell);
        assert.strictEqual(this[loadCellSym](row, col), cell);
    }

    private readonly localRefToRowCol = (localRef: LocalReference) => {
        const position = localRef.toPosition();
        return positionToRowCol(position);
    };
}
