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
    IComponent,
    IContainerContext,
    IRuntime,
} from "@prague/container-definitions";
import { IComponentCollection } from "@prague/runtime-definitions";
import { Scheduler } from "../../flow-util/dist";
import { HostView } from "./host";
import { importDoc } from "./template";

export class FlowHost extends Component {
    public static readonly type = "@chaincode/flow-host2";

    protected async create() {
        await Promise.all([
            this.runtime.createAndAttachComponent(this.docId, FlowDocument.type),
            this.runtime.createAndAttachComponent("math", "@chaincode/math"),
            this.runtime.createAndAttachComponent("video-players", "@chaincode/video-players"),
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
        const mathP = this.openCollection("math");
        const div = await this.platform.queryInterface<Element>("div");
        const videosP = this.openCollection("video-players");

        const scheduler = new Scheduler();
        const viewport = new HostView();
        viewport.attach(
            div,
            { scheduler, doc: await docP, math: await mathP, context: this.context, videos: await videosP });
    }

    private get docId() { return `${this.id}-doc`; }

    private async openCollection(id: string): Promise<IComponentCollection> {
        const runtime = await this.context.getComponentRuntime(id, true);
        const request = await runtime.request({ url: "/" });

        if (request.status !== 200 || request.mimeType !== "prague/component") {
            return Promise.reject("Not found");
        }

        const component = request.value as IComponent;
        return component.query<IComponentCollection>("IComponentCollection");
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
            ["@chaincode/charts", import(/* webpackChunkName: "charts", webpackPrefetch: true */ "@chaincode/charts")],
            ["@chaincode/video-players", import(/* webpackChunkName: "video-players", webpackPrefetch: true */ "@chaincode/video-players")],
            // pinpoint editor's SASS loading of resources causes trouble
            // If I can change webpack to do this then things are ok
            // {
            //     test: /\.css$/,
            //     use: [
            //         "style-loader", // creates style nodes from JS strings
            //         "css-loader", // translates CSS into CommonJS
            //     ]
            // },
            // ["@chaincode/pinpoint-editor", import(/* webpackChunkName: "video-players", webpackPrefetch: true */ "@chaincode/pinpoint-editor")],
        ]));
}
