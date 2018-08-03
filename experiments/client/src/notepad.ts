import { api as prague, ui as pragueUi } from "@prague/routerlicious";
import * as electron from "electron";
import * as jwt from "jsonwebtoken";

// For local development
const routerlicious = "https://alfred.wu2.prague.office-int.com";
const historian = "https://historian.wu2.prague.office-int.com";
const tenantId = "suspicious-northcutt";

// Register endpoint connection
prague.socketStorage.registerAsDefault(routerlicious, historian, tenantId);

async function run(token: string): Promise<void> {
    const host = new pragueUi.ui.BrowserContainerHost();

    // Load in the latest and connect to the document
    const claims = jwt.decode(token) as prague.core.ITokenClaims;
    const collabDoc = await prague.api.load(claims.documentId, { blockUpdateMarkers: true, token });

    const rootView = await collabDoc.getRoot().getView();

    // Add in the text string if it doesn't yet exist
    if (!collabDoc.existing) {
        const newString = collabDoc.createString() as prague.SharedString.SharedString;
        const starterText = " ";
        const segments = prague.MergeTree.loadSegments(starterText, 0, true);
        for (const segment of segments) {
            if (segment.getType() === prague.MergeTree.SegmentType.Text) {
                const textSegment = segment as prague.MergeTree.TextSegment;
                newString.insertText(textSegment.text, newString.client.getLength(),
                    textSegment.properties);
            } else {
                // assume marker
                const marker = segment as prague.MergeTree.Marker;
                newString.insertMarker(newString.client.getLength(), marker.refType, marker.properties);
            }
        }

        rootView.set("presence", collabDoc.createMap());
        rootView.set("text", newString);
        rootView.set("ink", collabDoc.createMap());
        rootView.set("pageInk", collabDoc.createStream());
    } else {
        await Promise.all([rootView.wait("text"), rootView.wait("ink")]);
    }

    // Load the text string and listen for updates
    const text = rootView.get("text");
    const ink = rootView.get("ink");

    const image = new pragueUi.controls.Image(
        document.createElement("div"),
        "https://alfred.wu2.prague.office-int.com/public/images/bindy.svg");

    const textElement = document.getElementById("text") as HTMLDivElement;
    const container = new pragueUi.controls.FlowContainer(
        textElement,
        collabDoc,
        text,
        ink,
        image,
        rootView.get("pageInk"),
        {});
    const theFlow = container.flowView;
    host.attach(container);

    if (text.client.getLength() > 0) {
        theFlow.render(0, true);
    }

    const clockStart = Date.now();
    theFlow.timeToEdit = theFlow.timeToImpression = Date.now() - clockStart;
    theFlow.setEdit(rootView);

    text.loaded.then(() => {
        theFlow.loadFinished(clockStart);
    });
}

electron.ipcRenderer.on("load-note", (event, token) => {
    run(token);
});
