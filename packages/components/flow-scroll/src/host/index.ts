/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { TextAnalyzer } from "@fluid-example/flow-intel";
import { FlowIntelViewer } from "@fluid-example/flow-intel-viewer";
import { TableDocumentType, TableSliceType } from "@fluid-example/table-document";
import { FlowDocument, flowDocumentFactory, FlowDocumentType } from "@fluid-example/webflow";
import { PrimedComponent, PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import {
    IComponent,
    IComponentHandle,
    IComponentHTMLView,
    IComponentHTMLVisual,
    IResponse,
} from "@microsoft/fluid-component-core-interfaces";
import { IComponentCollection } from "@microsoft/fluid-framework-interfaces";
import { SharedMap } from "@microsoft/fluid-map";
import {
    FlushMode,
    IComponentContext,
    IComponentRuntime,
    ITask,
    ITaskManager,
} from "@microsoft/fluid-runtime-definitions";
import { HostView } from "./host";
import { importDoc } from "./template";

const insightsMapId = "insights";

export class WebFlowHost extends PrimedComponent implements IComponentHTMLVisual {
    public static readonly type = "@fluid-example/webflow-host";

    private intelViewer: FlowIntelViewer;
    constructor(runtime: IComponentRuntime, context: IComponentContext) {
        super(runtime, context);
    }

    public get IComponentHTMLVisual() { return this; }

    public addView(scope?: IComponent): IComponentHTMLView {
        return new HostView(
            // eslint-disable-next-line @typescript-eslint/promise-function-async
            (rootkey: string, pkg: string, props?: any) => this.createSubComponent(rootkey, pkg, props),
            this.getComponent<FlowDocument>(this.root.get(this.docId)),
            this.openCollection("math"),
            this.openCollection("video-players"),
            this.openCollection("images"),
            this.intelViewer,
            this.root);
    }

    public async createSubComponent<T>(rootkey: string, pkg: string, props?: any) {
        const componentRuntime: IComponentRuntime = await this.context.createComponent(pkg);
        const response: IResponse = await componentRuntime.request({ url: "/" });
        componentRuntime.attach();
        this.root.set(rootkey, componentRuntime.id);
        return response.value as T;
    }

    protected async componentInitializingFirstTime() {
        await Promise.all([
            this.createSubComponent(this.docId, FlowDocumentType),
            this.createSubComponent("math", "@fluid-example/math"),
            this.createSubComponent("video-players", "@fluid-example/video-players"),
            this.createSubComponent("images", "@fluid-example/image-collection"),
        ]);

        const insights = SharedMap.create(this.runtime, insightsMapId);
        this.root.set(insightsMapId, insights.handle);

        const url = new URL(window.location.href);
        const template = url.searchParams.get("template");
        if (template) {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            importDoc(this.getComponent(this.root.get(this.docId)), template);
        }
    }

    protected async componentHasInitialized() {
        const handle = await this.root.wait<IComponentHandle<SharedMap>>(insightsMapId);
        const insights = await handle.get();

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

        const flowDocument = await this.getComponent<FlowDocument>(this.root.get(this.docId));
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        const taskScheduler = new TaskScheduler(
            this.context,
            this.taskManager,
            this.url,
            flowDocument,
            insights,
        );
        taskScheduler.start();
    }

    private get docId() { return `${this.runtime.id}-doc`; }

    private async openCollection(id: string): Promise<IComponentCollection> {
        const runtime = await this.context.getComponentRuntime(this.root.get(id), true);
        const request = await runtime.request({ url: "/" });

        if (request.status !== 200 || request.mimeType !== "fluid/component") {
            return Promise.reject("Not found");
        }

        const component = request.value;
        return component.IComponentCollection;
    }
}

class TaskScheduler {
    constructor(
        private readonly componentContext: IComponentContext,
        private readonly taskManager: ITaskManager,
        private readonly componentUrl: string,
        private readonly flowDocument: FlowDocument,
        private readonly insightsMap: SharedMap,
    ) {

    }

    public start() {
        const hostTokens = (this.componentContext.hostRuntime as IComponent).IComponentTokenProvider;
        const intelTokens = hostTokens && hostTokens.intelligence ? hostTokens.intelligence.textAnalytics : undefined;
        const intelTask: ITask = {
            id: "intel",
            instance: new TextAnalyzer(this.flowDocument, this.insightsMap, intelTokens),
        };
        this.taskManager.register(intelTask);
        this.taskManager.pick(this.componentUrl, "intel").then(() => {
            console.log(`Picked text analyzer`);
        }, (err) => {
            console.log(JSON.stringify(err));
        });
    }
}

export const webFlowHostFactory = new PrimedComponentFactory(
    WebFlowHost.type,
    WebFlowHost,
    [SharedMap.getFactory()],
    [
        [FlowDocumentType, Promise.resolve(flowDocumentFactory)],
        // eslint-disable-next-line max-len
        ["@fluid-example/video-players", import(/* webpackChunkName: "video-players", webpackPrefetch: true */ "@fluid-example/video-players").then((m) => m.fluidExport)],
        // eslint-disable-next-line max-len
        ["@fluid-example/image-collection", import(/* webpackChunkName: "image-collection", webpackPrefetch: true */ "@fluid-example/image-collection").then((m) => m.fluidExport)],
        ["@fluid-example/math", import("@fluid-example/math").then((m) => m.fluidExport)],
        [TableDocumentType, import("@fluid-example/table-document").then((m) => m.TableDocument.getFactory())],
        [TableSliceType, import("@fluid-example/table-document").then((m) => m.TableSlice.getFactory())],
        ["@fluid-example/table-view", import("@fluid-example/table-view").then((m) => m.TableView.getFactory())],
    ]);
