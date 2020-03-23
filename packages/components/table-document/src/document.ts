/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponent, PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import { ICombiningOp, IntervalType, LocalReference, PropertySet } from "@microsoft/fluid-merge-tree";
import {
    IComponentContext,
    IComponentRuntime,
} from "@microsoft/fluid-runtime-definitions";
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
import { ITable, TableDocumentItem } from "./table";

export class TableDocument extends PrimedComponent implements ITable {
    public static getFactory() { return TableDocument.factory; }

    private static readonly factory = new PrimedComponentFactory(
        TableDocument, [
            SparseMatrix.getFactory(),
            SharedNumberSequence.getFactory(),
        ],
    );

    public get numCols() { return this.maybeCols.getLength(); }
    public get numRows() { return this.matrix.numRows; }

    private get matrix(): SparseMatrix { return this.maybeMatrix; }
    private get workbook() { return this.maybeWorkbook; }

    private maybeRows?: SharedNumberSequence;
    private maybeCols?: SharedNumberSequence;
    private maybeMatrix?: SparseMatrix;
    private maybeWorkbook?: ISheetlet;

    constructor(runtime: IComponentRuntime, context: IComponentContext) {
        super(runtime, context);
    }

    public evaluateCell(row: number, col: number): TableDocumentItem {
        try {
            return this.workbook.evaluateCell(row, col);
        } catch (e) {
            return `${e}`;
        }
    }

    public evaluateFormula(formula: string): TableDocumentItem {
        try {
            return this.workbook.evaluateFormula(formula);
        } catch (e) {
            return `${e}`;
        }
    }

    public getCellValue(row: number, col: number): TableDocumentItem {
        return this.matrix.getItem(row, col);
    }

    public setCellValue(row: number, col: number, value: TableDocumentItem, properties?: PropertySet) {
        this.matrix.setItems(row, col, [value], properties);
        this.workbook.invalidate(row, col);
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
        const component = await super.createAndAttachComponent_NEW<TableSlice>(sliceId, TableSliceType,
            { docId: this.runtime.id, name, minRow, minCol, maxRow, maxCol });
        this.root.set(sliceId, (await component).handle);
        return component;
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

    public annotateCell(row: number, col: number, properties: PropertySet) {
        this.matrix.annotatePosition(row, col, properties);
    }

    public getCellProperties(row: number, col: number): PropertySet {
        return this.matrix.getPositionProperties(row, col);
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
            this.root.wait<IComponentHandle<SparseMatrix>>("matrix"),
            this.root.wait<IComponentHandle<SharedNumberSequence>>("rows"),
            this.root.wait<IComponentHandle<SharedNumberSequence>>("cols"),
        ]);

        this.maybeMatrix = await maybeMatrixHandle.get();
        this.maybeRows = await maybeRowsHandle.get();
        this.maybeCols = await maybeColsHandle.get();

        this.matrix.on("op", (op, local, target) => {
            if (!local) {
                // Temporarily, we invalidate the entire matrix when we receive a remote op.
                // This can be improved w/the new SparseMatrix, which makes it easier to decode
                // the range of cells impacted by matrix ops.
                for (let row = 0; row < this.numRows; row++) {
                    for (let col = 0; col < this.numCols; col++) {
                        this.workbook.invalidate(row, col);
                    }
                }
            }

            this.emit("op", op, local, target);
        });

        this.maybeCols.on("op", (...args: any[]) => this.emit("op", ...args));
        this.maybeRows.on("op", (...args: any[]) => this.emit("op", ...args));

        this.matrix.on("sequenceDelta", (...args: any[]) => this.emit("sequenceDelta", ...args));
        this.maybeCols.on("sequenceDelta", (...args: any[]) => this.emit("sequenceDelta", ...args));
        this.maybeRows.on("sequenceDelta", (...args: any[]) => this.emit("sequenceDelta", ...args));

        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const table = this;
        this.maybeWorkbook = createSheetlet({
            get numRows() { return table.numRows; },
            get numCols() { return table.numCols; },
            loadCellText: (row, col) => {
                const raw = this.matrix.getItem(row, col);
                return typeof raw === "object"
                    ? undefined
                    : raw;
            },
            loadCellData: (row, col) => this.matrix.getTag(row, col),
            storeCellData: (row, col, value) => {
                this.matrix.setTag(row, col, value);
            },
        });
    }

    private readonly localRefToRowCol = (localRef: LocalReference) => {
        const position = localRef.toPosition();
        return positionToRowCol(position);
    };
}
