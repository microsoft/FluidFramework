import { MapExtension, IMapView } from "@prague/map";
import { Component } from "@prague/app-component";
import { DataStore } from "@prague/app-datastore";
import { IChaincode } from "@prague/runtime-definitions";
import { TableDocument, CellRange } from "@chaincode/table-document";
import { ConfigView } from "./config";
import { ConfigKeys } from "./configKeys";

export class TableSlice extends Component {
    private maybeDoc?: TableDocument;
    private maybeRootView?: IMapView;
    private maybeHeaders?: CellRange;
    private maybeValues?: CellRange;

    constructor() {
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
     
        {
            const maybeServerUrl = await this.root.get(ConfigKeys.serverUrl);
            if (!maybeServerUrl) {
                const maybeDiv = await this.platform.queryInterface<HTMLElement>("div");
                if (maybeDiv) {            
                    const docId = this.rootView.get(ConfigKeys.docId);
                    if (!docId) {
                        const configView = new ConfigView(this.root);
                        maybeDiv.appendChild(configView.root);
                        await configView.done;
                        while (maybeDiv.lastChild) {
                            maybeDiv.lastChild.remove();
                        }
                    }
                }
            }
        }

        const store = await DataStore.from(await this.root.get(ConfigKeys.serverUrl));
        this.maybeDoc = await store.open<TableDocument>(
            this.rootView.get(ConfigKeys.docId), 
            this.rootView.get(ConfigKeys.userId),
            TableDocument.type);

        this.maybeHeaders = await this.getRange(ConfigKeys.headersRange);
        this.maybeValues  = await this.getRange(ConfigKeys.valuesRange);

        this.doc.on("op", (...args) => this.emit("op", ...args));
    }

    public get name() { return this.rootView.get(ConfigKeys.name); }
    public set name(value: string) { this.rootView.set(ConfigKeys.name, value); }
    public get headers() { return this.maybeHeaders! }
    public get values() { return this.maybeValues! }

    private get doc() { return this.maybeDoc!; }
    private get rootView() { return this.maybeRootView!; }

    public static readonly type = `${require("../package.json").name}@${require("../package.json").version}`;
}

// Chainloader bootstrap.
export async function instantiate(): Promise<IChaincode> {
    return Component.instantiate(new TableSlice());
}
