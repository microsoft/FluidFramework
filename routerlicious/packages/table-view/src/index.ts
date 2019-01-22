import { MapExtension } from "@prague/map";
import { Component } from "@prague/app-component";
import { DataStore } from "@prague/app-datastore";
import { TableDocument } from "@chaincode/table-document";
import { GridView } from "./grid";

export class TableView extends Component {
    constructor() {
        super([[MapExtension.Type, new MapExtension()]]);
    }
    
    protected async create() { 
        this.root.set("docId", Math.random().toString(36).substr(2, 4));
    }

    public async opened() {
        const store = await this.platform.queryInterface<DataStore>("datastore");
        const maybeDiv = await this.platform.queryInterface<HTMLElement>("div");

        if (maybeDiv) {
            const docId = await this.root.get("docId");
            const doc = await store.open<TableDocument>(docId, "danlehen", TableDocument.type);
            const grid = new GridView(doc);
            maybeDiv.appendChild(grid.root);
        }
    }

    public static readonly type = "@chaincode/flow-table@latest";

    // The below works, but causes 'webpack --watch' to build in an infinite loop when
    // build automatically publishes.
    //
    // public static readonly type = `${require("../package.json").name}@latest`;
}

// Chainloader bootstrap.
export async function instantiate() {
    return Component.instantiate(new TableView());
}
