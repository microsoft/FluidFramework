import * as resources from "gitresources";
import performanceNow = require("performance-now");
import * as request from "request";
import * as url from "url";
import * as API from "../../api";
import * as controls from "../../controls";
import * as SharedString from "../../merge-tree";
import * as shared from "../../shared";
import * as socketStorage from "../../socket-storage";
import * as ui from "../../ui";

// first script loaded
let clockStart = Date.now();

export let theFlow: controls.FlowView;

const prideAndPrejudice = "/public/literature/knuth-grimm.txt";

function downloadRawText(textUrl: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        request.get(url.resolve(document.baseURI, textUrl), (error, response, body: string) => {
            if (error) {
                reject(error);
            } else if (response.statusCode !== 200) {
                reject(response.statusCode);
            } else {
                resolve(body);
            }
        });
    });
}

async function getInsights(map: API.IMap, id: string): Promise<API.IMap> {
    const insights = await map.wait<API.IMap>("insights");
    return insights.wait<API.IMap>(id);
}

export async function onLoad(id: string, version: resources.ICommit, config: any) {
    const host = new ui.BrowserContainerHost();

    socketStorage.registerAsDefault(document.location.origin, config.blobStorageUrl, config.repository);
    console.log(`collabDoc loading ${id} - ${performanceNow()}`);
    const collabDoc = await API.load(id, { blockUpdateMarkers: true }, version);
    console.log(`collabDoc loaded ${id} - ${performanceNow()}`);
    const root = await collabDoc.getRoot().getView();
    console.log(`Getting root ${id} - ${performanceNow()}`);

    // If a text element already exists load it direclty - otherwise load in price + prejudice
    const existing = root.has("text");
    if (!existing) {
        console.log(`Not existing ${id} - ${performanceNow()}`);
        root.set("presence", collabDoc.createMap());
        const newString = collabDoc.createString() as SharedString.SharedString;
        const starterText = await downloadRawText(prideAndPrejudice);
        const segments = SharedString.loadSegments(starterText, 0, true);
        for (const segment of segments) {
            if (segment.getType() === SharedString.SegmentType.Text) {
                let textSegment = <SharedString.TextSegment> segment;
                newString.insertText(textSegment.text, newString.client.getLength(),
                    textSegment.properties);
            } else {
                // assume marker
                let marker = <SharedString.Marker> segment;
                newString.insertMarker(newString.client.getLength(), marker.behaviors, marker.properties);
            }
        }
        root.set("text", newString);
    }

    const sharedString = root.get("text") as SharedString.SharedString;
    console.log(`Shared string ready - ${performanceNow()}`);

    console.log(window.navigator.userAgent);
    console.log(`id is ${id}`);
    console.log(`Partial load fired - ${performanceNow()}`);

    // Bindy for insights
    const image = new controls.Image(
        document.createElement("div"),
        url.resolve(document.baseURI, "/public/images/bindy.svg"));

    const containerDiv = document.createElement("div");
    const container = new controls.FlowContainer(containerDiv, sharedString, image);
    theFlow = container.flowView;
    host.attach(container);

    getInsights(collabDoc.getRoot(), sharedString.id).then((insightsMap) => {
        container.trackInsights(insightsMap);
    });

    if (sharedString.client.getLength() > 0) {
        theFlow.render(0, true);
    }
    theFlow.timeToEdit = theFlow.timeToImpression = Date.now() - clockStart;

    theFlow.setEdit(root);

    sharedString.loaded.then(() => {
        // Bootstrap worker service.
        if (config.permission.sharedText) {
            shared.registerWorker(config);
        }

        theFlow.loadFinished(clockStart);
    });
}
