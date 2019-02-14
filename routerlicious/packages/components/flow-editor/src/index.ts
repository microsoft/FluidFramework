export { Editor } from "./components/editor";
export { VirtualizedView, IVirtualizedProps } from "./components/virtualized";
import { FlowDocument } from "@chaincode/flow-document";
import { Component } from "@prague/app-component";
import { DataStore } from "@prague/app-datastore";
import { IContainerContext, IRuntime } from "@prague/container-definitions";
import { Scheduler } from "@prague/flow-util";
import { MapExtension } from "@prague/map";
import { IChaincode, IChaincodeComponent } from "@prague/runtime-definitions";
import { Editor } from "./components/editor";

// tslint:disable-next-line:no-var-requires
const pkg = require("../package.json");

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
            // TODO: Likely should not pass datastore to children?
            const doc = await store.open<FlowDocument>(
                docId,
                FlowDocument.type,
                "",
                [["datastore", Promise.resolve(store)]]);
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

export async function instantiateComponent(): Promise<IChaincodeComponent> {
    return Component.instantiateComponent(FlowEditor);
}

export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
    return Component.instantiateRuntime(context, pkg.name, [[pkg.name, Promise.resolve({ instantiateComponent })]]);
}
