export { Editor } from "./components/editor";
export { ViewportView, IViewportProps } from "./components/viewport";

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
        const maybeDiv = await this.platform.queryInterface<HTMLElement>("div");
        if (maybeDiv) {
            const docId = await this.root.get("docId");
            const store = await DataStore.from("http://localhost:3000");
            const doc = await store.open<FlowDocument>(docId, "danlehen", FlowDocument.type);
            const editor = new Editor();
            const root = editor.mount({ doc, scheduler: new Scheduler(), trackedPositions: [], start: 0 })
            maybeDiv.appendChild(root);
        }
    }

    public static readonly type = `${require("../package.json").name}@latest`;
}

// Chainloader bootstrap.
export async function instantiate() {
    return Component.instantiate(new FlowEditor());
}
