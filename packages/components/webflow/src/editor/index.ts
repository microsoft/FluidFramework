/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export { Editor } from "./editor";
import { Component } from "@prague/app-component";
import { randomId } from "@prague/flow-util";
import { MapExtension } from "@prague/map";
import { FlowDocument } from "../document";
import { Editor } from "./editor";
export { Layout } from "./view/layout";

export class FlowEditor extends Component {
    // tslint:disable-next-line:no-require-imports
    public static readonly type = "@chaincode/flow-editor";

    constructor() {
        super([[MapExtension.Type, new MapExtension()]]);
    }

    public async opened() {
        const maybeDiv = await this.platform.queryInterface<HTMLElement>("div");
        if (maybeDiv) {
            const doc = await this.openComponent<FlowDocument>(await this.root.wait("docId"), true);

            // tslint:disable-next-line:no-unused-expression
            new Editor(doc, maybeDiv);
        }
    }

    protected async create() {
        // tslint:disable-next-line:insecure-random
        const docId = randomId();
        this.runtime.createAndAttachComponent(docId, FlowDocument.type);
        this.root.set("docId", docId);
    }
}
