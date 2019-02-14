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
import { IContainerContext, IRuntime } from "@prague/container-definitions";
import { MapExtension, registerDefaultValueType  } from "@prague/map";
import { Counter, CounterValueType } from "@prague/map";
import {
    IntervalType,
    LocalReference,
    Marker,
    MergeTree,
    ReferenceType,
    UniversalSequenceNumber,
} from "@prague/merge-tree";
import { IChaincode, IChaincodeComponent } from "@prague/runtime-definitions";
import {
    SharedIntervalCollectionValueType,
    SharedString,
    SharedStringExtension,
    SharedStringIntervalCollectionValueType,
} from "@prague/sequence";
import { Deferred } from "@prague/utils";
import { CellRange } from "./cellrange";
export { CellRange };

export const loadCellTextSym = Symbol("TableDocument.loadCellText");
export const storeCellTextSym = Symbol("TableDocument.storeCellText");

// tslint:disable-next-line:no-var-requires
const pkg = require("../package.json");

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

export class TableDocument extends Component {
    public get ready() {
        return this.readyDeferred.promise;
    }

    private get length()     { return this.mergeTree.getLength(UniversalSequenceNumber, this.clientId); }
    public  get numCols()    { return Math.min(this.root.get("stride").value, this.length); }
    public  get numRows()    { return Math.floor(this.length / this.numCols); }

    private get sharedString()  { return this.maybeSharedString!; }
    private get mergeTree()     { return this.maybeMergeTree!; }
    private get clientId()      { return this.maybeClientId!; }
    private get workbook()      { return this.maybeWorkbook!; }

    public static readonly type = `${require("../package.json").name}@${require("../package.json").version}`;

    private maybeSharedString?: SharedString;
    private maybeMergeTree?: MergeTree;
    private maybeClientId?: number;
    private maybeWorkbook?: WorkbookAdapter;
    private readyDeferred = new Deferred<void>();

    constructor() {
        super([
            [MapExtension.Type, new MapExtension()],
            [SharedStringExtension.Type, new SharedStringExtension()],
        ]);

        registerDefaultValueType(new CounterValueType());
        registerDefaultValueType(new SharedStringIntervalCollectionValueType());
        registerDefaultValueType(new SharedIntervalCollectionValueType());
    }

    public async opened() {
        this.maybeSharedString = await this.root.wait("text") as SharedString;
        await this.connected;

        const client = this.sharedString.client;
        this.maybeClientId = client.getClientId();
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
        this.readyDeferred.resolve();
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

    public createRange(label: string, minRow: number, minCol: number, maxRow: number, maxCol: number) {
        const start = this.rowColToPosition(minRow, minCol);
        const end = this.rowColToPosition(maxRow, maxCol);
        const intervals = this.sharedString.getSharedIntervalCollection(label);
        intervals.add(start, end, IntervalType.Simple);
    }

    public async getRange(label: string) {
        const intervals = this.sharedString.getSharedIntervalCollection(label);
        const interval = (await intervals.getView()).nextInterval(0);
        return new CellRange(interval, this.localRefToRowCol);
    }

    protected async create() {
        const numRows = 7;
        const numCols = 8;

        const text = this.runtime.createChannel("text", SharedStringExtension.Type) as SharedString;
        for (let i = numRows * numCols; i > 0; i--) {
            text.insertMarker(0, ReferenceType.Simple, { value: "" });
        }

        this.root.set<Counter>("stride", numCols, CounterValueType.Name);
        this.root.set("text", text);
    }

    private localRefToPosition(localRef: LocalReference) {
        return localRef.toPosition(this.mergeTree, UniversalSequenceNumber, this.clientId);
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
        const { segment } = this.mergeTree.getContainingSegment(this.rowColToPosition(row, col), UniversalSequenceNumber, this.clientId);
        return (segment as Marker).properties.value;
    }

    private [storeCellTextSym](row: number, col: number, value: UnboxedOper) {
        const position = this.rowColToPosition(row, col);
        this.sharedString.removeText(position, position + 1);
        this.sharedString.insertMarker(position, ReferenceType.Simple, { value: value.toString() });
    }
}

export async function instantiate(): Promise<IChaincode> {
    return Component.instantiate(new TableDocument());
}

export async function instantiateComponent(): Promise<IChaincodeComponent> {
    return Component.instantiateComponent(TableDocument);
}

export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
    return Component.instantiateRuntime(context, pkg.name, [[pkg.name, Promise.resolve({ instantiateComponent })]]);
}
