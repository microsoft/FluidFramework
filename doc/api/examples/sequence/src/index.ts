// For local development
// const routerlicious = "http://localhost:3000";
// const historian = "http://localhost:3001";
const routerlicious = "http://praguekube.westus2.cloudapp.azure.com";
const historian = "http://prague-historian.westus2.cloudapp.azure.com";
const repository = "prague";

// Register endpoint connection
prague.socketStorage.registerAsDefault(routerlicious, historian, repository);

async function run(id: string): Promise<void> {
    // Load in the latest and connect to the document
    const collabDoc = await prague.api.load(id, { blockUpdateMarkers: true });

    const rootView = await collabDoc.getRoot().getView();
    console.log("Keys");
    console.log(rootView.keys());

    // Add in the text string if it doesn't yet exist
    if (!rootView.has("text")) {
        rootView.set("text", collabDoc.createString());
    }

    // Load the text string and listen for updates
    const text = rootView.get("text");

    const textElement = document.getElementById("text");
    textElement.innerText = text.client.getText();

    // Update the text after being loaded as well as when receiving ops
    text.loaded.then(() => {
        textElement.innerText = text.client.getText();
    });
    text.on("op", (msg) => {
        textElement.innerText = text.client.getText();
    });

    const insertElement = document.getElementById("insertForm") as HTMLFormElement;
    insertElement.onsubmit = (event) => {
        const insertText = insertElement.elements["insertText"].value;
        const insertPosition = parseInt(insertElement.elements["insertLocation"].value);

        text.insertText(insertText, insertPosition);

        event.preventDefault();
    };
}

const documentId = "test-document-niode-201";
run(documentId).catch((error) => {
    console.error(error);
})
