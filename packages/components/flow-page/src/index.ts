/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { FlowDocument } from "@chaincode/flow-document";
import { FlowEditor } from "@chaincode/flow-editor";
import { Component } from "@prague/app-component";
import {
    IContainerContext,
    IRuntime,
} from "@prague/container-definitions";
import { Scheduler } from "../../flow-util/dist";
import { Viewport } from "./viewport";

export class FlowHost extends Component {
    public static readonly type = "@chaincode/flow-host2";

    protected async create() {
        this.runtime.createAndAttachComponent(this.docId, FlowDocument.type);

        this.runtime.openComponent<FlowDocument>(this.docId, /* wait: */ true).then((doc) => {
            this.importDoc(doc);
        });
    }

    protected async opened() {
        const docP = this.runtime.openComponent<FlowDocument>(this.docId, /* wait: */ true);
        const div = await this.platform.queryInterface<Element>("div");

        const scheduler = new Scheduler();
        const viewport = new Viewport();
        viewport.attach(div, { scheduler, doc: await docP });
    }

    private get docId() { return `${this.id}-doc`; }

    private async importDoc(doc: FlowDocument) {
        const response = await fetch("https://www.wu2.prague.office-int.com/public/literature/pp.txt");
        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        try {
            // tslint:disable-next-line:no-constant-condition
            while (true) {
                const {done, value} = await reader.read();
                if (done) {
                    return;
                }

                const lines = decoder.decode(value).split(/\r?\n/);
                for (const paragraph of lines) {
                    doc.insertText(doc.length, paragraph);
                    doc.insertParagraph(doc.length);
                }
            }
        } finally {
            reader.releaseLock();
        }
    }
}

/**
 * Instantiates a new chaincode host
 */
export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
    return Component.instantiateRuntime(
        context,
        FlowHost.type,
        new Map([
            [FlowHost.type, Promise.resolve(Component.createComponentFactory(FlowHost))],
            [FlowDocument.type, Promise.resolve(Component.createComponentFactory(FlowDocument))],
            [FlowEditor.type, Promise.resolve(Component.createComponentFactory(FlowEditor))],
        ]));
}
