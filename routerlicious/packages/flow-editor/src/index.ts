export { Editor } from "./components/editor";
export { VirtualizedView, IVirtualizedProps } from "./components/virtualized";

import { MapExtension } from "@prague/map";
import { Component } from "@prague/app-component";
import { DataStore } from "@prague/app-datastore";
import { FlowDocument } from "@chaincode/flow-document";
import { Editor } from "./components/editor";
import { Scheduler } from "@prague/flow-util";

export class FlowEditor extends Component {
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
            // TODO: 'hostUrl' (or possibly DataStore) should be passed from the host, not
            //       derived here.
            const doc = await store.open<FlowDocument>(docId, "danlehen", FlowDocument.type, [["datastore", Promise.resolve(store)]]);
            const editor = new Editor();
            const root = editor.mount({ doc, scheduler: new Scheduler(), trackedPositions: [] });
            maybeDiv.appendChild(root);
        }
    }

    public static readonly type = `${require("../package.json").name}@${require("../package.json").version}`;
}

// Chainloader bootstrap.
export async function instantiate() {
    return Component.instantiate(new FlowEditor());
}
