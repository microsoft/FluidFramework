/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { parse } from "querystring";
import * as url from "url";
import registerDebug from "debug";
import { controls, ui } from "@fluid-example/client-ui-lib";
import { TextAnalyzer } from "@fluid-example/intelligence-runner-agent";
import * as API from "@fluid-internal/client-api";
import { SharedCell } from "@fluidframework/cell";
import { performanceNow } from "@fluidframework/common-utils";
import {
    IFluidObject,
    IFluidHandle,
    IFluidLoadable,
    IRequest,
    IResponse,
    IFluidRouter,
} from "@fluidframework/core-interfaces";
import { FluidDataStoreRuntime, FluidObjectHandle } from "@fluidframework/datastore";
import { Ink } from "@fluidframework/ink";
import {
    ISharedMap,
    SharedMap,
} from "@fluidframework/map";
import * as MergeTree from "@fluidframework/merge-tree";
import {
    IFluidDataStoreContext,
    ITask,
    ITaskManager,
} from "@fluidframework/runtime-definitions";
import {
    IProvideSharedString,
    SharedNumberSequence,
    SharedObjectSequence,
    SharedString,
} from "@fluidframework/sequence";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { IFluidHTMLView } from "@fluidframework/view-interfaces";
import { Document } from "./document";
import { downloadRawText, getInsights, setTranslation } from "./utils";

const debug = registerDebug("fluid:shared-text");

/**
 * Helper function to retrieve the handle for the default component route
 */
async function getHandle(runtimeP: Promise<IFluidRouter>): Promise<IFluidHandle> {
    const component = await requestFluidObject(await runtimeP, "");
    return component.IFluidLoadable.handle;
}

export class SharedTextRunner
    extends EventEmitter
    implements IFluidHTMLView, IFluidLoadable, IProvideSharedString {
    public static async load(
        runtime: FluidDataStoreRuntime,
        context: IFluidDataStoreContext,
    ): Promise<SharedTextRunner> {
        const runner = new SharedTextRunner(runtime, context);
        await runner.initialize();

        return runner;
    }

    private readonly innerHandle: IFluidHandle<this>;

    public get handle(): IFluidHandle<this> { return this.innerHandle; }
    public get IFluidHandle() { return this.innerHandle; }
    public get IFluidLoadable() { return this; }

    public get IFluidHTMLView() { return this; }
    public get ISharedString() { return this.sharedString; }

    public readonly url = "/text";
    private sharedString: SharedString;
    private insightsMap: ISharedMap;
    private rootView: ISharedMap;
    private collabDoc: Document;
    private taskManager: ITaskManager;
    private uiInitialized = false;
    private readonly title: string = "Shared Text";

    private constructor(
        private readonly runtime: FluidDataStoreRuntime,
        private readonly context: IFluidDataStoreContext,
    ) {
        super();
        this.innerHandle = new FluidObjectHandle(this, this.url, this.runtime.IFluidHandleContext);
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
        if (request.url === "" || request.url === "/") {
            return { status: 200, mimeType: "fluid/object", value: this };
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

            const containerRuntime = this.context.containerRuntime;
            const [progressBars, math, videoPlayers, images] = await Promise.all([
                getHandle(containerRuntime.createDataStore("@fluid-example/progress-bars")),
                getHandle(containerRuntime.createDataStore("@fluid-example/math")),
                getHandle(containerRuntime.createDataStore("@fluid-example/video-players")),
                getHandle(containerRuntime.createDataStore("@fluid-example/image-collection")),
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

        this.sharedString = await this.rootView.get<IFluidHandle<SharedString>>("text").get();
        this.insightsMap = await this.rootView.get<IFluidHandle<ISharedMap>>("insights").get();
        debug(`Shared string ready - ${performanceNow()}`);
        debug(`id is ${this.runtime.id}`);
        debug(`Partial load fired: ${performanceNow()}`);

        this.taskManager = await this.context.containerRuntime.getTaskManager();

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
            .get<IFluidHandle<ISharedMap>>("flowContainerMap")
            .get();
        const overlayInkMap = await overlayMap.get<IFluidHandle<ISharedMap>>("overlayInk").get();

        const containerDiv = document.createElement("div");
        containerDiv.id = "flow-container";
        containerDiv.style.touchAction = "none";
        containerDiv.style.overflow = "hidden";
        const container = new controls.FlowContainer(
            containerDiv,
            this.title,
            // API.Document should not be used here. This should be removed once #2915 is fixed.
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
        private readonly componentContext: IFluidDataStoreContext,
        private readonly taskManager: ITaskManager,
        private readonly sharedString: SharedString,
        private readonly insightsMap: ISharedMap,
    ) {

    }

    public start() {
        const hostTokens =
            (this.componentContext.containerRuntime as IFluidObject).IFluidTokenProvider;
        const intelTokens = hostTokens && hostTokens.intelligence
            ? hostTokens.intelligence.textAnalytics
            : undefined;

        if (intelTokens?.key?.length > 0) {
            const intelTask: ITask = {
                id: "intel",
                instance: new TextAnalyzer(this.sharedString, this.insightsMap, intelTokens),
            };
            this.taskManager.register(intelTask);
            this.taskManager.pick(intelTask.id).then(() => {
                console.log(`Picked text analyzer`);
            }, (err) => {
                console.log(JSON.stringify(err));
            });
        } else {
            console.log("No intel key provided.");
        }
    }
}

export function instantiateDataStore(context: IFluidDataStoreContext) {
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

    const runtime = FluidDataStoreRuntime.load(
        context,
        modules,
    );

    const runnerP = SharedTextRunner.load(runtime, context);
    runtime.registerRequestHandler(async (request: IRequest) => {
        debug(`request(url=${request.url})`);
        const runner = await runnerP;
        return runner.request(request);
    });

    return runtime;
}
