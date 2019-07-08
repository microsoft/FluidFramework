/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Component } from "@prague/app-component";
import { Scheduler } from "@prague/flow-util";
import { FlowDocument } from "../document";
import { WebflowHost as WebflowHost } from "./host";
import { importDoc } from "./template";

export class WebFlow extends Component {
    public static readonly type = "@chaincode/webflow";

    protected async create() {
        await Promise.all([
            this.runtime.createAndAttachComponent(this.docId, FlowDocument.type),
        ]);

        const url = new URL(window.location.href);
        const template = url.searchParams.get("template");
        if (template) {
            importDoc(
                this.openComponent(this.docId, /* wait: */ true),
                template,
            );
        }
    }

    protected async opened() {
        const docP = this.openComponent<FlowDocument>(this.docId, /* wait: */ true);
        const div = await this.platform.queryInterface<Element>("div");

        const scheduler = new Scheduler();
        const host = new WebflowHost();
        host.attach(
            div,
            { scheduler, doc: await docP, context: this.context });
    }

    private get docId() { return `${this.id}-doc`; }
}
