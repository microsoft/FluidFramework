import { CellExtension } from "@prague/cell";
import * as API from "@prague/client-api";
import { controls, ui } from "@prague/client-ui";
import { ComponentRuntime } from "@prague/component-runtime";
import { IComponent, IComponentHTMLViewable, IHTMLView, IRequest } from "@prague/container-definitions";
import { TextAnalyzer } from "@prague/intelligence-runner";
import * as DistributedMap from "@prague/map";
import {
    CounterValueType,
    DistributedSetValueType,
    ISharedMap,
    MapExtension,
    registerDefaultValueType,
} from "@prague/map";
import * as MergeTree from "@prague/merge-tree";
import { IComponentContext, IComponentRuntime } from "@prague/runtime-definitions";
import {
    SharedIntervalCollectionValueType,
    SharedNumberSequence,
    SharedNumberSequenceExtension,
    SharedObjectSequenceExtension,
    SharedString,
    SharedStringExtension,
    SharedStringIntervalCollectionValueType,
} from "@prague/sequence";
import { SpellChecker } from "@prague/spellchecker";
import { IStream, StreamExtension } from "@prague/stream";
import { Translator } from "@prague/translator";
import { EventEmitter } from "events";
import { parse } from "querystring";
// tslint:disable:no-var-requires
const performanceNow = require("performance-now");
const debug = require("debug")("prague:shared-text");
// tslint:enable:no-var-requires
import * as url from "url";
import { Document } from "./document";
import { createCacheHTML } from "./pageCacher";
import {
    addTranslation,
    downloadRawText,
    getInsights,
    waitForFullConnection,
} from "./utils";

const translationApiKey = "bd099a1e38724333b253fcff7523f76a";

export class SharedTextRunner extends EventEmitter implements IComponent, IComponentHTMLViewable {
    public static supportedInterfaces = ["IComponentHTMLViewable"];

    public static async load(runtime: ComponentRuntime, context: IComponentContext): Promise<SharedTextRunner> {
        const runner = new SharedTextRunner(runtime, context);
        await runner.initialize();

        return runner;
    }

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

    public async addView(host: IComponent, element: HTMLElement): Promise<IHTMLView> {
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
            this.runTask(this.context.clientType);
        });

        this.listenForLeaderEvent();
    }

    // TODO: Leader only runs intel now until we figure out web worker story.
    private listenForLeaderEvent() {
        if (this.context.leader) {
            this.runTask("intel");
        } else {
            this.runtime.on("leader", (clientId) => {
                this.runTask("intel");
            });
        }
    }

    // TODO: Eventually agent-scheduler will request for specific task.
    private runTask(taskType: string) {
        switch (taskType) {
            case "intel":
                console.log(`@chaincode/shared-text running ${taskType}`);
                const textAnalyzer = new TextAnalyzer();
                textAnalyzer.run(this.sharedString, this.insightsMap);
            case "translation":
                console.log(`@chaincode/shared-text running ${taskType}`);
                const translator = new Translator();
                translator.run(
                    this.sharedString,
                    this.insightsMap,
                    translationApiKey);
                break;
            case "spell":
                console.log(`@chaincode/shared-text running ${taskType}`);
                const speller = new SpellChecker();
                speller.run(this.sharedString);
                break;
            case "cache":
                console.log(`@chaincode/shared-text running ${taskType}`);
                // Todo: Wrap this in a snapshot like scheduler
                setInterval(() => {
                    console.log(`Generated cached page in chaincode`);
                    createCacheHTML();
                }, 10000);
                break;
            default:
                break;
        }
    }
}

export async function instantiateComponent(context: IComponentContext): Promise<IComponentRuntime> {
    const modules = new Map<string, any>();

    // Register default map value types
    registerDefaultValueType(new DistributedSetValueType());
    registerDefaultValueType(new CounterValueType());
    registerDefaultValueType(new SharedStringIntervalCollectionValueType());
    registerDefaultValueType(new SharedIntervalCollectionValueType());

    // Create channel extensions
    const mapExtension = new MapExtension();
    const sharedStringExtension = new SharedStringExtension();
    const streamExtension = new StreamExtension();
    const cellExtension = new CellExtension();
    const objectSequenceExtension = new SharedObjectSequenceExtension();
    const numberSequenceExtension = new SharedNumberSequenceExtension();

    modules.set(MapExtension.Type, mapExtension);
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
        return request.url && request.url !== "/"
            ? { status: 404, mimeType: "text/plain", value: `${request.url} not found` }
            : { status: 200, mimeType: "prague/component", value: runner };
    });

    return runtime;
}
