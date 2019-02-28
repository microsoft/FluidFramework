import { Component } from "@prague/app-component";
import {
    EvalFormulaPaused,
    FailureReason,
    IllFormedFormula,
    NotFormulaString,
    NotImplemented,
    ReadOper,
    Result,
    ResultKind,
    UnboxedOper,
    Workbook,
} from "@prague/client-ui/ext/calc";
import { MapExtension, registerDefaultValueType  } from "@prague/map";
import { CounterValueType } from "@prague/map";
import {
    ICombiningOp,
    IntervalType,
    LocalClientId,
    LocalReference,
    Marker,
    MergeTree,
    PropertySet,
    ReferenceType,
    UniversalSequenceNumber,
} from "@prague/merge-tree";
import {
    SharedIntervalCollectionValueType,
//    SharedObjectSequence,
//    SharedObjectSequenceExtension,
    SharedString,
    SharedStringExtension,
    SharedStringIntervalCollectionValueType,
} from "@prague/sequence";
import { CellInterval } from "./cellinterval";
import { createComponentType } from "./pkg";
import { TableSlice } from "./slice";
import { ITable } from "./table";

export const loadCellTextSym = Symbol("TableDocument.loadCellText");
export const storeCellTextSym = Symbol("TableDocument.storeCellText");

type EvaluationResult = Result<ReadOper, FailureReason | NotImplemented | NotFormulaString | IllFormedFormula> | EvalFormulaPaused;

class WorkbookAdapter extends Workbook {
    // TODO: Our base class has a bug that calls 'storeCellText' during init(), overwriting
    //       incoming shared data.
    private isInitializing = true;

    constructor(private readonly doc: TableDocument) {
        // Note: The row/col provided here is only used by the '.init()' method.
        super(doc.numRows, doc.numCols);

        this.isInitializing = true;
        const init = [];
        for (let row = 0; row < doc.numRows; row++) {
            const rowArray: string[] = [];
            init.push(rowArray);
            for (let col = 0; col < doc.numCols; col++) {
                rowArray.push(this.doc[loadCellTextSym](row, col));
            }
        }

        this.init(init);
        this.isInitializing = false;
    }

    protected loadCellText(row: number, col: number): string {
        return this.doc[loadCellTextSym](row, col);
    }

    protected storeCellText(row: number, col: number, value: UnboxedOper) {
        if (this.isInitializing) {
            return;
        }

        this.doc[storeCellTextSym](row, col, value);
    }
}

export class TableDocument extends Component implements ITable {
    private get length()     { return this.mergeTree.getLength(UniversalSequenceNumber, LocalClientId); }
    public  get numCols()    { return Math.min(this.root.get("stride").value, this.length); }
    public  get numRows()    { return Math.floor(this.length / this.numCols); }

    private get sharedString()  { return this.maybeSharedString!; }
    private get mergeTree()     { return this.maybeMergeTree!; }
    private get workbook()      { return this.maybeWorkbook!; }
    public static readonly type = createComponentType(TableDocument);

    private maybeRows?: SharedString;
    private maybeCols?: SharedString;
    private maybeSharedString?: SharedString;
    private maybeMergeTree?: MergeTree;
    private maybeWorkbook?: WorkbookAdapter;

    constructor() {
        super([
            [MapExtension.Type, new MapExtension()],
            [SharedStringExtension.Type, new SharedStringExtension()],
        ]);

        registerDefaultValueType(new CounterValueType());
        registerDefaultValueType(new SharedStringIntervalCollectionValueType());
        registerDefaultValueType(new SharedIntervalCollectionValueType());
    }

    public evaluateCell(row: number, col: number) {
        return this.parseResult(this.workbook.evaluateCell(row, col));
    }

    public evaluateFormula(formula: string) {
        return this.parseResult(this.workbook.evaluateFormulaText(formula, 0, 0));
    }

    public getCellText(row: number, col: number) {
        return this.workbook.getCellText(row, col);
    }

    public setCellText(row: number, col: number, value: UnboxedOper) {
        this.workbook.setCellText(row, col, value);
    }

    public async getRange(label: string) {
        const intervals = this.sharedString.getSharedIntervalCollection(label);
        const interval = (await intervals.getView()).nextInterval(0);
        return new CellInterval(interval, this.localRefToRowCol);
    }

    public async createSlice(sliceId: string, name: string, minRow: number, minCol: number, maxRow: number, maxCol: number): Promise<ITable> {
        await this.host.createAndAttachComponent(sliceId, TableSlice.type);
        return await this.host.openComponent<TableSlice>(
            sliceId, true, [
                ["config", Promise.resolve({ docId: this.host.id, name, minRow, minCol, maxRow, maxCol })],
            ]);
    }

    public annotateRows(startRow: number, endRow: number, properties: PropertySet, op?: ICombiningOp) {
        this.maybeRows.annotateRange(properties, startRow, endRow, op);
    }

    public getRowProperties(row: number): PropertySet {
        const {segment} = this.maybeRows.client.mergeTree.getContainingSegment(row, UniversalSequenceNumber, LocalClientId);
        return segment.properties;
    }

    public annotateCols(startCol: number, endCol: number, properties: PropertySet, op?: ICombiningOp) {
        this.maybeCols.annotateRange(properties, startCol, endCol, op);
    }

    public getColProperties(col: number): PropertySet {
        const {segment} = this.maybeCols.client.mergeTree.getContainingSegment(col, UniversalSequenceNumber, LocalClientId);
        return segment.properties;
    }

    /** For internal use by TableSlice: Please do not use. */
    public createInterval(label: string, minRow: number, minCol: number, maxRow: number, maxCol: number) {
        const start = this.rowColToPosition(minRow, minCol);
        const end = this.rowColToPosition(maxRow, maxCol);
        const intervals = this.sharedString.getSharedIntervalCollection(label);
        intervals.add(start, end, IntervalType.Simple);
    }

    protected async create() {
        const numRows = 7;
        const numCols = 8;

        const rows = this.runtime.createChannel("rows", SharedStringExtension.Type) as SharedString;
        for (let i = numRows; i > 0; i--) {
            rows.insertMarker(0, ReferenceType.Simple, { });
        }
        this.root.set("rows", rows);

        const cols = this.runtime.createChannel("cols", SharedStringExtension.Type) as SharedString;
        for (let i = numCols; i > 0; i--) {
            cols.insertMarker(0, ReferenceType.Simple, { });
        }
        this.root.set("cols", cols);

        const text = this.runtime.createChannel("matrix", SharedStringExtension.Type) as SharedString;
        for (let i = numRows * numCols; i > 0; i--) {
            text.insertMarker(0, ReferenceType.Simple, { value: "" });
        }
        this.root.set("stride", numCols, CounterValueType.Name);
        this.root.set("matrix", text);
    }

    protected async opened() {
        this.maybeSharedString = await this.root.wait("matrix") as SharedString;
        this.maybeRows = await this.root.wait("rows") as SharedString;
        this.maybeCols = await this.root.wait("cols") as SharedString;
        await this.connected;

        const client = this.sharedString.client;
        this.maybeMergeTree = client.mergeTree;
        this.sharedString.on("op", (op, local) => {
            if (!local) {
                for (let row = 0; row < this.numRows; row++) {
                    for (let col = 0; col < this.numCols; col++) {
                        this.workbook.setCellText(row, col, this[loadCellTextSym](row, col), /* isExternal: */ true);
                    }
                }
            }

            this.emit("op", op, local);
        });

        this.maybeWorkbook = new WorkbookAdapter(this);
    }

    private localRefToPosition(localRef: LocalReference) {
        return localRef.toPosition(this.mergeTree, UniversalSequenceNumber, LocalClientId);
    }

    private readonly localRefToRowCol = (localRef: LocalReference) => this.positionToRowCol(this.localRefToPosition(localRef));

    private parseResult(result: EvaluationResult): string | number | boolean {
        switch (result.kind) {
            case ResultKind.Success: {
                const value = result.value;
                switch (typeof value) {
                    case "string":
                    case "number":
                    case "boolean":
                        return value;

                    default:
                        return this.workbook.serialiseValue(value);
                }
            }
            default:
                return result.reason.toString();
        }
    }

    private rowColToPosition(row: number, col: number) {
        return row * this.numCols + col;
    }

    private positionToRowCol(position: number) {
        const row = Math.floor(position / this.numCols);
        const col = position - (row * this.numCols);
        return {row, col};
    }

    private [loadCellTextSym](row: number, col: number): string {
        const { segment } = this.mergeTree.getContainingSegment(this.rowColToPosition(row, col), UniversalSequenceNumber, LocalClientId);
        return (segment as Marker).properties.value;
    }

    private [storeCellTextSym](row: number, col: number, value: UnboxedOper) {
        const position = this.rowColToPosition(row, col);
        this.sharedString.annotateRange({ value: value.toString() }, position, position);
    }
}
