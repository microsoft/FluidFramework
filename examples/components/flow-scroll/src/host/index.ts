/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { FlowIntelViewer } from "@fluid-example/flow-intel-viewer";
import { FlowDocument } from "@fluid-example/webflow";
import { TableView } from "@fluid-example/table-view";
import {
    IComponent,
    IComponentHandle,
} from "@microsoft/fluid-component-core-interfaces";
import {
    FlushMode, IComponentFactory, IComponentContext,
} from "@microsoft/fluid-runtime-definitions";
import { IProvideComponentCollection } from "@microsoft/fluid-framework-interfaces";
import { SharedMap, ISharedDirectory, SharedDirectory } from "@microsoft/fluid-map";
import { MathCollection } from "@fluid-example/math";
import { VideoPlayerCollection } from "@fluid-example/video-players";
import { ImageCollection } from "@fluid-example/image-collection";
import { SharedComponentFactory, SharedComponent } from "@microsoft/fluid-component-base";
import { IComponentHTMLView, IComponentHTMLVisual } from "@microsoft/fluid-view-interfaces";
import { hostType } from "../package";
import { importDoc } from "./template";
import { HostView } from "./host";
import { TaskScheduler } from "./taskscheduler";

const enum RootKey {
    doc = "doc",
    images = "images",
    insights = "insights",
    math = "math",
    videos = "videos",
}

export class WebFlowHost extends SharedComponent<ISharedDirectory> implements IComponentHTMLVisual {
    private static readonly factory = new SharedComponentFactory<WebFlowHost>(
        hostType,
        WebFlowHost,
        /* root: */ SharedDirectory.getFactory(),
        [SharedMap.getFactory()],
        [
            FlowDocument.getFactory(),
            VideoPlayerCollection.getFactory(),
            ImageCollection.getFactory(),
            MathCollection.getFactory(),
            TableView.getFactory(),
        ]);

    public static getFactory(): IComponentFactory { return WebFlowHost.factory; }

    public static create(parentContext: IComponentContext, props?: any) {
        return WebFlowHost.factory.create(parentContext, props);
    }

    private intelViewer: FlowIntelViewer;

    public get IComponentHTMLVisual() { return this; }

    public addView(scope?: IComponent): IComponentHTMLView {
        return new HostView(
            this.createSubComponent,
            this.root.wait<IComponentHandle<FlowDocument>>(RootKey.doc).then(async (handle) => handle.get()),
            this.openCollection(RootKey.math),
            this.openCollection(RootKey.videos),
            this.openCollection(RootKey.images),
            this.intelViewer);
    }

    public readonly createSubComponent = async (pkg: string, props?: any) => {
        const componentRuntime = await this.context.createComponent(pkg);
        const response = await componentRuntime.request({ url: "/" });
        componentRuntime.attach();
        return response.value.handle;
    };

    public create() {
        const doc = FlowDocument.create(this.context);
        this.root.set(RootKey.doc, doc.handle);
        this.root.set(RootKey.images, ImageCollection.create(this.context).handle);
        this.root.set(RootKey.videos, VideoPlayerCollection.create(this.context).handle);
        this.root.set(RootKey.math, MathCollection.create(this.context).handle);

        const insights = SharedMap.create(this.runtime, RootKey.insights);
        this.root.set(RootKey.insights, insights.handle);

        const url = new URL(window.location.href);
        const template = url.searchParams.get("template");
        if (template) {
            importDoc(doc, template).catch((error) => console.error(error));
        }

        this.init(insights, doc);
    }

    public async load() {
        const insightsH = await this.root.wait<IComponentHandle<SharedMap>>(RootKey.insights);
        const insights = await insightsH.get();

        const docH = await this.root.wait<IComponentHandle<FlowDocument>>(RootKey.doc);
        const doc = await docH.get();

        this.init(insights, doc);
    }

    private init(insights: SharedMap, doc: FlowDocument) {
        this.context.hostRuntime.setFlushMode(FlushMode.Manual);

        const runtimeEmitter = this.context.hostRuntime;

        let messages = [];
        let count = 0;
        let turnCount = 0;
        let needReset = true;

        runtimeEmitter.on("batchBegin", () => {
            count = 0;
        });

        runtimeEmitter.on("op", (message) => {
            count++;
            turnCount++;
            messages.push(message);

            if (needReset) {
                needReset = false;
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                Promise.resolve().then(() => {
                    console.log(`Turn count ${turnCount}`);
                    turnCount = 0;
                    needReset = true;
                });
            }
        });

        runtimeEmitter.on("batchEnd", () => {
            console.log(`Message count: ${count}`);
            console.log(messages);
            messages = [];
        });

        this.intelViewer = new FlowIntelViewer(insights);

        this.context.hostRuntime.request({ url: "_scheduler" }).then((response) => {
            assert.equal(response.status, 200);
            assert.equal(response.mimeType, "fluid/component");

            const taskScheduler = new TaskScheduler(
                this.context,
                response.value,
                this.url,
                doc,
                insights,
            );

            taskScheduler.start();
        }).catch((error) => console.error(error));
    }

    private async openCollection<T extends IProvideComponentCollection>(key: RootKey) {
        const handle = await this.root.wait<IComponentHandle<T>>(key);
        const component = await handle.get();
        return component.IComponentCollection;
    }
}
