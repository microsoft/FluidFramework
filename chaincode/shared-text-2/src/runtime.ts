import { Document } from "@prague/app-component";
import * as API from "@prague/client-api";
import {
    IContainerContext,
    IRequest,
    IRuntime,
} from "@prague/container-definitions";
import * as Intelligence from "@prague/intelligence-runner";
import * as DistributedMap from "@prague/map";
import * as MergeTree from "@prague/merge-tree";
import {
    Runtime,
} from "@prague/runtime";
import * as SharedString from "@prague/sequence";
import * as Snapshotter from "@prague/snapshotter";
import * as Spellcheker from "@prague/spellchecker";
import { IStream } from "@prague/stream";
import * as Translator from "@prague/translator";
import { default as axios } from "axios";
import { parse } from "querystring";
import * as uuid from "uuid/v4";
// tslint:disable:no-var-requires
const performanceNow = require("performance-now");
const debug = require("debug")("prague:shared-text");
// tslint:enable:no-var-requires
import * as url from "url";
import { controls, ui } from "./controls";

// first script loaded
const clockStart = Date.now();

const translationApiKey = "bd099a1e38724333b253fcff7523f76a";

async function getInsights(map: DistributedMap.ISharedMap, id: string): Promise<DistributedMap.ISharedMap> {
    const insights = await map.wait<DistributedMap.ISharedMap>("insights");
    return insights.wait<DistributedMap.ISharedMap>(id);
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

class SharedTextComponent extends Document {
    private sharedString: SharedString.SharedString;
    private insightsMap: DistributedMap.ISharedMap;

    public async opened() {
        debug(`collabDoc loaded ${this.runtime.id} - ${performanceNow()}`);
        const root = await this.root;
        debug(`Getting root ${this.runtime.id} - ${performanceNow()}`);

        await Promise.all([root.wait("text"), root.wait("ink"), root.wait("insights")]);

        this.sharedString = root.get("text") as SharedString.SharedString;
        this.insightsMap = root.get("insights") as DistributedMap.ISharedMap;
        debug(`Shared string ready - ${performanceNow()}`);
        debug(`id is ${this.runtime.id}`);
        debug(`Partial load fired: ${performanceNow()}`);

        waitForFullConnection(this.runtime).then(() => {
            this.runTask(this.runtime.clientType);
        });

        const hostContent: HTMLElement = await this.platform.queryInterface<HTMLElement>("div");
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

        // Bindy for insights
        const image = new controls.Image(
            document.createElement("div"),
            url.resolve(document.baseURI, "/public/images/bindy.svg"));

        // const wrapperDiv = document.createElement("div");
        // wrapperDiv.id = "content";
        // wrapperDiv.appendChild(containerDiv);

        const containerDiv = document.createElement("div");
        containerDiv.id = "content";
        const container = new controls.FlowContainer(
            containerDiv,
            new API.Document(this.runtime, this.root),
            this.sharedString,
            image,
            root.get("pageInk") as IStream,
            {});
        const theFlow = container.flowView;
        host.attach(container);

        getInsights(this.root, this.sharedString.id).then(
            (insightsMap) => {
                container.trackInsights(insightsMap);
            });

        if (this.sharedString.client.getLength() > 0) {
            theFlow.render(0, true);
        }
        theFlow.timeToEdit = theFlow.timeToImpression = Date.now() - clockStart;

        theFlow.setEdit(root);

        this.sharedString.loaded.then(() => {
            theFlow.loadFinished(clockStart);
            debug(`${this.runtime.id} fully loaded: ${performanceNow()} `);
        });
    }

    protected async create() {
        const insightsMapId = "insights";

        const insights = this.createMap(insightsMapId);
        this.root.set(insightsMapId, insights);

        debug(`Not existing ${this.runtime.id} - ${performanceNow()}`);
        this.root.set("presence", this.createMap());
        this.root.set("users", this.createMap());
        this.root.set("calendar", undefined, SharedString.SharedIntervalCollectionValueType.Name);
        const seq = this.runtime.createChannel(
            uuid(), SharedString.SharedNumberSequenceExtension.Type) as
            SharedString.SharedNumberSequence;
        this.root.set("sequence-test", seq);
        const newString = this.createString() as SharedString.SharedString;

        const template = parse(window.location.search).template;
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
        this.root.set("text", newString);
        this.root.set("ink", this.createMap());

        insights.set(newString.id, this.createMap());
        /*
        const idMap = await insights.wait<DistributedMap.ISharedMap>(newString.id);
        idMap.set("translationsTo", undefined, DistributedMap.DistributedSetValueType.Name);
        idMap.set("translationsFrom", undefined, DistributedMap.DistributedSetValueType.Name);
        const translationsTo = await idMap.wait<DistributedMap.DistributedSet<string>>("translationsTo");
        translationsTo.add("fr");
        const translationsFrom = await idMap.wait<DistributedMap.DistributedSet<string>>("translationsFrom");
        translationsFrom.add("en");*/
    }

    private runTask(clientType: string) {
        switch (clientType) {
            case "intel":
                console.log(`@chaincode/shared-text-2 running ${clientType}`);
                Intelligence.run(this.sharedString, this.insightsMap);
                break;
            case "translation":
                console.log(`@chaincode/shared-text-2 running ${clientType}`);
                Translator.run(
                    this.sharedString,
                    this.insightsMap,
                    translationApiKey);
                break;
            case "spell":
                console.log(`@chaincode/shared-text-2 running ${clientType}`);
                Spellcheker.run(this.sharedString);
                break;
            default:
                break;
        }
    }
}

export async function instantiateComponent() {
    return new SharedTextComponent();
}

/**
 * Instantiates a new chaincode host
 */
export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
    const registry = new Map<string, any>([
        ["@chaincode/shared-text-2", { instantiateComponent }],
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

    runtime.registerTasks(["spell", "translation", "intel", "snapshot"], "1.0");

    waitForFullConnection(runtime).then(() => {
        // Call snapshot directly from runtime.
        if (runtime.clientType === "snapshot") {
            console.log(`@chaincode/shared-text-2 running ${runtime.clientType}`);
            Snapshotter.run(runtime);
        }
    });

    // On first boot create the base component
    if (!runtime.existing) {
        runtime.createAndAttachComponent("text", "@chaincode/shared-text-2").catch((error) => {
            context.error(error);
        });
    }

    return runtime;
}
