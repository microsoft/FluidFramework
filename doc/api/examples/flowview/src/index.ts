import * as API from "@prague/client-api";
import { controls, ui } from "@prague/client-ui";
import * as MergeTree from "@prague/merge-tree";
import * as socketStorage from "@prague/routerlicious-socket-storage";
import * as SharedString from "@prague/sequence";
import { InsecureUrlResolver } from "./urlResolver";

// Using package verions published in 03-04-2019
// For local development
// const routerlicious = "http://localhost:3000";
// const historian = "http://localhost:3001";
// const tenantId = "prague";
// const secret = "43cfc3fbf04a97c0921fd23ff10f9e4b";
// const routerlicious = "https://alfred.wu2.prague.office-int.com";
// const historian = "https://historian.wu2.prague.office-int.com";
// const tenantId = "gallant-hugle";
// const secret = "03302d4ebfb6f44b662d00313aff5a46";
const routerlicious = "https://alfred.wu2-ppe.prague.office-int.com";
// Use undefined for only subscribing to the ordering service.
const historian = undefined;
const tenantId = "stupefied-kilby";
const secret = "4a9211594f7c3daebca3deb8d6115fe2";

const userId = "test";

const documentId = window.location.search.slice(1) || "flowview-test-03042019-03";

// Register endpoint connection
const documentServices = socketStorage.createDocumentService(routerlicious, historian);
API.registerDocumentService(documentServices);

async function run(id: string): Promise<void> {
    const host = new ui.BrowserContainerHost();

    const resolver = new InsecureUrlResolver(
        routerlicious,
        historian,
        userId,
        secret);

    const documentUrl = `prague://${new URL(routerlicious).host}` +
        `/${encodeURIComponent(tenantId)}` +
        `/${encodeURIComponent(documentId)}`;
    const apiHost = { resolver };

    const collabDoc = await API.load(
        documentUrl,
        apiHost,
        { blockUpdateMarkers: true });

    const rootMap = await collabDoc.getRoot();
    console.log(`rootMap keys: ${rootMap.keys()}`);

    // Add in the text string if it doesn't yet exist
    if (!collabDoc.existing) {
        const newString = collabDoc.createString() as SharedString.SharedString;
        const starterText = " ";
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

        rootMap.set("presence", collabDoc.createMap());
        rootMap.set("text", newString);
        rootMap.set("ink", collabDoc.createMap());
        rootMap.set("pageInk", collabDoc.createStream());

        const seq = collabDoc.create(SharedString.SharedNumberSequenceExtension.Type) as
            SharedString.SharedNumberSequence;
        rootMap.set("sequence-test", seq);
    } else {
        await Promise.all([rootMap.wait("text"), rootMap.wait("ink")]);
    }

    collabDoc.on("clientJoin", (message) => {
        console.log(`${JSON.stringify(message)} joined`);
        console.log(`${Array.from(collabDoc.getClients().keys())}`);
    });
    collabDoc.on("clientLeave", (message) => {
        console.log(`${JSON.stringify(message)} left`);
        console.log(`${Array.from(collabDoc.getClients().keys())}`);
    });

    // Load the text string and listen for updates
    const text = rootMap.get("text");
    const ink = rootMap.get("ink");

    const image = new controls.Image(
        document.createElement("div"),
        "https://alfred.wu2.prague.office-int.com/public/images/bindy.svg");

    const textElement = document.getElementById("text") as HTMLDivElement;
    const container = new controls.FlowContainer(
        textElement,
        collabDoc,
        text,
        ink,
        image,
        rootMap.get("pageInk"),
        {});
    const theFlow = container.flowView;
    host.attach(container);

    if (text.client.getLength() > 0) {
        theFlow.render(0, true);
    }

    const clockStart = Date.now();
    theFlow.timeToEdit = theFlow.timeToImpression = Date.now() - clockStart;
    theFlow.setEdit(rootMap);

    text.loaded.then(() => {
        theFlow.loadFinished(clockStart);
    });
}

run(documentId).catch((error) => {
    console.error(error);
});
