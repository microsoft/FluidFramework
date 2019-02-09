import { MapExtension, IMapView } from "@prague/map";
import { Component } from "@prague/app-component";
import { ITree, IPlatform } from "@prague/container-definitions";
import { ComponentHost } from "@prague/runtime";
import { IChaincode, IChaincodeComponent, IComponentPlatform, IComponentRuntime, IComponentDeltaHandler } from "@prague/runtime-definitions";
import { TableDocument, CellRange, TableDocumentComponent } from "@chaincode/table-document";
import { Deferred } from "@prague/utils";
import { ConfigView } from "./config";
import { ConfigKeys } from "./configKeys";

export class TableSlice extends Component {
    public get ready() {
        return this.readyDeferred.promise;
    }

    private maybeDoc?: TableDocument;
    private maybeRootView?: IMapView;
    private maybeHeaders?: CellRange;
    private maybeValues?: CellRange;
    private readyDeferred = new Deferred<void>();

    constructor(private componentRuntime: IComponentRuntime) {
        super([[MapExtension.Type, new MapExtension()]]);
    }
    
    protected async create() { }

    private async getRange(key: ConfigKeys) {
        let id = this.rootView.get(key);

        if (!id) {
            id = `${Math.random().toString(36).substr(2)}`;
            this.rootView.set(key, id);
            await this.doc.createRange(id, 0, 0, 0, 0);                
        }

        return await this.doc.getRange(id);
    }

    public async opened() {
        await this.connected;
        this.maybeRootView = await this.root.getView();
        this.readyDeferred.resolve();
    }

    public async attach(platform: IComponentPlatform): Promise<IComponentPlatform> {
        {
            const maybeServerUrl = await this.root.get(ConfigKeys.serverUrl);
            if (!maybeServerUrl) {
                const maybeDiv = await platform.queryInterface<HTMLElement>("div");
                if (maybeDiv) {            
                    const docId = this.rootView.get(ConfigKeys.docId);
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
        const component = await this.componentRuntime.getProcess(docId, true);
        const tableDocComponent = component.chaincode as TableDocumentComponent;
        this.maybeDoc = tableDocComponent.table;
        await this.maybeDoc.ready;

        this.maybeHeaders = await this.getRange(ConfigKeys.headersRange);
        this.maybeValues  = await this.getRange(ConfigKeys.valuesRange);

        this.doc.on("op", (...args) => this.emit("op", ...args));

        return;
    }

    public get name() { return this.rootView.get(ConfigKeys.name); }
    public set name(value: string) { this.rootView.set(ConfigKeys.name, value); }
    public get headers() { return this.maybeHeaders! }
    public get values() { return this.maybeValues! }

    private get doc() { return this.maybeDoc!; }
    private get rootView() { return this.maybeRootView!; }

    public static readonly type = `${require("../package.json").name}@${require("../package.json").version}`;
}

/**
 * A document is a collection of collaborative types.
 */
export class TableSliceComponent implements IChaincodeComponent {
    public slice: TableSlice;
    private chaincode: IChaincode;
    private component: ComponentHost;

    public getModule(type: string) {
        return null;
    }

    public async close(): Promise<void> {
        return;
    }

    public async run(runtime: IComponentRuntime, platform: IPlatform): Promise<IComponentDeltaHandler> {
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
            runtime.user,
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

    public async attach(platform: IComponentPlatform): Promise<IComponentPlatform> {
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
