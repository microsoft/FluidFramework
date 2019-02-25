import { Component } from "@prague/app-component";
import { MapExtension } from "@prague/map";
import { UnboxedOper } from "../../client-ui/ext/calc";
import { CellRange, parseRange } from "./cellrange";
import { ConfigKeys } from "./configKeys";
import { TableDocument } from "./document";
import { createComponentType } from "./pkg";
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
    public static readonly type = createComponentType(TableSlice);

    public get name() { return this.root.get(ConfigKeys.name); }
    public set name(value: string) { this.root.set(ConfigKeys.name, value); }
    public get values() { return this.maybeValues!; }
    private get doc() { return this.maybeDoc!; }

    private maybeDoc?: TableDocument;
    private maybeValues?: CellRange;

    constructor() {
        super([[MapExtension.Type, new MapExtension()]]);
    }

    public async opened() {
        await this.connected;

        await this.ensureDoc();
        this.maybeValues = await this.doc.getRange(this.root.get(ConfigKeys.valuesKey));

        this.root.on("op", this.emitOp);
        this.doc.on("op", this.emitOp);
    }

    public get numRows() {
        const {start, end} = this.maybeValues.getPositions();
        return end.row - start.row;
    }

    public get numCols() {
        const {start, end} = this.maybeValues.getPositions();
        return end.col - start.col;
    }

    public evaluateCell(row: number, col: number) {
        return this.doc.evaluateCell(row, col);
    }

    public evaluateFormula(formula: string) {
        return this.doc.evaluateFormula(formula);
    }

    public getCellText(row: number, col: number): string {
        return this.doc.getCellText(row, col);
    }

    public setCellText(row: number, col: number, value: UnboxedOper) {
        this.doc.setCellText(row, col, value);
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
        await this.doc.createRange(valuesRangeId, minRow, minCol, maxRow, maxCol);
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
