import * as prague from "routerlicious";

const routerlicious = "http://praguekube.westus2.cloudapp.azure.com";
const historian = "http://prague-historian.westus2.cloudapp.azure.com";
const repository = "prague";

// Register endpoint connection
prague.api.socketStorage.registerAsDefault(routerlicious, historian, repository);

async function run(id: string): Promise<void> {
    const host = new prague.ui.ui.BrowserContainerHost();

    // Load in the latest and connect to the document
    const collabDoc = await prague.api.api.load(id, { blockUpdateMarkers: true });

    const rootView = await collabDoc.getRoot().getView();

    // Add in the text string if it doesn't yet exist
    if (!rootView.has("text")) {
        const newString = collabDoc.createString() as prague.api.MergeTree.SharedString;
        const starterText = " ";
        const segments = prague.api.MergeTree.loadSegments(starterText, 0, true);
        for (const segment of segments) {
            if (segment.getType() === prague.api.MergeTree.SegmentType.Text) {
                const textSegment = segment as prague.api.MergeTree.TextSegment;
                newString.insertText(textSegment.text, newString.client.getLength(),
                    textSegment.properties);
            } else {
                // assume marker
                const marker = segment as prague.api.MergeTree.Marker;
                newString.insertMarker(newString.client.getLength(), marker.behaviors, marker.properties);
            }
        }

        rootView.set("presence", collabDoc.createMap());
        rootView.set("text", newString);
        rootView.set("ink", collabDoc.createMap());
        rootView.set("pageInk", collabDoc.createInk());
    }

    // Load the text string and listen for updates
    const text = rootView.get("text");
    const ink = rootView.get("ink");

    const image = new prague.ui.controls.Image(
        document.createElement("div"),
        "http://praguekube.westus2.cloudapp.azure.com/public/images/bindy.svg");

    const textElement = document.getElementById("text") as HTMLDivElement;
    const container = new prague.ui.controls.FlowContainer(
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

const documentId = "test-electron-new";
run(documentId).catch((error) => {
    console.error(error);
});
