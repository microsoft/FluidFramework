/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponent, PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import { ICombiningOp, PropertySet } from "@microsoft/fluid-merge-tree";
import { IComponentContext, IComponentRuntime } from "@microsoft/fluid-runtime-definitions";
import { UnboxedOper } from "@microsoft/fluid-sequence";
import { CellRange } from "./cellrange";
import { ConfigKey } from "./configKey";
import { TableDocument } from "./document";
import { ITable } from "./table";

export interface ITableSliceConfig {
    docId: string;
    name: string;
    minRow: number;
    minCol: number;
    maxRow: number;
    maxCol: number;
}

export class TableSlice extends PrimedComponent implements ITable {
    public static getFactory() { return TableSlice.factory; }

    private static readonly factory = new PrimedComponentFactory(
        TableSlice,
        [],
    );

    public get name() { return this.root.get(ConfigKey.name); }
    public set name(value: string) { this.root.set(ConfigKey.name, value); }
    public get values() { return this.maybeValues!; }
    private get doc() { return this.maybeDoc!; }

    public get numRows() { return this.values.getRange().numRows; }
    public get numCols() { return this.values.getRange().numCols; }

    private maybeDoc?: TableDocument;
    private maybeValues?: CellRange;

    constructor(runtime: IComponentRuntime, context: IComponentContext) {
        super(runtime, context);
    }

    public evaluateCell(row: number, col: number) {
        this.validateInSlice(row, col);
        return this.doc.evaluateCell(row, col);
    }

    public evaluateFormula(formula: string) {
        return this.doc.evaluateFormula(formula);
    }

    public getCellValue(row: number, col: number): UnboxedOper {
        this.validateInSlice(row, col);
        return this.doc.getCellValue(row, col);
    }

    public setCellValue(row: number, col: number, value: UnboxedOper) {
        this.validateInSlice(row, col);
        this.doc.setCellValue(row, col, value);
    }

    public annotateRows(startRow: number, endRow: number, properties: PropertySet, op?: ICombiningOp) {
        this.validateInSlice(startRow, undefined);
        this.validateInSlice(endRow - 1, undefined);
        this.doc.annotateRows(startRow, endRow, properties, op);
    }

    public getRowProperties(row: number): PropertySet {
        this.validateInSlice(row, undefined);
        return this.doc.getRowProperties(row);
    }

    public annotateCols(startCol: number, endCol: number, properties: PropertySet, op?: ICombiningOp) {
        this.validateInSlice(undefined, startCol);
        this.validateInSlice(undefined, endCol - 1);
        this.doc.annotateCols(startCol, endCol, properties, op);
    }

    public getColProperties(col: number): PropertySet {
        this.validateInSlice(undefined, col);
        return this.doc.getColProperties(col);
    }

    public insertRows(startRow: number, numRows: number) {
        this.doc.insertRows(startRow, numRows);
    }

    public removeRows(startRow: number, numRows: number) {
        this.doc.removeRows(startRow, numRows);
    }

    public insertCols(startCol: number, numCols: number) {
        this.doc.insertCols(startCol, numCols);
    }

    public removeCols(startCol: number, numCols: number)  {
        this.doc.removeCols(startCol, numCols);
    }

    protected async componentInitializingFirstTime(props?: any) {
        if (!props) {
            return Promise.reject();
        }
        const maybeConfig = props!;
        this.root.set(ConfigKey.docId, maybeConfig.docId);
        this.root.set(ConfigKey.name, maybeConfig.name);
        await this.ensureDoc();
        this.createValuesRange(maybeConfig.minCol, maybeConfig.minRow, maybeConfig.maxCol, maybeConfig.maxRow);
    }

    protected async componentInitializingFromExisting() {
        await this.ensureDoc();
    }

    protected async componentHasInitialized() {
        this.maybeValues = await this.doc.getRange(this.root.get(ConfigKey.valuesKey));

        this.root.on("op", this.emitOp);
        this.doc.on("op", this.emitOp);
    }

    private async ensureDoc() {
        if (!this.maybeDoc) {
            const docId = this.root.get(ConfigKey.docId);
            this.maybeDoc = await this.getComponent(docId);
        }
    }

    private createValuesRange(minCol: number, minRow: number, maxCol: number, maxRow: number) {
        // tslint:disable-next-line:insecure-random
        const valuesRangeId = `values-${Math.random().toString(36).substr(2)}`;
        this.root.set(ConfigKey.valuesKey, valuesRangeId);
        this.doc.createInterval(valuesRangeId, minRow, minCol, maxRow, maxCol);
    }

    // Checks whether or not a specified row/column combination is within this slice and throws if not.
    private validateInSlice(row?: number, col?: number) {
        const range = this.values.getRange();

        if (row !== undefined && row < range.row || row >= (range.row + range.numRows)) {
            throw new Error("Unable to access specified row from this slice.");
        }

        if (col !== undefined && col < range.col || col >= (range.col + range.numCols)) {
            throw new Error("Unable to access specified column from this slice.");
        }
    }

    private readonly emitOp = (...args: any[]) => {
        this.emit("op", ...args);
    }
}
