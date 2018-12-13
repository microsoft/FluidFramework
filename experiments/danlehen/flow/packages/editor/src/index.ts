export { Editor } from "./editor";
export { ViewportView, IViewportProps } from "./components/viewport";
export { Scheduler } from "./scheduler";
export { e } from "./dom";

import { MapExtension } from "@prague/map";
import { IChaincode } from "@prague/runtime-definitions";
import { Component } from "@prague/app-component";
import { DataStore } from "@prague/app-datastore";
import { FlowDocument } from "@chaincode/flow-document";
import { Editor } from "./editor";
import { Scheduler } from "./scheduler";

export class FlowEditor extends Component {
    constructor() {
        super([[MapExtension.Type, new MapExtension()]]);
    }
    
    protected async create() { 
        this.root.set("docId", Math.random().toString(36).substr(2, 4));
    }

    public async opened() {
        const docId = await this.root.get("docId");
        const store = await DataStore.From("http://localhost:3000");
        const doc = await store.open<FlowDocument>(docId, "danlehen", "@chaincode/flow-document@latest");
        const editor = new Editor(new Scheduler(), doc);
        const maybeDiv = await this.platform.queryInterface<HTMLElement>("div");
        if (maybeDiv) {
            maybeDiv.appendChild(editor.root);
        }
    }
}

// Chainloader bootstrap.
export async function instantiate(): Promise<IChaincode> {
    return Component.instantiate(new FlowEditor());
}
