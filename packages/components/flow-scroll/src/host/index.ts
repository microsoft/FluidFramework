/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { TextAnalyzer } from "@fluid-example/flow-intel";
import { FlowIntelViewer } from "@fluid-example/flow-intel-viewer";
import { FlowDocument, FlowDocumentType } from "@fluid-example/webflow";
import { PrimedComponent, PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import {
    IComponent,
    IComponentHandle,
    IComponentHTMLOptions,
    IComponentHTMLView,
    IComponentHTMLVisual,
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
            (id: string, pkg: string, props?: any) => this.createAndAttachComponent(id, pkg, props),
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
            this.createAndAttachComponent(this.docId, FlowDocumentType),
            this.createAndAttachComponent("math", "@fluid-example/math"),
            this.createAndAttachComponent("video-players", "@fluid-example/video-players"),
            this.createAndAttachComponent("images", "@fluid-example/image-collection"),
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

        if (request.status !== 200 || request.mimeType !== "fluid/component") {
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

export const webFlowHostFactory = new PrimedComponentFactory(WebFlowHost, [SharedMap.getFactory()]);
