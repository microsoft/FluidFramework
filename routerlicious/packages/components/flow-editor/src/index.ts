export { Editor } from "./components/editor";
export { VirtualizedView, IVirtualizedProps } from "./components/virtualized";
import { FlowDocument } from "@chaincode/flow-document";
import { Component } from "@prague/app-component";
import { DataStore } from "@prague/app-datastore";
import { Scheduler } from "@prague/flow-util";
import { MapExtension } from "@prague/map";
import { IChaincode } from "@prague/runtime-definitions";
import { Editor } from "./components/editor";

export class FlowEditor extends Component {

    public static readonly type = `${require("../package.json").name}@${require("../package.json").version}`;
    constructor() {
        super([[MapExtension.Type, new MapExtension()]]);
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

    protected async create() {
        // tslint:disable-next-line:insecure-random
        this.root.set("docId", Math.random().toString(36).substr(2, 4));
    }
}

// Chainloader bootstrap.
export async function instantiate(): Promise<IChaincode> {
    return Component.instantiate(new FlowEditor());
}
