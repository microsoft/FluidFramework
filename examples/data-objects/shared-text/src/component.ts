/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { parse } from "querystring";
import * as url from "url";
import registerDebug from "debug";
import { controls, ui } from "@fluid-example/client-ui-lib";
import { TextAnalyzer } from "@fluid-example/intelligence-runner-agent";
import { IAgentScheduler } from "@fluidframework/agent-scheduler";
import { SharedCell } from "@fluidframework/cell";
import { performance } from "@fluidframework/common-utils";
import {
    FluidObject,
    IFluidHandle,
    IFluidLoadable,
    IRequest,
    IResponse,
} from "@fluidframework/core-interfaces";
import { FluidDataStoreRuntime, FluidObjectHandle, mixinRequestHandler } from "@fluidframework/datastore";
import {
    ISharedMap,
    SharedMap,
} from "@fluidframework/map";
import * as MergeTree from "@fluidframework/merge-tree";
import {
    IFluidDataStoreContext,
} from "@fluidframework/runtime-definitions";
import {
    SharedString,
} from "@fluidframework/sequence";
import {
    RequestParser,
    create404Response,
} from "@fluidframework/runtime-utils";
import { IFluidHTMLView } from "@fluidframework/view-interfaces";
import { IFluidTokenProvider } from "@fluidframework/container-definitions";
import { SharedTextDocument } from "./document";
import { downloadRawText, getInsights, setTranslation } from "./utils";

const debug = registerDebug("fluid:shared-text");

export class SharedTextRunner
    extends EventEmitter
    implements IFluidHTMLView, IFluidLoadable {
    public static async load(
        runtime: FluidDataStoreRuntime,
        context: IFluidDataStoreContext,
        existing: boolean,
    ): Promise<SharedTextRunner> {
        const runner = new SharedTextRunner(runtime, context);
        await runner.initialize(existing);

        return runner;
    }

    private readonly innerHandle: IFluidHandle<this>;

    public get handle(): IFluidHandle<this> { return this.innerHandle; }
    public get IFluidHandle() { return this.innerHandle; }
    public get IFluidLoadable() { return this; }

    public get IFluidHTMLView() { return this; }

    private sharedString: SharedString;
    private insightsMap: ISharedMap;
    private rootView: ISharedMap;
    private sharedTextDocument: SharedTextDocument;
    private uiInitialized = false;
    private readonly title: string = "Shared Text";

    private constructor(
        private readonly runtime: FluidDataStoreRuntime,
        private readonly context: IFluidDataStoreContext,
    ) {
        super();
        this.innerHandle = new FluidObjectHandle(this, "/text", this.runtime.objectsRoutingContext);
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
        const pathParts = RequestParser.getPathParts(request.url);
        if (pathParts.length === 0) {
            return { status: 200, mimeType: "fluid/object", value: this };
        } else if (pathParts.length === 1 && pathParts[0].toLocaleLowerCase() === "sharedstring") {
            return { status:200, mimeType: "fluid/sharedstring", value: this.sharedString };
        }
        else {
            return create404Response(request);
        }
    }

    private async initialize(existing: boolean): Promise<void> {
        this.sharedTextDocument = await SharedTextDocument.load(this.runtime, existing);
        this.rootView = this.sharedTextDocument.getRoot();

        if (!existing) {
            const insightsMapId = "insights";

            const insights = this.sharedTextDocument.createMap(insightsMapId);
            this.rootView.set(insightsMapId, insights.handle);

            debug(`Not existing ${this.runtime.id} - ${performance.now()}`);
            this.rootView.set("users", this.sharedTextDocument.createMap().handle);
            const newString = this.sharedTextDocument.createString();

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

            insights.set(newString.id, this.sharedTextDocument.createMap().handle);

            // The flowContainerMap MUST be set last

            const flowContainerMap = this.sharedTextDocument.createMap();
            this.rootView.set("flowContainerMap", flowContainerMap.handle);

            insights.set(newString.id, this.sharedTextDocument.createMap().handle);
        }

        debug(`collabDoc loaded ${this.runtime.id} - ${performance.now()}`);
        debug(`Getting root ${this.runtime.id} - ${performance.now()}`);

        await this.rootView.wait("flowContainerMap");

        this.sharedString = await this.rootView.get<IFluidHandle<SharedString>>("text").get();
        this.insightsMap = await this.rootView.get<IFluidHandle<ISharedMap>>("insights").get();
        debug(`Shared string ready - ${performance.now()}`);
        debug(`id is ${this.runtime.id}`);
        debug(`Partial load fired: ${performance.now()}`);

        const agentSchedulerResponse = await this.context.containerRuntime.request({ url: "/_scheduler" });
        if (agentSchedulerResponse.status === 404) {
            throw new Error("Agent scheduler not found");
        }
        const agentScheduler = agentSchedulerResponse.value as IAgentScheduler;

        const options = parse(window.location.search.substr(1));
        setTranslation(
            this.sharedTextDocument,
            this.sharedString.id,
            options.translationFromLanguage as string,
            options.translationToLanguage as string,
            existing)
            .catch((error) => {
                console.error("Problem adding translation", error);
            });

        const taskScheduler = new TaskScheduler(
            this.context,
            agentScheduler,
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
        /* eslint-enable @typescript-eslint/no-require-imports,
        import/no-internal-modules, import/no-unassigned-import */

        const browserContainerHost = new ui.BrowserContainerHost();

        // Bindy for insights
        const image = new controls.Image(
            document.createElement("div"),
            url.resolve(document.baseURI, "/public/images/bindy.svg"));

        const containerDiv = document.createElement("div");
        containerDiv.id = "flow-container";
        containerDiv.style.touchAction = "none";
        containerDiv.style.overflow = "hidden";
        const container = new controls.FlowContainer(
            containerDiv,
            this.title,
            this.runtime,
            this.context,
            this.sharedString,
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
        theFlow.timeToEdit = theFlow.timeToImpression = performance.now();

        theFlow.setEdit(this.rootView);

        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.sharedString.loaded.then(() => {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            theFlow.loadFinished(performance.now());
            debug(`${this.runtime.id} fully loaded: ${performance.now()} `);
        });
    }
}

class TaskScheduler {
    constructor(
        private readonly componentContext: IFluidDataStoreContext,
        private readonly agentScheduler: IAgentScheduler,
        private readonly sharedString: SharedString,
        private readonly insightsMap: ISharedMap,
    ) {

    }

    public start() {
        const hostTokens =
            (this.componentContext.containerRuntime as FluidObject<IFluidTokenProvider>).IFluidTokenProvider;
        const intelTokens = hostTokens && hostTokens.intelligence
            ? hostTokens.intelligence.textAnalytics
            : undefined;

        if (intelTokens?.key?.length > 0) {
            const intelTaskId = "intel";
            const textAnalyzer = new TextAnalyzer(this.sharedString, this.insightsMap, intelTokens);
            this.agentScheduler.pick(intelTaskId, async () => {
                console.log(`Picked text analyzer`);
                await textAnalyzer.run();
            }).catch((err) => { console.error(err); });
        } else {
            console.log("No intel key provided.");
        }
    }
}

export function instantiateDataStore(context: IFluidDataStoreContext, existing: boolean) {
    const runtimeClass = mixinRequestHandler(
        async (request: IRequest) => {
            const router = await routerP;
            return router.request(request);
        });

    const runtime = new runtimeClass(
        context,
        new Map([
            SharedMap.getFactory(),
            SharedString.getFactory(),
            SharedCell.getFactory(),
        ].map((factory) => [factory.type, factory])),
        existing,
    );
    const routerP = SharedTextRunner.load(runtime, context, existing);

    return runtime;
}
