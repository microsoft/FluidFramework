import { Component } from "@prague/app-component";
import { MapExtension } from "@prague/map";
import { ICombiningOp, PropertySet } from "@prague/merge-tree";
import { UnboxedOper } from "../../client-ui/ext/calc";
import { CellInterval, parseRange } from "./cellinterval";
import { ConfigKeys } from "./configKeys";
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

export class TableSlice extends Component implements ITable {
    public get name() { return this.root.get(ConfigKeys.name); }
    public set name(value: string) { this.root.set(ConfigKeys.name, value); }
    public get values() { return this.maybeValues!; }
    private get doc() { return this.maybeDoc!; }

    public get numRows() {
        const {start, end} = this.values.getRange();
        return end.row - start.row;
    }

    public get numCols() {
        const {start, end} = this.values.getRange();
        return end.col - start.col;
    }

    private maybeDoc?: TableDocument;
    private maybeValues?: CellInterval;

    constructor() {
        super([[MapExtension.Type, new MapExtension()]]);
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

    protected async create() {
        try {
            const maybeConfig = await this.platform.queryInterface<ITableSliceConfig>("config");
            this.root.set(ConfigKeys.docId, maybeConfig.docId);
            this.root.set(ConfigKeys.name, maybeConfig.name);
            await this.ensureDoc();
            this.createValuesRange(maybeConfig.minCol, maybeConfig.minRow, maybeConfig.maxCol, maybeConfig.maxRow);
        } catch {
            await this.showConfigDlg();
        }
    }

    protected async opened() {
        await this.connected;

        await this.ensureDoc();
        this.maybeValues = await this.doc.getRange(this.root.get(ConfigKeys.valuesKey));

        this.root.on("op", this.emitOp);
        this.doc.on("op", this.emitOp);
    }

    private async ensureDoc() {
        if (!this.maybeDoc) {
            const docId = this.root.get(ConfigKeys.docId);
            this.maybeDoc = await this.host.openComponent(docId, true);
        }
    }

    private async createValuesRange(minCol: number, minRow: number, maxCol: number, maxRow: number) {
        // tslint:disable-next-line:insecure-random
        const valuesRangeId = `values-${Math.random().toString(36).substr(2)}`;
        this.root.set(ConfigKeys.valuesKey, valuesRangeId);
        this.doc.createInterval(valuesRangeId, minRow, minCol, maxRow, maxCol);
    }

    // Checks whether or not a specified row/column combination is within this slice and throws if not.
    private validateInSlice(row?: number, col?: number) {
        const {start, end} = this.values.getRange();

        if (row !== undefined && row < start.row || row > end.row) {
            throw new Error("Unable to access specified row from this slice.");
        }

        if (col !== undefined && col < start.col || col > end.col) {
            throw new Error("Unable to access specified column from this slice.");
        }
    }

    private async showConfigDlg() {
        const maybeDiv = await this.platform.queryInterface<HTMLElement>("div");

        const { ConfigView } = await import(/* webpackPreload: true */ "./config");
        const configView = new ConfigView(this.host, this.root);
        maybeDiv.appendChild(configView.root);
        await configView.done;

        while (maybeDiv.lastChild) {
            maybeDiv.lastChild.remove();
        }

        await this.ensureDoc();

        // Note: <input> pattern validation ensures that parsing will succeed.
        const { minCol, minRow, maxCol, maxRow } = parseRange(this.root.get(ConfigKeys.valuesText));

        this.createValuesRange(minCol, minRow, maxCol, maxRow);
    }

    private readonly emitOp = (...args: any[]) => {
        this.emit("op", ...args);
    }
}
