/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { SharedCell } from "@prague/cell";
import * as API from "@prague/client-api";
import { controls, ui } from "@prague/client-ui";
import {
    IComponent,
    IComponentHTMLVisual,
    IComponentLoadable,
    IRequest,
    IResponse } from "@prague/component-core-interfaces";
import { ComponentRuntime } from "@prague/component-runtime";
import { TextAnalyzer } from "@prague/intelligence-runner";
import * as DistributedMap from "@prague/map";
import {
    CounterValueType,
    DistributedSetValueType,
    ISharedMap,
    SharedMap,
} from "@prague/map";
import * as MergeTree from "@prague/merge-tree";
import {
    IComponentContext,
    ITask,
    ITaskManager,
} from "@prague/runtime-definitions";
import {
    SharedIntervalCollectionValueType,
    SharedNumberSequence,
    SharedObjectSequence,
    SharedString,
    SharedStringIntervalCollectionValueType,
} from "@prague/sequence";
import { IStream, Stream } from "@prague/stream";
import { EventEmitter } from "events";
import { parse } from "querystring";
// tslint:disable:no-var-requires
const performanceNow = require("performance-now");
const debug = require("debug")("prague:shared-text");
// tslint:enable:no-var-requires
import * as url from "url";
import { Document } from "./document";
import {
    addTranslation,
    downloadRawText,
    getInsights,
} from "./utils";

export class SharedTextRunner extends EventEmitter implements IComponentHTMLVisual, IComponentLoadable {
    public static async load(runtime: ComponentRuntime, context: IComponentContext): Promise<SharedTextRunner> {
        const runner = new SharedTextRunner(runtime, context);
        await runner.initialize();

        return runner;
    }

    public get IComponentLoadable() { return this; }
    public get IComponentHTMLVisual() { return this; }

    public readonly url = "/text";
    private sharedString: SharedString;
    private insightsMap: DistributedMap.ISharedMap;
    private rootView: ISharedMap;
    private collabDoc: Document;
    private taskManager: ITaskManager;

    private constructor(private runtime: ComponentRuntime, private context: IComponentContext) {
        super();
    }

    public render(element: HTMLElement) {
    }

    public getRoot(): ISharedMap {
        return this.rootView;
    }

    public async request(request: IRequest): Promise<IResponse> {
        if (request.url.startsWith(this.taskManager.url)) {
            return this.taskManager.request(request);
        } else if (request.url === "" || request.url === "/") {
            return { status: 200, mimeType: "prague/component", value: this };
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
            this.rootView.set("users", this.collabDoc.createMap());
            this.rootView.set("calendar", undefined, SharedIntervalCollectionValueType.Name);
            const seq = SharedNumberSequence.create(this.collabDoc.runtime);
            this.rootView.set("sequence-test", seq);
            const newString = this.collabDoc.createString() as SharedString;

            const template = parse(window.location.search.substr(1)).template;
            const starterText = template
                ? await downloadRawText(`/public/literature/${template}`)
                : " ";

            const segments = MergeTree.loadSegments(starterText, 0, true);
            for (const segment of segments) {
                if (MergeTree.TextSegment.is(segment)) {
                    newString.insertText(newString.client.getLength(), segment.text,
                    segment.properties);
                } else {
                    // assume marker
                    const marker = segment as MergeTree.Marker;
                    newString.insertMarker(newString.client.getLength(), marker.refType, marker.properties);
                }
            }
            this.rootView.set("text", newString);
            this.rootView.set("ink", this.collabDoc.createMap());

            insights.set(newString.id, this.collabDoc.createMap().handle);
        }

        debug(`collabDoc loaded ${this.runtime.id} - ${performanceNow()}`);
        debug(`Getting root ${this.runtime.id} - ${performanceNow()}`);

        await Promise.all([this.rootView.wait("text"), this.rootView.wait("ink"), this.rootView.wait("insights")]);

        this.sharedString = this.rootView.get("text") as SharedString;
        this.insightsMap = this.rootView.get("insights") as DistributedMap.ISharedMap;
        debug(`Shared string ready - ${performanceNow()}`);
        debug(`id is ${this.runtime.id}`);
        debug(`Partial load fired: ${performanceNow()}`);

        // tslint:disable
        require("bootstrap/dist/css/bootstrap.min.css");
        require("bootstrap/dist/css/bootstrap-theme.min.css");
        require("../stylesheets/map.css");
        require("../stylesheets/style.css");
        require("katex/dist/katex.min.css");
        // tslint:enable

        const browserContainerHost = new ui.BrowserContainerHost();

        const inkPlane = this.rootView.get("ink");

        // Bindy for insights
        const image = new controls.Image(
            document.createElement("div"),
            url.resolve(document.baseURI, "/public/images/bindy.svg"));

        const containerDiv = document.createElement("div");
        const container = new controls.FlowContainer(
            containerDiv,
            new API.Document(this.runtime, this.context, this.rootView),
            this.sharedString,
            inkPlane,
            image,
            this.rootView.get("pageInk") as IStream,
            {});
        const theFlow = container.flowView;
        browserContainerHost.attach(container);

        const schedulerResponse = await this.runtime.request({ url: "/_scheduler" });
        const schedulerComponent = schedulerResponse.value as IComponent;
        this.taskManager = schedulerComponent.ITaskManager;

        const options = parse(window.location.search.substr(1));
        addTranslation(
            this.collabDoc,
            this.sharedString.id,
            options.translationFromLanguage as string,
            options.translationToLanguage as string)
            .catch((error) => {
                console.error("Problem adding translation", error);
            });

        getInsights(this.rootView, this.sharedString.id).then(
            (insightsMap) => {
                container.trackInsights(insightsMap);
            });

        if (this.sharedString.client.getLength() > 0) {
            theFlow.render(0, true);
        }
        theFlow.timeToEdit = theFlow.timeToImpression = performanceNow();

        theFlow.setEdit(this.rootView);

        this.sharedString.loaded.then(() => {
            theFlow.loadFinished(performanceNow());
            debug(`${this.runtime.id} fully loaded: ${performanceNow()} `);
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

    // Map value types to register as defaults
    const mapValueTypes = [
        new DistributedSetValueType(),
        new CounterValueType(),
        new SharedStringIntervalCollectionValueType(),
        new SharedIntervalCollectionValueType(),
    ];

    // Create channel factories
    const mapFactory = SharedMap.getFactory(mapValueTypes);
    const sharedStringFactory = SharedString.getFactory();
    const streamFactory = Stream.getFactory();
    const cellFactory = SharedCell.getFactory();
    const objectSequenceFactory = SharedObjectSequence.getFactory();
    const numberSequenceFactory = SharedNumberSequence.getFactory();

    modules.set(mapFactory.type, mapFactory);
    modules.set(sharedStringFactory.type, sharedStringFactory);
    modules.set(streamFactory.type, streamFactory);
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
