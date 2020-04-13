/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { parse } from "querystring";
import * as url from "url";
import { controls, ui } from "@fluid-example/client-ui-lib";
import { TextAnalyzer } from "@fluid-example/intelligence-runner-agent";
import * as API from "@fluid-internal/client-api";
import { SharedCell } from "@microsoft/fluid-cell";
import {
    IComponent,
    IComponentHandle,
    IComponentLoadable,
    IRequest,
    IResponse,
} from "@microsoft/fluid-component-core-interfaces";
import { ComponentRuntime } from "@microsoft/fluid-component-runtime";
import { Ink } from "@microsoft/fluid-ink";
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
import { IComponentHTMLView } from "@microsoft/fluid-view-interfaces";
import { Document } from "./document";
import { downloadRawText, getInsights, setTranslation } from "./utils";

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires */
const performanceNow = require("performance-now");
const debug = require("debug")("fluid:shared-text");
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires */

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
    implements IComponentHTMLView, IComponentLoadable, IProvideSharedString {

    public static async load(runtime: ComponentRuntime, context: IComponentContext): Promise<SharedTextRunner> {
        const runner = new SharedTextRunner(runtime, context);
        await runner.initialize();

        return runner;
    }

    public get IComponentLoadable() { return this; }
    public get IComponentHTMLView() { return this; }
    public get ISharedString() { return this.sharedString; }

    public readonly url = "/text";
    private sharedString: SharedString;
    private insightsMap: ISharedMap;
    private rootView: ISharedMap;
    private collabDoc: Document;
    private taskManager: ITaskManager;
    private uiInitialized = false;

    private constructor(private readonly runtime: ComponentRuntime, private readonly context: IComponentContext) {
        super();
    }

    public render(element: HTMLElement) {
        if (this.uiInitialized) {
            return;
        }

        this.initializeUI(element).catch(debug);
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
        this.rootView = this.collabDoc.getRoot();

        if (!this.runtime.existing) {
            const insightsMapId = "insights";

            const insights = this.collabDoc.createMap(insightsMapId);
            this.rootView.set(insightsMapId, insights.handle);

            debug(`Not existing ${this.runtime.id} - ${performanceNow()}`);
            this.rootView.set("users", this.collabDoc.createMap().handle);
            const seq = SharedNumberSequence.create(this.collabDoc.runtime);
            this.rootView.set("sequence-test", seq.handle);
            const newString = this.collabDoc.createString();

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
                    // Assume marker
                    const marker = segment as MergeTree.Marker;
                    newString.insertMarker(newString.getLength(), marker.refType, marker.properties);
                }
            }
            this.rootView.set("text", newString.handle);

            const hostRuntime = this.context.hostRuntime;
            const [progressBars, math, videoPlayers, images] = await Promise.all([
                getHandle(hostRuntime.createComponentWithProps("@fluid-example/progress-bars")),
                getHandle(hostRuntime.createComponentWithProps("@fluid-example/math")),
                getHandle(hostRuntime.createComponentWithProps("@fluid-example/video-players")),
                getHandle(hostRuntime.createComponentWithProps("@fluid-example/image-collection")),
            ]);

            this.rootView.set("progressBars", progressBars);
            this.rootView.set("math", math);
            this.rootView.set("videoPlayers", videoPlayers);
            this.rootView.set("images", images);

            insights.set(newString.id, this.collabDoc.createMap().handle);

            // The flowContainerMap MUST be set last

            const flowContainerMap = this.collabDoc.createMap();
            flowContainerMap.set("overlayInk", this.collabDoc.createMap().handle);
            this.rootView.set("flowContainerMap", flowContainerMap.handle);

            insights.set(newString.id, this.collabDoc.createMap().handle);
        }

        debug(`collabDoc loaded ${this.runtime.id} - ${performanceNow()}`);
        debug(`Getting root ${this.runtime.id} - ${performanceNow()}`);

        await this.rootView.wait("flowContainerMap");

        this.sharedString = await this.rootView.get<IComponentHandle<SharedString>>("text").get();
        this.insightsMap = await this.rootView.get<IComponentHandle<ISharedMap>>("insights").get();
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

    private async initializeUI(div): Promise<void> {
        /* eslint-disable @typescript-eslint/no-require-imports,
        import/no-internal-modules, import/no-unassigned-import */
        require("bootstrap/dist/css/bootstrap.min.css");
        require("bootstrap/dist/css/bootstrap-theme.min.css");
        require("../stylesheets/map.css");
        require("../stylesheets/style.css");
        require("katex/dist/katex.min.css");
        /* eslint-enable @typescript-eslint/no-require-imports,
        import/no-internal-modules, import/no-unassigned-import */

        const browserContainerHost = new ui.BrowserContainerHost();

        // Bindy for insights
        const image = new controls.Image(
            document.createElement("div"),
            url.resolve(document.baseURI, "/public/images/bindy.svg"));

        const overlayMap = await this.rootView
            .get<IComponentHandle<ISharedMap>>("flowContainerMap")
            .get();
        const overlayInkMap = await overlayMap.get<IComponentHandle<ISharedMap>>("overlayInk").get();

        const containerDiv = document.createElement("div");
        containerDiv.id = "flow-container";
        containerDiv.style.touchAction = "none";
        containerDiv.style.overflow = "hidden";
        const container = new controls.FlowContainer(
            containerDiv,
            new API.Document(
                this.runtime,
                this.context,
                this.rootView,
                () => { throw new Error("Can't close document"); }),
            this.sharedString,
            overlayInkMap,
            image,
            {});
        const theFlow = container.flowView;
        browserContainerHost.attach(container, div);

        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        getInsights(this.rootView, this.sharedString.id).then(
            (insightsMap) => {
                container.trackInsights(insightsMap);
            });

        if (this.sharedString.getLength() > 0) {
            theFlow.render(0, true);
        }
        theFlow.timeToEdit = theFlow.timeToImpression = performanceNow();

        theFlow.setEdit(this.rootView);

        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.sharedString.loaded.then(() => {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            theFlow.loadFinished(performanceNow());
            debug(`${this.runtime.id} fully loaded: ${performanceNow()} `);
        });
    }
}

class TaskScheduler {
    constructor(
        private readonly componentContext: IComponentContext,
        private readonly taskManager: ITaskManager,
        private readonly componentUrl: string,
        private readonly sharedString: SharedString,
        private readonly insightsMap: ISharedMap,
    ) {

    }

    public start() {
        const hostTokens = (this.componentContext.hostRuntime as IComponent).IComponentTokenProvider;
        const intelTokens = hostTokens && hostTokens.intelligence
            ? hostTokens.intelligence.textAnalytics
            : undefined;

        if (intelTokens?.key?.length > 0) {
            const intelTask: ITask = {
                id: "intel",
                instance: new TextAnalyzer(this.sharedString, this.insightsMap, intelTokens),
            };
            this.taskManager.register(intelTask);
            this.taskManager.pick(this.componentUrl, "intel").then(() => {
                console.log(`Picked text analyzer`);
            }, (err) => {
                console.log(JSON.stringify(err));
            });
        } else {
            console.log("No intel key provided.");
        }
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

    const runtime = ComponentRuntime.load(
        context,
        modules,
    );

    const runnerP = SharedTextRunner.load(runtime, context);
    runtime.registerRequestHandler(async (request: IRequest) => {
        debug(`request(url=${request.url})`);
        const runner = await runnerP;
        return runner.request(request);
    });
}
