import * as API from "@prague/client-api";
import { controls, ui } from "@prague/client-ui";
import * as DistributedMap from "@prague/map";
import * as MergeTree from "@prague/merge-tree";
import { IChaincode, IPlatform } from "@prague/runtime-definitions";
import * as SharedString from "@prague/shared-string";
import { IStream } from "@prague/stream";
import { default as axios } from "axios";
// tslint:disable-next-line:no-var-requires
const performanceNow = require("performance-now");
import * as url from "url";
import { Chaincode } from "./chaincode";

// tslint:disable
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap/dist/css/bootstrap-theme.min.css";
import "../stylesheets/map.css";
import "../stylesheets/style.css";
// tslint:enable

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

class Runner {
    public run(collabDoc: API.Document, platform: IPlatform) {
        this.runCore(collabDoc, platform).catch((error) => console.error(error));
    }

    private async runCore(collabDoc: API.Document, platform: IPlatform) {
        const hostContent: HTMLElement = await platform.queryInterface<HTMLElement>("div");
        if (!hostContent) {
            // If headless exist early
            return;
        }

        const host = new ui.BrowserContainerHost();

        // Register to run task only if the client type is browser.
        // agent.registerToWork(collabDoc, client, token, config);

        console.log(`collabDoc loaded ${collabDoc.id} - ${performanceNow()}`);
        const root = await collabDoc.getRoot().getView();
        console.log(`Getting root ${collabDoc.id} - ${performanceNow()}`);

        // If a text element already exists load it directly - otherwise load in pride + prejudice
        if (!collabDoc.existing) {
            console.log(`Not existing ${collabDoc.id} - ${performanceNow()}`);
            root.set("presence", collabDoc.createMap());
            root.set("users", collabDoc.createMap());
            const newString = collabDoc.createString() as SharedString.SharedString;

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
            root.set("text", newString);
            root.set("ink", collabDoc.createMap());
        } else {
            await Promise.all([root.wait("text"), root.wait("ink")]);
        }

        const sharedString = root.get("text") as SharedString.SharedString;
        console.log(`Shared string ready - ${performanceNow()}`);
        console.log(window.navigator.userAgent);
        console.log(`id is ${collabDoc.id}`);
        console.log(`Partial load fired - ${performanceNow()}`);

        // Higher plane ink
        const inkPlane = root.get("ink");

        // Bindy for insights
        const image = new controls.Image(
            document.createElement("div"),
            url.resolve(document.baseURI, "/public/images/bindy.svg"));

        const containerDiv = document.createElement("div");
        const container = new controls.FlowContainer(
            containerDiv,
            collabDoc,
            sharedString,
            inkPlane,
            image,
            root.get("pageInk") as IStream,
            {});
        const theFlow = container.flowView;
        host.attach(container);

        // const translationLanguage = "translationLanguage";
        // addTranslation(collabDoc, sharedString.id, options[translationLanguage]).catch((error) => {
        //     console.error("Problem adding translation", error);
        // });

        getInsights(collabDoc.getRoot(), sharedString.id).then(
            (insightsMap) => {
                container.trackInsights(insightsMap);
            });

        if (sharedString.client.getLength() > 0) {
            theFlow.render(0, true);
        }
        theFlow.timeToEdit = theFlow.timeToImpression = Date.now() - clockStart;

        theFlow.setEdit(root);

        sharedString.loaded.then(() => {
            theFlow.loadFinished(clockStart);
            console.log(`fully loaded ${collabDoc.id}: ${performanceNow()} `);
        });
    }
}

export async function instantiate(): Promise<IChaincode> {
    // Instantiate a new runtime per code load. That'll separate handlers, etc...
    const chaincode = new Chaincode(new Runner());
    return chaincode;
}
