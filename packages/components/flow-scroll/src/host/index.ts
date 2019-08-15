/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { TextAnalyzer } from "@chaincode/flow-intel";
import { FlowIntelViewer } from "@chaincode/flow-intel-viewer";
import { FlowDocument } from "@chaincode/webflow";
import { PrimedComponent, SharedComponentFactory } from "@prague/aqueduct";
import {
    IComponent,
    IComponentHandle,
    IComponentHTMLOptions,
    IComponentHTMLView,
    IComponentHTMLVisual,
} from "@prague/component-core-interfaces";
import { MapFactory, SharedMap } from "@prague/map";
import {
    IComponentCollection,
    IComponentContext,
    IComponentRuntime,
    ITask,
    ITaskManager } from "@prague/runtime-definitions";
import { HostView  } from "./host";
import { importDoc } from "./template";

const insightsMapId = "insights";

export class WebFlowHost extends PrimedComponent implements IComponentHTMLVisual {
    public static readonly type = "@chaincode/webflow-host";

    private intelViewer: FlowIntelViewer;
    constructor(runtime: IComponentRuntime, context: IComponentContext) {
        super(runtime, context);
    }

    public get IComponentHTMLVisual() { return this; }

    public addView(scope?: IComponent): IComponentHTMLView {
        return new HostView(
            this.context,
            this.getComponent<FlowDocument>(this.docId),
            this.openCollection("math"),
            this.openCollection("video-players"),
            this.openCollection("images"),
            this.intelViewer);
    }

    public render(elm: HTMLElement, options?: IComponentHTMLOptions): void {
        this.addView().render(elm, options);
    }

    protected async componentInitializingFirstTime() {
        await Promise.all([
            this.createAndAttachComponent(this.docId, FlowDocument.type),
            this.createAndAttachComponent("math", "@chaincode/math"),
            this.createAndAttachComponent("video-players", "@chaincode/video-players"),
            this.createAndAttachComponent("images", "@chaincode/image-collection"),
        ]);

        const insights = SharedMap.create(this.runtime, insightsMapId);
        this.root.set(insightsMapId, insights.handle);

        const url = new URL(window.location.href);
        const template = url.searchParams.get("template");
        if (template) {
            importDoc(this.getComponent(this.docId), template);
        }
    }

    protected async componentHasInitialized() {
        const handle = await this.root.wait<IComponentHandle>(insightsMapId);
        const insights = await handle.get<SharedMap>();

        this.intelViewer = new FlowIntelViewer(insights);

        const flowDocument = await this.getComponent<FlowDocument>(this.docId);
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
        const runtime = await this.context.getComponentRuntime(id, true);
        const request = await runtime.request({ url: "/" });

        if (request.status !== 200 || request.mimeType !== "prague/component") {
            return Promise.reject("Not found");
        }

        const component = request.value as IComponent;
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
        this.taskManager.pick(this.componentUrl, intelTask).then(() => {
            console.log(`Picked text analyzer`);
        }, (err) => {
            console.log(err);
        });
    }
}

export const webFlowHostFactory = new SharedComponentFactory(WebFlowHost, [new MapFactory()]);
