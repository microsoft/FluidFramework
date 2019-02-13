import { CellRange, TableDocument, TableDocumentComponent } from "@chaincode/table-document";
import { Component } from "@prague/app-component";
import { ComponentHost } from "@prague/component";
import { IPlatform, ITree } from "@prague/container-definitions";
import { MapExtension } from "@prague/map";
import { IChaincode, IChaincodeComponent, IComponentDeltaHandler, IComponentRuntime } from "@prague/runtime-definitions";
import { Deferred } from "@prague/utils";
import { cellRangeExpr, ConfigView } from "./config";
import { ConfigKeys } from "./configKeys";

export class TableSlice extends Component {
    public get ready() {
        return this.readyDeferred.promise;
    }

    public get name() { return this.root.get(ConfigKeys.name); }
    public set name(value: string) { this.root.set(ConfigKeys.name, value); }
    public get headers() { return this.maybeHeaders!; }
    public get values() { return this.maybeValues!; }

    private get doc() { return this.maybeDoc!; }

    public static readonly type = `${require("../package.json").name}@${require("../package.json").version}`;

    private maybeDoc?: TableDocument;
    private maybeHeaders?: CellRange;
    private maybeValues?: CellRange;
    private readyDeferred = new Deferred<void>();

    constructor(private componentRuntime: IComponentRuntime) {
        super([[MapExtension.Type, new MapExtension()]]);
    }

    public async opened() {
        await this.connected;
        this.readyDeferred.resolve();
    }

    public async attach(platform: IPlatform): Promise<IPlatform> {
        {
            const maybeServerUrl = await this.root.get(ConfigKeys.serverUrl);
            if (!maybeServerUrl) {
                const maybeDiv = await platform.queryInterface<HTMLElement>("div");
                if (maybeDiv) {
                    // tslint:disable-next-line:no-shadowed-variable
                    const docId = this.root.get(ConfigKeys.docId);
                    if (!docId) {
                        const configView = new ConfigView(this.componentRuntime, this.root);
                        maybeDiv.appendChild(configView.root);
                        await configView.done;
                        while (maybeDiv.lastChild) {
                            maybeDiv.lastChild.remove();
                        }
                    }
                }
            }
        }

        const docId = await this.root.get(ConfigKeys.docId);
        const component = await this.componentRuntime.getComponent(docId, true);
        const tableDocComponent = component.chaincode as TableDocumentComponent;
        this.maybeDoc = tableDocComponent.table;
        await this.maybeDoc.ready;

        this.maybeHeaders = await this.getRange(ConfigKeys.headersKey, ConfigKeys.headerText);
        this.maybeValues  = await this.getRange(ConfigKeys.valuesKey, ConfigKeys.valuesText);

        this.root.on("op", this.emitOp);
        this.doc.on("op", this.emitOp);
        return;
    }

    public evaluateCell(row: number, col: number) {
        return this.doc.evaluateCell(row, col);
    }

    public evaluateFormula(formula: string) {
        return this.doc.evaluateFormula(formula);
    }

    protected async create() { /* do nothing */ }

    private colNameToIndex(name: string) {
        return [...name]
            .map((letter) => letter.toUpperCase().charCodeAt(0) - 64)                 // 64 -> A=1, B=2, etc.
            .reduce((accumulator, value) => (accumulator * 26) + value, 0) - 1;     // 1-indexed -> 0-indexed
    }

    private async getRange(rangeKey: ConfigKeys, initKey: ConfigKeys) {
        let id = this.root.get(rangeKey);
        if (!id) {
            // tslint:disable-next-line:insecure-random
            id = `${Math.random().toString(36).substr(2)}`;
            const init = this.root.get(initKey);
            // Note: <input> pattern validation ensures that matches will be non-null.
            const matches = cellRangeExpr.exec(init)!;
            const minCol = this.colNameToIndex(matches[1]);
            const minRow = parseInt(matches[2], 10) - 1;                           // 1-indexed -> 0-indexed
            const maxCol = this.colNameToIndex(matches[3]);
            const maxRow = parseInt(matches[4], 10) - 1;                           // 1-indexed -> 0-indexed
            this.root.set(rangeKey, id);
            await this.doc.createRange(id, minRow, minCol, maxRow, maxCol);
        }

        return await this.doc.getRange(id);
    }

    private readonly emitOp = (...args: any[]) => {
        this.emit("op", ...args);
    }
}

/**
 * A document is a collection of shared types.
 */
export class TableSliceComponent implements IChaincodeComponent {
    public slice: TableSlice;
    private chaincode: IChaincode;
    private component: ComponentHost;

    public async close(): Promise<void> {
        return;
    }

    public async run(runtime: IComponentRuntime): Promise<IComponentDeltaHandler> {
        this.slice = new TableSlice(runtime);
        this.chaincode = Component.instantiate(this.slice);
        const chaincode = this.chaincode;

        // All of the below would be hidden from a developer
        // Is this an await or does it just go?
        const component = await ComponentHost.LoadFromSnapshot(
            runtime,
            runtime.tenantId,
            runtime.documentId,
            runtime.id,
            runtime.parentBranch,
            runtime.existing,
            runtime.options,
            runtime.clientId,
            runtime.blobManager,
            runtime.baseSnapshot,
            chaincode,
            runtime.deltaManager,
            runtime.getQuorum(),
            runtime.storage,
            runtime.connectionState,
            runtime.branch,
            runtime.minimumSequenceNumber,
            runtime.snapshotFn,
            runtime.closeFn);
        this.component = component;

        return component;
    }

    public async attach(platform: IPlatform): Promise<IPlatform> {
        return this.slice.attach(platform);
    }

    public snapshot(): ITree {
        const entries = this.component.snapshotInternal();
        return { entries };
    }
}

export async function instantiateComponent(): Promise<IChaincodeComponent> {
    return new TableSliceComponent();
}
