/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { TextAnalyzer } from "@chaincode/flow-intel";
import { FlowIntelViewer } from "@chaincode/flow-intel-viewer";
import { FlowDocument } from "@chaincode/webflow";
import { PrimedComponent, SharedComponentFactory } from "@prague/aqueduct";
import { IComponent, IComponentHTMLOptions, IComponentHTMLView, IComponentHTMLVisual } from "@prague/container-definitions";
import { MapExtension, SharedMap } from "@prague/map";
import { IComponentCollection, IComponentContext, IComponentRuntime } from "@prague/runtime-definitions";
import { HostView  } from "./host";
import { importDoc } from "./template";

const insightsMapId = "insights";

export class WebFlowHost extends PrimedComponent implements IComponentHTMLVisual {
    public static readonly type = "@chaincode/webflow-host";

    private intelViewer: FlowIntelViewer;
    constructor(runtime: IComponentRuntime, context: IComponentContext) {
        super(runtime, context, ["IComponentHTMLVisual"]);
    }

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

    protected async create() {
        await super.create();

        await Promise.all([
            this.createAndAttachComponent(this.docId, FlowDocument.type),
            this.createAndAttachComponent("math", "@chaincode/math"),
            this.createAndAttachComponent("video-players", "@chaincode/video-players"),
            this.createAndAttachComponent("images", "@chaincode/image-collection"),
        ]);

        const insights = SharedMap.create(this.runtime, insightsMapId);
        this.root.set(insightsMapId, insights);

        const url = new URL(window.location.href);
        const template = url.searchParams.get("template");
        if (template) {
            importDoc(this.getComponent(this.docId), template);
        }
    }

    protected async opened() {
        await super.opened();
        const insights = await this.root.wait(insightsMapId) as SharedMap;
        this.intelViewer = new FlowIntelViewer(insights);
        this.runIntel(this.getComponent(this.docId));
    }

    private get docId() { return `${this.runtime.id}-doc`; }

    private async openCollection(id: string): Promise<IComponentCollection> {
        const runtime = await this.context.getComponentRuntime(id, true);
        const request = await runtime.request({ url: "/" });

        if (request.status !== 200 || request.mimeType !== "prague/component") {
            return Promise.reject("Not found");
        }

        const component = request.value as IComponent;
        return component.query<IComponentCollection>("IComponentCollection");
    }

    // TODO (mdaumi): Temporary way to schedule intelligent agents. This will be turned
    // into agent-scheduler + webworker.
    private runIntel(docP: Promise<FlowDocument>) {
        if (this.context.leader) {
            this.runTextAnalyzer(docP);
        } else {
            this.runtime.on("leader", (clientId) => {
                this.runTextAnalyzer(docP);
            });
        }
    }

    private async runTextAnalyzer(docP: Promise<FlowDocument>) {
        const flowDocument = await docP;
        await this.root.wait(insightsMapId);
        const insightsMap = this.root.get(insightsMapId);
        const textAnalyzer = new TextAnalyzer();
        textAnalyzer.run(flowDocument, insightsMap);
    }

}

export const webFlowHostFactory = new SharedComponentFactory(WebFlowHost, [new MapExtension()]);
