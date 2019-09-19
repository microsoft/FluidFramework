/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { controls, ui } from "@fluid-example/client-ui-lib";
import { TextAnalyzer } from "@fluid-example/intelligence-runner-agent";
import { SharedCell } from "@microsoft/fluid-cell";
import { ComponentRuntime } from "@microsoft/fluid-component-runtime";
import { IInk, Ink } from "@microsoft/fluid-ink";
import * as DistributedMap from "@microsoft/fluid-map";
import {
    ISharedMap,
    SharedMap,
} from "@microsoft/fluid-map";
import * as MergeTree from "@microsoft/fluid-merge-tree";
import { IComponentContext, IComponentRuntime, ITask, ITaskManager } from "@microsoft/fluid-runtime-definitions";
import {
    IProvideSharedString,
    SharedNumberSequence,
    SharedObjectSequence,
    SharedString,
} from "@microsoft/fluid-sequence";
import * as API from "@prague/client-api";
import {
    IComponent,
    IComponentHandle,
    IComponentHTMLVisual,
    IComponentLoadable,
    IRequest,
    IResponse,
} from "@prague/component-core-interfaces";
import { EventEmitter } from "events";
import { parse } from "querystring";
import * as url from "url";
import { Document } from "./document";
import { downloadRawText, getInsights, setTranslation } from "./utils";

// tslint:disable:no-var-requires
const performanceNow = require("performance-now");
const debug = require("debug")("fluid:shared-text");
// tslint:enable:no-var-requires

/**
 * Helper function to retrieve the handle for the default component route
 */
async function getHandle(runtimeP: Promise<IComponentRuntime>): Promise<IComponentHandle> {
    const runtime = await runtimeP;
    const request = await runtime.request({ url: "" });

    if (request.status !== 200 || request.mimeType !== "fluid/component") {
        return Promise.reject("Not found");
    }

    const component = request.value as IComponent;
    return component.IComponentLoadable.handle;
}

export class SharedTextRunner
    extends EventEmitter
    implements IComponentHTMLVisual, IComponentLoadable, IProvideSharedString {

    public static async load(runtime: ComponentRuntime, context: IComponentContext): Promise<SharedTextRunner> {
        const runner = new SharedTextRunner(runtime, context);
        await runner.initialize();

        return runner;
    }

    public get IComponentLoadable() { return this; }
    public get IComponentHTMLVisual() { return this; }
    public get ISharedString() { return this.sharedString; }

    public readonly url = "/text";
    private sharedString: SharedString;
    private insightsMap: DistributedMap.ISharedMap;
    private rootView: ISharedMap;
    private collabDoc: Document;
    private taskManager: ITaskManager;
    private uiInitialized = false;

    private constructor(private runtime: ComponentRuntime, private context: IComponentContext) {
        super();
    }

    public render(element: HTMLElement) {
        if (this.uiInitialized) {
            return;
        }

        this.initializeUI().catch(debug);
        this.uiInitialized = true;
    }

    public getRoot(): ISharedMap {
        return this.rootView;
    }

    public async request(request: IRequest): Promise<IResponse> {
        if (request.url.startsWith(this.taskManager.url)) {
            return this.taskManager.request(request);
        } else if (request.url === "" || request.url === "/") {
            return { status: 200, mimeType: "fluid/component", value: this };
        } else {
            return { status: 404, mimeType: "text/plain", value: `${request.url} not found` };
        }
    }

    private async initialize(): Promise<void> {
        this.collabDoc = await Document.load(this.runtime);
        this.rootView = await this.collabDoc.getRoot();

        if (!this.runtime.existing) {
            const insightsMapId = "insights";

            const insights = this.collabDoc.createMap(insightsMapId);
            this.rootView.set(insightsMapId, insights.handle);

            debug(`Not existing ${this.runtime.id} - ${performanceNow()}`);
            this.rootView.set("users", this.collabDoc.createMap().handle);
            const seq = SharedNumberSequence.create(this.collabDoc.runtime);
            this.rootView.set("sequence-test", seq.handle);
            const newString = this.collabDoc.createString() as SharedString;

            const template = parse(window.location.search.substr(1)).template;
            const starterText = template
                ? await downloadRawText(`/public/literature/${template}`)
                : " ";

            const segments = MergeTree.loadSegments(starterText, 0, true);
            for (const segment of segments) {
                if (MergeTree.TextSegment.is(segment)) {
                    newString.insertText(newString.getLength(), segment.text,
                    segment.properties);
                } else {
                    // assume marker
                    const marker = segment as MergeTree.Marker;
                    newString.insertMarker(newString.getLength(), marker.refType, marker.properties);
                }
            }
            this.rootView.set("text", newString.handle);

            const hostRuntime = this.context.hostRuntime;
            const [progressBars, math, videoPlayers, images] = await Promise.all([
                getHandle(hostRuntime.createComponent("@fluid-example/progress-bars")),
                getHandle(hostRuntime.createComponent("@fluid-example/math")),
                getHandle(hostRuntime.createComponent("@fluid-example/video-players")),
                getHandle(hostRuntime.createComponent("@fluid-example/image-collection")),
            ]);

            this.rootView.set("progressBars", progressBars);
            this.rootView.set("math", math);
            this.rootView.set("videoPlayers", videoPlayers);
            this.rootView.set("images", images);

            insights.set(newString.id, this.collabDoc.createMap().handle);

             // flowContainerMap MUST be set last

            const flowContainerMap = this.collabDoc.createMap();
            flowContainerMap.set("overlayInk", this.collabDoc.createMap().handle);
            flowContainerMap.set("pageInk", Ink.create(this.runtime).handle);
            this.rootView.set("flowContainerMap", flowContainerMap.handle);

            insights.set(newString.id, this.collabDoc.createMap().handle);
        }

        debug(`collabDoc loaded ${this.runtime.id} - ${performanceNow()}`);
        debug(`Getting root ${this.runtime.id} - ${performanceNow()}`);

        await this.rootView.wait("flowContainerMap");

        this.sharedString = await this.rootView.get<IComponentHandle>("text").get<SharedString>();
        this.insightsMap = await this.rootView.get<IComponentHandle>("insights").get<DistributedMap.ISharedMap>();
        debug(`Shared string ready - ${performanceNow()}`);
        debug(`id is ${this.runtime.id}`);
        debug(`Partial load fired: ${performanceNow()}`);

        const schedulerResponse = await this.runtime.request({ url: "/_scheduler" });
        const schedulerComponent = schedulerResponse.value as IComponent;
        this.taskManager = schedulerComponent.ITaskManager;

        const options = parse(window.location.search.substr(1));
        setTranslation(
            this.collabDoc,
            this.sharedString.id,
            options.translationFromLanguage as string,
            options.translationToLanguage as string)
            .catch((error) => {
                console.error("Problem adding translation", error);
            });

        const taskScheduler = new TaskScheduler(
            this.context,
            this.taskManager,
            this.url,
            this.sharedString,
            this.insightsMap,
        );
        taskScheduler.start();
    }

    private async initializeUI(): Promise<void> {
        // tslint:disable
        require("bootstrap/dist/css/bootstrap.min.css");
        require("bootstrap/dist/css/bootstrap-theme.min.css");
        require("../stylesheets/map.css");
        require("../stylesheets/style.css");
        require("katex/dist/katex.min.css");
        // tslint:enable

        const browserContainerHost = new ui.BrowserContainerHost();

        // Bindy for insights
        const image = new controls.Image(
            document.createElement("div"),
            url.resolve(document.baseURI, "/public/images/bindy.svg"));

        const overlayMap = await this.rootView
            .get<IComponentHandle>("flowContainerMap")
            .get<DistributedMap.ISharedMap>();
        const [overlayInkMap, pageInk] = await Promise.all([
            overlayMap.get<IComponentHandle>("overlayInk").get<ISharedMap>(),
            overlayMap.get<IComponentHandle>("pageInk").get<IInk>(),
        ]);

        const containerDiv = document.createElement("div");
        const container = new controls.FlowContainer(
            containerDiv,
            new API.Document(this.runtime, this.context, this.rootView),
            this.sharedString,
            overlayInkMap,
            pageInk,
            image,
            {});
        const theFlow = container.flowView;
        browserContainerHost.attach(container);

        getInsights(this.rootView, this.sharedString.id).then(
            (insightsMap) => {
                container.trackInsights(insightsMap);
            });

        if (this.sharedString.getLength() > 0) {
            theFlow.render(0, true);
        }
        theFlow.timeToEdit = theFlow.timeToImpression = performanceNow();

        theFlow.setEdit(this.rootView);

        this.sharedString.loaded.then(() => {
            theFlow.loadFinished(performanceNow());
            debug(`${this.runtime.id} fully loaded: ${performanceNow()} `);
        });
    }
}

class TaskScheduler {
    constructor(
        private componentContext: IComponentContext,
        private taskManager: ITaskManager,
        private componentUrl: string,
        private sharedString: SharedString,
        private insightsMap: DistributedMap.ISharedMap,
    ) {

    }

    public start() {
        const hostTokens = (this.componentContext.hostRuntime as IComponent).IComponentTokenProvider;
        const intelTokens = hostTokens && hostTokens.intelligence
            ? hostTokens.intelligence.textAnalytics
            : undefined;
        const intelTask: ITask = {
            id: "intel",
            instance: new TextAnalyzer(this.sharedString, this.insightsMap, intelTokens),
        };
        this.taskManager.pick(this.componentUrl, intelTask).then(() => {
            console.log(`Picked intel task`);
        }, (err) => {
            console.log(err);
        });
    }
}

export function instantiateComponent(context: IComponentContext): void {
    const modules = new Map<string, any>();

    // Create channel factories
    const mapFactory = SharedMap.getFactory();
    const sharedStringFactory = SharedString.getFactory();
    const inkFactory = Ink.getFactory();
    const cellFactory = SharedCell.getFactory();
    const objectSequenceFactory = SharedObjectSequence.getFactory();
    const numberSequenceFactory = SharedNumberSequence.getFactory();

    modules.set(mapFactory.type, mapFactory);
    modules.set(sharedStringFactory.type, sharedStringFactory);
    modules.set(inkFactory.type, inkFactory);
    modules.set(cellFactory.type, cellFactory);
    modules.set(objectSequenceFactory.type, objectSequenceFactory);
    modules.set(numberSequenceFactory.type, numberSequenceFactory);

    ComponentRuntime.load(
        context,
        modules,
        (runtime) => {
            const runnerP = SharedTextRunner.load(runtime, context);
            runtime.registerRequestHandler(async (request: IRequest) => {
                debug(`request(url=${request.url})`);
                const runner = await runnerP;
                return runner.request(request);
            });
        });
}
