import { MapExtension } from "@prague/map";
import { Component } from "@prague/app-component";
import { ITree, IPlatform } from "@prague/container-definitions";
import { ComponentHost } from "@prague/runtime";
import { IChaincode, IChaincodeComponent, IComponentPlatform, IComponentRuntime, IComponentDeltaHandler } from "@prague/runtime-definitions";
import { TableDocumentComponent } from "@chaincode/table-document";
import { Deferred } from "@prague/utils";
import { GridView } from "./grid";
import { ConfigView } from "./config";
import { ConfigKeys } from "./configKeys";

export class TableView extends Component {
    private ready = new Deferred<void>();

    constructor(private componentRuntime: IComponentRuntime) {
        super([[MapExtension.Type, new MapExtension()]]);
    }
    
    protected async create() {}

    public async opened() {
        await this.connected;
        this.ready.resolve();        
    }

    public async attach(platform: IComponentPlatform): Promise<IComponentPlatform> {
        const maybeDiv = await platform.queryInterface<HTMLElement>("div");
        if (!maybeDiv) {
            console.error(`No <div> provided`);
            return;
        }

        const docId = await this.root.get(ConfigKeys.docId);
        if (!docId) {
            const configView = new ConfigView(this.componentRuntime, this.root);
            maybeDiv.appendChild(configView.root);
            await configView.done;
            while (maybeDiv.lastChild) {
                maybeDiv.lastChild.remove();
            }
        }

        if (maybeDiv) {
            const docId = await this.root.get(ConfigKeys.docId);
            const component = await this.componentRuntime.getProcess(docId, true);
            const tableDocComponent = component.chaincode as TableDocumentComponent;
            const doc = tableDocComponent.table;
            const grid = new GridView(doc);
            maybeDiv.appendChild(grid.root);
        }
    }

    public static readonly type = `${require("../package.json").name}@${require("../package.json").version}`;
}

/**
 * A document is a collection of collaborative types.
 */
export class TableViewComponent implements IChaincodeComponent {
    public view: TableView;
    private chaincode: IChaincode;
    private component: ComponentHost;

    constructor() {
    }

    public getModule(type: string) {
        return null;
    }

    public async close(): Promise<void> {
        return;
    }

    public async run(runtime: IComponentRuntime, platform: IPlatform): Promise<IComponentDeltaHandler> {
        this.view = new TableView(runtime);
        this.chaincode = Component.instantiate(this.view);
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
        return this.view.attach(platform);
    }

    public snapshot(): ITree {
        const entries = this.component.snapshotInternal();
        return { entries };
    }
}

export async function instantiateComponent(): Promise<IChaincodeComponent> {
    return new TableViewComponent();
}
