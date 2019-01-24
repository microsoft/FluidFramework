import * as charts from "@chaincode/charts";
import * as monaco from "@chaincode/monaco";
import * as pinpoint from "@chaincode/pinpoint-editor";
import { Component, Document } from "@prague/app-component";
import * as API from "@prague/client-api";
import * as DistributedMap from "@prague/map";
import * as MergeTree from "@prague/merge-tree";
import { IChaincodeComponent, IChaincodeHost, IHostRuntime } from "@prague/process-definitions";
import { LegacyChaincodeBridge } from "@prague/process-utils";
import { IChaincode, IPlatform } from "@prague/runtime-definitions";
import * as SharedString from "@prague/sequence";
import { IStream } from "@prague/stream";
import { default as axios } from "axios";
import { EventEmitter } from "events";
// tslint:disable:no-var-requires
const performanceNow = require("performance-now");
const debug = require("debug")("chaincode:shared-text");
// tslint:enable:no-var-requires
import * as url from "url";
import { controls, ui } from "./controls";

// first script loaded
const clockStart = Date.now();

async function getInsights(map: DistributedMap.IMap, id: string): Promise<DistributedMap.IMap> {
    const insights = await map.wait<DistributedMap.IMap>("insights");
    return insights.wait<DistributedMap.IMap>(id);
}

async function downloadRawText(textUrl: string): Promise<string> {
    const data = await axios.get(textUrl);
    return data.data;
}

const loadPP = false;

class SharedText extends Document {
    private sharedString: SharedString.SharedString;

    public async opened() {
        debug(`collabDoc loaded ${this.runtime.id} - ${performanceNow()}`);
        const root = await this.root.getView();
        debug(`Getting root ${this.runtime.id} - ${performanceNow()}`);

        await Promise.all([root.wait("text"), root.wait("ink")]);

        this.sharedString = root.get("text") as SharedString.SharedString;
        debug(`Shared string ready - ${performanceNow()}`);
        debug(`id is ${this.runtime.id}`);
        debug(`Partial load fired - ${performanceNow()}`);

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

        // Higher plane ink
        const inkPlane = root.get("ink");

        // Bindy for insights
        const image = new controls.Image(
            document.createElement("div"),
            url.resolve(document.baseURI, "/public/images/bindy.svg"));

        const containerDiv = document.createElement("div");
        const container = new controls.FlowContainer(
            containerDiv,
            new API.Document(this.runtime, this.root),
            this.sharedString,
            inkPlane,
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
            debug(`fully loaded ${this.runtime.id}: ${performanceNow()} `);
        });
    }

    protected async create() {
        const insightsMapId = "insights";

        const insights = this.createMap(insightsMapId);
        this.root.set(insightsMapId, insights);

        debug(`Not existing ${this.runtime.id} - ${performanceNow()}`);
        this.root.set("presence", this.createMap());
        this.root.set("users", this.createMap());
        const newString = this.createString() as SharedString.SharedString;

        const starterText = loadPP
            ? await downloadRawText("https://alfred.wu2-ppe.prague.office-int.com/public/literature/pp.txt")
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
    }
}

class MyPlatform extends EventEmitter implements IPlatform {
    public async queryInterface<T>(id: string): Promise<T> {
        return null;
    }
}

class SharedTextHost implements IChaincodeHost {
    public async getModule(type: string) {
        switch (type) {
            case "@chaincode/charts":
                return charts;
            case "@chaincode/shared-text":
                return { instantiateComponent };
            case "@chaincode/pinpoint-editor":
                return pinpoint;
            case "@chaincode/monaco":
                return monaco;
            default:
                return Promise.reject("Unknown component");
        }
    }

    public async close(): Promise<void> {
        return;
    }

    // I believe that runtime needs to have everything necessary for this thing to actually load itself once this
    // method is called
    public async run(runtime: IHostRuntime, platform: IPlatform): Promise<IPlatform> {
        this.doWork(runtime).catch((error) => {
            runtime.error(error);
        });

        return new MyPlatform();
    }

    public async doWork(runtime: IHostRuntime) {
        if (!runtime.existing) {
            await runtime.createAndAttachProcess("text", "@chaincode/shared-text");
        } else {
            await runtime.getProcess("text");
        }

        console.log("Running, running, running");
    }
}

export async function instantiate(): Promise<IChaincode> {
    return Component.instantiate(new SharedText());
}

/**
 * Instantiates a new chaincode component
 */
export async function instantiateComponent(): Promise<IChaincodeComponent> {
    const code = await instantiate();
    return new LegacyChaincodeBridge(code);
}

/**
 * Instantiates a new chaincode host
 */
export async function instantiateHost(): Promise<IChaincodeHost> {
    return new SharedTextHost();
}
