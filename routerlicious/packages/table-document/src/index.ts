import { UnboxedOper, Workbook, ResultKind } from "@prague/client-ui/ext/calc";
import { MapExtension, IMapView, registerDefaultValueType,  } from "@prague/map";
import { SharedString, CollaborativeStringExtension } from "@prague/shared-string";
import { Component } from "@prague/app-component";
import { Counter, CounterValueType } from "@prague/map";
import {
    MergeTree,
    UniversalSequenceNumber,
    ReferenceType,
    Marker
} from "@prague/merge-tree";

class WorkbookAdapter extends Workbook {
    constructor (private readonly doc: TableDocument) {
        // Note: The row/col provided here is only used by the '.init()' method.
        super(NaN, NaN);
    }

    protected loadCellText(row: number, col: number): string {
        return this.doc.loadCellText(row, col);
    }
    
    protected storeCellText(row: number, col: number, value: UnboxedOper) {
        this.doc.storeCellText(row, col, value);
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
        this.maybeSharedString.on("op", (op, local) => { this.emit("op", op, local) });
        const client = this.sharedString.client;
        this.maybeClientId = client.getClientId();
        this.maybeMergeTree = client.mergeTree;
        this.maybeRootView = await this.root.getView();
        this.maybeWorkbook = new WorkbookAdapter(this);
        
        if (!this.runtime.connected) {
            console.log("*** awaiting connection");
            return new Promise<void>(accept => {
                console.log("connected!");
                this.runtime.on("connected", accept);
            })
        } else {
            console.log("*** already connected?");
        }
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

    public loadCellText(row: number, col: number): string {
        const { segment } = this.mergeTree.getContainingSegment(row * this.numRows + col, UniversalSequenceNumber, this.clientId);
        return (segment as Marker).properties["value"];
    }
    
    public storeCellText(row: number, col: number, value: UnboxedOper) {
        const { segment } = this.mergeTree.getContainingSegment(row * this.numRows + col, UniversalSequenceNumber, this.clientId);
        (segment as Marker).properties["value"] = value.toString();
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