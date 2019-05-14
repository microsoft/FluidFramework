export { Editor, IEditorProps } from "./components/editor";
export { PagePosition } from "./pagination";

import { FlowDocument } from "@chaincode/flow-document";
import { Component } from "@prague/app-component";
import { Scheduler } from "@prague/flow-util";
import { MapExtension } from "@prague/map";
import { Editor } from "./components/editor";

export class FlowEditor extends Component {
    // tslint:disable-next-line:no-require-imports
    public static readonly type = `${require("../package.json").name}@${require("../package.json").version}`;

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
        this.runtime.createAndAttachComponent(docId, FlowDocument.type);
        this.root.set("docId", docId);
    }
}
