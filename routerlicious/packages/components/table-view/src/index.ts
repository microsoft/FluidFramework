import { TableDocumentComponent } from "@chaincode/table-document";
import { Component } from "@prague/app-component";
import { ComponentHost } from "@prague/component";
import { IPlatform, ITree } from "@prague/container-definitions";
import { MapExtension } from "@prague/map";
import { IChaincode, IChaincodeComponent, IComponentDeltaHandler, IComponentRuntime } from "@prague/runtime-definitions";
import { Deferred } from "@prague/utils";
import { ConfigView } from "./config";
import { ConfigKeys } from "./configKeys";
import { GridView } from "./grid";

export class TableView extends Component {

    public static readonly type = `${require("../package.json").name}@${require("../package.json").version}`;
    private ready = new Deferred<void>();

    constructor(private componentRuntime: IComponentRuntime) {
        super([[MapExtension.Type, new MapExtension()]]);
    }

    public async opened() {
        await this.connected;
        this.ready.resolve();
    }

    public async attach(platform: IPlatform): Promise<IPlatform> {
        const maybeDiv = await platform.queryInterface<HTMLElement>("div");
        if (!maybeDiv) {
            throw new Error("No <div> provided");
        }

        {
            const docId = await this.root.get(ConfigKeys.docId);
            if (!docId) {
                const configView = new ConfigView(this.componentRuntime, this.root);
                maybeDiv.appendChild(configView.root);
                await configView.done;
                while (maybeDiv.lastChild) {
                    maybeDiv.lastChild.remove();
                }
            }
        }

        if (maybeDiv) {
            // tslint:disable-next-line:no-shadowed-variable
            const docId = await this.root.get(ConfigKeys.docId);
            const component = await this.componentRuntime.getComponent(docId, true);
            const tableDocComponent = component.chaincode as TableDocumentComponent;
            const doc = tableDocComponent.table;
            await doc.ready;

            const grid = new GridView(doc);
            maybeDiv.appendChild(grid.root);
        }

        return;
    }

    protected async create() { /* do nothing */ }
}

/**
 * A document is a collection of shared types.
 */
export class TableViewComponent implements IChaincodeComponent {
    public view: TableView;
    private chaincode: IChaincode;
    private component: ComponentHost;

    public async close(): Promise<void> {
        return;
    }

    public async run(runtime: IComponentRuntime): Promise<IComponentDeltaHandler> {
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
