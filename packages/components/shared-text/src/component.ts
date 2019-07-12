/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { SharedCell } from "@prague/cell";
import * as API from "@prague/client-api";
import { controls, ui } from "@prague/client-ui";
import { ComponentRuntime } from "@prague/component-runtime";
import {
    IComponent,
    IComponentHTMLViewableDeprecated,
    IComponentLoadable,
    IComponentRouter,
    IHTMLViewDeprecated,
    IRequest,
    IResponse,
} from "@prague/container-definitions";
import { TextAnalyzer } from "@prague/intelligence-runner";
import * as DistributedMap from "@prague/map";
import {
    CounterValueType,
    DistributedSetValueType,
    ISharedMap,
    SharedMap,
} from "@prague/map";
import * as MergeTree from "@prague/merge-tree";
import { IAgentScheduler, IComponentContext, IComponentRuntime } from "@prague/runtime-definitions";
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
    waitForFullConnection,
} from "./utils";

const textAnalyzerRoute = "/tasks/intel";

export class SharedTextRunner extends EventEmitter
    implements IComponent, IComponentHTMLViewableDeprecated, IComponentLoadable, IComponentRouter {
    public static supportedInterfaces = [
        "IComponentHTMLViewableDeprecated",
        "IComponentLoadable",
        "IComponentRouter",
    ];

    public static async load(runtime: ComponentRuntime, context: IComponentContext): Promise<SharedTextRunner> {
        const runner = new SharedTextRunner(runtime, context);
        await runner.initialize();

        return runner;
    }

    public readonly url = "/text";
    private sharedString: SharedString;
    private insightsMap: DistributedMap.ISharedMap;
    private rootView: ISharedMap;
    private collabDoc: Document;

    private constructor(private runtime: ComponentRuntime, private context: IComponentContext) {
        super();
    }

    public query(id: string): any {
        return SharedTextRunner.supportedInterfaces.indexOf(id) !== -1 ? this : undefined;
    }

    public list(): string[] {
        return SharedTextRunner.supportedInterfaces;
    }

    public async request(request: IRequest): Promise<IResponse> {
        if (request.url === textAnalyzerRoute) {
            const textAnalyzer = new TextAnalyzer(this.sharedString, this.insightsMap);
            return { status: 200, mimeType: "prague/component", value: textAnalyzer };
        } else if (request.url === "" || request.url === "/") {
            return { status: 200, mimeType: "prague/component", value: this };
        } else {
            return { status: 404, mimeType: "text/plain", value: `${request.url} not found` };
        }
    }

    public async addView(host: IComponent, element: HTMLElement): Promise<IHTMLViewDeprecated> {
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

        return {
            remove: () => { },
        };
    }

    public getRoot(): ISharedMap {
        return this.rootView;
    }

    private async initialize(): Promise<void> {
        this.collabDoc = await Document.load(this.runtime);
        this.rootView = await this.collabDoc.getRoot();

        if (!this.runtime.existing) {
            const insightsMapId = "insights";

            const insights = this.collabDoc.createMap(insightsMapId);
            this.rootView.set(insightsMapId, insights);

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
                    newString.insertText(segment.text, newString.client.getLength(),
                    segment.properties);
                } else {
                    // assume marker
                    const marker = segment as MergeTree.Marker;
                    newString.insertMarker(newString.client.getLength(), marker.refType, marker.properties);
                }
            }
            this.rootView.set("text", newString);
            this.rootView.set("ink", this.collabDoc.createMap());

            insights.set(newString.id, this.collabDoc.createMap());
        }

        debug(`collabDoc loaded ${this.runtime.id} - ${performanceNow()}`);
        debug(`Getting root ${this.runtime.id} - ${performanceNow()}`);

        await Promise.all([this.rootView.wait("text"), this.rootView.wait("ink"), this.rootView.wait("insights")]);

        this.sharedString = this.rootView.get("text") as SharedString;
        this.insightsMap = this.rootView.get("insights") as DistributedMap.ISharedMap;
        debug(`Shared string ready - ${performanceNow()}`);
        debug(`id is ${this.runtime.id}`);
        debug(`Partial load fired: ${performanceNow()}`);

        waitForFullConnection(this.runtime).then(() => {
            this.registerTasks().then(() => {
                console.log(`Requested tasks`);
            })
            .catch((err) => {
                console.log(`Error requesting tasks ${err}`);
            });
        });
    }

    // TODO: component will ask host for capability before registering.
    private async registerTasks() {
        const response = await this.runtime.request({ url: "/_scheduler" });
        const rawComponent = response.value as IComponent;

        const scheduler = rawComponent.query<IAgentScheduler>("IAgentScheduler");

        // TODO: Pick tasks once stuff are finalized.
        if (scheduler.leader) {
            console.log(`This instance is the leader`);
        } else {
            scheduler.on("leader", () => {
                console.log(`This instance is the leader`);
            });
        }
    }

}

export async function instantiateComponent(context: IComponentContext): Promise<IComponentRuntime> {
    const modules = new Map<string, any>();

    // Map value types to register as defaults
    const mapValueTypes = [
        new DistributedSetValueType(),
        new CounterValueType(),
        new SharedStringIntervalCollectionValueType(),
        new SharedIntervalCollectionValueType(),
    ];

    // Create channel extensions
    const mapExtension = SharedMap.getFactory(mapValueTypes);
    const sharedStringExtension = SharedString.getFactory();
    const streamExtension = Stream.getFactory();
    const cellExtension = SharedCell.getFactory();
    const objectSequenceExtension = SharedObjectSequence.getFactory();
    const numberSequenceExtension = SharedNumberSequence.getFactory();

    modules.set(mapExtension.type, mapExtension);
    modules.set(sharedStringExtension.type, sharedStringExtension);
    modules.set(streamExtension.type, streamExtension);
    modules.set(cellExtension.type, cellExtension);
    modules.set(objectSequenceExtension.type, objectSequenceExtension);
    modules.set(numberSequenceExtension.type, numberSequenceExtension);

    const runtime = await ComponentRuntime.load(context, modules);
    const runnerP = SharedTextRunner.load(runtime, context);

    runtime.registerRequestHandler(async (request: IRequest) => {
        debug(`request(url=${request.url})`);
        const runner = await runnerP;
        return runner.request(request);
    });

    return runtime;
}
