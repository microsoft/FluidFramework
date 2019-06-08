import { CellExtension } from "@prague/cell";
import * as API from "@prague/client-api";
import { controls, ui } from "@prague/client-ui";
import { ComponentRuntime } from "@prague/component-runtime";
import { IPlatform, IRequest } from "@prague/container-definitions";
import * as Intelligence from "@prague/intelligence-runner";
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
import * as Spellchecker from "@prague/spellchecker";
import { IStream, StreamExtension } from "@prague/stream";
import * as Translator from "@prague/translator";
import { EventEmitter } from "events";
import { parse } from "querystring";
// tslint:disable-next-line:no-submodule-imports
import * as uuid from "uuid/v4";
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

export class SharedTextRunner extends EventEmitter implements IPlatform {
    public static async Load(runtime: ComponentRuntime, context: IComponentContext): Promise<SharedTextRunner> {
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

    public async queryInterface(id: string): Promise<any> {
        return null;
    }

    public detach() {
        console.log("Text detach");
        return;
    }

    public async attach(platform: IPlatform): Promise<IPlatform> {
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

        const hostContent: HTMLElement = await platform.queryInterface<HTMLElement>("div");
        if (!hostContent) {
            // If headless exist early
            return;
        }

        // tslint:disable
        require("bootstrap/dist/css/bootstrap.min.css");
        require("bootstrap/dist/css/bootstrap-theme.min.css");
        require("../stylesheets/map.css");
        require("../stylesheets/style.css");
        require("katex/dist/katex.min.css");
        // tslint:enable

        const host = new ui.BrowserContainerHost();

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
        host.attach(container);

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

        return this;
    }

    public getRoot(): ISharedMap {
        return this.rootView;
    }

    private async initialize(): Promise<void> {
        this.collabDoc = await Document.Load(this.runtime);
        this.rootView = await this.collabDoc.getRoot();

        if (!this.runtime.existing) {
            const insightsMapId = "insights";

            const insights = this.collabDoc.createMap(insightsMapId);
            this.rootView.set(insightsMapId, insights);

            debug(`Not existing ${this.runtime.id} - ${performanceNow()}`);
            this.rootView.set("users", this.collabDoc.createMap());
            this.rootView.set("calendar", undefined, SharedIntervalCollectionValueType.Name);
            const seq = this.collabDoc.createChannel(
                uuid(),
                SharedNumberSequenceExtension.Type) as SharedNumberSequence;
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
    }

    // Leader can run tasks directly.
    private listenForLeaderEvent() {
        if (this.context.leader) {
            this.runTask("intel");
        } else {
            this.runtime.on("leader", (clientId) => {
                this.runTask("intel");
            });
        }
    }

    private runTask(clientType: string) {
        switch (clientType) {
            case "intel":
                console.log(`@chaincode/shared-text running ${clientType}`);
                Intelligence.run(this.sharedString, this.insightsMap);
                break;
            case "translation":
                console.log(`@chaincode/shared-text running ${clientType}`);
                Translator.run(
                    this.sharedString,
                    this.insightsMap,
                    translationApiKey);
                break;
            case "spell":
                console.log(`@chaincode/shared-text running ${clientType}`);
                Spellchecker.run(this.sharedString);
                break;
            case "cache":
                console.log(`@chaincode/shared-text running ${clientType}`);
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

    const runtime = await ComponentRuntime.Load(context, modules);
    const runnerP = SharedTextRunner.Load(runtime, context);

    runtime.registerRequestHandler(async (request: IRequest) => {
        debug(`request(url=${request.url})`);
        const runner = await runnerP;
        return request.url && request.url !== "/"
            ? { status: 404, mimeType: "text/plain", value: `${request.url} not found` }
            : { status: 200, mimeType: "prague/component", value: runner };
    });

    return runtime;
}
