import { UnboxedOper, Workbook, ResultKind } from "@prague/client-ui/ext/calc";
import { MapExtension, IMapView, registerDefaultValueType,  } from "@prague/map";
import { SharedString, CollaborativeStringExtension } from "@prague/sequence";
import { Component } from "@prague/app-component";
import { Counter, CounterValueType } from "@prague/map";
import {
    MergeTree,
    UniversalSequenceNumber,
    ReferenceType,
    Marker
} from "@prague/merge-tree";

const loadCellTextSym = Symbol("TableDocument.loadCellText");
const storeCellTextSym = Symbol("TableDocument.storeCellText");

class WorkbookAdapter extends Workbook {
    // TODO: Our base class has a bug that calls 'storeCellText' during init(), overwriting
    //       incoming collaborative data.
    private isInitializing = true;

    constructor (private readonly doc: TableDocument) {
        // Note: The row/col provided here is only used by the '.init()' method.
        super(doc.numRows, doc.numCols);

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
    private maybeSharedString?: SharedString;
    private maybeMergeTree?: MergeTree;
    private maybeClientId?: number;
    private maybeRootView?: IMapView;
    private maybeWorkbook?: WorkbookAdapter;

    constructor() {
        super([
            [MapExtension.Type, new MapExtension()],
            [CollaborativeStringExtension.Type, new CollaborativeStringExtension()]
        ]);

        registerDefaultValueType(new CounterValueType());
    }
    
    protected async create() {
        const text = this.runtime.createChannel("text", CollaborativeStringExtension.Type) as SharedString;
        this.root.set("text", text);
        this.root.set<Counter>("stride", 4, CounterValueType.Name);

        for (let i = 0; i < 16; i++) {
            text.insertMarker(0, ReferenceType.Simple, { value: "" });
        }
    }

    public async opened() {
        this.maybeSharedString = await this.root.wait("text") as SharedString;
        this.maybeSharedString.on("op", (op, local) => { 
            this.emit("op", op, local)
        });
        const client = this.sharedString.client;
        this.maybeClientId = client.getClientId();
        this.maybeMergeTree = client.mergeTree;
        this.maybeRootView = await this.root.getView();
        if (!this.runtime.connected) {
            await new Promise<void>(accept => {
                this.runtime.on("connected", accept);
            });
        }

        this.maybeWorkbook = new WorkbookAdapter(this);
    }

    private get length() { return this.mergeTree.getLength(UniversalSequenceNumber, this.clientId); }
    public get numCols() { return Math.min(this.rootView.get("stride").value, this.length); }
    public get numRows() { return Math.floor(this.length / this.numCols); }

    public evaluateCell(row: number, col: number) {
        const result = this.workbook.evaluateCell(row, col);
        switch (result.kind) {
            case ResultKind.Success:
                return this.workbook.serialiseValue(result.value);
            default:
                return result.reason.toString();
        }
    }

    private [loadCellTextSym](row: number, col: number): string {
        const { segment } = this.mergeTree.getContainingSegment(row * this.numRows + col, UniversalSequenceNumber, this.clientId);
        return (segment as Marker).properties["value"];
    }

    public getCellText(row: number, col: number) { return this.workbook.getCellText(row, col); }
    public setCellText(row: number, col: number, value: UnboxedOper) { return this.workbook.setCellText(row, col, value); }
    
    private [storeCellTextSym](row: number, col: number, value: UnboxedOper) {
        const { segment } = this.mergeTree.getContainingSegment(row * this.numRows + col, UniversalSequenceNumber, this.clientId);
        this.sharedString.annotateMarker({ value: value.toString() }, segment as Marker);
    }

    private get sharedString() { return this.maybeSharedString!; }
    private get mergeTree() { return this.maybeMergeTree!; }
    private get clientId() { return this.maybeClientId!; }
    private get workbook() { return this.maybeWorkbook!; }
    private get rootView() { return this.maybeRootView!; }

    public static readonly type = "@chaincode/table-document@latest";

    // The below works, but causes 'webpack --watch' to build in an infinite loop when
    // build automatically publishes.
    //
    // public static readonly type = `${require("../package.json").name}@latest`;
}

// Chainloader bootstrap.
export async function instantiate() {
    return Component.instantiate(new TableDocument());
}
