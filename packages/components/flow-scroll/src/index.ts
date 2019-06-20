/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ChartView } from "@chaincode/chart-view";
import { FlowDocument } from "@chaincode/flow-document";
import { FlowEditor } from "@chaincode/flow-editor";
import { TableDocumentType, TableSliceType } from "@chaincode/table-document";
import { TableView } from "@chaincode/table-view";
import { Component } from "@prague/app-component";
import {
    IContainerContext,
    IRuntime,
} from "@prague/container-definitions";
import { Scheduler } from "../../flow-util/dist";
import { HostView } from "./host";
import { importDoc } from "./template";

export class FlowHost extends Component {
    public static readonly type = "@chaincode/flow-host2";

    protected async create() {
        await Promise.all([
            this.runtime.createAndAttachComponent(this.docId, FlowDocument.type),
            this.runtime.createAndAttachComponent("math", "@chaincode/math"),
        ]);

        const url = new URL(window.location.href);
        const template = url.searchParams.get("template");
        if (template) {
            importDoc(
                this.runtime.openComponent(this.docId, /* wait: */ true),
                template,
            );
        }
    }

    protected async opened() {
        const docP = this.runtime.openComponent<FlowDocument>(this.docId, /* wait: */ true);
        const mathP = this.openPlatform<{ create: () => { url: string }}>("math");
        const div = await this.platform.queryInterface<Element>("div");

        const scheduler = new Scheduler();
        const viewport = new HostView();
        viewport.attach(div, { scheduler, doc: await docP, math: await mathP, context: this.context });
    }

    private get docId() { return `${this.id}-doc`; }

    private async openPlatform<T>(id: string): Promise<T> {
        const runtime = await this.context.getComponentRuntime(id, true);
        const component = await runtime.request({ url: "/" });

        if (component.status !== 200 || component.mimeType !== "prague/component") {
            return Promise.reject("Not found");
        }

        return component.value as T;
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

            // Demo components
            ["@chaincode/math", import("@chaincode/math")],
            // Bootstrap CSS definitions conflict with flow-scroll
            // ["@chaincode/progress-bars", import("@chaincode/progress-bars")],
            [TableDocumentType, import("@chaincode/table-document").then((m) => Component.createComponentFactory(m.TableDocument))],
            [TableSliceType, import("@chaincode/table-document").then((m) => Component.createComponentFactory(m.TableSlice))],
            ["@chaincode/chart-view", Promise.resolve(Component.createComponentFactory(ChartView))],
            ["@chaincode/table-view", Promise.resolve(Component.createComponentFactory(TableView))],
        ]));
}
