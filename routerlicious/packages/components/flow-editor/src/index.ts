export { Editor } from "./components/editor";
export { VirtualizedView, IVirtualizedProps } from "./components/virtualized";
import { FlowDocument } from "@chaincode/flow-document";
import { Component } from "@prague/app-component";
import { Scheduler } from "@prague/flow-util";
import { MapExtension } from "@prague/map";
import { Editor } from "./components/editor";

export class FlowEditor extends Component {
    constructor() {
        super([[MapExtension.Type, new MapExtension()]]);
    }

    public async opened() {
        const maybeDiv = await this.platform.queryInterface<HTMLElement>("div");
        if (maybeDiv) {
            const doc = await this.runtime.openComponent<FlowDocument>(await this.root.wait("docId"), true);
            const editor = new Editor();
            const root = editor.mount({ doc, scheduler: new Scheduler(), trackedPositions: [] });
            maybeDiv.appendChild(root);
        }
    }

    protected async create() {
        // tslint:disable-next-line:insecure-random
        const docId = Math.random().toString(36).substr(2, 4);
        this.runtime.createAndAttachComponent(docId, "@chaincode/flow-document");
        this.root.set("docId", docId);
    }
}
