import { MapExtension } from "@prague/map";
import { Component } from "@prague/app-component";
import { DataStore } from "@prague/app-datastore";
import { IChaincode } from "@prague/runtime-definitions";
import { TableDocument } from "@chaincode/table-document";
import { GridView } from "./grid";
import { ConfigView } from "./config";
import { ConfigKeys } from "./configKeys";

export class TableView extends Component {
    constructor() {
        super([[MapExtension.Type, new MapExtension()]]);
    }
    
    protected async create() {}

    public async opened() {
        const maybeDiv = await this.platform.queryInterface<HTMLElement>("div");
        if (!maybeDiv) {
            console.error(`No <div> provided`);
            return;
        }

        await this.connected;
        const docId = await this.root.get(ConfigKeys.docId);
        if (!docId) {
            const configView = new ConfigView(this.root);
            maybeDiv.appendChild(configView.root);
            await configView.done;
            while (maybeDiv.lastChild) {
                maybeDiv.lastChild.remove();
            }
        }

        const store = await DataStore.from(await this.root.get(ConfigKeys.serverUrl));
        if (maybeDiv) {
            const doc = await store.open<TableDocument>(
                await this.root.get(ConfigKeys.docId), 
                await this.root.get(ConfigKeys.userId),
                TableDocument.type);
            const grid = new GridView(doc);
            maybeDiv.appendChild(grid.root);
        }
    }

    public static readonly type = `${require("../package.json").name}@${require("../package.json").version}`;
}

// Chainloader bootstrap.
export async function instantiate(): Promise<IChaincode> {
    return Component.instantiate(new TableView());
}
