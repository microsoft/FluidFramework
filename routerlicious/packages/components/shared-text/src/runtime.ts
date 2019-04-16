import * as cell from "@prague/cell";
import * as API from "@prague/client-api";
import { controls, ui } from "@prague/client-ui";
import { ComponentHost } from "@prague/component";
import {
    IContainerContext,
    IPlatform,
    IRequest,
    IRuntime,
    ITree,
} from "@prague/container-definitions";
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
import {
    Runtime,
} from "@prague/runtime";
import {
    IChaincode, IChaincodeComponent, IComponentDeltaHandler, IComponentRuntime, IRuntime as ILegacyRuntime,
} from "@prague/runtime-definitions";
import * as SharedString from "@prague/sequence";
import * as sequence from "@prague/sequence";
import * as Snapshotter from "@prague/snapshotter";
import * as Spellcheker from "@prague/spellchecker";
import { IStream } from "@prague/stream";
import * as stream from "@prague/stream";
import * as Translator from "@prague/translator";
import { Deferred } from "@prague/utils";
import * as assert from "assert";
import { default as axios } from "axios";
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

const charts = import(/* webpackChunkName: "charts", webpackPrefetch: true */ "@chaincode/charts");
const monaco = import(/* webpackChunkName: "charts", webpackPrefetch: true */ "@chaincode/monaco");
const pinpoint = import(/* webpackChunkName: "pinpoint", webpackPrefetch: true */ "@chaincode/pinpoint-editor");

// tslint:disable
(self as any).MonacoEnvironment = {
	getWorkerUrl: function (moduleId, label) {
		switch (label) {
			case 'json': return require('blob-url-loader?type=application/javascript!compile-loader?target=worker&emit=false!monaco-editor/esm/vs/language/json/json.worker');
			case 'css': return require('blob-url-loader?type=application/javascript!compile-loader?target=worker&emit=false!monaco-editor/esm/vs/language/css/css.worker');
			case 'html': return require('blob-url-loader?type=application/javascript!compile-loader?target=worker&emit=false!monaco-editor/esm/vs/language/html/html.worker');
			case 'typescript':
			case 'javascript': return require('blob-url-loader?type=application/javascript!compile-loader?target=worker&emit=false!monaco-editor/esm/vs/language/typescript/ts.worker');
			default:
				return require('blob-url-loader?type=application/javascript!compile-loader?target=worker&emit=false!monaco-editor/esm/vs/editor/editor.worker');
		}
	}
};
// tslint:enable

// first script loaded
const clockStart = Date.now();

const translationApiKey = "bd099a1e38724333b253fcff7523f76a";

async function getInsights(map: DistributedMap.ISharedMap, id: string): Promise<DistributedMap.ISharedMap> {
    const insights = await map.wait<DistributedMap.ISharedMap>("insights");
    return insights.wait<DistributedMap.ISharedMap>(id);
}

async function addTranslation(
    document: Document,
    id: string,
    fromLanguage: string,
    toLanguage: string): Promise<void> {
    // Create the translations map
    const insights = await document.getRoot().wait<DistributedMap.ISharedMap>("insights");
    const idMap = await insights.wait<DistributedMap.ISharedMap>(id);
    if (!document.existing) {
        idMap.set("translationsFrom", undefined, DistributedMap.DistributedSetValueType.Name);
        idMap.set("translationsTo", undefined, DistributedMap.DistributedSetValueType.Name);
    }

    if (fromLanguage) {
        const translationsFrom = await idMap.wait<DistributedMap.DistributedSet<string>>("translationsFrom");
        translationsFrom.add(fromLanguage);
    }

    if (toLanguage) {
        const translationsTo = await idMap.wait<DistributedMap.DistributedSet<string>>("translationsTo");
        translationsTo.add(toLanguage);
    }
}

async function downloadRawText(textUrl: string): Promise<string> {
    const data = await axios.get(textUrl);
    return data.data;
}

// Wait for the runtime to get fully connected.
async function waitForFullConnection(runtime: any): Promise<void> {
    if (runtime.connected) {
        return;
    } else {
        return new Promise<void>((resolve, reject) => {
            runtime.once("connected", () => {
                resolve();
            });
        });
    }
}

export class SharedTextRunner extends EventEmitter implements IPlatform {
    private sharedString: SharedString.SharedString;
    private insightsMap: DistributedMap.ISharedMap;
    private rootView: ISharedMap;
    private runtime: ILegacyRuntime;
    private collabDocDeferred = new Deferred<Document>();

    public async run(runtime: ILegacyRuntime, platform: IPlatform) {
        this.runtime = runtime;
        this.initialize(runtime).then(
            (doc) => this.collabDocDeferred.resolve(doc),
            (error) => this.collabDocDeferred.reject(error));
        return this;
    }

    public async queryInterface<T>(id: string): Promise<any> {
        return null;
    }

    public detach() {
        console.log("Text detach");
        return;
    }

    public async attach(platform: IPlatform): Promise<IPlatform> {
        const collabDoc = await this.collabDocDeferred.promise;

        debug(`collabDoc loaded ${this.runtime.id} - ${performanceNow()}`);
        debug(`Getting root ${this.runtime.id} - ${performanceNow()}`);

        await Promise.all([this.rootView.wait("text"), this.rootView.wait("ink"), this.rootView.wait("insights")]);

        this.sharedString = this.rootView.get("text") as SharedString.SharedString;
        this.insightsMap = this.rootView.get("insights") as DistributedMap.ISharedMap;
        debug(`Shared string ready - ${performanceNow()}`);
        debug(`id is ${this.runtime.id}`);
        debug(`Partial load fired: ${performanceNow()}`);

        waitForFullConnection(this.runtime).then(() => {
            this.runTask(this.runtime.clientType);
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
            new API.Document(this.runtime, this.rootView),
            this.sharedString,
            inkPlane,
            image,
            this.rootView.get("pageInk") as IStream,
            {});
        const theFlow = container.flowView;
        host.attach(container);

        const options = parse(window.location.search.substr(1));
        addTranslation(
            collabDoc,
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
        theFlow.timeToEdit = theFlow.timeToImpression = Date.now() - clockStart;

        theFlow.setEdit(this.rootView);

        this.sharedString.loaded.then(() => {
            theFlow.loadFinished(clockStart);
            debug(`${this.runtime.id} fully loaded: ${performanceNow()} `);
        });
    }

    private async initialize(runtime: ILegacyRuntime): Promise<Document> {
        const collabDoc = await Document.Load(runtime);
        this.rootView = await collabDoc.getRoot();

        if (!runtime.existing) {
            const insightsMapId = "insights";

            const insights = collabDoc.createMap(insightsMapId);
            this.rootView.set(insightsMapId, insights);

            debug(`Not existing ${runtime.id} - ${performanceNow()}`);
            this.rootView.set("users", collabDoc.createMap());
            this.rootView.set("calendar", undefined, SharedString.SharedIntervalCollectionValueType.Name);
            const seq = collabDoc.createChannel(
                uuid(), SharedString.SharedNumberSequenceExtension.Type) as
                SharedString.SharedNumberSequence;
            this.rootView.set("sequence-test", seq);
            const newString = collabDoc.createString() as SharedString.SharedString;

            const template = parse(window.location.search.substr(1)).template;
            const starterText = template
                ? await downloadRawText(
                    `/public/literature/${template}`)
                : " ";

            const segments = MergeTree.loadSegments(starterText, 0, true);
            for (const segment of segments) {
                if (segment.getType() === MergeTree.SegmentType.Text) {
                    const textSegment = segment as MergeTree.TextSegment;
                    newString.insertText(textSegment.text, newString.client.getLength(),
                        textSegment.properties);
                } else {
                    // assume marker
                    const marker = segment as MergeTree.Marker;
                    newString.insertMarker(newString.client.getLength(), marker.refType, marker.properties);
                }
            }
            this.rootView.set("text", newString);
            this.rootView.set("ink", collabDoc.createMap());

            insights.set(newString.id, collabDoc.createMap());
        }

        return collabDoc;
    }

    // Leader can run tasks directly.
    private listenForLeaderEvent() {
        if (this.runtime.leader) {
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
                Spellcheker.run(this.sharedString);
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

/**
 * A document is a collection of collaborative types.
 */
class Chaincode extends EventEmitter implements IChaincode {
    private modules = new Map<string, any>();

    /**
     * Constructs a new document from the provided details
     */
    constructor(private runner: any) {
        super();

        // Register default map value types
        registerDefaultValueType(new DistributedSetValueType());
        registerDefaultValueType(new CounterValueType());
        registerDefaultValueType(new sequence.SharedStringIntervalCollectionValueType());
        registerDefaultValueType(new sequence.SharedIntervalCollectionValueType());

        // Create channel extensions
        const mapExtension = new MapExtension();
        const sharedStringExtension = new sequence.SharedStringExtension();
        const streamExtension = new stream.StreamExtension();
        const cellExtension = new cell.CellExtension();
        const objectSequenceExtension = new sequence.SharedObjectSequenceExtension();
        const numberSequenceExtension = new sequence.SharedNumberSequenceExtension();

        this.modules.set(MapExtension.Type, mapExtension);
        this.modules.set(sharedStringExtension.type, sharedStringExtension);
        this.modules.set(streamExtension.type, streamExtension);
        this.modules.set(cellExtension.type, cellExtension);
        this.modules.set(objectSequenceExtension.type, objectSequenceExtension);
        this.modules.set(numberSequenceExtension.type, numberSequenceExtension);
    }

    public getModule(type: string): any {
        assert(this.modules.has(type));
        return this.modules.get(type);
    }

    /**
     * Stops the instantiated chaincode from running
     */
    public close(): Promise<void> {
        return Promise.resolve();
    }

    public async run(runtime: ILegacyRuntime, platform: IPlatform): Promise<IPlatform> {
        return this.runner.run(runtime, platform);
    }
}

export class SharedTextComponent implements IChaincodeComponent {
    private sharedText = new SharedTextRunner();
    private chaincode: Chaincode;
    private component: ComponentHost;

    constructor() {
        this.chaincode = new Chaincode(this.sharedText);
    }

    public getModule(type: string) {
        return null;
    }

    public async close(): Promise<void> {
        return;
    }

    public async run(runtime: IComponentRuntime): Promise<IComponentDeltaHandler> {
        const chaincode = this.chaincode;

        const component = await ComponentHost.LoadFromSnapshot(runtime, chaincode);
        this.component = component;

        return component;
    }

    public async attach(platform: IPlatform): Promise<IPlatform> {
        return this.sharedText.attach(platform);
    }

    public snapshot(): ITree {
        const entries = this.component.snapshotInternal();
        return { entries, sha: null };
    }
}

export async function instantiateComponent(): Promise<IChaincodeComponent> {
    return new SharedTextComponent();
}

/**
 * Instantiates a new chaincode host
 */
export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
    const registry = new Map<string, any>([
        ["@chaincode/charts", charts],
        ["@chaincode/monaco", monaco],
        ["@chaincode/pinpoint-editor", pinpoint],
        ["@chaincode/shared-text", { instantiateComponent }],
    ]);

    const runtime = await Runtime.Load(registry, context);

    // Register path handler for inbound messages
    runtime.registerRequestHandler(async (request: IRequest) => {
        console.log(request.url);
        const requestUrl = request.url.length > 0 && request.url.charAt(0) === "/"
            ? request.url.substr(1)
            : request.url;
        const trailingSlash = requestUrl.indexOf("/");

        const componentId = requestUrl
            ? requestUrl.substr(0, trailingSlash === -1 ? requestUrl.length : trailingSlash)
            : "text";
        const component = await runtime.getComponent(componentId, true);

        // If there is a trailing slash forward to the component. Otherwise handle directly.
        if (trailingSlash === -1) {
            return { status: 200, mimeType: "prague/component", value: component };
        } else {
            return component.request({ url: requestUrl.substr(trailingSlash) });
        }
    });

    // Registering for tasks to run in headless runner.
    runtime.registerTasks(["snapshot", "spell", "translation", "cache"], "1.0");

    waitForFullConnection(runtime).then(() => {
        // Call snapshot directly from runtime.
        if (runtime.clientType === "snapshot") {
            console.log(`@chaincode/shared-text running ${runtime.clientType}`);
            Snapshotter.run(runtime);
        }
    });

    // On first boot create the base component
    if (!runtime.existing) {
        runtime.createAndAttachComponent("text", "@chaincode/shared-text").catch((error) => {
            context.error(error);
        });
    }

    return runtime;
}
