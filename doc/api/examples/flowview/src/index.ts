// For local development
const routerlicious = "http://localhost:3000";
const historian = "http://localhost:3001";
// const routerlicious = "http://praguekube.westus2.cloudapp.azure.com";
// const historian = "http://prague-historian.westus2.cloudapp.azure.com";
const repository = "prague";

const pragueUi = window["pragueUi"];

// Register endpoint connection
prague.socketStorage.registerAsDefault(routerlicious, historian, repository);

async function run(id: string): Promise<void> {
    const host = new pragueUi.ui.BrowserContainerHost();

    // Load in the latest and connect to the document
    const collabDoc = await prague.api.load(id, { blockUpdateMarkers: true });

    const rootView = await collabDoc.getRoot().getView();
    console.log("Keys");
    console.log(rootView.keys());

    // Add in the text string if it doesn't yet exist
    if (!rootView.has("text")) {
        const newString = collabDoc.createString() as prague.MergeTree.SharedString;
        const starterText = " ";
        const segments = prague.MergeTree.loadSegments(starterText, 0, true);
        for (const segment of segments) {
            if (segment.getType() === prague.MergeTree.SegmentType.Text) {
                let textSegment = <prague.MergeTree.TextSegment> segment;
                newString.insertText(textSegment.text, newString.client.getLength(),
                    textSegment.properties);
            } else {
                // assume marker
                let marker = <prague.MergeTree.Marker> segment;
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

    const image = new pragueUi.controls.Image(
        document.createElement("div"),
        "http://praguekube.westus2.cloudapp.azure.com/public/images/bindy.svg");

    const textElement = document.getElementById("text");
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

    let clockStart = Date.now();
    theFlow.timeToEdit = theFlow.timeToImpression = Date.now() - clockStart;
    theFlow.setEdit(rootView);

    text.loaded.then(() => {
        theFlow.loadFinished(clockStart);
    });
}

const documentId = "test-document-niode-201";
run(documentId).catch((error) => {
    console.error(error);
})
