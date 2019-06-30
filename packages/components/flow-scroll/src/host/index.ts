/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { FlowDocument } from "@chaincode/webflow";
import { Component } from "@prague/app-component";
import { IComponent } from "@prague/container-definitions";
import { Scheduler } from "@prague/flow-util";
import { IComponentCollection } from "@prague/runtime-definitions";
import { HostView  } from "./host";
import { importDoc } from "./template";

export class WebFlowHost extends Component {
    public static readonly type = "@chaincode/webflow-host";

    protected async create() {
        await Promise.all([
            this.runtime.createAndAttachComponent(this.docId, FlowDocument.type),
            this.runtime.createAndAttachComponent("math", "@chaincode/math"),
            this.runtime.createAndAttachComponent("video-players", "@chaincode/video-players"),
            this.runtime.createAndAttachComponent("images", "@chaincode/image-collection"),
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
        const videosP = this.openCollection("video-players");
        const imagesP = this.openCollection("images");

        const div = await this.platform.queryInterface<Element>("div");
        const scheduler = new Scheduler();
        const host = new HostView();
        host.attach(
            div, {
                scheduler,
                context: this.context,
                doc: await docP,
                math: await mathP,
                videos: await videosP,
                images: await imagesP,
            });
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
